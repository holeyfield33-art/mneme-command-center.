import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { worker, tasks, approvals, system, projects } from '../api'
import { useLayers } from '../context/LayerContext'
import GlobalSearch from '../components/GlobalSearch'
import QueueManager from '../components/QueueManager'
import TaskTemplates from '../components/TaskTemplates'
import RepoPickerModal from '../components/RepoPickerModal'

export default function Home() {
  const navigate = useNavigate()
  const { showModal } = useLayers()
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
  const [showGlobalSearch, setShowGlobalSearch] = useState(false)
  const [showTaskTemplates, setShowTaskTemplates] = useState(false)
  const [showRepoPickerModal, setShowRepoPickerModal] = useState(false)
  const [selectedProject, setSelectedProject] = useState(null)

  const formatRelative = (value) => {
    if (!value) return 'unknown'
    const target = new Date(value)
    const seconds = Math.max(0, Math.floor((Date.now() - target.getTime()) / 1000))
    if (seconds < 60) return `${seconds}s ago`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    return `${Math.floor(seconds / 86400)}d ago`
  }

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
    return (
      <div style={{ padding: '2rem' }}>
        <h1 style={{ marginBottom: '1rem' }}>Dashboard</h1>
        <div className="mneme-surface mneme-enter" style={{ padding: '1rem' }}>
          <div className="mneme-skeleton" style={{ height: '1.3rem', marginBottom: '0.7rem' }} />
          <div className="mneme-skeleton" style={{ height: '4rem', marginBottom: '0.7rem' }} />
          <div className="mneme-skeleton" style={{ height: '4rem' }} />
        </div>
      </div>
    )
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
  const highRiskTasks = activeTasks.filter((task) => task.risk_level === 'high').length
  const executionBacklog = activeTasks.filter((task) => ['queued', 'planning'].includes(task.status)).length
  const incidentTimeline = [
    ...activeTasks.slice(0, 8).map((task) => ({
      id: `task-${task.id}`,
      type: 'task',
      title: task.objective,
      subtitle: `Task ${task.status}`,
      at: task.updated_at || task.created_at,
      risk: task.risk_level || 'medium',
    })),
    ...pendingApprovals.slice(0, 8).map((approval) => ({
      id: `approval-${approval.id}`,
      type: 'approval',
      title: approval.title,
      subtitle: `Approval pending (${approval.type})`,
      at: approval.created_at,
      risk: approval.risk_level || 'medium',
    })),
  ]
    .sort((left, right) => new Date(right.at || 0).getTime() - new Date(left.at || 0).getTime())
    .slice(0, 10)

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

      {error && <div className="mneme-alert error">{error}</div>}

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
          <div className="mneme-empty">No workers connected yet. Launch a worker to process queued tasks and approvals.</div>
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

      <div className="mneme-surface mneme-enter" style={{ marginBottom: '2rem', padding: '1rem' }}>
        <h2 style={{ marginBottom: '0.75rem' }}>Operator Snapshot</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(120px, 1fr))', gap: '0.75rem' }}>
          <div style={{ backgroundColor: '#f6fafc', border: '1px solid #dbe6ef', borderRadius: '8px', padding: '0.75rem' }}>
            <div style={{ fontSize: '0.78rem', color: '#5b6a79' }}>Active Tasks</div>
            <div style={{ fontWeight: 700, fontSize: '1.15rem' }}>{activeTasks.length}</div>
          </div>
          <div style={{ backgroundColor: '#f6fafc', border: '1px solid #dbe6ef', borderRadius: '8px', padding: '0.75rem' }}>
            <div style={{ fontSize: '0.78rem', color: '#5b6a79' }}>Pending Approvals</div>
            <div style={{ fontWeight: 700, fontSize: '1.15rem' }}>{pendingApprovals.length}</div>
          </div>
          <div style={{ backgroundColor: '#fff8f0', border: '1px solid #f0ddc8', borderRadius: '8px', padding: '0.75rem' }}>
            <div style={{ fontSize: '0.78rem', color: '#8f6638' }}>High-Risk Tasks</div>
            <div style={{ fontWeight: 700, fontSize: '1.15rem', color: '#8f6638' }}>{highRiskTasks}</div>
          </div>
          <div style={{ backgroundColor: '#eef7ff', border: '1px solid #cfe1f5', borderRadius: '8px', padding: '0.75rem' }}>
            <div style={{ fontSize: '0.78rem', color: '#2c5f8c' }}>Queue Backlog</div>
            <div style={{ fontWeight: 700, fontSize: '1.15rem', color: '#2c5f8c' }}>{executionBacklog}</div>
          </div>
        </div>
      </div>

      <div className="mneme-surface mneme-enter" style={{ marginBottom: '2rem', padding: '1rem' }}>
        <h2 style={{ marginBottom: '0.75rem' }}>Incident Timeline</h2>
        {incidentTimeline.length === 0 ? (
          <div className="mneme-empty">No active incident signals. New task and approval events will stream here for rapid triage.</div>
        ) : (
          <div style={{ display: 'grid', gap: '0.55rem' }}>
            {incidentTimeline.map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '0.75rem',
                  border: '1px solid #dde7f0',
                  borderRadius: '8px',
                  padding: '0.55rem 0.7rem',
                  backgroundColor: item.risk === 'high' ? '#fff8f5' : '#fbfdff',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, color: '#263a4d' }}>{item.title}</div>
                  <div style={{ fontSize: '0.82rem', color: '#5d6b79' }}>{item.subtitle}</div>
                </div>
                <div style={{ fontSize: '0.8rem', color: '#5d6b79', whiteSpace: 'nowrap' }}>{formatRelative(item.at)}</div>
              </div>
            ))}
          </div>
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
          <div className="mneme-empty">No active tasks in queue. Use New Task or Browse Repos to start a workflow.</div>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                  <div style={{ fontSize: '0.9rem', color: '#777' }}>{t.status}</div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      showModal('layer2', { taskId: t.id })
                    }}
                    style={{
                      padding: '0.35rem 0.6rem',
                      backgroundColor: '#2c3e50',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      fontWeight: 600
                    }}
                  >
                    View Workflow
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Queue Manager - Phase 2 */}
      <QueueManager />

      {/* Quick Navigation - Phase 2 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1rem',
        marginBottom: '2rem'
      }}>
        <button
          onClick={() => setShowGlobalSearch(true)}
          style={{
            padding: '1.5rem',
            backgroundColor: '#3498db',
            color: 'white',
            border: 'none',
            borderRadius: '0.5rem',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: 'bold',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.5rem',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#2980b9'
            e.currentTarget.style.transform = 'scale(1.05)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#3498db'
            e.currentTarget.style.transform = 'scale(1)'
          }}
        >
          <span style={{ fontSize: '1.5rem' }}>🔍</span>
          Global Search
        </button>

        <button
          onClick={() => setShowTaskTemplates(true)}
          style={{
            padding: '1.5rem',
            backgroundColor: '#27ae60',
            color: 'white',
            border: 'none',
            borderRadius: '0.5rem',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: 'bold',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.5rem',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#229954'
            e.currentTarget.style.transform = 'scale(1.05)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#27ae60'
            e.currentTarget.style.transform = 'scale(1)'
          }}
        >
          <span style={{ fontSize: '1.5rem' }}>✨</span>
          New Task
        </button>

        <button
          onClick={() => setShowRepoPickerModal(true)}
          style={{
            padding: '1.5rem',
            backgroundColor: '#e74c3c',
            color: 'white',
            border: 'none',
            borderRadius: '0.5rem',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: 'bold',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.5rem',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#c0392b'
            e.currentTarget.style.transform = 'scale(1.05)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#e74c3c'
            e.currentTarget.style.transform = 'scale(1)'
          }}
        >
          <span style={{ fontSize: '1.5rem' }}>🔗</span>
          Browse Repos
        </button>
      </div>

      {/* Pending Approvals */}
      <div style={{ marginBottom: '2rem', padding: '1rem', backgroundColor: '#f9f9f9', borderRadius: '8px', border: '1px solid #ddd' }}>
        <h2>Pending Approvals ({pendingApprovals.length})</h2>
        {pendingApprovals.length === 0 ? (
          <div className="mneme-empty">No pending approvals. Risk-gated changes will appear here instantly when needed.</div>
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

      {/* Phase 2 Modal Components */}
      <GlobalSearch isOpen={showGlobalSearch} onClose={() => setShowGlobalSearch(false)} />
      
      {showTaskTemplates && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10001
        }} onClick={() => setShowTaskTemplates(false)}>
          <div
            style={{
              backgroundColor: '#2c3e50',
              color: 'white',
              borderRadius: '0.5rem',
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
              maxWidth: '600px',
              maxHeight: '80vh',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              width: '90vw',
              padding: '2rem'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <TaskTemplates projectId={selectedProject} onClose={() => setShowTaskTemplates(false)} />
          </div>
        </div>
      )}

      <RepoPickerModal
        isOpen={showRepoPickerModal}
        onClose={() => setShowRepoPickerModal(false)}
        onSelect={(repo) => {
          navigate('/projects')
        }}
      />
    </div>
  )
}
