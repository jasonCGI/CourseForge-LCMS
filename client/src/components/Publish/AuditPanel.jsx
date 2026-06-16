import React, { useMemo } from 'react'
import useProjectStore from '../../store/projectStore'

// ── Audit checks ─────────────────────────────────────────────────

function auditProject(project) {
  const issues = []
  const warnings = []

  if (!project) return { issues, warnings }

  let frameCount   = 0
  let videoFrames  = 0
  let videoWithCaptions = 0
  let videoWithWebm = 0
  let imagesTotal  = 0
  let imagesWithAlt = 0
  let emptyFrames  = 0
  let branchNoTarget = 0

  for (const course of project.courses || []) {
    for (const mod of course.modules || []) {
      for (const lesson of mod.lessons || []) {
        for (const frame of lesson.frames || []) {
          frameCount++
          const blocks = frame.content?.blocks || []

          if (blocks.length === 0) {
            emptyFrames++
          }

          for (const block of blocks) {
            if (block.type === 'media' && block.data?.kind === 'video') {
              videoFrames++
              if (block.data?.asset_meta?.has_captions) videoWithCaptions++
              if (block.data?.asset_meta?.has_webm)     videoWithWebm++
            }

            if (block.type === 'media' && block.data?.kind === 'image') {
              imagesTotal++
              if (block.data?.alt_text) imagesWithAlt++
            }

            if (block.type === 'branch') {
              if (!block.data?.true_frame_id || !block.data?.false_frame_id) {
                branchNoTarget++
              }
            }
          }
        }
      }
    }
  }

  // ── Errors (block publish) ──────────────────────────────────
  if (branchNoTarget > 0) {
    issues.push({
      code: 'BRANCH_NO_TARGET',
      label: `${branchNoTarget} branch block${branchNoTarget > 1 ? 's' : ''} missing frame targets`,
      detail: 'Branch blocks must have both true and false targets set before publishing.',
      fix: 'Open each branch block and select destination frames.',
    })
  }

  // ── Warnings (508 / best practice) ─────────────────────────
  if (videoFrames > 0) {
    const uncaptioned = videoFrames - videoWithCaptions
    if (uncaptioned > 0) {
      warnings.push({
        code: 'VIDEO_NO_CAPTIONS',
        label: `${uncaptioned} video${uncaptioned > 1 ? 's' : ''} without caption file (VTT)`,
        detail: 'WCAG 1.2.2 requires captions for all pre-recorded video with speech. If this video has no spoken content, this warning can be ignored.',
        fix: 'Upload a .vtt file with the same base name as the video file. It will be auto-paired.',
        wcag: '1.2.2',
      })
    }

    const noWebm = videoFrames - videoWithWebm
    if (noWebm > 0) {
      warnings.push({
        code: 'VIDEO_NO_WEBM',
        label: `${noWebm} video${noWebm > 1 ? 's' : ''} without WebM fallback`,
        detail: 'A .webm fallback ensures video plays in restricted browser environments (government/DoD systems).',
        fix: 'Run source video through ForgePack to generate .webm + .mp4 paired files.',
        wcag: null,
      })
    }
  }

  if (imagesTotal > 0 && imagesWithAlt < imagesTotal) {
    const missing = imagesTotal - imagesWithAlt
    warnings.push({
      code: 'IMAGE_NO_ALT',
      label: `${missing} image${missing > 1 ? 's' : ''} without alt text`,
      detail: 'WCAG 1.1.1 requires all informational images to have descriptive alt text.',
      fix: 'Add alt text to each image block in the Media block settings.',
      wcag: '1.1.1',
    })
  }

  if (emptyFrames > 0) {
    warnings.push({
      code: 'EMPTY_FRAMES',
      label: `${emptyFrames} frame${emptyFrames > 1 ? 's' : ''} with no content blocks`,
      detail: 'Empty frames will render as blank pages in the published course.',
      fix: 'Add at least one content block to each frame, or remove unused frames.',
      wcag: null,
    })
  }

  const stats = { frameCount, videoFrames, videoWithCaptions, videoWithWebm, imagesTotal, imagesWithAlt }

  return { issues, warnings, stats }
}

// ── Component ─────────────────────────────────────────────────────

