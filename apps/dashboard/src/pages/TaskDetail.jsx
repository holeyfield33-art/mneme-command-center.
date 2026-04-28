import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { tasks } from '../api'

export default function TaskDetail() {
  const { taskId } = useParams()
  const navigate = useNavigate()
  const [task, setTask] = useState(null)
  const [logs, setLogs] = useState([])
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
