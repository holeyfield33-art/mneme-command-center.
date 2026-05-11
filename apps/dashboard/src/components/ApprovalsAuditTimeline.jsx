import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { system } from '../api'

const APPROVAL_OPERATIONS = new Set([
  'approval_modify_requested',
  'approval_approved',
  'approval_rejected',
])

function formatRelativeTime(value) {
  const target = new Date(value)
  const seconds = Math.max(0, Math.floor((Date.now() - target.getTime()) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function eventAccent(operation) {
  if (operation === 'approval_approved') return '#2f9e6f'
  if (operation === 'approval_rejected') return '#c44236'
  if (operation === 'approval_modify_requested') return '#d9822b'
  return '#5b6a79'
}

function eventLabel(operation) {
  if (operation === 'approval_approved') return 'Approved'
  if (operation === 'approval_rejected') return 'Rejected'
  if (operation === 'approval_modify_requested') return 'Modify Requested'
  return operation
}

export default function ApprovalsAuditTimeline() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)

  const loadEvents = useCallback(async () => {
    try {
      const response = await system.getAuditEvents(120)
      const filtered = (response.data || []).filter((event) => APPROVAL_OPERATIONS.has(event.operation))
      setEvents(filtered.slice(0, 30))
    } catch (err) {
      console.error('Failed to load approvals timeline', err)
      setEvents([])
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

    return () => {
      window.removeEventListener('mneme:sse', onSSE)
    }
  }, [loadEvents])

  const renderedEvents = useMemo(() => events.map((event) => {
    const details = event?.details || {}
    const detailText = details.reason_code
      ? `Reason: ${details.reason_code}`
      : details.approval_type
        ? `Type: ${details.approval_type}`
        : 'No additional details'

    return {
      id: event.id,
      operation: event.operation,
      resource: event.resource,
      timestamp: event.created_at,
      detailText,
      status: event.status,
    }
  }), [events])

  return (
    <section className="mneme-surface mneme-enter" style={{ padding: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h3 style={{ margin: 0 }}>Approval Timeline</h3>
        <span style={{ fontSize: '0.78rem', color: '#5b6a79' }}>Last {renderedEvents.length} events</span>
      </div>

      {loading ? (
        <div className="mneme-skeleton" style={{ height: '4rem' }} />
      ) : renderedEvents.length === 0 ? (
        <div style={{ color: '#5b6a79', fontSize: '0.9rem' }}>No approval actions recorded yet.</div>
      ) : (
        <div style={{ display: 'grid', gap: '0.55rem', maxHeight: '280px', overflowY: 'auto', paddingRight: '0.25rem' }}>
          {renderedEvents.map((event) => (
            <div
              key={event.id}
              style={{
                border: '1px solid #d9e3ec',
                borderLeft: `4px solid ${eventAccent(event.operation)}`,
                borderRadius: '6px',
                padding: '0.55rem 0.65rem',
                backgroundColor: '#fbfdff',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ fontWeight: 700, color: '#223649' }}>{eventLabel(event.operation)}</div>
                <div style={{ fontSize: '0.76rem', color: '#5b6a79' }}>{formatRelativeTime(event.timestamp)}</div>
              </div>
              <div style={{ fontSize: '0.82rem', color: '#30465c', marginTop: '0.2rem' }}>
                Approval: {event.resource || 'unknown'}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#526170', marginTop: '0.15rem' }}>
                {event.detailText}
              </div>
              {event.status !== 'ok' && (
                <div style={{ fontSize: '0.74rem', color: '#c44236', marginTop: '0.25rem' }}>
                  Status: {event.status}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}