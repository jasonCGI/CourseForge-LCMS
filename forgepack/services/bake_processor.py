"""
ForgePack Bake Processor

Takes a source video + .clip.json, inserts hold frames at each interaction
timecode, mutes audio during holds, and recalculates all timecodes in the
clip.json for the expanded timeline. Returns a mediaPackage ZIP.

Hold strategy:
  - 1.0s hold per interaction point (configurable)
  - Audio: fade out 0.1s before hold, silent during, fade in 0.1s after
  - Trigger offset: 0.5s into hold (midpoint — guaranteed stable)
  - Output: CFR 30fps, short GOP (g=30), faststart

mediaPackage ZIP:
  {name}.mp4 / {name}.clip.json            ← originals (re-author in ForgeClip)
  {name}_baked.mp4 / {name}_baked.clip.json ← hold-expanded + corrected timecodes
  README.txt
"""

import os
import json
import uuid
import zipfile
import subprocess
import threading
import copy
from pathlib import Path
from datetime import datetime
from services.job_store import reap

JOBS = {}
HOLD_DURATION  = 1.0    # seconds per interaction point
TRIGGER_OFFSET = 0.5    # seconds into the hold to place the trigger (midpoint)
FADE_DURATION  = 0.1    # audio fade in/out at hold boundaries
FPS            = 30
EPS            = 0.04   # tiny slice (~1 frame) so the freeze grabs a real frame


def allowed_video(filename: str) -> bool:
    return Path(filename).suffix.lower() in {'.mp4', '.mov', '.webm', '.m4v', '.avi'}


def recalculate_timecodes(interactions, hold_duration=HOLD_DURATION, trigger_offset=TRIGGER_OFFSET):
    """Return a copy of interactions (sorted) with baked timecodes."""
    sorted_ints = sorted(interactions, key=lambda i: i['timecode'])
    result = [copy.deepcopy(i) for i in sorted_ints]
    accumulated = 0.0
    for idx, interaction in enumerate(result):
        original = sorted_ints[idx]['timecode']
        interaction['timecode'] = round(original + accumulated + trigger_offset, 3)
        if sorted_ints[idx].get('end_timecode'):
            interaction['end_timecode'] = round(
                sorted_ints[idx]['end_timecode'] + accumulated + hold_duration, 3)
        accumulated += hold_duration
    return result


def build_filter_complex(timecodes, has_audio, hold_duration=HOLD_DURATION, fade_dur=FADE_DURATION):
    """
    Build the FFmpeg filter_complex for N freeze-holds.
    Layout: seg0 hold0 seg1 hold1 ... segN  (2N+1 segments).
    Each video segment is normalised to CFR 30fps + SAR 1 so concat is clean;
    the hold is a single trimmed frame looped then re-timed via fps.
    """
    n = len(timecodes)
    if n == 0:
        return ''
    tcs = sorted(timecodes)
    hold_frames = int(hold_duration * FPS)

    v, a = [], []
    prev = 0.0
    for i, tc in enumerate(tcs):
        v.append(f'[0:v]trim={prev:.3f}:{tc:.3f},setpts=PTS-STARTPTS,fps={FPS},setsar=1[seg_v{i}]')
        v.append(f'[0:v]trim={tc:.3f}:{tc + EPS:.3f},setpts=PTS-STARTPTS,'
                 f'loop=loop={hold_frames}:size=1:start=0,fps={FPS},setsar=1[hold_v{i}]')
        prev = tc
    v.append(f'[0:v]trim=start={prev:.3f},setpts=PTS-STARTPTS,fps={FPS},setsar=1[seg_v{n}]')
    v_in = ''.join(f'[seg_v{i}][hold_v{i}]' for i in range(n)) + f'[seg_v{n}]'
    v.append(f'{v_in}concat=n={n * 2 + 1}:v=1:a=0[outv]')

    if has_audio:
        prev = 0.0
        fade_out_st = max(0.0, hold_duration - fade_dur)
        for i, tc in enumerate(tcs):
            a.append(f'[0:a]atrim={prev:.3f}:{tc:.3f},asetpts=PTS-STARTPTS,aresample=async=1[seg_a{i}]')
            a.append(f'[0:a]atrim={tc:.3f}:{tc + EPS:.3f},asetpts=PTS-STARTPTS,'
                     f'afade=t=out:st=0:d={fade_dur:.2f},apad=pad_dur={hold_duration:.3f},'
                     f'afade=t=in:st={fade_out_st:.3f}:d={fade_dur:.2f},aresample=async=1[hold_a{i}]')
            prev = tc
        a.append(f'[0:a]atrim=start={prev:.3f},asetpts=PTS-STARTPTS,aresample=async=1[seg_a{n}]')
        a_in = ''.join(f'[seg_a{i}][hold_a{i}]' for i in range(n)) + f'[seg_a{n}]'
        a.append(f'{a_in}concat=n={n * 2 + 1}:v=0:a=1[outa]')

    return ';'.join(v + a)


