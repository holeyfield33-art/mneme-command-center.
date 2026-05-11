import React, { useState, useEffect, useCallback } from 'react'
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
  const [error, setError] = useState('')
  const layer = layers?.layer1

  if (!layer?.visible) return null

  const loadEvents = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const res = await system.getAuditEvents(50)
      const nextEvents = (res?.data || []).map(log => ({
        id: log.id,
        type: log.operation,
        actor: log.actor,
        resource: log.resource,
        status: log.status,
        timestamp: new Date(log.created_at),
        message: `${log.actor} ${log.operation} ${log.resource}`,
        details: log.details
      }))
      setEvents(nextEvents)
    } catch (err) {
      console.error('Failed to load audit events:', err)
      setEvents([])
      setError('Activity feed unavailable. Check API connectivity and authentication, then refresh.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadEvents()
  }, [loadEvents])

  useEffect(() => {
    const onSSE = () => {
      loadEvents()
    }

    window.addEventListener('mneme:sse', onSSE)
    return () => window.removeEventListener('mneme:sse', onSSE)
  }, [loadEvents])

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
      backgroundColor: 'var(--mneme-surface)',
      color: 'var(--mneme-ink)',
      borderRight: '1px solid var(--mneme-border)',
      borderRadius: '0 0.5rem 0.5rem 0',
      boxShadow: 'var(--mneme-shadow-md)',
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
        borderBottom: '1px solid var(--mneme-border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        cursor: 'pointer',
        backgroundColor: 'var(--mneme-brand-soft)',
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
          className="mneme-btn mneme-btn-ghost"
          style={{ fontSize: '1rem', padding: '0.25rem 0.5rem' }}
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
        {error ? (
          <div style={{ padding: '1rem', color: 'var(--mneme-danger)', textAlign: 'left' }}>
            <div style={{ fontWeight: 700, marginBottom: '0.35rem' }}>Offline / Error</div>
            <div style={{ opacity: 0.9, marginBottom: '0.45rem' }}>{error}</div>
            <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>
              Troubleshooting: verify API on `http://localhost:8000/health`, ensure token is valid, and confirm SSE is connected.
            </div>
          </div>
        ) : loading ? (
          <div style={{ padding: '1rem', opacity: 0.8, textAlign: 'center' }}>
            Loading events...
          </div>
        ) : events.length === 0 ? (
          <div style={{ padding: '1rem', opacity: 0.6, textAlign: 'center' }}>
            No events yet
          </div>
        ) : (
          events.map((event, idx) => (
            <div
              key={event.id || idx}
              style={{
                padding: '0.6rem 0.75rem',
                borderBottom: '1px solid var(--mneme-border)',
                opacity: idx === 0 ? 1 : 0.8,
                cursor: 'pointer',
                transition: 'background-color 0.2s',
                ':hover': { backgroundColor: 'var(--mneme-brand-soft)' }
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--mneme-brand-soft)'
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
