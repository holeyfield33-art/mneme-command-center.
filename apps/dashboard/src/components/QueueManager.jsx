import React, { useState, useEffect } from 'react'
import { tasks, system } from '../api'
import { useLayers } from '../context/LayerContext'

/**
 * QueueManager - Task Queue with Priority Controls
 * 
 * Features:
 * - Shows pending/queued tasks in priority order
 * - Drag-reorder for priority management
 * - Pause/resume individual tasks
 * - Cancel with reason
 * - Task status visualization
 */
export default function QueueManager() {
  const { layers, toggleMinimize, hideModal, showModal } = useLayers()
  const [queue, setQueue] = useState([])
  const [loading, setLoading] = useState(false)
  const [draggedTask, setDraggedTask] = useState(null)
  const layer = layers?.layer1 // Reuse layer 1 socket or show separately

  useEffect(() => {
    loadQueue()
    const interval = setInterval(loadQueue, 5000)
    return () => clearInterval(interval)
  }, [])

  const loadQueue = async () => {
    try {
      const res = await tasks.list()
      const queued = res.data?.filter(t => ['queued', 'pending', 'planning'].includes(t.status)) || []
      setQueue(queued)
    } catch (err) {
      console.error('Failed to load queue:', err)
    }
  }

  const handlePauseTask = async (taskId) => {
    try {
      // Call pause endpoint if available
      // await tasks.pause(taskId)
      setQueue(q => q.map(t => t.id === taskId ? { ...t, status: 'paused' } : t))
    } catch (err) {
      console.error('Failed to pause task:', err)
    }
  }

  const handleResumeTask = async (taskId) => {
    try {
      // Call resume endpoint if available
      // await tasks.resume(taskId)
      setQueue(q => q.map(t => t.id === taskId ? { ...t, status: 'queued' } : t))
    } catch (err) {
      console.error('Failed to resume task:', err)
    }
  }

  const handleCancelTask = async (taskId, reason) => {
    try {
      // Call cancel endpoint if available
      // await tasks.cancel(taskId, { reason })
      setQueue(q => q.filter(t => t.id !== taskId))
    } catch (err) {
      console.error('Failed to cancel task:', err)
    }
  }

  const handleDragStart = (task) => {
    setDraggedTask(task)
  }

  const handleDragOver = (e) => {
    e.preventDefault()
  }

  const handleDrop = (targetTask) => {
    if (!draggedTask || draggedTask.id === targetTask.id) return

    // Reorder in local state
    const newQueue = [...queue]
    const draggedIdx = newQueue.findIndex(t => t.id === draggedTask.id)
    const targetIdx = newQueue.findIndex(t => t.id === targetTask.id)

    if (draggedIdx > -1 && targetIdx > -1) {
      [newQueue[draggedIdx], newQueue[targetIdx]] = [newQueue[targetIdx], newQueue[draggedIdx]]
      setQueue(newQueue)
      // TODO: call API to persist priority change
    }

    setDraggedTask(null)
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'queued':
        return '#3498db'
      case 'pending':
        return '#3498db'
      case 'planning':
        return '#f39c12'
      case 'paused':
        return '#95a5a6'
      default:
        return '#7f8c8d'
    }
  }

  if (!queue.length) {
    return null
  }

  return (
    <div style={{
      backgroundColor: '#2c3e50',
      color: 'white',
      borderRadius: '0.5rem',
      padding: '1.5rem',
      marginBottom: '2rem',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
    }}>
      <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span>📋 Task Queue ({queue.length})</span>
      </h3>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.75rem' }}>
        {queue.map((task, idx) => (
          <div
            key={task.id}
            draggable
            onDragStart={() => handleDragStart(task)}
            onDragOver={handleDragOver}
            onDrop={() => handleDrop(task)}
            style={{
              backgroundColor: '#34495e',
              padding: '1rem',
              borderRadius: '0.25rem',
              cursor: draggedTask?.id === task.id ? 'grabbing' : 'grab',
              opacity: draggedTask?.id === task.id ? 0.5 : 1,
              border: `2px solid ${getStatusColor(task.status)}`,
              transition: 'all 0.2s'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
              {/* Priority indicator */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '2rem',
                height: '2rem',
                backgroundColor: '#2c3e50',
                borderRadius: '50%',
                fontWeight: 'bold',
                fontSize: '0.9rem'
              }}>
                #{idx + 1}
              </div>

              {/* Task info */}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>
                  {task.title}
                </div>
                <div style={{
                  fontSize: '0.8rem',
                  opacity: 0.7,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem'
                }}>
                  <span>Status: {task.status}</span>
                  {task.risk_level && <span>Risk: {task.risk_level}</span>}
                  {task.project_id && <span>Project: {task.project_id.substring(0, 8)}...</span>}
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {task.status === 'paused' ? (
                  <button
                    onClick={() => handleResumeTask(task.id)}
                    style={{
                      padding: '0.4rem 0.8rem',
                      backgroundColor: '#27ae60',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.2rem',
                      cursor: 'pointer',
                      fontSize: '0.8rem'
                    }}
                  >
                    Resume
                  </button>
                ) : (
                  <button
                    onClick={() => handlePauseTask(task.id)}
                    style={{
                      padding: '0.4rem 0.8rem',
                      backgroundColor: '#f39c12',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.2rem',
                      cursor: 'pointer',
                      fontSize: '0.8rem'
                    }}
                  >
                    Pause
                  </button>
                )}
                <button
                  onClick={() => handleCancelTask(task.id, 'Cancelled by user')}
                  style={{
                    padding: '0.4rem 0.8rem',
                    backgroundColor: '#e74c3c',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.2rem',
                    cursor: 'pointer',
                    fontSize: '0.8rem'
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>

            {/* Progress bar */}
            {task.estimated_duration && (
              <div style={{
                backgroundColor: '#2c3e50',
                height: '0.25rem',
                borderRadius: '0.125rem',
                overflow: 'hidden',
                marginTop: '0.5rem'
              }}>
                <div style={{
                  width: task.progress ? `${task.progress * 100}%` : '0%',
                  height: '100%',
                  backgroundColor: getStatusColor(task.status),
                  transition: 'width 0.3s'
                }} />
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{
        marginTop: '1rem',
        padding: '0.75rem',
        backgroundColor: '#1a252f',
        borderRadius: '0.25rem',
        fontSize: '0.8rem',
        opacity: 0.8
      }}>
        💡 Drag tasks to reorder priority. Pause to hold, Resume to continue, Cancel to remove.
      </div>
    </div>
  )
}
