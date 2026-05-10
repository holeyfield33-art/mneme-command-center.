import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { worker, tasks, approvals, system, projects } from '../api'

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
  const [projectCount, setProjectCount] = useState(0)

  const loadDashboard = useCallback(async () => {
    try {
      setError('')
      const [workersRes, tasksRes, approvalsRes, stopStatusRes, runtimeRes, workerProcessRes, projectsRes] = await Promise.all([
        worker.getStatus(),
        tasks.list(),
        approvals.list('pending'),
        system.getEmergencyStopStatus(),
        system.getRuntimeStatus(),
        worker.getProcessStatus(),
        projects.list(),
      ])
      
      setWorkers(workersRes.data)
      setActiveTasks(tasksRes.data.filter(t => ['queued', 'planning', 'executing'].includes(t.status)))
      setPendingApprovals(approvalsRes.data)
      setEmergencyStopActive(stopStatusRes.data.active)
      setRuntimeStatus(runtimeRes.data)
      setWorkerProcess(workerProcessRes.data)
      setProjectCount(projectsRes.data.length || 0)
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

  const setupChecklist = [
    {
      label: 'Model provider configured',
      done: !!runtimeStatus?.model_provider_key_configured || runtimeStatus?.model_provider === 'ollama',
      action: () => navigate('/settings'),
      actionText: 'Open Settings',
    },
    {
      label: 'GitHub token configured',
      done: !!runtimeStatus?.github_configured,
      action: () => navigate('/settings'),
      actionText: 'Add GitHub Token',
    },
    {
      label: 'At least one project connected',
      done: projectCount > 0,
      action: () => navigate('/projects'),
      actionText: 'Connect Project',
    },
    {
      label: 'Worker process running',
      done: !!workerProcess.running,
      action: workerProcess.running ? handleStopWorker : handleStartWorker,
      actionText: workerProcess.running ? 'Stop Worker' : 'Start Worker',
    },
  ]
  const completedSetupSteps = setupChecklist.filter(item => item.done).length

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

      <div style={{ marginBottom: '2rem', padding: '1rem', backgroundColor: '#eef6ff', borderRadius: '8px', border: '1px solid #c7def7' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0 }}>Quick Setup Checklist</h2>
          <button
            onClick={() => navigate('/setup')}
            style={{
              padding: '0.45rem 0.8rem',
              backgroundColor: '#0d6efd',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Open Setup Wizard
          </button>
        </div>
        <p style={{ margin: '0.5rem 0 0.75rem 0', color: '#335' }}>
          {completedSetupSteps}/{setupChecklist.length} completed
        </p>
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          {setupChecklist.map((item, idx) => (
            <div
              key={item.label}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '0.75rem',
                backgroundColor: 'white',
                border: '1px solid #d7e8fa',
                borderRadius: '6px',
                padding: '0.6rem 0.75rem',
              }}
            >
              <div>
                <strong>{idx + 1}. {item.label}</strong>
                <span style={{ marginLeft: '0.5rem', color: item.done ? '#198754' : '#b26a00', fontWeight: 600 }}>
                  {item.done ? 'Done' : 'Needs attention'}
                </span>
              </div>
              {!item.done && (
                <button
                  onClick={item.action}
                  disabled={workerActionLoading && item.label === 'Worker process running'}
                  style={{
                    padding: '0.4rem 0.75rem',
                    backgroundColor: '#2c3e50',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.actionText}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

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
            <li>
              <strong>Active Provider Health:</strong>{' '}
              {runtimeStatus.available_providers?.[runtimeStatus.model_provider]?.health?.status || 'unknown'}
            </li>
            <li><strong>GitHub Configured:</strong> {runtimeStatus.github_configured ? 'yes' : 'no'}</li>
            <li><strong>Legacy CLI Command Configured:</strong> {runtimeStatus.claude_command_configured ? 'yes' : 'no'}</li>
            <li><strong>Execution Timeout (s):</strong> {runtimeStatus.claude_code_timeout_seconds}</li>
            <li><strong>Execution Max Retries:</strong> {runtimeStatus.claude_code_max_retries}</li>
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
