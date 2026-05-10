import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { worker, tasks, approvals, system } from '../api'

export default function Home() {
  const navigate = useNavigate()
  const [workers, setWorkers] = useState([])
  const [activeTasks, setActiveTasks] = useState([])
  const [pendingApprovals, setPendingApprovals] = useState([])
  const [emergencyStopActive, setEmergencyStopActive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [runtimeStatus, setRuntimeStatus] = useState(null)
  const [workerProcess, setWorkerProcess] = useState({ running: false, pid: null })
  const [workerActionLoading, setWorkerActionLoading] = useState(false)

  const loadDashboard = useCallback(async () => {
    try {
      setError('')
      const [workersRes, tasksRes, approvalsRes, stopStatusRes, runtimeRes, workerProcessRes] = await Promise.all([
        worker.getStatus(),
        tasks.list(),
        approvals.list('pending'),
        system.getEmergencyStopStatus(),
        system.getRuntimeStatus(),
        worker.getProcessStatus(),
      ])
      
      setWorkers(workersRes.data)
      setActiveTasks(tasksRes.data.filter(t => ['queued', 'planning', 'executing'].includes(t.status)))
      setPendingApprovals(approvalsRes.data)
      setEmergencyStopActive(stopStatusRes.data.active)
      setRuntimeStatus(runtimeRes.data)
      setWorkerProcess(workerProcessRes.data)
    } catch (err) {
      setError('Failed to load dashboard')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

  useEffect(() => {
    const onSSE = () => {
      loadDashboard()
    }

    window.addEventListener('mneme:sse', onSSE)
    return () => window.removeEventListener('mneme:sse', onSSE)
  }, [loadDashboard])

  const handleEmergencyStop = async () => {
    if (confirm('Are you sure you want to activate emergency stop?')) {
      try {
        await system.emergencyStop()
        setEmergencyStopActive(true)
      } catch (err) {
        setError('Failed to activate emergency stop')
      }
    }
  }

  const handleClearEmergencyStop = async () => {
    try {
      await system.clearEmergencyStop()
      setEmergencyStopActive(false)
    } catch (err) {
      setError('Failed to clear emergency stop')
    }
  }

  const handleStartWorker = async () => {
    try {
      setWorkerActionLoading(true)
      await worker.launch()
      await loadDashboard()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to start worker')
    } finally {
      setWorkerActionLoading(false)
    }
  }

  const handleStopWorker = async () => {
    try {
      setWorkerActionLoading(true)
      await worker.stop()
      await loadDashboard()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to stop worker')
    } finally {
      setWorkerActionLoading(false)
    }
  }

  if (loading && workers.length === 0) {
    return <div style={{ padding: '2rem' }}>Loading...</div>
  }

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1>Dashboard</h1>
        <div>
          {emergencyStopActive ? (
            <button
              onClick={handleClearEmergencyStop}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              🛑 Emergency Stop Active - Click to Clear
            </button>
          ) : (
            <button
              onClick={handleEmergencyStop}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              🛑 Emergency Stop
            </button>
          )}
        </div>
      </div>

      {error && <div style={{ color: 'red', marginBottom: '1rem', padding: '1rem', backgroundColor: '#ffe6e6', borderRadius: '4px' }}>{error}</div>}

      {/* Worker Status */}
      <div style={{ marginBottom: '2rem', padding: '1rem', backgroundColor: '#f9f9f9', borderRadius: '8px', border: '1px solid #ddd' }}>
        <h2>Worker Status</h2>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
          {workerProcess.running ? (
            <button
              onClick={handleStopWorker}
              disabled={workerActionLoading}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              {workerActionLoading ? 'Stopping...' : 'Stop Worker'}
            </button>
          ) : (
            <button
              onClick={handleStartWorker}
              disabled={workerActionLoading}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#198754',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              {workerActionLoading ? 'Starting...' : 'Start Worker'}
            </button>
          )}
          <span style={{ alignSelf: 'center', fontSize: '0.9rem', color: '#555' }}>
            API-managed process: {workerProcess.running ? `running (pid ${workerProcess.pid})` : 'stopped'}
          </span>
        </div>
        {workers.length === 0 ? (
          <p>No workers connected</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {workers.map(w => (
              <li key={w.worker_id} style={{ padding: '0.5rem 0', borderBottom: '1px solid #eee' }}>
                <strong>{w.hostname}</strong> - <span style={{ color: w.status === 'online' ? 'green' : 'red' }}>● {w.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div style={{ marginBottom: '2rem', padding: '1rem', backgroundColor: '#f9f9f9', borderRadius: '8px', border: '1px solid #ddd' }}>
        <h2>Runtime Settings</h2>
        {!runtimeStatus ? (
          <p>Runtime settings unavailable</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            <li><strong>Active Model Provider:</strong> {runtimeStatus.model_provider}</li>
            <li><strong>Active Provider Key Configured:</strong> {runtimeStatus.model_provider_key_configured ? 'yes' : 'no'}</li>
            <li><strong>GitHub Configured:</strong> {runtimeStatus.github_configured ? 'yes' : 'no'}</li>
            <li><strong>Legacy Claude CLI Command Configured:</strong> {runtimeStatus.claude_command_configured ? 'yes' : 'no'}</li>
            <li><strong>Claude Timeout (s):</strong> {runtimeStatus.claude_code_timeout_seconds}</li>
            <li><strong>Claude Max Retries:</strong> {runtimeStatus.claude_code_max_retries}</li>
            <li><strong>Notifications Enabled:</strong> {runtimeStatus.notifications_enabled ? 'yes' : 'no'}</li>
            <li><strong>Telegram Configured:</strong> {runtimeStatus.telegram_configured ? 'yes' : 'no'}</li>
          </ul>
        )}
      </div>

      {/* Active Tasks */}
      <div style={{ marginBottom: '2rem', padding: '1rem', backgroundColor: '#f9f9f9', borderRadius: '8px', border: '1px solid #ddd' }}>
        <h2>Active Tasks ({activeTasks.length})</h2>
        {activeTasks.length === 0 ? (
          <p>No active tasks</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {activeTasks.map(t => (
              <li
                key={t.id}
                onClick={() => navigate(`/task/${t.id}`)}
                style={{
                  padding: '1rem',
                  marginBottom: '0.5rem',
                  backgroundColor: 'white',
                  borderRadius: '4px',
                  border: '1px solid #ddd',
                  cursor: 'pointer',
                  textDecoration: 'underline'
                }}
              >
                <div><strong>{t.objective}</strong></div>
                <div style={{ fontSize: '0.9rem', color: '#777' }}>{t.status}</div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Pending Approvals */}
      <div style={{ marginBottom: '2rem', padding: '1rem', backgroundColor: '#f9f9f9', borderRadius: '8px', border: '1px solid #ddd' }}>
        <h2>Pending Approvals ({pendingApprovals.length})</h2>
        {pendingApprovals.length === 0 ? (
          <p>No pending approvals</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {pendingApprovals.map(a => (
              <li
                key={a.id}
                onClick={() => navigate(`/approvals`)}
                style={{
                  padding: '1rem',
                  marginBottom: '0.5rem',
                  backgroundColor: 'white',
                  borderRadius: '4px',
                  border: '1px solid #ddd',
                  cursor: 'pointer',
                  textDecoration: 'underline'
                }}
              >
                <div><strong>{a.title}</strong></div>
                <div style={{ fontSize: '0.9rem', color: '#777' }}>{a.summary}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
