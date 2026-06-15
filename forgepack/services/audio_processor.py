"""
ForgePack Audio Processor

FFmpeg pipeline:
  1. Probe source file — channels, sample rate, duration, integrated loudness
  2. Loudness normalization (EBU R128 via loudnorm filter)
  3. Encode MP3 (libmp3lame)
  4. Encode OGG (libvorbis)
  5. Encode M4A (AAC)
  6. Package all three into ZIP with README
"""

import os
import json
import uuid
import zipfile
import subprocess
import threading
from pathlib import Path
from datetime import datetime

JOBS = {}

ALLOWED_INPUT_EXTENSIONS = {
    '.wav', '.aiff', '.aif', '.flac',
    '.mp3', '.m4a', '.aac', '.ogg', '.opus',
}


def allowed_audio(filename: str) -> bool:
    return Path(filename).suffix.lower() in ALLOWED_INPUT_EXTENSIONS


def probe_audio(input_path: str) -> dict:
    """Probe audio file for metadata and integrated loudness."""
    probe_cmd = [
        'ffprobe', '-v', 'error',
        '-show_entries', 'stream=channels,sample_rate:format=duration',
        '-of', 'json', input_path,
    ]
    try:
        result = subprocess.run(probe_cmd, capture_output=True, text=True, timeout=30)
        data     = json.loads(result.stdout)
        streams  = data.get('streams', [{}])
        fmt      = data.get('format', {})
        channels    = int(streams[0].get('channels', 1)) if streams else 1
        sample_rate = int(streams[0].get('sample_rate', 44100)) if streams else 44100
        duration    = float(fmt.get('duration', 0))
    except Exception:
        channels, sample_rate, duration = 1, 44100, 0.0

    loudness_lufs = None
    try:
        loud_cmd = [
            'ffmpeg', '-i', input_path,
            '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json',
            '-f', 'null', '-',
        ]
        loud_result = subprocess.run(loud_cmd, capture_output=True, text=True, timeout=120)
        stderr = loud_result.stderr
        json_start = stderr.rfind('{')
        json_end   = stderr.rfind('}') + 1
        if json_start >= 0 and json_end > json_start:
            loud_data     = json.loads(stderr[json_start:json_end])
            loudness_lufs = float(loud_data.get('input_i', -99))
    except Exception:
        pass

    return {
        'channels':      channels,
        'sample_rate':   sample_rate,
        'duration':      duration,
        'loudness_lufs': loudness_lufs,
    }


def run_ffmpeg_audio(cmd: list, job_id: str, stage: str,
                     progress_start: int, progress_end: int) -> bool:
    """Run FFmpeg command, update job progress. Returns True on success."""
    try:
        proc = subprocess.Popen(
            cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True,
        )
        _, stderr = proc.communicate()
        if proc.returncode != 0:
            JOBS[job_id]['status'] = 'failed'
            JOBS[job_id]['error']  = f"FFmpeg failed at {stage}: {stderr[-500:]}"
            return False
        JOBS[job_id]['progress'] = progress_end
        JOBS[job_id]['message']  = f"{stage} complete"
        return True
    except FileNotFoundError:
        JOBS[job_id]['status'] = 'failed'
        JOBS[job_id]['error']  = 'FFmpeg not found.'
        return False
    except Exception as e:
        JOBS[job_id]['status'] = 'failed'
        JOBS[job_id]['error']  = str(e)
        return False


