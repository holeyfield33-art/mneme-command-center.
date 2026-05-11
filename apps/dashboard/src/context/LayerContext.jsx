import React, { createContext, useState, useCallback } from 'react'

/**
 * LayerContext - Progressive Dashboard Layer Management
 * 
 * Manages visibility and state of dashboard layers:
 * - Layer 0: Approval Hub (always on)
 * - Layer 1: Activity Feed (collapsible)
 * - Layer 2: Workflow Canvas (modal)
 * - Layer 3: Control Room (modal)
 */

export const LayerContext = createContext()

export function LayerProvider({ children }) {
  const [layers, setLayers] = useState({
    layer0: { visible: true, name: 'Approval Hub', minimized: false },
    layer1: { visible: true, name: 'Activity Feed', minimized: true },
    layer2: { visible: false, name: 'Workflow Canvas', minimized: false, isModal: true, taskId: null },
    layer3: { visible: false, name: 'Control Room', minimized: false, isModal: true }
  })

  const toggleLayer = useCallback((layerId) => {
    setLayers(prev => ({
      ...prev,
      [layerId]: {
        ...prev[layerId],
        visible: !prev[layerId].visible
      }
    }))
  }, [])

  const toggleMinimize = useCallback((layerId) => {
    setLayers(prev => ({
      ...prev,
      [layerId]: {
        ...prev[layerId],
        minimized: !prev[layerId].minimized
      }
    }))
  }, [])

  const showModal = useCallback((layerId, options = {}) => {
    setLayers(prev => ({
      ...prev,
      [layerId]: {
        ...prev[layerId],
        visible: true,
        minimized: false,
        ...(options || {})
      }
    }))
  }, [])

  const hideModal = useCallback((layerId) => {
    setLayers(prev => ({
      ...prev,
      [layerId]: {
        ...prev[layerId],
        visible: false
      }
    }))
  }, [])

  const value = {
    layers,
    toggleLayer,
    toggleMinimize,
    showModal,
    hideModal
  }

  return (
    <LayerContext.Provider value={value}>
      {children}
    </LayerContext.Provider>
  )
}

export function useLayers() {
  const context = React.useContext(LayerContext)
  if (!context) {
    throw new Error('useLayers must be used within a LayerProvider')
  }
  return context
}
