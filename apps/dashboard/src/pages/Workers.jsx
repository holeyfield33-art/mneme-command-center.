import React, { useEffect, useState } from 'react'
import { worker } from '../api'

export default function Workers() {
  const [status, setStatus] = useState(null)
  const [processStatus, setProcessStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  const load = async () => {
    try {
      setError('')
      const [statusRes, procRes] = await Promise.all([
        worker.getStatus(),
        worker.getProcessStatus().catch(() => ({ data: null })),
      ])
      setStatus(statusRes.data)
      setProcessStatus(procRes.data)
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to load worker status')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, 5000)
    return () => clearInterval(interval)
  }, [])

  const handleLaunch = async () => {
    try {
      setActionLoading(true)
      await worker.launch()
      await load()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to launch worker')
    } finally {
      setActionLoading(false)
    }
  }

  const handleStop = async () => {
    try {
      setActionLoading(true)
      await worker.stop()
      await load()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to stop worker')
    } finally {
      setActionLoading(false)
    }
  }

  const BG = '#0c0c0d'
  const SURFACE = '#131316'
  const BORDER = '#26262b'
  const FG = '#e6e4e0'
  const FG_DIM = '#86847f'
  const ACCENT = '#f5b945'
  const SUCCESS = '#34d399'
  const DANGER = '#f87171'
  const FONT_SANS = '"Geist","Inter",system-ui,-apple-system,sans-serif'
  const FONT_MONO = '"Geist Mono","JetBrains Mono",ui-monospace,monospace'

  const isRunning = status?.status === 'running' || status?.running === true

  return (
    <div style={{ minHeight: '100vh', background: BG, color: FG, fontFamily: FONT_SANS, padding: '32px 40px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>Workers</h1>
            <p style={{ color: FG_DIM, margin: '4px 0 0', fontSize: 13 }}>Agent execution engine status and controls</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleLaunch} disabled={actionLoading || isRunning} style={{
              padding: '7px 16px', borderRadius: 6, border: `1px solid ${ACCENT}`,
              background: 'transparent', color: ACCENT, fontSize: 13, cursor: 'pointer',
              opacity: actionLoading || isRunning ? 0.4 : 1,
            }}>Launch</button>
            <button onClick={handleStop} disabled={actionLoading || !isRunning} style={{
              padding: '7px 16px', borderRadius: 6, border: `1px solid ${DANGER}`,
              background: 'transparent', color: DANGER, fontSize: 13, cursor: 'pointer',
              opacity: actionLoading || !isRunning ? 0.4 : 1,
            }}>Stop</button>
          </div>
        </div>

        {error && (
          <div style={{ background: '#2a1515', border: `1px solid ${DANGER}`, borderRadius: 8, padding: '12px 16px', marginBottom: 20, color: DANGER, fontSize: 13 }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ color: FG_DIM, textAlign: 'center', padding: 64 }}>Loading worker status…</div>
        ) : (
          <div style={{ display: 'grid', gap: 16 }}>
            <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <div style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: isRunning ? SUCCESS : FG_DIM,
                  boxShadow: isRunning ? `0 0 8px ${SUCCESS}` : 'none',
                }} />
                <span style={{ fontWeight: 600, fontSize: 15 }}>Worker Process</span>
                <span style={{ color: FG_DIM, fontSize: 12, fontFamily: FONT_MONO }}>
                  {isRunning ? 'running' : 'stopped'}
                </span>
              </div>
              {status && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))', gap: 12 }}>
                  {Object.entries(status).map(([k, v]) => (
                    <div key={k} style={{ background: '#0c0c0d', borderRadius: 6, padding: '10px 14px' }}>
                      <div style={{ color: FG_DIM, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{k}</div>
                      <div style={{ fontFamily: FONT_MONO, fontSize: 12 }}>{String(v)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {processStatus && (
              <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 24 }}>
                <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 16 }}>Process Details</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))', gap: 12 }}>
                  {Object.entries(processStatus).map(([k, v]) => (
                    <div key={k} style={{ background: '#0c0c0d', borderRadius: 6, padding: '10px 14px' }}>
                      <div style={{ color: FG_DIM, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{k}</div>
                      <div style={{ fontFamily: FONT_MONO, fontSize: 12 }}>{String(v)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
