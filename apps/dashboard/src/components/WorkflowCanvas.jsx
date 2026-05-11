import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { tasks } from '../api'
import { useLayers } from '../context/LayerContext'

/**
 * WorkflowCanvas - Layer 2 Workflow Visualization
 * 
 * Modal showing agent orchestration graph for current task:
 * - Planner → Implementer → Tester → Reviewer
 * - Shows status of each phase
 * - Displays logs/output from each phase
 * - Allows inspection of handoff points
 */
export default function WorkflowCanvas() {
  const { layers, hideModal, showModal } = useLayers()
  const [activeTasks, setActiveTasks] = useState([])
  const [selectedPhase, setSelectedPhase] = useState('planner')
  const [phaseMap, setPhaseMap] = useState({})
  const [statusSnapshot, setStatusSnapshot] = useState(null)
  const [orchestrationLog, setOrchestrationLog] = useState([])
  const [checkpoints, setCheckpoints] = useState([])
  const [selectedCheckpointId, setSelectedCheckpointId] = useState('')
  const [diffContent, setDiffContent] = useState('')
  const [diffError, setDiffError] = useState('')
  const [checkpointError, setCheckpointError] = useState('')
  const [taskTitle, setTaskTitle] = useState('')
  const [loading, setLoading] = useState(false)
  const [initLoading, setInitLoading] = useState(false)
  const [rollbackLoading, setRollbackLoading] = useState(false)
  const [resumeLoading, setResumeLoading] = useState(false)
  const [error, setError] = useState('')
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null)
  const layer = layers?.layer2
  const taskId = layer?.taskId

  if (!layer?.visible) return null

  const phaseOrder = [
    {
      id: 'planner',
      name: 'Planner',
      role: 'Analyzes requirements and designs approach',
      icon: '📊'
    },
    {
      id: 'implementer',
      name: 'Implementer',
      role: 'Writes code and creates artifacts',
      icon: '💻'
    },
    {
      id: 'tester',
      name: 'Tester',
      role: 'Validates changes and runs tests',
      icon: '✓'
    },
    {
      id: 'reviewer',
      name: 'Reviewer',
      role: 'Performs final review and approval',
      icon: '👁️'
    }
  ]

  const selectedPhaseData = useMemo(
    () => phaseOrder.find((agent) => agent.id === selectedPhase),
    [phaseOrder, selectedPhase]
  )

  const selectedPhaseStatus = phaseMap?.[selectedPhase]?.status || 'pending'

  const loadActiveTasks = useCallback(async () => {
    try {
      const res = await tasks.list()
      const active = (res.data || []).filter((t) =>
        ['queued', 'planning', 'executing', 'approved_for_execution', 'plan_approved'].includes(t.status)
      )
      setActiveTasks(active)
    } catch {
      setActiveTasks([])
    }
  }, [])

  const loadWorkflow = useCallback(async () => {
    if (!taskId) {
      return
    }

    try {
      setLoading(true)
      setError('')

      const [taskRes, phasesRes, statusRes, logRes, checkpointsRes] = await Promise.all([
        tasks.get(taskId),
        tasks.orchestrationPhases(taskId),
        tasks.orchestrationStatus(taskId),
        tasks.orchestrationLog(taskId, 100, 0),
        tasks.orchestrationCheckpoints(taskId),
      ])

      try {
        const diffRes = await tasks.getArtifact(taskId, 'diff')
        setDiffContent(diffRes.data?.content || '')
        setDiffError('')
      } catch {
        setDiffContent('')
        setDiffError('Diff artifact not available yet.')
      }

      const phases = phasesRes.data?.phases || []
      const nextPhaseMap = {}
      phases.forEach((phase) => {
        nextPhaseMap[phase.phase_type] = phase
      })

      setTaskTitle(taskRes.data?.objective || taskId)
      setPhaseMap(nextPhaseMap)
      setStatusSnapshot(statusRes.data || null)
      setOrchestrationLog(logRes.data?.entries || [])
      const nextCheckpoints = checkpointsRes.data?.checkpoints || []
      setCheckpoints(nextCheckpoints)
      setCheckpointError('')
      setSelectedCheckpointId((prevId) => {
        if (!prevId && nextCheckpoints[0]?.checkpoint_id) {
          return nextCheckpoints[0].checkpoint_id
        }
        if (prevId && !nextCheckpoints.some((cp) => cp.checkpoint_id === prevId)) {
          return nextCheckpoints[0]?.checkpoint_id || ''
        }
        return prevId
      })
      setLastRefreshedAt(new Date())

      const inProgress = phases.find((phase) => phase.status === 'in_progress')
      if (inProgress?.phase_type) {
        setSelectedPhase(inProgress.phase_type)
      }
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to load orchestration workflow')
    } finally {
      setLoading(false)
    }
  }, [taskId])

  useEffect(() => {
    loadActiveTasks()
  }, [loadActiveTasks])

  useEffect(() => {
    if (!layer?.visible) {
      return
    }
    loadWorkflow()
  }, [layer?.visible, loadWorkflow])

  useEffect(() => {
    const onSSE = (event) => {
      const eventTaskId = event?.detail?.data?.task_id
      if (taskId && eventTaskId === taskId) {
        loadWorkflow()
      }
    }

    window.addEventListener('mneme:sse', onSSE)
    return () => window.removeEventListener('mneme:sse', onSSE)
  }, [taskId, loadWorkflow])

  const initializeWorkflow = async () => {
    if (!taskId) return

    try {
      setInitLoading(true)
      setError('')
      await tasks.orchestrationInitialize(taskId)
      await tasks.enableOrchestration(taskId)
      await loadWorkflow()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to initialize workflow')
    } finally {
      setInitLoading(false)
    }
  }

  const rollbackFromSelectedPhase = async () => {
    if (!taskId || !selectedPhase) {
      return
    }
    try {
      setRollbackLoading(true)
      setError('')
      await tasks.orchestrationRollback(taskId, selectedPhase)
      await loadWorkflow()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to rollback workflow')
    } finally {
      setRollbackLoading(false)
    }
  }

  const resumeFromCheckpoint = async () => {
    if (!taskId || !selectedCheckpointId) {
      return
    }
    try {
      setResumeLoading(true)
      setError('')
      setCheckpointError('')
      await tasks.orchestrationResume(taskId, selectedCheckpointId)
      await loadWorkflow()
    } catch (err) {
      const detail = err?.response?.data?.detail || 'Failed to resume from checkpoint'
      setCheckpointError(detail)
    } finally {
      setResumeLoading(false)
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return '#27ae60' // Green
      case 'in-progress':
        return '#f39c12' // Orange
      case 'rolled_back':
        return '#8e44ad' // Purple
      case 'pending':
        return '#95a5a6' // Gray
      case 'failed':
        return '#e74c3c' // Red
      default:
        return '#3498db' // Blue
    }
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return '✓'
      case 'in-progress':
        return '⟳'
      case 'rolled_back':
        return '↺'
      case 'pending':
        return '○'
      case 'failed':
        return '✗'
      default:
        return '?'
    }
  }

  const normalizeStatus = (status) => {
    if (status === 'in_progress') return 'in-progress'
    if (status === 'rolled_back') return 'rolled_back'
    return status || 'pending'
  }

  const formatDuration = (seconds) => {
    if (!Number.isFinite(seconds)) return '—'
    if (seconds < 60) return `${seconds}s`
    const mins = Math.floor(seconds / 60)
    const rem = seconds % 60
    return `${mins}m ${rem}s`
  }

  const selectedLogs = orchestrationLog.filter((entry) => {
    return (
      entry.actor === selectedPhase ||
      entry.source_phase === selectedPhase ||
      entry.target_phase === selectedPhase
    )
  }).slice(0, 12)

  const emptyWorkflow = taskId && Object.keys(phaseMap).length === 0
  const selectedCheckpoint = checkpoints.find((checkpoint) => checkpoint.checkpoint_id === selectedCheckpointId)

  return (
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
      zIndex: 10000
    }}>
      <div style={{
        backgroundColor: '#2c3e50',
        color: 'white',
        borderRadius: '0.5rem',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        maxWidth: '900px',
        maxHeight: '80vh',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        width: '90vw'
      }}>
        {/* Header */}
        <div style={{
          padding: '1.5rem',
          borderBottom: '1px solid #34495e',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.5rem' }}>🔄 Workflow Orchestration</h2>
            <div style={{ opacity: 0.8, fontSize: '0.85rem', marginTop: '0.25rem' }}>
              {taskId ? `Task: ${taskTitle || taskId}` : 'Select a task to view orchestration'}
            </div>
          </div>
          <button
            onClick={() => hideModal('layer2')}
            style={{
              background: 'none',
              border: 'none',
              color: 'white',
              fontSize: '1.5rem',
              cursor: 'pointer',
              padding: 0
            }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '2rem', flex: 1, overflow: 'auto' }}>
          {!taskId && (
            <div style={{ backgroundColor: '#1a252f', borderRadius: '0.5rem', padding: '1.25rem', marginBottom: '1rem' }}>
              <h3 style={{ marginTop: 0 }}>Select Active Task</h3>
              {activeTasks.length === 0 ? (
                <p style={{ marginBottom: 0, opacity: 0.8 }}>No active tasks found.</p>
              ) : (
                <div style={{ display: 'grid', gap: '0.5rem' }}>
                  {activeTasks.slice(0, 8).map((task) => (
                    <button
                      key={task.id}
                      onClick={() => showModal('layer2', { taskId: task.id })}
                      style={{
                        textAlign: 'left',
                        backgroundColor: '#34495e',
                        color: 'white',
                        border: '1px solid #4a647f',
                        borderRadius: '0.4rem',
                        padding: '0.7rem 0.8rem',
                        cursor: 'pointer'
                      }}
                    >
                      <strong>{task.objective}</strong>
                      <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>{task.status}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && (
            <div style={{ marginBottom: '1rem', backgroundColor: '#5b1f1f', color: '#ffdada', padding: '0.8rem', borderRadius: '0.4rem' }}>
              {error}
            </div>
          )}

          {taskId && (
            <div style={{
              marginBottom: '1rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '0.75rem',
              flexWrap: 'wrap'
            }}>
              <div style={{ opacity: 0.75, fontSize: '0.85rem' }}>
                Overall status: {statusSnapshot?.overall_status || 'pending'}
                {lastRefreshedAt ? ` · Refreshed ${lastRefreshedAt.toLocaleTimeString()}` : ''}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => loadWorkflow()}
                  disabled={loading}
                  style={{
                    backgroundColor: '#34495e',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.3rem',
                    padding: '0.45rem 0.75rem',
                    cursor: 'pointer'
                  }}
                >
                  {loading ? 'Refreshing…' : 'Refresh'}
                </button>
                <button
                  onClick={initializeWorkflow}
                  disabled={initLoading}
                  style={{
                    backgroundColor: '#16a085',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.3rem',
                    padding: '0.45rem 0.75rem',
                    cursor: 'pointer'
                  }}
                >
                  {initLoading ? 'Initializing…' : 'Initialize'}
                </button>
              </div>
            </div>
          )}

          {/* Agent flow diagram */}
          <div style={{ marginBottom: '2rem' }}>
            <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1rem' }}>Agent Orchestration Flow</h3>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '1rem',
              alignItems: 'start'
            }}>
              {phaseOrder.map((agent, idx) => {
                const currentPhase = phaseMap?.[agent.id]
                const normalizedStatus = normalizeStatus(currentPhase?.status)
                return (
                <div key={agent.id}>
                  {/* Agent box */}
                  <div
                    onClick={() => setSelectedPhase(agent.id)}
                    style={{
                      backgroundColor: '#34495e',
                      border: `2px solid ${getStatusColor(normalizedStatus)}`,
                      borderRadius: '0.5rem',
                      padding: '1rem',
                      textAlign: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      transform: selectedPhase === agent.id ? 'scale(1.05)' : 'scale(1)',
                      marginBottom: '0.5rem'
                    }}
                  >
                    <div style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>
                      {agent.icon}
                    </div>
                    <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.95rem' }}>
                      {agent.name}
                    </h4>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.35rem',
                      fontSize: '0.8rem'
                    }}>
                      <span>{getStatusIcon(normalizedStatus)}</span>
                      <span style={{
                        width: '0.5rem',
                        height: '0.5rem',
                        borderRadius: '50%',
                        backgroundColor: getStatusColor(normalizedStatus)
                      }} />
                      {normalizedStatus}
                    </div>
                  </div>

                  {/* Arrow between agents */}
                  {idx < phaseOrder.length - 1 && (
                    <div style={{
                      fontSize: '1.5rem',
                      textAlign: 'center',
                      opacity: 0.5,
                      marginTop: '-0.5rem'
                    }}>
                      ↓
                    </div>
                  )}
                </div>
              )})}
            </div>
          </div>

          {/* Selected phase details */}
          <div style={{
            backgroundColor: '#1a252f',
            border: `1px solid ${getStatusColor(selectedPhaseStatus)}`,
            borderRadius: '0.5rem',
            padding: '1.5rem'
          }}>
            {selectedPhaseData && (
              <div key={selectedPhaseData.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                  <div style={{ fontSize: '1.5rem' }}>{selectedPhaseData.icon}</div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '1.1rem' }}>{selectedPhaseData.name}</h4>
                    <p style={{ margin: '0.25rem 0 0 0', opacity: 0.8, fontSize: '0.9rem' }}>
                      {selectedPhaseData.role}
                    </p>
                  </div>
                </div>

                {/* Phase logs */}
                <div style={{
                  backgroundColor: '#0f1823',
                  borderRadius: '0.25rem',
                  padding: '1rem',
                  fontFamily: 'monospace',
                  fontSize: '0.8rem',
                  maxHeight: '200px',
                  overflowY: 'auto',
                  marginBottom: '1rem'
                }}>
                  {selectedLogs.length === 0 ? (
                    <div style={{ color: '#95a5a6' }}>
                      {emptyWorkflow
                        ? 'No orchestration phases initialized yet.'
                        : 'No orchestration entries for this phase yet.'}
                    </div>
                  ) : (
                    selectedLogs.map((entry) => (
                      <div key={entry.id} style={{ marginBottom: '0.5rem', color: '#c9d6e2' }}>
                        <strong style={{ color: '#7fb2ff' }}>{entry.operation}</strong>
                        <span style={{ opacity: 0.7 }}> · {new Date(entry.created_at).toLocaleTimeString()}</span>
                        <div style={{ color: '#9fb3c6' }}>{entry.status}</div>
                      </div>
                    ))
                  )}
                </div>

                {/* Phase stats */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '1rem'
                }}>
                  <div style={{ backgroundColor: '#34495e', padding: '0.75rem', borderRadius: '0.25rem' }}>
                    <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>Duration</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>
                      {formatDuration(phaseMap?.[selectedPhase]?.duration)}
                    </div>
                  </div>
                  <div style={{ backgroundColor: '#34495e', padding: '0.75rem', borderRadius: '0.25rem' }}>
                    <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>Phase Status</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>
                      {phaseMap?.[selectedPhase]?.status || 'pending'}
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={rollbackFromSelectedPhase}
                    disabled={rollbackLoading}
                    style={{
                      padding: '0.55rem 0.85rem',
                      backgroundColor: '#8e44ad',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.25rem',
                      cursor: 'pointer',
                      fontWeight: 'bold'
                    }}
                  >
                    {rollbackLoading ? 'Rolling back…' : `Rollback From ${selectedPhaseData.name}`}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div style={{
            marginTop: '1rem',
            backgroundColor: '#1a252f',
            border: '1px solid #34495e',
            borderRadius: '0.5rem',
            padding: '1rem'
          }}>
            <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem' }}>Checkpoint Resume</h3>
            {checkpoints.length === 0 ? (
              <div style={{ color: '#9fb3c6', fontSize: '0.85rem' }}>No checkpoints available yet. Complete at least one phase to create a resume point.</div>
            ) : (
              <>
                <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <select
                    value={selectedCheckpointId}
                    onChange={(event) => setSelectedCheckpointId(event.target.value)}
                    style={{
                      width: '100%',
                      backgroundColor: '#0f1823',
                      color: 'white',
                      border: '1px solid #34495e',
                      borderRadius: '0.3rem',
                      padding: '0.5rem'
                    }}
                  >
                    {checkpoints.map((checkpoint) => (
                      <option key={checkpoint.checkpoint_id} value={checkpoint.checkpoint_id}>
                        {checkpoint.phase_type} · {checkpoint.source} · {checkpoint.created_at ? new Date(checkpoint.created_at).toLocaleString() : 'unknown time'}
                      </option>
                    ))}
                  </select>
                </div>
                {selectedCheckpoint && (
                  <div style={{ color: '#9fb3c6', fontSize: '0.82rem', marginBottom: '0.75rem' }}>
                    Resume point: {selectedCheckpoint.phase_type} ({selectedCheckpoint.source})
                  </div>
                )}
                {checkpointError && (
                  <div style={{ marginBottom: '0.6rem', color: '#ffdada', backgroundColor: '#5b1f1f', borderRadius: '0.3rem', padding: '0.55rem' }}>
                    {checkpointError}
                  </div>
                )}
                <button
                  onClick={resumeFromCheckpoint}
                  disabled={resumeLoading || !selectedCheckpointId}
                  style={{
                    padding: '0.55rem 0.85rem',
                    backgroundColor: '#1f7a8c',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.25rem',
                    cursor: 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  {resumeLoading ? 'Resuming…' : 'Resume Workflow From Checkpoint'}
                </button>
              </>
            )}
          </div>

          <div style={{
            marginTop: '1rem',
            backgroundColor: '#1a252f',
            border: '1px solid #34495e',
            borderRadius: '0.5rem',
            padding: '1rem'
          }}>
            <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem' }}>Diff Review</h3>
            {diffError ? (
              <div style={{ color: '#9fb3c6', fontSize: '0.85rem' }}>{diffError}</div>
            ) : (
              <pre style={{
                margin: 0,
                maxHeight: '220px',
                overflow: 'auto',
                backgroundColor: '#0f1823',
                borderRadius: '0.25rem',
                padding: '0.75rem',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontSize: '0.8rem'
              }}>
                {diffContent || 'No diff content.'}
              </pre>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '1rem',
          borderTop: '1px solid #34495e',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '0.75rem',
          flexShrink: 0
        }}>
          <button
            onClick={() => hideModal('layer2')}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#34495e',
              color: 'white',
              border: 'none',
              borderRadius: '0.25rem',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
