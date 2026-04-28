import React, { useState, useEffect } from 'react'
import { approvals, tasks } from '../api'

export default function Approvals() {
  const [approvalList, setApprovalList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [taskDetails, setTaskDetails] = useState({})

  useEffect(() => {
    loadApprovals()
    const interval = setInterval(loadApprovals, 3000)
    return () => clearInterval(interval)
  }, [])

  const loadApprovals = async () => {
    try {
      setError('')
      const response = await approvals.list('pending')
      setApprovalList(response.data)
      
      // Load task details for each approval
      for (const approval of response.data) {
        if (!taskDetails[approval.task_id]) {
          try {
            const taskRes = await tasks.get(approval.task_id)
            setTaskDetails(prev => ({
              ...prev,
              [approval.task_id]: taskRes.data
            }))
          } catch (err) {
            console.error('Failed to load task', err)
          }
        }
      }
    } catch (err) {
      setError('Failed to load approvals')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

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

  if (loading) {
    return <div style={{ padding: '2rem' }}>Loading...</div>
  }

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Pending Approvals</h1>

      {error && <div style={{ color: 'red', marginBottom: '1rem', padding: '1rem', backgroundColor: '#ffe6e6', borderRadius: '4px' }}>{error}</div>}

      {approvalList.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <p>No pending approvals</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '1.5rem' }}>
          {approvalList.map(approval => {
            const task = taskDetails[approval.task_id]
            return (
              <div
                key={approval.id}
                style={{
                  padding: '1.5rem',
                  backgroundColor: 'white',
                  borderRadius: '8px',
                  border: '2px solid #ff6b6b'
                }}
              >
                <h3>{approval.title}</h3>
                <p style={{ margin: '0.5rem 0', color: '#555', fontSize: '0.9rem' }}>
                  <strong>Risk:</strong> {approval.risk_level || 'medium'}
                </p>
                {task && (
                  <p style={{ margin: '0.5rem 0', color: '#777', fontSize: '0.9rem' }}>
                    <strong>Task:</strong> {task.objective}
                  </p>
                )}
                <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#f9f9f9', borderRadius: '4px', maxHeight: '300px', overflowY: 'auto' }}>
                  <strong>Plan:</strong>
                  <pre style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word', margin: '0.5rem 0 0 0' }}>
                    {approval.summary}
                  </pre>
                </div>
                <div style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <button
                    onClick={() => handleApprove(approval.id)}
                    style={{
                      padding: '0.75rem 1.5rem',
                      backgroundColor: '#28a745',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      fontSize: '1rem'
                    }}
                  >
                    ✓ Approve
                  </button>
                  <button
                    onClick={() => handleReject(approval.id)}
                    style={{
                      padding: '0.75rem 1.5rem',
                      backgroundColor: '#dc3545',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      fontSize: '1rem'
                    }}
                  >
                    ✕ Reject
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
