import React, { useState, useEffect } from 'react'
import { system } from '../api'
import { useLayers } from '../context/LayerContext'

/**
 * ActivityFeed - Layer 1 Event Log
 * 
 * Collapsible event log showing:
 * - Recent approvals
 * - Task status changes
 * - Agent actions
 * - Policy denials
 * - System events
 * 
 * Expands/collapses smoothly; docks to left side of screen
 */
export default function ActivityFeed() {
  const { layers, toggleMinimize } = useLayers()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(false)
  const layer = layers?.layer1

  if (!layer?.visible) return null

  useEffect(() => {
    const loadEvents = async () => {
      try {
        // Try to load audit events (Phase 0 added this endpoint)
        const res = await system.getAuditEvents?.call?.(this, { limit: 50 })
        if (res?.data) {
          // Transform audit logs into activity feed format
          setEvents(res.data.map(log => ({
            id: log.id,
            type: log.operation,
            actor: log.actor,
            resource: log.resource,
            status: log.status,
            timestamp: new Date(log.created_at),
            message: `${log.actor} ${log.operation} ${log.resource}`,
            details: log.details
          })))
        }
      } catch (err) {
        console.error('Failed to load audit events:', err)
        // Fallback: create mock events for demo
        setEvents([
          {
            id: '1',
            type: 'approval_approved',
            actor: 'user',
            resource: 'task-123',
            status: 'ok',
            timestamp: new Date(),
            message: 'Approved PR creation for task-123',
            details: {}
          },
          {
            id: '2',
            type: 'task_status_change',
            actor: 'system',
            resource: 'task-123',
            status: 'ok',
            timestamp: new Date(Date.now() - 300000),
            message: 'Task status changed to executing',
            details: { prev_status: 'planning', new_status: 'executing' }
          }
        ])
      }
    }

    loadEvents()
    const interval = setInterval(loadEvents, 10000)
    return () => clearInterval(interval)
  }, [])

  const getEventIcon = (type) => {
    switch (type) {
      case 'approval_approved':
        return '✓'
      case 'approval_rejected':
        return '✗'
      case 'approval_modified':
        return '✎'
      case 'task_status_change':
        return '→'
      case 'policy_denial':
        return '⛔'
      case 'secret_access':
        return '🔐'
      default:
        return '•'
    }
  }

  const getEventColor = (type) => {
    switch (type) {
      case 'approval_approved':
        return '#27ae60'
      case 'approval_rejected':
        return '#e74c3c'
      case 'approval_modified':
        return '#f39c12'
      case 'policy_denial':
        return '#e74c3c'
      case 'secret_access':
        return '#3498db'
      default:
        return '#95a5a6'
    }
  }

  const formatTime = (date) => {
    const now = new Date()
    const diffMs = now - date
    const diffSecs = Math.floor(diffMs / 1000)
    const diffMins = Math.floor(diffSecs / 60)
    const diffHours = Math.floor(diffMins / 60)

    if (diffSecs < 60) return `${diffSecs}s ago`
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return date.toLocaleDateString()
  }

  return (
    <div style={{
      position: 'fixed',
      left: 0,
      top: '0.5rem',
      bottom: '24rem',
      width: layer.minimized ? '3rem' : '24rem',
      backgroundColor: '#2c3e50',
      color: 'white',
      borderRight: '1px solid #34495e',
      borderRadius: '0 0.5rem 0.5rem 0',
      boxShadow: '2px 2px 8px rgba(0,0,0,0.15)',
      zIndex: 9998,
      transform: `translateX(${layer.minimized ? 'calc(-100% + 3rem)' : '0'})`,
      transition: 'transform 0.3s ease, width 0.3s ease',
      overflowX: 'hidden',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Minimizable header */}
      <div style={{
        padding: '0.75rem',
        borderBottom: '1px solid #34495e',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        cursor: 'pointer',
        backgroundColor: '#1a252f',
        flexShrink: 0
      }}>
        <div style={{ display: layer.minimized ? 'none' : 'block' }}>
          <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '0.95rem', fontWeight: 'bold' }}>
            📋 Activity Log
          </h3>
          <div style={{ fontSize: '0.7rem', opacity: 0.7 }}>
            Last 50 events
          </div>
        </div>
        <button
          onClick={() => toggleMinimize('layer1')}
          style={{
            background: 'none',
            border: 'none',
            color: 'white',
            fontSize: '1rem',
            cursor: 'pointer',
            padding: '0.25rem 0.5rem'
          }}
        >
          {layer.minimized ? '◀' : '▶'}
        </button>
      </div>

      {/* Events list */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        fontSize: '0.8rem',
        display: layer.minimized ? 'none' : 'block',
        padding: '0.5rem 0'
      }}>
        {events.length === 0 ? (
          <div style={{ padding: '1rem', opacity: 0.6, textAlign: 'center' }}>
            No events yet
          </div>
        ) : (
          events.map((event, idx) => (
            <div
              key={event.id || idx}
              style={{
                padding: '0.6rem 0.75rem',
                borderBottom: '1px solid #34495e',
                opacity: idx === 0 ? 1 : 0.8,
                cursor: 'pointer',
                transition: 'background-color 0.2s',
                ':hover': { backgroundColor: '#34495e' }
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#34495e'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent'
              }}
            >
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.25rem' }}>
                <span style={{
                  color: getEventColor(event.type),
                  fontSize: '0.9rem',
                  flexShrink: 0
                }}>
                  {getEventIcon(event.type)}
                </span>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontSize: '0.8rem',
                    opacity: 0.9
                  }}>
                    {event.message}
                  </div>
                  <div style={{
                    fontSize: '0.7rem',
                    opacity: 0.6,
                    marginTop: '0.2rem'
                  }}>
                    {formatTime(event.timestamp)}
                  </div>
                </div>
              </div>
              {event.status !== 'ok' && (
                <div style={{
                  fontSize: '0.7rem',
                  color: '#e74c3c',
                  marginLeft: '1.25rem'
                }}>
                  Status: {event.status}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
