import React, { useEffect, useState } from 'react'
import { system } from '../api'
import ApprovalsAuditTimeline from '../components/ApprovalsAuditTimeline'

export default function Audit() {
  const [events, setEvents] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadEvents = async () => {
    try {
      setError('')
      const [eventsResponse, summaryResponse] = await Promise.all([
        system.getAuditEvents(200),
        system.getAuditSummary(),
      ])
      setEvents(eventsResponse.data || [])
      setSummary(summaryResponse.data || null)
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to load audit events')
      setEvents([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadEvents()
  }, [])

  useEffect(() => {
    const onSSE = () => {
      loadEvents()
    }
    window.addEventListener('mneme:sse', onSSE)
    return () => window.removeEventListener('mneme:sse', onSSE)
  }, [])

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1 style={{ margin: 0 }}>Audit Dashboard</h1>
        <button
          onClick={loadEvents}
          style={{
            padding: '0.45rem 0.8rem',
            backgroundColor: '#2c3e50',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Refresh
        </button>
      </div>

      {error && <div className="mneme-alert error">{error}</div>}

      <div style={{ marginBottom: '1rem' }}>
        <ApprovalsAuditTimeline />
      </div>

      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
          {[
            { label: 'Total Events', value: summary.total },
            { label: 'OK', value: summary.ok },
            { label: 'Errors', value: summary.errors },
            { label: 'Last 24h', value: summary.last_24h },
          ].map((card) => (
            <div key={card.label} className="mneme-surface" style={{ padding: '0.85rem' }}>
              <div style={{ fontSize: '0.78rem', color: '#5b6a79' }}>{card.label}</div>
              <div style={{ fontWeight: 700, fontSize: '1.15rem' }}>{card.value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="mneme-surface mneme-enter" style={{ padding: '1rem' }}>
        <h3 style={{ marginTop: 0 }}>Recent Security and Workflow Events</h3>
        {loading ? (
          <div className="mneme-skeleton" style={{ height: '4rem' }} />
        ) : events.length === 0 ? (
          <div style={{ color: '#5b6a79' }}>No audit events available.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid #d9e3ec' }}>
                  <th style={{ padding: '0.5rem' }}>Time</th>
                  <th style={{ padding: '0.5rem' }}>Actor</th>
                  <th style={{ padding: '0.5rem' }}>Operation</th>
                  <th style={{ padding: '0.5rem' }}>Resource</th>
                  <th style={{ padding: '0.5rem' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id} style={{ borderBottom: '1px solid #eef2f6' }}>
                    <td style={{ padding: '0.5rem' }}>{new Date(event.created_at).toLocaleString()}</td>
                    <td style={{ padding: '0.5rem' }}>{event.actor || 'unknown'}</td>
                    <td style={{ padding: '0.5rem' }}>{event.operation}</td>
                    <td style={{ padding: '0.5rem' }}>{event.resource || '-'}</td>
                    <td style={{ padding: '0.5rem', color: event.status === 'ok' ? '#198754' : '#c44236' }}>
                      {event.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
