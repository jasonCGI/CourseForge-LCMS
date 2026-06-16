import { create } from 'zustand'

/**
 * In-memory block clipboard (one block). Cleared on refresh.
 */
const useClipboardStore = create((set) => ({
  copiedBlock: null, // { type, data, sourceFrameId, label, copiedAt }

  copyBlock: (block, frameId) => {
    const copy = JSON.parse(JSON.stringify(block))
    set({
      copiedBlock: {
        type: copy.type, data: copy.data,
        sourceFrameId: frameId, label: _blockLabel(copy),
        copiedAt: Date.now(),
      },
    })
  },

  clearClipboard: () => set({ copiedBlock: null }),
}))

function _blockLabel(block) {
  switch (block.type) {
    case 'text':    return 'Text block'
    case 'media':   return `${block.data?.kind || 'Media'} block`
    case 'quiz':    return 'Quiz block'
    case 'hotspot': return 'Hotspot block'
    case 'branch':  return 'Branch block'
    case 'wcn':     return `${block.data?.wcn_type || 'WCN'} block`
    case 'oam':     return 'OAM block'
    case 'ivideo':  return 'Interactive video block'
    case 'model3d': return '3D model block'
    case 'gui':     return 'GUI shell block'
    default:        return `${block.type} block`
  }
}

export default useClipboardStore
