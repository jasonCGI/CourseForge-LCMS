/**
 * Count words in HTML (tags stripped). Read ~230 wpm, narrate ~150 wpm.
 */
export function countWords(html) {
  if (!html) return { words: 0, chars: 0, readSeconds: 0, narrateSeconds: 0 }
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[^;]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const words = text ? text.split(/\s+/).filter(w => w.length).length : 0
  return {
    words,
    chars: text.length,
    readSeconds: Math.round((words / 230) * 60),
    narrateSeconds: Math.round((words / 150) * 60),
  }
}

export function formatTime(seconds) {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60), s = seconds % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}
