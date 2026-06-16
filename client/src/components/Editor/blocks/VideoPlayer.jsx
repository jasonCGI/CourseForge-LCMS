import React, { useEffect, useRef } from 'react'
import videojs from 'video.js'
import 'video.js/dist/video-js.css'

// Theme-matched Video.js skin — applied via CSS custom properties, injected once
const CF_VIDEOJS_STYLE = `
  .cf-video-player { width: 100%; }
  .cf-video-player .vjs-control-bar {
    background: var(--cf-header-bg, #06080f);
    border-top: 1px solid var(--cf-border-primary, #1c1c2c);
  }
  .cf-video-player .vjs-play-progress,
  .cf-video-player .vjs-volume-level { background: var(--cf-accent, var(--forge-amber)); }
  .cf-video-player .vjs-load-progress { background: var(--cf-border-secondary, #2a3848); }
  .cf-video-player .vjs-button > .vjs-icon-placeholder::before,
  .cf-video-player .vjs-time-control,
  .cf-video-player .vjs-remaining-time { color: var(--cf-text-secondary, #7A90A8); }
  .cf-video-player .vjs-button:hover > .vjs-icon-placeholder::before { color: var(--cf-accent, var(--forge-amber)); }
  .cf-video-player .vjs-big-play-button {
    background: var(--cf-accent, var(--forge-amber)); border: none; border-radius: 50%;
    width: 60px; height: 60px; line-height: 60px;
    margin-top: -30px; margin-left: -30px;
  }
  .cf-video-player .vjs-big-play-button .vjs-icon-placeholder::before {
    color: var(--cf-header-bg, #06080f); font-size: 28px; line-height: 60px;
  }
  .cf-video-player:hover .vjs-big-play-button,
  .cf-video-player .vjs-big-play-button:focus {
    background: var(--cf-accent, var(--forge-amber));
    outline: 3px solid var(--cf-accent, var(--forge-amber)); outline-offset: 2px;
  }
  .cf-video-player .vjs-text-track-display .vjs-text-track-cue > div {
    background: rgba(0,0,0,0.85) !important; color: #FFFFFF !important;
    font-family: var(--cf-font, Inter, system-ui, sans-serif);
    font-size: 14px; padding: 4px 8px; border-radius: 3px;
  }
  [data-cf-mode="hc"] .cf-video-player .vjs-control-bar { background: #000000; border-top: 2px solid #FFFFFF; }
  [data-cf-mode="hc"] .cf-video-player .vjs-button > .vjs-icon-placeholder::before { color: #FFFFFF; }
  [data-cf-mode="hc"] .cf-video-player .vjs-play-progress,
  [data-cf-mode="hc"] .cf-video-player .vjs-volume-level { background: var(--forge-amber); }
  [data-cf-mode="hc"] .cf-video-player .vjs-big-play-button { background: var(--forge-amber); border: 2px solid #FFFFFF; }
  [data-cf-mode="light"] .cf-video-player .vjs-control-bar { background: #1B3A5C; border-top: 1px solid #2A5A8C; }
  [data-cf-mode="light"] .cf-video-player .vjs-button > .vjs-icon-placeholder::before,
  [data-cf-mode="light"] .cf-video-player .vjs-time-control { color: #B5D4F4; }
  .cf-video-player .vjs-control:focus,
  .cf-video-player .vjs-button:focus {
    outline: var(--cf-focus-outline, 2px solid var(--forge-amber)) !important; outline-offset: 2px;
  }
`

if (typeof document !== 'undefined' && !document.getElementById('cf-videojs-style')) {
  const style = document.createElement('style')
  style.id = 'cf-videojs-style'
  style.textContent = CF_VIDEOJS_STYLE
  document.head.appendChild(style)
}

export default function VideoPlayer({
  mp4Url, webmUrl, vttUrl, posterUrl,
  width, height, controls = true, autoplay = false,
  loop = false, muted = false, title = 'Video',
}) {
  const videoRef = useRef(null)
  const playerRef = useRef(null)

  useEffect(() => {
    if (!videoRef.current) return

    const sources = []
    if (webmUrl) sources.push({ src: webmUrl, type: 'video/webm' })
    if (mp4Url)  sources.push({ src: mp4Url,  type: 'video/mp4'  })

    const options = {
      controls, autoplay, loop, muted,
      poster: posterUrl || undefined,
      fluid: !width,
      width:  width  || undefined,
      height: height || undefined,
      sources,
      playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 2],
      html5: { vhs: { overrideNative: true } },
    }

    const player = videojs(videoRef.current, options)
    playerRef.current = player

    if (vttUrl) {
      player.ready(() => {
        player.addRemoteTextTrack({
          kind: 'captions', src: vttUrl,
          srclang: 'en', label: 'English', default: true,
        }, false)
      })
    }

    return () => {
      if (playerRef.current) {
        playerRef.current.dispose()
        playerRef.current = null
      }
    }
  }, [mp4Url, webmUrl, vttUrl, posterUrl])

  return (
    <div data-vjs-player style={{ width: width ? `${width}px` : '100%' }}>
      <video
        ref={videoRef}
        className="video-js vjs-big-play-centered cf-video-player"
        aria-label={title}
        playsInline
      />
    </div>
  )
}
