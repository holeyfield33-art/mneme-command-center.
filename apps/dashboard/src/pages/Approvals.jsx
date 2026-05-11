import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { approvals, tasks } from '../api'
import ApprovalCard from '../components/ApprovalCard'
import ApprovalsAuditTimeline from '../components/ApprovalsAuditTimeline'
import ApprovalBacklogCorrelation from '../components/ApprovalBacklogCorrelation'

function getSlaHoursByRisk(riskLevel) {
  const risk = String(riskLevel || 'medium').toLowerCase()
  if (risk === 'high') return 2
  if (risk === 'low') return 24
  return 8
}

function isApprovalOverdue(approval) {
  const createdAt = approval?.created_at ? new Date(approval.created_at).getTime() : null
  if (!createdAt || Number.isNaN(createdAt)) return false
  const dueAtMs = createdAt + (getSlaHoursByRisk(approval?.risk_level) * 60 * 60 * 1000)
  return Date.now() > dueAtMs
}

export default function Approvals() {
  const [approvalList, setApprovalList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [incidentMode, setIncidentMode] = useState(false)
  const [incidentFilter, setIncidentFilter] = useState('all')
  const [selectedApprovalIds, setSelectedApprovalIds] = useState([])
  const [bulkActionLoading, setBulkActionLoading] = useState(false)
  const [taskDetails, setTaskDetails] = useState({})
  const [modifyDraft, setModifyDraft] = useState({
    approvalId: '',
    reasonCode: 'scope_change',
    details: '',
  })

  const modifyReasonOptions = [
    { value: 'scope_change', label: 'Scope change needed' },
    { value: 'test_coverage_gap', label: 'Test coverage gap' },
    { value: 'risk_reduction', label: 'Risk reduction required' },
    { value: 'rollback_plan', label: 'Rollback plan unclear' },
  ]

  const sortedApprovals = useMemo(() => {
    const riskRank = { high: 3, medium: 2, low: 1 }
    return [...approvalList].sort((a, b) => {
      const riskA = riskRank[(a?.risk_level || 'medium').toLowerCase()] || 0
      const riskB = riskRank[(b?.risk_level || 'medium').toLowerCase()] || 0
      if (riskA !== riskB) return riskB - riskA

      const createdA = a?.created_at ? new Date(a.created_at).getTime() : 0
      const createdB = b?.created_at ? new Date(b.created_at).getTime() : 0
      return createdA - createdB
    })
  }, [approvalList])

  const queueSummary = useMemo(() => {
    const summary = {
      total: approvalList.length,
      highRisk: 0,
      mediumRisk: 0,
      lowRisk: 0,
    }

    approvalList.forEach((approval) => {
      const risk = (approval?.risk_level || 'medium').toLowerCase()
      if (risk === 'high') summary.highRisk += 1
      else if (risk === 'low') summary.lowRisk += 1
      else summary.mediumRisk += 1
    })

    return summary
  }, [approvalList])

  const overdueCount = useMemo(
    () => approvalList.filter((approval) => isApprovalOverdue(approval)).length,
    [approvalList]
  )

  const filteredApprovals = useMemo(() => {
    return sortedApprovals.filter((approval) => {
      if (incidentFilter === 'high') {
        return String(approval?.risk_level || 'medium').toLowerCase() === 'high'
      }
      if (incidentFilter === 'overdue') {
        return isApprovalOverdue(approval)
      }
      if (incidentFilter === 'high_or_overdue') {
        return String(approval?.risk_level || 'medium').toLowerCase() === 'high' || isApprovalOverdue(approval)
      }
      return true
    })
  }, [sortedApprovals, incidentFilter])

  useEffect(() => {
    const visibleIds = new Set(filteredApprovals.map((approval) => approval.id))
    setSelectedApprovalIds((prev) => prev.filter((id) => visibleIds.has(id)))
  }, [filteredApprovals])

  const loadApprovals = useCallback(async () => {
    try {
      setError('')
      const response = await approvals.list('pending')
      setApprovalList(response.data)

      const uniqueTaskIds = [...new Set(response.data.map((approval) => approval.task_id))]
      const loadedTasks = await Promise.all(
        uniqueTaskIds.map(async (taskId) => {
          try {
            const taskRes = await tasks.get(taskId)
            return [taskId, taskRes.data]
          } catch (err) {
            console.error('Failed to load task', err)
            return null
          }
        })
      )

      const nextTaskDetails = {}
      loadedTasks.forEach((entry) => {
        if (entry) {
          nextTaskDetails[entry[0]] = entry[1]
        }
      })
      setTaskDetails(nextTaskDetails)
    } catch (err) {
      setError('Failed to load approvals')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadApprovals()
  }, [loadApprovals])

  useEffect(() => {
    const onSSE = () => {
      loadApprovals()
    }

    window.addEventListener('mneme:sse', onSSE)
    return () => window.removeEventListener('mneme:sse', onSSE)
  }, [loadApprovals])

  const handleApprove = async (approvalId) => {
    try {
      await approvals.approve(approvalId)
      loadApprovals()
    } catch (err) {
      setError('Failed to approve')
    }
  }

  const handleReject = async (approvalId) => {
    try {
      await approvals.reject(approvalId)
      loadApprovals()
    } catch (err) {
      setError('Failed to reject')
    }
  }

  const handleModify = (approvalId) => {
    setModifyDraft({
      approvalId,
      reasonCode: 'scope_change',
      details: '',
    })
  }

  const toggleApprovalSelection = (approvalId) => {
    setSelectedApprovalIds((prev) => {
      if (prev.includes(approvalId)) {
        return prev.filter((id) => id !== approvalId)
      }
      return [...prev, approvalId]
    })
  }

  const selectVisibleApprovals = () => {
    setSelectedApprovalIds(filteredApprovals.map((approval) => approval.id))
  }

  const clearSelection = () => {
    setSelectedApprovalIds([])
  }

  const runBulkAction = async (action) => {
    if (selectedApprovalIds.length === 0) {
      setError('Select one or more approvals to run a bulk action.')
      return
    }

    const actionLabel = action === 'approve' ? 'approve' : 'reject'
    if (!window.confirm(`Run bulk ${actionLabel} for ${selectedApprovalIds.length} approvals?`)) {
      return
    }

    setBulkActionLoading(true)
    setError('')
    setInfo('')

    try {
      const results = await Promise.allSettled(
        selectedApprovalIds.map((approvalId) =>
          action === 'approve' ? approvals.approve(approvalId) : approvals.reject(approvalId)
        )
      )

      const successCount = results.filter((result) => result.status === 'fulfilled').length
      const failureCount = results.length - successCount

      if (failureCount > 0) {
        setError(`Bulk ${actionLabel} completed with ${failureCount} failure(s).`)
      }
      setInfo(`Bulk ${actionLabel}: ${successCount} succeeded${failureCount ? `, ${failureCount} failed` : ''}.`)
      setSelectedApprovalIds([])
      loadApprovals()
    } catch (err) {
      setError(`Failed to run bulk ${actionLabel}.`)
      console.error(err)
    } finally {
      setBulkActionLoading(false)
    }
  }

  const submitModifyDraft = async () => {
    if (!modifyDraft.approvalId || !modifyDraft.details.trim()) {
      setError('Please provide modification details before submitting.')
      return
    }

    try {
      await approvals.modify(
        modifyDraft.approvalId,
        modifyDraft.reasonCode,
        modifyDraft.details.trim(),
      )
      setInfo(
        `Modify request submitted for ${modifyDraft.approvalId}: ` +
        `${modifyDraft.reasonCode}`
      )
      setError('')
      setModifyDraft({ approvalId: '', reasonCode: 'scope_change', details: '' })
      loadApprovals()
    } catch (err) {
      setError('Failed to submit modify request')
      console.error(err)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '2rem' }}>
        <h1 style={{ marginBottom: '1rem' }}>Pending Approvals</h1>
        <div className="mneme-surface mneme-enter" style={{ padding: '1rem' }}>
          <div className="mneme-skeleton" style={{ height: '1.2rem', marginBottom: '0.75rem' }} />
          <div className="mneme-skeleton" style={{ height: '3.6rem', marginBottom: '0.6rem' }} />
          <div className="mneme-skeleton" style={{ height: '3.6rem' }} />
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Pending Approvals</h1>

      {error && <div className="mneme-alert error">{error}</div>}
      {info && <div className="mneme-alert info">{info}</div>}

      <div style={{ marginBottom: '1.1rem' }}>
        <ApprovalsAuditTimeline />
      </div>

      <ApprovalBacklogCorrelation approvals={approvalList} taskDetails={taskDetails} />

      <div className="mneme-surface mneme-enter" style={{ marginBottom: '1.1rem', padding: '0.9rem 1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0 }}>Incident Mode</h3>
          <button
            type="button"
            onClick={() => {
              setIncidentMode((prev) => !prev)
              setSelectedApprovalIds([])
            }}
            style={{
              padding: '0.42rem 0.85rem',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 700,
              backgroundColor: incidentMode ? '#c44236' : '#1f7a8c',
              color: 'white',
            }}
          >
            {incidentMode ? 'Disable Incident Mode' : 'Enable Incident Mode'}
          </button>
        </div>
        <div style={{ marginTop: '0.45rem', fontSize: '0.86rem', color: '#526170' }}>
          Overdue approvals: <strong>{overdueCount}</strong>
        </div>

        {incidentMode && (
          <div style={{ marginTop: '0.75rem', display: 'grid', gap: '0.7rem' }}>
            <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
              {[
                { value: 'all', label: 'All Pending' },
                { value: 'high', label: 'High Risk' },
                { value: 'overdue', label: 'Overdue SLA' },
                { value: 'high_or_overdue', label: 'High or Overdue' },
              ].map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setIncidentFilter(filter.value)}
                  style={{
                    border: '1px solid #c9d4de',
                    borderRadius: '999px',
                    padding: '0.2rem 0.6rem',
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    color: incidentFilter === filter.value ? 'white' : '#30465c',
                    backgroundColor: incidentFilter === filter.value ? '#1f7a8c' : 'white',
                  }}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '0.82rem', color: '#526170' }}>
                Selected: <strong>{selectedApprovalIds.length}</strong> / {filteredApprovals.length}
              </span>
              <button
                type="button"
                onClick={selectVisibleApprovals}
                style={{ padding: '0.36rem 0.7rem', borderRadius: '6px', border: '1px solid #c9d4de', backgroundColor: 'white', cursor: 'pointer', fontWeight: 600 }}
              >
                Select Visible
              </button>
              <button
                type="button"
                onClick={clearSelection}
                style={{ padding: '0.36rem 0.7rem', borderRadius: '6px', border: '1px solid #c9d4de', backgroundColor: 'white', cursor: 'pointer', fontWeight: 600 }}
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => runBulkAction('approve')}
                disabled={bulkActionLoading || selectedApprovalIds.length === 0}
                style={{ padding: '0.36rem 0.7rem', borderRadius: '6px', border: 'none', backgroundColor: '#2f9e6f', color: 'white', cursor: 'pointer', fontWeight: 700 }}
              >
                Approve Selected
              </button>
              <button
                type="button"
                onClick={() => runBulkAction('reject')}
                disabled={bulkActionLoading || selectedApprovalIds.length === 0}
                style={{ padding: '0.36rem 0.7rem', borderRadius: '6px', border: 'none', backgroundColor: '#c44236', color: 'white', cursor: 'pointer', fontWeight: 700 }}
              >
                Reject Selected
              </button>
            </div>
          </div>
        )}
      </div>

      {approvalList.length === 0 ? (
        <div className="mneme-empty mneme-enter" style={{ textAlign: 'center' }}>
          <p style={{ fontWeight: 700, marginBottom: '0.25rem', color: '#30465c' }}>No pending approvals</p>
          <p>Workflow queue is clear. New risk-gated actions will appear here in real time.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '1.5rem' }}>
          <div className="mneme-surface mneme-enter" style={{ padding: '0.9rem 1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(120px, 1fr))', gap: '0.75rem' }}>
              <div>
                <div style={{ fontSize: '0.76rem', color: '#5b6a79' }}>Pending</div>
                <div style={{ fontWeight: 700, color: '#223649' }}>{queueSummary.total}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.76rem', color: '#5b6a79' }}>High Risk</div>
                <div style={{ fontWeight: 700, color: '#c44236' }}>{queueSummary.highRisk}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.76rem', color: '#5b6a79' }}>Medium Risk</div>
                <div style={{ fontWeight: 700, color: '#d9822b' }}>{queueSummary.mediumRisk}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.76rem', color: '#5b6a79' }}>Low Risk</div>
                <div style={{ fontWeight: 700, color: '#2f9e6f' }}>{queueSummary.lowRisk}</div>
              </div>
            </div>
          </div>

          {filteredApprovals.map(approval => {
            const task = taskDetails[approval.task_id]
            return (
              <div key={approval.id} style={{ position: 'relative' }}>
                {incidentMode && (
                  <label
                    style={{
                      position: 'absolute',
                      top: '0.65rem',
                      right: '0.75rem',
                      zIndex: 3,
                      backgroundColor: '#ffffffee',
                      border: '1px solid #d9e3ec',
                      borderRadius: '999px',
                      padding: '0.2rem 0.45rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      fontSize: '0.76rem',
                      color: '#30465c',
                      fontWeight: 700,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedApprovalIds.includes(approval.id)}
                      onChange={() => toggleApprovalSelection(approval.id)}
                    />
                    Scope
                  </label>
                )}
                <ApprovalCard
                  approval={approval}
                  task={task}
                  onApprove={handleApprove}
                  onReject={handleReject}
                  onModify={handleModify}
                />
              </div>
            )
          })}
        </div>
      )}

      {modifyDraft.approvalId && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10010,
          }}
          onClick={() => setModifyDraft({ approvalId: '', reasonCode: 'scope_change', details: '' })}
        >
          <div
            className="mneme-surface mneme-enter"
            style={{
              width: 'min(620px, 92vw)',
              backgroundColor: 'white',
              padding: '1.2rem',
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <h3 style={{ margin: 0, marginBottom: '0.8rem' }}>Structured Modify Request</h3>
            <p style={{ marginBottom: '0.75rem', color: '#526170', fontSize: '0.92rem' }}>
              Approval ID: {modifyDraft.approvalId}
            </p>
            <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 600 }}>Reason Code</label>
            <select
              value={modifyDraft.reasonCode}
              onChange={(event) => setModifyDraft((prev) => ({ ...prev, reasonCode: event.target.value }))}
              style={{ width: '100%', marginBottom: '0.75rem', padding: '0.5rem', borderRadius: '6px', border: '1px solid #c9d4de' }}
            >
              {modifyReasonOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 600 }}>Reviewer Guidance</label>
            <textarea
              value={modifyDraft.details}
              onChange={(event) => setModifyDraft((prev) => ({ ...prev, details: event.target.value }))}
              placeholder="Describe exact changes needed before approval."
              style={{ width: '100%', minHeight: '120px', padding: '0.6rem', borderRadius: '6px', border: '1px solid #c9d4de' }}
            />
            <div style={{ marginTop: '0.9rem', display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
              <button
                onClick={() => setModifyDraft({ approvalId: '', reasonCode: 'scope_change', details: '' })}
                style={{ padding: '0.5rem 0.8rem', border: 'none', borderRadius: '6px', backgroundColor: '#7d8a96', color: 'white', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={submitModifyDraft}
                style={{ padding: '0.5rem 0.8rem', border: 'none', borderRadius: '6px', backgroundColor: '#1f7a8c', color: 'white', cursor: 'pointer', fontWeight: 700 }}
              >
                Save Modify Guidance
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