export default function AuditPanel({ onProceed, onCancel }) {
  const activeProject = useProjectStore(s => s.activeProject)
  const { issues, warnings, stats } = useMemo(
    () => auditProject(activeProject),
    [activeProject]
  )

  const hasBlockers = issues.length > 0
  const score = stats
    ? Math.round(
        ((stats.videoWithCaptions / Math.max(stats.videoFrames, 1)) * 40 +
         (stats.imagesWithAlt     / Math.max(stats.imagesTotal,  1)) * 40 +
         (issues.length === 0 ? 20 : 0))
      )
    : 100

  return (
    <div>
      {/* Score */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '14px 20px',
        background: 'var(--cf-input-bg)',
        border: '1px solid var(--cf-border-secondary)',
        borderRadius: 8, marginBottom: 16,
      }}>
        <div style={{
          width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
          background: score >= 80 ? 'rgba(59,138,74,0.15)' : score >= 50 ? 'color-mix(in srgb, var(--forge-amber) 15%, transparent)' : 'rgba(194,57,52,0.15)',
          border: `2px solid ${score >= 80 ? '#4CAF50' : score >= 50 ? 'var(--forge-amber)' : '#E87070'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, fontWeight: 700,
          color: score >= 80 ? '#4CAF50' : score >= 50 ? 'var(--forge-amber)' : '#E87070',
        }}>
          {score}
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--cf-text-primary)', marginBottom: 2 }}>
            508 / Accessibility Score
          </div>
          <div style={{ fontSize: 12, color: 'var(--cf-text-secondary)' }}>
            {score >= 80 ? 'Good — ready to publish' : score >= 50 ? 'Needs attention — review warnings below' : 'Issues found — resolve before publishing'}
          </div>
          <div style={{ fontSize: 10, color: 'var(--cf-text-tertiary)', marginTop: 2 }}>
            Heuristic estimate — not a formal WCAG conformance score.
          </div>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--cf-text-tertiary)', textAlign: 'right' }}>
          <div>{stats?.frameCount || 0} frames</div>
          <div>{stats?.videoFrames || 0} videos</div>
          <div>{stats?.imagesTotal || 0} images</div>
        </div>
      </div>

      {/* Errors */}
      {issues.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#E87070', marginBottom: 8 }}>
            Errors — must fix before publishing
          </div>
          {issues.map(issue => (
            <AuditItem key={issue.code} item={issue} type="error" />
          ))}
        </div>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--forge-amber)', marginBottom: 8 }}>
            Warnings — recommended fixes
          </div>
          {warnings.map(w => (
            <AuditItem key={w.code} item={w} type="warning" />
          ))}
        </div>
      )}

      {issues.length === 0 && warnings.length === 0 && (
        <div style={{
          padding: '16px 20px', background: 'rgba(59,138,74,0.1)',
          border: '1px solid rgba(59,138,74,0.3)', borderRadius: 6,
          fontSize: 13, color: '#4CAF50', marginBottom: 14,
        }}>
          ✓ No issues found — project is ready to publish.
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 14, borderTop: '1px solid var(--cf-border-tertiary)' }}>
        <button onClick={onCancel} style={secondaryBtnStyle}>Cancel</button>
        <button
          onClick={onProceed}
          disabled={hasBlockers}
          style={{
            padding: '8px 20px',
            background: hasBlockers ? 'var(--cf-border-primary)' : '#185FA5',
            color: hasBlockers ? 'var(--cf-text-tertiary)' : '#fff',
            border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 600,
            cursor: hasBlockers ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--cf-font)',
          }}
          aria-disabled={hasBlockers}
        >
          {hasBlockers ? 'Fix errors to continue' : 'Continue to Publish →'}
        </button>
      </div>
    </div>
  )
}

function AuditItem({ item, type }) {
  const [open, setOpen] = React.useState(false)
  const isError = type === 'error'
  const color   = isError ? '#E87070' : 'var(--forge-amber)'
  const bg      = isError ? 'rgba(194,57,52,0.08)' : 'color-mix(in srgb, var(--forge-amber) 8%, transparent)'
  const border  = isError ? 'rgba(194,57,52,0.25)' : 'color-mix(in srgb, var(--forge-amber) 25%, transparent)'

  return (
    <div style={{
      background: bg, border: `1px solid ${border}`,
      borderRadius: 6, marginBottom: 8, overflow: 'hidden',
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        style={{
          width: '100%', padding: '10px 14px',
          background: 'transparent', border: 'none',
          display: 'flex', alignItems: 'center', gap: 10,
          cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--cf-font)',
        }}
      >
        <span style={{ color, fontSize: 13 }}>{isError ? '✕' : '⚠'}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color, flex: 1 }}>{item.label}</span>
        {item.wcag && (
          <span style={{
            fontSize: 9, fontWeight: 700, padding: '1px 5px',
            borderRadius: 3, background: `${color}22`, color,
            letterSpacing: '0.06em',
          }}>WCAG {item.wcag}</span>
        )}
        <span style={{ fontSize: 10, color: 'var(--cf-text-tertiary)' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ padding: '0 14px 12px', borderTop: `1px solid ${border}` }}>
          <p style={{ fontSize: 12, color: 'var(--cf-text-secondary)', margin: '10px 0 6px', lineHeight: 1.5 }}>
            {item.detail}
          </p>
          {item.fix && (
            <div style={{
              fontSize: 11, color, padding: '6px 10px',
              background: `${color}11`, borderRadius: 4,
              borderLeft: `2px solid ${color}`,
            }}>
              <strong>Fix:</strong> {item.fix}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const secondaryBtnStyle = {
  padding: '8px 16px', background: 'transparent',
  color: 'var(--cf-text-secondary)',
  border: '1px solid var(--cf-border-secondary)',
  borderRadius: 4, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--cf-font)',
}
