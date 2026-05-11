import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { approvals, tasks } from '../api'
import ApprovalCard from '../components/ApprovalCard'

export default function Approvals() {
  const [approvalList, setApprovalList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
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

          {sortedApprovals.map(approval => {
            const task = taskDetails[approval.task_id]
            return (
              <ApprovalCard
                key={approval.id}
                approval={approval}
                task={task}
                onApprove={handleApprove}
                onReject={handleReject}
                onModify={handleModify}
              />
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