def process_audio_job(job_id: str, input_path: str, base_name: str,
                      output_dir: str, preset: dict):
    """Main audio processing pipeline. Runs in background thread."""
    JOBS[job_id].update({'status': 'running', 'progress': 0, 'message': 'Starting…'})

    input_p  = Path(input_path)
    output_p = Path(output_dir)
    output_p.mkdir(parents=True, exist_ok=True)

    mp3_path = str(output_p / f"{base_name}.mp3")
    ogg_path = str(output_p / f"{base_name}.ogg")
    m4a_path = str(output_p / f"{base_name}.m4a")
    zip_path = str(output_p / f"{base_name}_forgepack.zip")

    # ── Step 1: Probe ─────────────────────────────────────────
    JOBS[job_id]['message'] = 'Analysing source file…'
    probe     = probe_audio(str(input_p))
    target    = preset.get('target_lufs', -16)
    true_peak = preset.get('true_peak', -1.5)
    lra       = preset.get('lra', 11)
    source_lufs = probe.get('loudness_lufs')
    duration    = probe.get('duration', 0)

    JOBS[job_id].update({
        'progress': 10, 'probe': probe, 'source_lufs': source_lufs,
        'target_lufs': target, 'duration': duration,
    })

    loudnorm = f"loudnorm=I={target}:TP={true_peak}:LRA={lra}"
    channels = str(min(probe.get('channels', 1), 2))  # max stereo

    # ── Step 2: MP3 ───────────────────────────────────────────
    JOBS[job_id]['message'] = f'Encoding MP3 (normalized to {target} LUFS)…'
    mp3_bitrate = preset.get('mp3_bitrate', '128k')
    mp3_cmd = ['ffmpeg', '-y', '-i', str(input_p), '-af', loudnorm,
               '-c:a', 'libmp3lame', '-b:a', mp3_bitrate, '-ar', '44100', '-ac', channels, mp3_path]
    if not run_ffmpeg_audio(mp3_cmd, job_id, 'MP3 encoding', 10, 45):
        return

    # ── Step 3: OGG ───────────────────────────────────────────
    JOBS[job_id]['message'] = 'Encoding OGG Vorbis…'
    ogg_quality = preset.get('ogg_quality', '4')
    ogg_cmd = ['ffmpeg', '-y', '-i', str(input_p), '-af', loudnorm,
               '-c:a', 'libvorbis', '-q:a', ogg_quality, '-ar', '44100', '-ac', channels, ogg_path]
    if not run_ffmpeg_audio(ogg_cmd, job_id, 'OGG encoding', 45, 75):
        return

    # ── Step 4: M4A / AAC ─────────────────────────────────────
    JOBS[job_id]['message'] = 'Encoding M4A (AAC)…'
    m4a_bitrate = preset.get('m4a_bitrate', '128k')
    m4a_cmd = ['ffmpeg', '-y', '-i', str(input_p), '-af', loudnorm,
               '-c:a', 'aac', '-b:a', m4a_bitrate, '-ar', '44100', '-ac', channels, m4a_path]
    if not run_ffmpeg_audio(m4a_cmd, job_id, 'M4A encoding', 75, 90):
        return

    # ── Step 5: Package ───────────────────────────────────────
    JOBS[job_id]['message'] = 'Packaging output…'
    lufs_str = f"{source_lufs:.1f}" if source_lufs is not None else 'unknown'
    adj = abs((source_lufs or target) - target)
    readme = f"""ForgePack Audio Output
======================
Source:        {input_p.name}
Preset:        {preset.get('label', 'Custom')}
Created:       {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}
Duration:      {duration:.1f}s
Source LUFS:   {lufs_str} LUFS
Target LUFS:   {target} LUFS
True Peak:     {true_peak} dBTP
Channels:      {probe.get('channels', 1)}

Files:
  {base_name}.mp3  — MP3, {mp3_bitrate}, normalized to {target} LUFS
  {base_name}.ogg  — OGG Vorbis, quality {ogg_quality}, normalized
  {base_name}.m4a  — AAC {m4a_bitrate}, for Safari, normalized

CourseForge import:
  Drop all three files into a CourseForge Media block (audio kind).
  Files with the same base name are auto-paired as companions.
  The .mp3 is the primary; .ogg and .m4a are fallbacks.

Loudness note:
  All files normalized to {target} LUFS (EBU R128) — the broadcast
  standard for training narration. Source was {lufs_str} LUFS
  ({'boosted' if source_lufs and source_lufs < target else 'reduced'} by {adj:.1f} dB).
"""

    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.write(mp3_path, f"{base_name}.mp3")
        zf.write(ogg_path, f"{base_name}.ogg")
        zf.write(m4a_path, f"{base_name}.m4a")
        zf.writestr('README.txt', readme)

    for path in [mp3_path, ogg_path, m4a_path]:
        try: os.remove(path)
        except: pass
    try: os.remove(str(input_p))
    except: pass

    JOBS[job_id].update({
        'status': 'complete', 'progress': 100, 'message': 'Done',
        'output_path': zip_path, 'base_name': base_name,
        'source_lufs': source_lufs, 'target_lufs': target, 'duration': duration,
    })


def start_audio_job(input_path: str, base_name: str, output_dir: str, preset: dict) -> str:
    job_id = str(uuid.uuid4())
    JOBS[job_id] = {
        'status': 'queued', 'progress': 0, 'message': 'Queued',
        'output_path': None, 'error': None, 'created_at': datetime.utcnow().isoformat(),
    }
    threading.Thread(
        target=process_audio_job,
        args=(job_id, input_path, base_name, output_dir, preset),
        daemon=True,
    ).start()
    return job_id


def get_audio_job(job_id: str) -> dict | None:
    return JOBS.get(job_id)
