import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { approvals, tasks, system } from '../api'
import { useLayers } from '../context/LayerContext'

export default function TaskDetail() {
  const { taskId } = useParams()
  const navigate = useNavigate()
  const { showModal } = useLayers()
  const [task, setTask] = useState(null)
  const [logs, setLogs] = useState([])
  const [taskApprovals, setTaskApprovals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [runtimeStatus, setRuntimeStatus] = useState(null)
  const [artifactType, setArtifactType] = useState('stdout')
  const [artifactContent, setArtifactContent] = useState('')
  const [artifactPath, setArtifactPath] = useState('')
  const [artifactError, setArtifactError] = useState('')
  const [loadingArtifact, setLoadingArtifact] = useState(false)
  const [rerunLoading, setRerunLoading] = useState(false)
  const [prStatusLoading, setPrStatusLoading] = useState(false)
  const [prStatus, setPrStatus] = useState(null)
  const [lastPrRefreshAt, setLastPrRefreshAt] = useState(null)
    const [costInfo, setCostInfo] = useState(null)
    const [diffContent, setDiffContent] = useState('')
    const [diffLoading, setDiffLoading] = useState(false)
    const [diffError, setDiffError] = useState('')
    const [diffDecisionLoading, setDiffDecisionLoading] = useState(false)

    const loadDiff = useCallback(async () => {
      setDiffLoading(true)
      setDiffError('')
      try {
        const diffRes = await tasks.getTaskDiff(taskId)
        setDiffContent(diffRes.data.diff || '')
      } catch (err) {
        setDiffError(err?.response?.data?.detail || 'Failed to load diff')
      } finally {
        setDiffLoading(false)
      }
    }, [taskId])

    const refreshPrStatus = useCallback(async () => {
    setPrStatusLoading(true)
    try {
      const prStatusRes = await tasks.getGithubPrStatus(taskId)
      setPrStatus(prStatusRes.data)
      setLastPrRefreshAt(new Date())
    } catch (_err) {
      setPrStatus(null)
    } finally {
      setPrStatusLoading(false)
    }
  }, [taskId])

  const handleDiffDecision = async (approvalId, decision) => {
    setDiffDecisionLoading(true)
    setError('')
    try {
      if (decision === 'approve') {
        await approvals.approve(approvalId)
      } else {
        await approvals.reject(approvalId)
      }
      await loadTask()
    } catch (err) {
      setError(err?.response?.data?.detail || `Failed to ${decision} diff review`)
    } finally {
      setDiffDecisionLoading(false)
    }
  }

  const loadTask = useCallback(async () => {
    try {
      setError('')
      const [taskRes, logsRes, runtimeRes] = await Promise.all([
        tasks.get(taskId),
        tasks.getLogs(taskId),
        system.getRuntimeStatus()
      ])
      setTask(taskRes.data)
      setLogs(logsRes.data)
      setRuntimeStatus(runtimeRes.data)

      const approvalsRes = await approvals.list(undefined, taskId)
      setTaskApprovals(approvalsRes.data)
      await refreshPrStatus()
        try {
          const costRes = await tasks.getCost(taskId)
          setCostInfo(costRes.data)
        } catch (_e) { /* cost info is best-effort */ }
    } catch (err) {
      setError('Failed to load task')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [taskId, refreshPrStatus])

  useEffect(() => {
    loadTask()
  }, [loadTask])

  useEffect(() => {
    const onSSE = (event) => {
      const eventTaskId = event?.detail?.data?.task_id
      if (!eventTaskId || eventTaskId === taskId) {
        loadTask()
      }
    }

    window.addEventListener('mneme:sse', onSSE)
    return () => window.removeEventListener('mneme:sse', onSSE)
  }, [loadTask, taskId])

  useEffect(() => {
    loadArtifact(artifactType)
  }, [taskId, artifactType])

  const loadArtifact = async (selectedType) => {
    setLoadingArtifact(true)
    setArtifactError('')
    try {
      const response = await tasks.getArtifact(taskId, selectedType)
      setArtifactContent(response.data.content || '')
      setArtifactPath(response.data.path || '')
    } catch (err) {
      setArtifactContent('')
      setArtifactPath('')
      setArtifactError('Artifact not available yet')
    } finally {
      setLoadingArtifact(false)
    }
  }

  const handleRerunClaude = async () => {
    setRerunLoading(true)
    setError('')
    try {
      await tasks.rerunClaude(taskId)
      await loadTask()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to queue rerun')
    } finally {
      setRerunLoading(false)
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
    queued_for_execution: '#6f42c1',
    approved_for_execution: '#0dcaf0',
    waiting_for_manual_execution: '#fd7e14',
    waiting_for_diff_review: '#d63384',
    diff_review_approved: '#198754',
    plan_approved: '#28a745',
    plan_rejected: '#dc3545',
    executing: '#0d6efd',
    completed: '#198754',
    failed: '#dc3545'
  }

  const latestPlanApproval = taskApprovals
    .filter(approval => approval.type === 'plan')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]

  const latestDiffApproval = taskApprovals
    .filter(approval => approval.type === 'diff_review' || approval.type === 'diff')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]

  const pendingDiffApproval = taskApprovals
    .filter(approval => (approval.type === 'diff_review' || approval.type === 'diff') && approval.status === 'pending')
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
  const claudePromptPath = findLogValue('Claude prompt generated:')
  const claudeArtifacts = findLogValue('Claude artifacts written:')
  const diffSummaryPath = findLogValue('Diff summary generated:')
  const changedFiles = findLogValue('Changed files:')
  const latestPrUrl = findLogValue('GitHub PR URL:')
  const latestPrStatus = findLogValue('GitHub PR status:')
  const latestPrError = findLogValue('GitHub PR error:')
  const latestPrAttempt = findLogValue('GitHub PR attempt:')

  const prLogEntries = logs.filter(log => (log.message || '').startsWith('GitHub PR '))

  const testLogEntries = logs.filter(log => (log.message || '').startsWith('Test command `'))
  const notificationLogEntries = logs.filter(log => (log.message || '').startsWith('Notification '))
  const latestNotification = notificationLogEntries.length > 0 ? notificationLogEntries[notificationLogEntries.length - 1] : null

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
      <button
        onClick={() => showModal('layer2', { taskId })}
        style={{
          marginBottom: '1rem',
          marginLeft: '0.6rem',
          padding: '0.5rem 1rem',
          backgroundColor: '#2c3e50',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer'
        }}
      >
        View Workflow Graph
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

        {costInfo && (costInfo.total_tokens > 0 || costInfo.budget_usd > 0) && (
          <div style={{ marginBottom: '2rem', padding: '1rem', backgroundColor: '#fff8e7', borderRadius: '8px', border: '1px solid #ffe08a' }}>
            <h2 style={{ marginTop: 0 }}>Cost &amp; Usage</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
              <div><strong>Total Tokens:</strong> {costInfo.total_tokens.toLocaleString()}</div>
              <div><strong>Estimated Cost:</strong> ${costInfo.estimated_cost_usd.toFixed(4)}</div>
              {costInfo.budget_usd > 0 && (
                <div style={{ color: costInfo.budget_remaining_usd === 0 ? '#c00' : '#060' }}>
                  <strong>Budget:</strong> ${costInfo.budget_usd.toFixed(2)} (${costInfo.budget_remaining_usd?.toFixed(4) ?? '—'} remaining)
                </div>
              )}
            </div>
          </div>
        )}

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

      <div style={{ marginBottom: '2rem', padding: '1rem', backgroundColor: '#f9f9f9', borderRadius: '8px', border: '1px solid #ddd' }}>
        <h2>Execution Artifacts</h2>
        {task.status === 'failed' && (
          <div style={{ marginBottom: '1rem' }}>
            <button
              onClick={handleRerunClaude}
              disabled={rerunLoading}
              style={{
                padding: '0.65rem 1.1rem',
                backgroundColor: '#6f42c1',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: rerunLoading ? 'not-allowed' : 'pointer',
                opacity: rerunLoading ? 0.7 : 1,
                fontWeight: 'bold'
              }}
            >
              {rerunLoading ? 'Queueing...' : 'Rerun Execution'}
            </button>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
          <div><strong>Agent Prompt Path:</strong> {claudePromptPath || 'N/A'}</div>
          <div><strong>Agent Artifacts:</strong> {claudeArtifacts || 'N/A'}</div>
          <div><strong>Diff Summary Path:</strong> {diffSummaryPath || 'N/A'}</div>
          <div><strong>Active Model Provider:</strong> {runtimeStatus?.model_provider || 'N/A'}</div>
          <div><strong>Legacy CLI Command Configured:</strong> {runtimeStatus?.claude_command_configured ? 'yes' : 'no'}</div>
          <div><strong>Active Provider Key Configured:</strong> {runtimeStatus?.model_provider_key_configured ? 'yes' : 'no'}</div>
          <div><strong>Execution Max Retries:</strong> {runtimeStatus?.claude_code_max_retries ?? 'N/A'}</div>
        </div>
        <div style={{ marginTop: '1rem' }}>
          <p><strong>Changed Files:</strong> {changedFiles || 'N/A'}</p>
          <p>
            <strong>Diff Review Approval:</strong>{' '}
            {latestDiffApproval ? `${latestDiffApproval.status} (${latestDiffApproval.risk_level})` : 'none'}
          </p>
          <p><strong>Latest Notification Status:</strong> {latestNotification ? latestNotification.message : 'N/A'}</p>
        </div>

        <div style={{ marginTop: '1rem', padding: '0.75rem', backgroundColor: 'white', borderRadius: '4px', border: '1px solid #e5e5e5' }}>
          <strong>GitHub Pull Request Metadata</strong>
          <p><strong>Latest PR Attempt:</strong> {latestPrAttempt || 'N/A'}</p>
          <p><strong>Latest PR Status:</strong> {latestPrStatus || 'N/A'}</p>
          <p>
            <strong>Latest PR URL:</strong>{' '}
            {latestPrUrl ? (
              <a href={latestPrUrl} target="_blank" rel="noreferrer">{latestPrUrl}</a>
            ) : 'N/A'}
          </p>
          <p><strong>Latest PR Error:</strong> {latestPrError || 'N/A'}</p>
          <div>
            <strong>PR Event Logs:</strong>
            {prLogEntries.length === 0 ? (
              <p>No PR logs yet.</p>
            ) : (
              <ul>
                {prLogEntries.map(log => (
                  <li key={log.id}>{new Date(log.created_at).toLocaleTimeString()} - {log.message}</li>
                ))}
              </ul>
            )}
          </div>

          <div style={{ marginTop: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <strong>Live PR Status</strong>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button
                  onClick={refreshPrStatus}
                  disabled={prStatusLoading}
                  style={{
                    padding: '0.4rem 0.7rem',
                    backgroundColor: '#0d6efd',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  {prStatusLoading ? 'Refreshing...' : 'Refresh'}
                </button>
                <span style={{ fontSize: '0.8rem', color: '#666' }}>
                  SSE/manual refresh{lastPrRefreshAt ? ` · Last ${lastPrRefreshAt.toLocaleTimeString()}` : ''}
                </span>
              </div>
            </div>

            {prStatusLoading ? (
              <p>Refreshing PR status...</p>
            ) : !prStatus ? (
              <p>Unavailable</p>
            ) : prStatus.status !== 'ok' ? (
              <p>
                {prStatus.status}
                {prStatus.error ? ` - ${prStatus.error}` : ''}
              </p>
            ) : (
              <div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', margin: '0.5rem 0' }}>
                  <span style={{ padding: '0.2rem 0.55rem', borderRadius: '999px', backgroundColor: prStatus.pr.state === 'open' ? '#e7f3ff' : '#f0f0f0' }}>
                    State: {prStatus.pr.state}
                  </span>
                  <span style={{ padding: '0.2rem 0.55rem', borderRadius: '999px', backgroundColor: prStatus.pr.merged ? '#e8f8ec' : '#fff4e5' }}>
                    Merged: {String(prStatus.pr.merged)}
                  </span>
                  <span style={{ padding: '0.2rem 0.55rem', borderRadius: '999px', backgroundColor: prStatus.pr.draft ? '#fff4e5' : '#eef6ff' }}>
                    Draft: {String(prStatus.pr.draft)}
                  </span>
                  <span style={{ padding: '0.2rem 0.55rem', borderRadius: '999px', backgroundColor: '#f5f5f5' }}>
                    Mergeable: {String(prStatus.pr.mergeable)}
                  </span>
                </div>
                <p style={{ margin: '0.35rem 0' }}><strong>Head:</strong> {prStatus.pr.head}</p>
                <p style={{ margin: '0.35rem 0' }}><strong>Base:</strong> {prStatus.pr.base}</p>
                <p style={{ margin: '0.35rem 0' }}>
                  <strong>URL:</strong> <a href={prStatus.pr.url} target="_blank" rel="noreferrer">{prStatus.pr.url}</a>
                </p>
              </div>
            )}
          </div>
        </div>
        <div>
          <strong>Test Results:</strong>
          {testLogEntries.length === 0 ? (
            <p>No test execution logs yet.</p>
          ) : (
            <ul>
              {testLogEntries.map(log => (
                <li key={log.id}>{log.message}</li>
              ))}
            </ul>
          )}
        </div>
        {latestDiffApproval && (
          <div style={{ marginTop: '1rem', padding: '0.75rem', backgroundColor: 'white', borderRadius: '4px' }}>
            <strong>Latest Diff Review Summary</strong>
            <pre style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word', marginTop: '0.5rem' }}>
              {latestDiffApproval.summary}
            </pre>
          </div>
        )}

          {task.status === 'waiting_for_diff_review' && (
            <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#fff8e7', borderRadius: '8px', border: '2px solid #d39e00' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, color: '#664d03' }}>Diff Review Required</h3>
                <button
                  onClick={loadDiff}
                  disabled={diffLoading}
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: '#0d6efd',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: diffLoading ? 'not-allowed' : 'pointer',
                    opacity: diffLoading ? 0.7 : 1,
                    fontSize: '0.9rem'
                  }}
                >
                  {diffLoading ? 'Loading...' : 'View Diff'}
                </button>
              </div>

              {diffError && (
                <div style={{ padding: '0.75rem', backgroundColor: '#f8d7da', border: '1px solid #f6d6da', borderRadius: '4px', color: '#842029', marginBottom: '1rem' }}>
                  {diffError}
                </div>
              )}

              {diffContent && (
                <div style={{ 
                  backgroundColor: '#f5f5f5', 
                  border: '1px solid #ddd', 
                  borderRadius: '4px', 
                  overflow: 'auto',
                  maxHeight: '400px',
                  marginBottom: '1rem'
                }}>
                  <pre style={{ 
                    margin: 0, 
                    padding: '1rem',
                    fontFamily: 'monospace',
                    fontSize: '0.85rem',
                    whiteSpace: 'pre-wrap',
                    wordWrap: 'break-word'
                  }}>
                    {diffContent.split('\n').map((line, i) => (
                      <div
                        key={i}
                        style={{
                          backgroundColor:
                            line.startsWith('+') && !line.startsWith('+++') ? '#e6ffdb' :
                            line.startsWith('-') && !line.startsWith('---') ? '#ffe6e6' :
                            line.startsWith('@@') ? '#e6f2ff' :
                            'transparent',
                          color:
                            line.startsWith('+') && !line.startsWith('+++') ? '#155724' :
                            line.startsWith('-') && !line.startsWith('---') ? '#721c24' :
                            line.startsWith('@@') ? '#004085' :
                            '#333',
                          paddingLeft: '0.5rem',
                          lineHeight: '1.4'
                        }}
                      >
                        {line}
                      </div>
                    ))}
                  </pre>
                </div>
              )}

              {diffContent && (
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => handleDiffDecision(pendingDiffApproval?.id, 'approve')}
                    disabled={!pendingDiffApproval || diffDecisionLoading}
                    style={{
                      padding: '0.65rem 1.2rem',
                      backgroundColor: '#198754',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: !pendingDiffApproval || diffDecisionLoading ? 'not-allowed' : 'pointer',
                      fontWeight: 'bold',
                      opacity: !pendingDiffApproval || diffDecisionLoading ? 0.7 : 1
                    }}
                  >
                    {diffDecisionLoading ? 'Submitting...' : 'Approve Changes'}
                  </button>
                  <button
                    onClick={() => handleDiffDecision(pendingDiffApproval?.id, 'reject')}
                    disabled={!pendingDiffApproval || diffDecisionLoading}
                    style={{
                      padding: '0.65rem 1.2rem',
                      backgroundColor: '#dc3545',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: !pendingDiffApproval || diffDecisionLoading ? 'not-allowed' : 'pointer',
                      fontWeight: 'bold',
                      opacity: !pendingDiffApproval || diffDecisionLoading ? 0.7 : 1
                    }}
                  >
                    {diffDecisionLoading ? 'Submitting...' : 'Reject Changes'}
                  </button>
                  {!pendingDiffApproval && (
                    <p style={{ margin: 0, color: '#666', alignSelf: 'center' }}>
                      No pending diff approval request is available.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

        <div style={{ marginTop: '1rem', padding: '0.75rem', backgroundColor: 'white', borderRadius: '4px', border: '1px solid #e5e5e5' }}>
          <div style={{ marginBottom: '0.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <strong>Artifact Viewer:</strong>
            <select
              value={artifactType}
              onChange={(event) => setArtifactType(event.target.value)}
              style={{ padding: '0.35rem 0.5rem', borderRadius: '4px', border: '1px solid #ccc' }}
            >
              <option value="stdout">stdout</option>
              <option value="stderr">stderr</option>
              <option value="meta">meta</option>
              <option value="prompt">prompt</option>
              <option value="diff">diff</option>
            </select>
          </div>
          {artifactPath && <p style={{ margin: '0.25rem 0 0.5rem 0', color: '#666', fontSize: '0.85rem' }}><strong>Path:</strong> {artifactPath}</p>}
          {loadingArtifact ? (
            <p>Loading artifact...</p>
          ) : artifactError ? (
            <p style={{ color: '#a94442' }}>{artifactError}</p>
          ) : (
            <pre style={{ maxHeight: '260px', overflow: 'auto', whiteSpace: 'pre-wrap', wordWrap: 'break-word', margin: 0, backgroundColor: '#fbfbfb', border: '1px solid #eee', borderRadius: '4px', padding: '0.65rem' }}>
              {artifactContent || 'No content'}
            </pre>
          )}
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
