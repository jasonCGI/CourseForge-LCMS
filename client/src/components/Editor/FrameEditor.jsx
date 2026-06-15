import React, { useState } from 'react'
import useEditorStore from '../../store/editorStore'
import FrameHeader from './FrameHeader'
import BlockToolbar from './BlockToolbar'
import TextBlock from './blocks/TextBlock'
import MediaBlock from './blocks/MediaBlock'
import QuizBlock from './blocks/QuizBlock'
import HotspotBlock from './blocks/HotspotBlock'
import BranchBlock from './blocks/BranchBlock'
import PreviewModal from '../Preview/PreviewModal'

const BLOCK_COMPONENTS = {
  text:    TextBlock,
  media:   MediaBlock,
  quiz:    QuizBlock,
  hotspot: HotspotBlock,
  branch:  BranchBlock,
}

export default function FrameEditor() {
  const activeFrame  = useEditorStore(s => s.activeFrame)
  const [showPreview, setShowPreview] = useState(false)

  if (!activeFrame) {
    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center',
        justifyContent: 'center', flexDirection: 'column',
        gap: 10, color: 'var(--color-text-secondary)',
      }}>
        <div style={{ fontSize: 32, opacity: 0.3 }}>🎞</div>
        <p style={{ fontSize: 14, margin: 0 }}>Select a frame from the sidebar</p>
        <p style={{ fontSize: 12, margin: 0, opacity: 0.6 }}>
          Or import a JSON project to get started
        </p>
      </div>
    )
  }

  const blocks = activeFrame.content?.blocks || []

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      <FrameHeader onPreview={() => setShowPreview(true)} />

      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        {blocks.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--color-text-secondary)', fontSize: 13 }}>
            No blocks yet — use the toolbar below to add content.
          </div>
        )}
        {blocks.map(block => {
          const BlockComponent = BLOCK_COMPONENTS[block.type]
          if (!BlockComponent) {
            return (
              <div key={block.id} style={{
                padding: '12px 16px', border: '1px dashed var(--color-border-tertiary)',
                borderRadius: 6, marginBottom: 12, fontSize: 12,
                color: 'var(--color-text-secondary)',
              }}>
                Block type <strong>{block.type}</strong> — editor coming in Sprint 5
              </div>
            )
          }
          return <BlockComponent key={block.id} block={block} />
        })}
      </div>

      <BlockToolbar />

      {showPreview && <PreviewModal onClose={() => setShowPreview(false)} />}
    </div>
  )
}
