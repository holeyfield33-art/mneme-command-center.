import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { approvals, tasks } from '../api'

export default function TaskDetail() {
  const { taskId } = useParams()
  const navigate = useNavigate()
  const [task, setTask] = useState(null)
  const [logs, setLogs] = useState([])
  const [taskApprovals, setTaskApprovals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadTask()
    const interval = setInterval(loadTask, 3000)
    return () => clearInterval(interval)
  }, [taskId])

  const loadTask = async () => {
    try {
      setError('')
      const [taskRes, logsRes] = await Promise.all([
        tasks.get(taskId),
        tasks.getLogs(taskId)
      ])
      setTask(taskRes.data)
      setLogs(logsRes.data)

      const approvalsRes = await approvals.list(undefined, taskId)
      setTaskApprovals(approvalsRes.data)
    } catch (err) {
      setError('Failed to load task')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div style={{ padding: '2rem' }}>Loading...</div>
  }

  if (!task) {
    return <div style={{ padding: '2rem' }}>Task not found</div>
  }

  const statusColors = {
    queued: '#ffc107',
    planning: '#17a2b8',
    waiting_for_plan_approval: '#ff6b6b',
    plan_approved: '#28a745',
    plan_rejected: '#dc3545',
    executing: '#0d6efd',
    completed: '#198754',
    failed: '#dc3545'
  }

  const latestPlanApproval = taskApprovals
    .filter(approval => approval.type === 'plan')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]

  const findLogValue = (prefix) => {
    const entry = [...logs].reverse().find(log => (log.message || '').startsWith(prefix))
    if (!entry) return null
    return entry.message.slice(prefix.length).trim()
  }

  const gitBranch = findLogValue('Git branch:')
  const gitDirty = findLogValue('Working tree dirty:')
  const gitRemotes = findLogValue('Git remotes:')
  const scanFiles = findLogValue('Repo scan files:')
  const scanDirectories = findLogValue('Repo scan directories:')
  const planPath = findLogValue('Implementation plan generated:')
  const profilePath = findLogValue('Repo profile generated:')

  return (
    <div style={{ padding: '2rem' }}>
      <button
        onClick={() => navigate(-1)}
        style={{
          marginBottom: '1rem',
          padding: '0.5rem 1rem',
          backgroundColor: '#6c757d',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer'
        }}
      >
        ← Back
      </button>

      {error && <div style={{ color: 'red', marginBottom: '1rem', padding: '1rem', backgroundColor: '#ffe6e6', borderRadius: '4px' }}>{error}</div>}

      <div style={{ marginBottom: '2rem', padding: '1rem', backgroundColor: '#f9f9f9', borderRadius: '8px', border: '1px solid #ddd' }}>
        <h1>{task.objective}</h1>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginTop: '1rem' }}>
          <div>
            <strong>Status:</strong>{' '}
            <span
              style={{
                display: 'inline-block',
                padding: '0.25rem 0.75rem',
                backgroundColor: statusColors[task.status] || '#6c757d',
                color: 'white',
                borderRadius: '4px',
                fontSize: '0.9rem'
              }}
            >
              {task.status}
            </span>
          </div>
          <div><strong>Mode:</strong> {task.mode}</div>
          <div><strong>Risk Level:</strong> {task.risk_level}</div>
          <div><strong>Created:</strong> {new Date(task.created_at).toLocaleString()}</div>
        </div>
      </div>

      <div style={{ marginBottom: '2rem', padding: '1rem', backgroundColor: '#f9f9f9', borderRadius: '8px', border: '1px solid #ddd' }}>
        <h2>Repo Planning Summary</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
          <div><strong>Git Branch:</strong> {gitBranch || 'N/A'}</div>
          <div><strong>Working Tree Dirty:</strong> {gitDirty || 'N/A'}</div>
          <div><strong>Plan Path:</strong> {planPath || 'N/A'}</div>
          <div><strong>Profile Path:</strong> {profilePath || 'N/A'}</div>
        </div>
        <div style={{ marginTop: '1rem' }}>
          <p><strong>Remotes:</strong> {gitRemotes || 'N/A'}</p>
          <p><strong>Scan Files:</strong> {scanFiles || 'N/A'}</p>
          <p><strong>Scan Directories:</strong> {scanDirectories || 'N/A'}</p>
        </div>
      </div>

      <div style={{ marginBottom: '2rem', padding: '1rem', backgroundColor: '#f9f9f9', borderRadius: '8px', border: '1px solid #ddd' }}>
        <h2>Generated Plan</h2>
        {latestPlanApproval ? (
          <>
            <p>
              <strong>Approval Risk Level:</strong> {latestPlanApproval.risk_level}
            </p>
            <pre style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word', marginTop: '0.75rem' }}>
              {latestPlanApproval.summary}
            </pre>
          </>
        ) : (
          <p>No plan approval generated yet.</p>
        )}
      </div>

      <div style={{ padding: '1rem', backgroundColor: '#f9f9f9', borderRadius: '8px', border: '1px solid #ddd' }}>
        <h2>Logs</h2>
        {logs.length === 0 ? (
          <p>No logs yet</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {logs.map(log => (
              <li
                key={log.id}
                style={{
                  padding: '0.75rem',
                  marginBottom: '0.5rem',
                  backgroundColor: 'white',
                  borderRadius: '4px',
                  borderLeft: `4px solid ${
                    log.level === 'error' ? '#dc3545' :
                    log.level === 'warning' ? '#ffc107' :
                    log.level === 'info' ? '#0d6efd' :
                    '#6c757d'
                  }`,
                  fontFamily: 'monospace',
                  fontSize: '0.9rem'
                }}
              >
                <span style={{ color: '#777', fontSize: '0.85rem' }}>
                  {new Date(log.created_at).toLocaleTimeString()}
                </span>{' '}
                <span
                  style={{
                    padding: '0.1rem 0.5rem',
                    backgroundColor:
                      log.level === 'error' ? '#ffe6e6' :
                      log.level === 'warning' ? '#fff3cd' :
                      log.level === 'info' ? '#e7f3ff' :
                      '#f0f0f0',
                    borderRadius: '2px',
                    fontSize: '0.8rem',
                    fontWeight: 'bold'
                  }}
                >
                  {log.level.toUpperCase()}
                </span>{' '}
                {log.message}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