def check_has_audio(input_path):
    try:
        r = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'a',
                            '-show_entries', 'stream=codec_type', '-of',
                            'default=noprint_wrappers=1:nokey=1', input_path],
                           capture_output=True, text=True, timeout=30)
        return 'audio' in r.stdout.lower()
    except Exception:
        return False


def get_duration(input_path):
    try:
        r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                            '-of', 'default=noprint_wrappers=1:nokey=1', input_path],
                           capture_output=True, text=True, timeout=30)
        return float(r.stdout.strip())
    except Exception:
        return 0.0


def bake_job(job_id, video_path, clip_data, base_name, output_dir):
    JOBS[job_id].update({'status': 'running', 'progress': 0, 'message': 'Starting bake pipeline…'})
    output_p = Path(output_dir); output_p.mkdir(parents=True, exist_ok=True)
    baked_video_path = str(output_p / f"{base_name}_baked.mp4")
    baked_clip_path  = str(output_p / f"{base_name}_baked.clip.json")
    original_clip_path = str(output_p / f"{base_name}.clip.json")
    zip_path = str(output_p / f"mediaPackage_{base_name}.zip")

    try:
        JOBS[job_id]['message'] = 'Analysing source video…'
        has_audio = check_has_audio(video_path)
        duration  = get_duration(video_path)
        JOBS[job_id]['progress'] = 10

        interactions = clip_data.get('interactions', [])
        sorted_ints  = sorted(interactions, key=lambda i: i['timecode'])
        timecodes    = [i['timecode'] for i in sorted_ints]
        if not timecodes:
            JOBS[job_id].update({'status': 'failed', 'error': 'No interactions found in clip.json. Nothing to bake.'})
            return
        JOBS[job_id].update({'progress': 15, 'message': 'Building FFmpeg pipeline…'})

        filter_complex = build_filter_complex(timecodes, has_audio)
        maps = ['-map', '[outv]'] + (['-map', '[outa]'] if has_audio else ['-an'])
        cmd = ['ffmpeg', '-y', '-i', video_path, '-filter_complex', filter_complex, *maps,
               '-c:v', 'libx264', '-crf', '23', '-preset', 'medium',
               '-g', str(FPS), '-vsync', 'cfr', '-r', str(FPS), '-pix_fmt', 'yuv420p',
               '-movflags', '+faststart']
        if has_audio:
            cmd += ['-c:a', 'aac', '-b:a', '128k']
        cmd.append(baked_video_path)

        JOBS[job_id].update({'progress': 20, 'message': f'Baking {len(timecodes)} hold point(s) into video…'})
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True)
        _, stderr = proc.communicate()
        if proc.returncode != 0:
            JOBS[job_id].update({'status': 'failed', 'error': f'FFmpeg failed: {stderr[-700:]}'})
            return
        JOBS[job_id]['progress'] = 80

        JOBS[job_id]['message'] = 'Recalculating interaction timecodes…'
        baked_interactions = recalculate_timecodes(interactions)
        baked_clip = dict(clip_data)
        baked_clip['interactions']  = baked_interactions
        baked_clip['baked']         = True
        baked_clip['baked_at']      = datetime.utcnow().isoformat() + 'Z'
        baked_clip['bake_settings'] = {
            'hold_duration': HOLD_DURATION, 'trigger_offset': TRIGGER_OFFSET,
            'audio_handling': 'muted_with_fade', 'fade_duration': FADE_DURATION,
            'original_duration': duration, 'baked_duration': duration + len(timecodes) * HOLD_DURATION,
        }
        if 'video' in baked_clip and isinstance(baked_clip['video'], dict):
            baked_clip['video']['filename'] = f"{base_name}_baked.mp4"
            baked_clip['video']['duration'] = duration + len(timecodes) * HOLD_DURATION
        Path(baked_clip_path).write_text(json.dumps(baked_clip, indent=2), encoding='utf-8')
        Path(original_clip_path).write_text(json.dumps(clip_data, indent=2), encoding='utf-8')
        JOBS[job_id]['progress'] = 88

        JOBS[job_id]['message'] = 'Assembling mediaPackage…'
        log_lines = '\n'.join(
            f"  {sorted_ints[i]['timecode']:.3f}s -> {baked_interactions[i]['timecode']:.3f}s  ({sorted_ints[i].get('type','?')})"
            for i in range(len(sorted_ints)))
        readme = (
            f"mediaPackage - {base_name}\n"
            f"{'=' * (14 + len(base_name))}\n"
            f"Created:         {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}\n"
            f"Tool:            ForgeClip + ForgePack v1.3.0\n"
            f"Interactions:    {len(timecodes)} hold point(s) baked in\n"
            f"Hold duration:   {HOLD_DURATION}s per interaction\n"
            f"Audio handling:  Muted during holds (fade {FADE_DURATION}s in/out)\n"
            f"Source duration: {duration:.1f}s\n"
            f"Baked duration:  {duration + len(timecodes) * HOLD_DURATION:.1f}s\n\n"
            "CONTENTS\n"
            f"  {base_name}.mp4              original video (pre-bake) - re-author in ForgeClip\n"
            f"  {base_name}.clip.json        original markers (pre-bake timecodes)\n"
            f"  {base_name}_baked.mp4        hold-expanded video - import to CourseForge\n"
            f"  {base_name}_baked.clip.json  corrected timecodes - import to CourseForge\n\n"
            "TO IMPORT INTO COURSEFORGE\n"
            f"  Upload {base_name}_baked.mp4 and {base_name}_baked.clip.json to a\n"
            "  CourseForge ivideo block. They auto-pair by base name.\n\n"
            "TO RE-AUTHOR\n"
            "  Drop this ZIP into ForgeClip - it restores the source mp4 + clip.json.\n\n"
            "BAKE LOG (original -> baked):\n" + log_lines + "\n")

        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
            zf.write(video_path,         f"{base_name}.mp4")
            zf.write(baked_video_path,   f"{base_name}_baked.mp4")
            zf.write(original_clip_path, f"{base_name}.clip.json")
            zf.write(baked_clip_path,    f"{base_name}_baked.clip.json")
            zf.writestr('README.txt', readme)

        for p in (baked_video_path, baked_clip_path, original_clip_path):
            try: os.remove(p)
            except OSError: pass

        JOBS[job_id].update({
            'status': 'complete', 'progress': 100, 'message': 'Done',
            'output_path': zip_path, 'base_name': base_name, 'hold_count': len(timecodes),
            'baked_duration': duration + len(timecodes) * HOLD_DURATION,
            'timecode_map': [
                {'original': sorted_ints[i]['timecode'], 'baked': baked_interactions[i]['timecode'],
                 'type': sorted_ints[i].get('type', '?')} for i in range(len(sorted_ints))],
        })
    except Exception as e:
        JOBS[job_id].update({'status': 'failed', 'error': str(e)})
    finally:
        # The uploaded source MP4 is bundled into the ZIP above; always remove it
        # afterwards (success or failure) so uploads/source/bake/ doesn't grow.
        try: os.remove(video_path)
        except OSError: pass


def start_bake_job(video_path, clip_data, base_name, output_dir):
    reap(JOBS)
    job_id = str(uuid.uuid4())
    JOBS[job_id] = {'status': 'queued', 'progress': 0, 'message': 'Queued',
                    'output_path': None, 'error': None, 'created_at': datetime.utcnow().isoformat()}
    threading.Thread(target=bake_job, args=(job_id, video_path, clip_data, base_name, output_dir), daemon=True).start()
    return job_id


def get_bake_job(job_id):
    return JOBS.get(job_id)
