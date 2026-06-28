/**
 * Frame completion status for the content-tree audit.
 *
 *  'optional'   — frame flagged optional (excluded from completion counts)
 *  'empty'      — no blocks
 *  'incomplete' — a block is missing required data (errors, not warnings)
 *  'complete'   — all good
 */
// Real authoring status, ignoring the optional flag. The tree shows this in the
// status dot even for optional frames (optional is surfaced as a separate OPT
// chip), so a optional-but-unfinished frame still reads as incomplete/empty.
export function getFrameBaseStatus(frame) {
  const blocks = frame?.content?.blocks || []
  if (blocks.length === 0) return 'empty'
  return getFrameIssues(frame).some(i => i.severity !== 'warning') ? 'incomplete' : 'complete'
}

export function getFrameCompletion(frame) {
  if (frame?.optional) return 'optional'
  return getFrameBaseStatus(frame)
}

export function getFrameIssues(frame) {
  const blocks = frame?.content?.blocks || []
  const issues = []
  for (const block of blocks) {
    const data = block.data || {}
    switch (block.type) {
      case 'media':
        if (!data.asset_id && !data.serve_url)
          issues.push({ block_type: 'media', issue: `${data.placeholder_label || data.kind || 'Media'} not uploaded` })
        // Captions only matter when the video actually has an audio track.
        if (data.kind === 'video' && data.asset_id && data.asset_meta &&
            data.asset_meta.has_audio !== false && !data.asset_meta.has_captions)
          issues.push({ block_type: 'media', issue: 'Video missing caption file (.vtt)', severity: 'warning' })
        break
      case 'hotspot':
        if (!data.background_asset_id && !data.background_url && !data.image_id)
          issues.push({ block_type: 'hotspot', issue: 'Hotspot missing background image' })
        if (!data.regions || data.regions.length === 0)
          issues.push({ block_type: 'hotspot', issue: 'Hotspot has no regions defined' })
        break
      case 'quiz':
        if (!data.question || !data.question.trim())
          issues.push({ block_type: 'quiz', issue: 'Quiz missing question' })
        if (!data.choices || data.choices.length < 2)
          issues.push({ block_type: 'quiz', issue: 'Quiz needs at least 2 choices' })
        break
      case 'branch':
        if (!data.condition || !data.condition.trim())
          issues.push({ block_type: 'branch', issue: 'Branch missing condition' })
        if (!data.true_frame_id && !data.false_frame_id)
          issues.push({ block_type: 'branch', issue: 'Branch target frames not set', severity: 'warning' })
        break
      case 'oam':
        if (!data.oam_asset_id) issues.push({ block_type: 'oam', issue: 'OAM file not uploaded' })
        break
      case 'ivideo':
        if (!data.video_asset_id) issues.push({ block_type: 'ivideo', issue: 'Interactive video not uploaded' })
        if (!data.clip_asset_id && !(data.clip && (data.clip.interactions || []).length))
          issues.push({ block_type: 'ivideo', issue: '.clip.json not uploaded', severity: 'warning' })
        break
      case 'model3d':
        if (!data.model_asset_id) issues.push({ block_type: 'model3d', issue: '3D model not uploaded' })
        break
      case 'gui':
        if (!data.gui_asset_id) issues.push({ block_type: 'gui', issue: 'GUI shell not uploaded' })
        break
      case 'wcn':
        if (!data.text || !data.text.trim()) issues.push({ block_type: 'wcn', issue: 'WCN block has no text' })
        break
      default:
        break
    }
  }
  return issues
}
