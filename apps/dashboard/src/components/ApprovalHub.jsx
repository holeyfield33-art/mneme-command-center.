import React, { useState, useEffect } from 'react'
import { approvals } from '../api'

/**
 * ApprovalHub - Layer 0 Universal Approval Gate
 * 
 * Always-visible component that displays pending approvals requiring immediate user action.
 * - Fixed position at bottom of screen
 * - Shows one approval at a time (highest priority first)
 * - Provides structured action buttons (Approve, Reject, Modify)
 * - Minimizable but never scrolls away
 * - Displays risk level, cost estimate, and action summary
 */
export default function ApprovalHub({ onApprovalResolved = () => {} }) {
  const [currentApproval, setCurrentApproval] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isMinimized, setIsMinimized] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [modifyMode, setModifyMode] = useState(false)
  const [modifyText, setModifyText] = useState('')

  // Poll for pending approvals
  useEffect(() => {
    const loadApprovals = async () => {
      try {
        const res = await approvals.list('pending')
        if (res.data && res.data.length > 0) {
          // Sort by created_at (oldest first) and priority
          const sorted = res.data.sort((a, b) => {
            // High risk first
            const riskOrder = { high: 0, medium: 1, low: 2 }
            const riskA = riskOrder[a.risk_level] ?? 999
            const riskB = riskOrder[b.risk_level] ?? 999
            if (riskA !== riskB) return riskA - riskB
            // Then by creation time
            return new Date(a.created_at) - new Date(b.created_at)
          })
          setCurrentApproval(sorted[0])
        } else {
          setCurrentApproval(null)
        }
      } catch (err) {
        console.error('Failed to load approvals:', err)
      }
    }

    loadApprovals()
    const interval = setInterval(loadApprovals, 3000) // Poll every 3 seconds
    return () => clearInterval(interval)
  }, [])

  const handleApprove = async () => {
    if (!currentApproval) return
    try {
      setActionLoading(true)
      setError('')
      await approvals.respond(currentApproval.id, 'approved', {})
      onApprovalResolved('approved')
      setCurrentApproval(null)
    } catch (err) {
      setError('Failed to approve: ' + (err.message || 'Unknown error'))
    } finally {
      setActionLoading(false)
    }
  }

  const handleReject = async () => {
    if (!currentApproval) return
    if (!confirm('Are you sure you want to reject this action?')) return
    try {
      setActionLoading(true)
      setError('')
      await approvals.respond(currentApproval.id, 'rejected', {
        reason: 'Rejected by user'
      })
      onApprovalResolved('rejected')
      setCurrentApproval(null)
    } catch (err) {
      setError('Failed to reject: ' + (err.message || 'Unknown error'))
    } finally {
      setActionLoading(false)
    }
  }

  const handleModifySubmit = async () => {
    if (!currentApproval) return
    if (!modifyText.trim()) {
      setError('Please provide modification details')
      return
    }
    try {
      setActionLoading(true)
      setError('')
      await approvals.respond(currentApproval.id, 'modified', {
        modification_request: modifyText,
        original_context: currentApproval.context
      })
      onApprovalResolved('modified')
      setCurrentApproval(null)
      setModifyMode(false)
      setModifyText('')
    } catch (err) {
      setError('Failed to send modification request: ' + (err.message || 'Unknown error'))
    } finally {
      setActionLoading(false)
    }
  }

  // If no pending approval, don't render
  if (!currentApproval) {
    return (
      <div style={{
        position: 'fixed',
        bottom: '2rem',
        right: '2rem',
        backgroundColor: '#2ecc71',
        color: 'white',
        padding: '0.75rem 1rem',
        borderRadius: '0.5rem',
        fontSize: '0.875rem',
        zIndex: 50,
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        opacity: 0.7,
        pointerEvents: 'none'
      }}>
        ✓ All approvals current
      </div>
    )
  }

  const getRiskColor = (riskLevel) => {
    switch (riskLevel) {
      case 'high':
        return '#e74c3c' // Red
      case 'medium':
        return '#f39c12' // Orange
      case 'low':
        return '#3498db' // Blue
      default:
        return '#95a5a6' // Gray
    }
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: '#2c3e50',
      color: 'white',
      borderTop: `4px solid ${getRiskColor(currentApproval.risk_level)}`,
      boxShadow: '0 -4px 12px rgba(0,0,0,0.15)',
      zIndex: 9999,
      transform: isMinimized ? 'translateY(calc(100% - 3rem))' : 'translateY(0)',
      transition: 'transform 0.3s ease',
      maxHeight: isMinimized ? '3rem' : '100vh',
      overflowY: isMinimized ? 'hidden' : 'auto'
    }}>
      {/* Minimizable header */}
      <div style={{
        padding: '1rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid #34495e',
        cursor: 'pointer',
        backgroundColor: getRiskColor(currentApproval.risk_level)
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
          <span style={{ fontSize: '1.25rem' }}>⚠️</span>
          <div>
            <div style={{ fontWeight: 'bold', fontSize: '1rem' }}>
              Approval Required
            </div>
            <div style={{ fontSize: '0.875rem', opacity: 0.9 }}>
              {currentApproval.type || 'Action'} - {currentApproval.risk_level} risk
            </div>
          </div>
        </div>
        <button
          onClick={() => setIsMinimized(!isMinimized)}
          style={{
            background: 'none',
            border: 'none',
            color: 'white',
            fontSize: '1.5rem',
            cursor: 'pointer',
            padding: 0
          }}
        >
          {isMinimized ? '▲' : '▼'}
        </button>
      </div>

      {!isMinimized && (
        <div style={{ padding: '1.5rem' }}>
          {/* Error message */}
          {error && (
            <div style={{
              backgroundColor: '#e74c3c',
              color: 'white',
              padding: '0.75rem',
              borderRadius: '0.25rem',
              marginBottom: '1rem',
              fontSize: '0.875rem'
            }}>
              {error}
            </div>
          )}

          {!modifyMode ? (
            <>
              {/* Action summary */}
              <div style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1.125rem' }}>
                  {currentApproval.action || 'Requested Action'}
                </h3>
                {currentApproval.description && (
                  <p style={{ margin: '0.5rem 0', fontSize: '0.95rem', opacity: 0.9 }}>
                    {currentApproval.description}
                  </p>
                )}

                {/* Risk and cost info */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
                  {currentApproval.estimated_cost && (
                    <div style={{
                      backgroundColor: '#34495e',
                      padding: '0.75rem',
                      borderRadius: '0.25rem'
                    }}>
                      <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>Estimated Cost</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>
                        ${currentApproval.estimated_cost.toFixed(2)}
                      </div>
                    </div>
                  )}
                  {currentApproval.blast_radius && (
                    <div style={{
                      backgroundColor: '#34495e',
                      padding: '0.75rem',
                      borderRadius: '0.25rem'
                    }}>
                      <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>Blast Radius</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>
                        {currentApproval.blast_radius}
                      </div>
                    </div>
                  )}
                </div>

                {/* Context details */}
                {currentApproval.context && (
                  <div style={{
                    backgroundColor: '#1a252f',
                    padding: '0.75rem',
                    borderRadius: '0.25rem',
                    marginTop: '1rem',
                    fontFamily: 'monospace',
                    fontSize: '0.85rem',
                    maxHeight: '200px',
                    overflowY: 'auto'
                  }}>
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {typeof currentApproval.context === 'string'
                        ? currentApproval.context
                        : JSON.stringify(currentApproval.context, null, 2)}
                    </pre>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: '0.75rem'
              }}>
                <button
                  onClick={handleReject}
                  disabled={actionLoading}
                  style={{
                    padding: '0.75rem 1rem',
                    backgroundColor: '#e74c3c',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.25rem',
                    cursor: actionLoading ? 'not-allowed' : 'pointer',
                    fontWeight: 'bold',
                    opacity: actionLoading ? 0.6 : 1
                  }}
                >
                  {actionLoading ? '...' : 'Reject'}
                </button>
                <button
                  onClick={() => setModifyMode(true)}
                  disabled={actionLoading}
                  style={{
                    padding: '0.75rem 1rem',
                    backgroundColor: '#f39c12',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.25rem',
                    cursor: actionLoading ? 'not-allowed' : 'pointer',
                    fontWeight: 'bold',
                    opacity: actionLoading ? 0.6 : 1
                  }}
                >
                  {actionLoading ? '...' : 'Modify'}
                </button>
                <button
                  onClick={handleApprove}
                  disabled={actionLoading}
                  style={{
                    padding: '0.75rem 1rem',
                    backgroundColor: '#27ae60',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.25rem',
                    cursor: actionLoading ? 'not-allowed' : 'pointer',
                    fontWeight: 'bold',
                    opacity: actionLoading ? 0.6 : 1
                  }}
                >
                  {actionLoading ? '...' : 'Approve'}
                </button>
              </div>
            </>
          ) : (
            /* Modify mode */
            <>
              <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.125rem' }}>
                Request Modification
              </h3>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.95rem' }}>
                  What would you like changed?
                </label>
                <textarea
                  value={modifyText}
                  onChange={(e) => setModifyText(e.target.value)}
                  placeholder="Describe the changes you'd like..."
                  style={{
                    width: '100%',
                    minHeight: '100px',
                    padding: '0.75rem',
                    borderRadius: '0.25rem',
                    border: '1px solid #34495e',
                    backgroundColor: '#1a252f',
                    color: 'white',
                    fontFamily: 'inherit',
                    fontSize: '0.95rem',
                    boxSizing: 'border-box',
                    resize: 'vertical'
                  }}
                />
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '0.75rem'
              }}>
                <button
                  onClick={() => {
                    setModifyMode(false)
                    setModifyText('')
                  }}
                  disabled={actionLoading}
                  style={{
                    padding: '0.75rem 1rem',
                    backgroundColor: '#7f8c8d',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.25rem',
                    cursor: actionLoading ? 'not-allowed' : 'pointer',
                    fontWeight: 'bold',
                    opacity: actionLoading ? 0.6 : 1
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleModifySubmit}
                  disabled={actionLoading || !modifyText.trim()}
                  style={{
                    padding: '0.75rem 1rem',
                    backgroundColor: '#f39c12',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.25rem',
                    cursor: (!modifyText.trim() || actionLoading) ? 'not-allowed' : 'pointer',
                    fontWeight: 'bold',
                    opacity: (!modifyText.trim() || actionLoading) ? 0.6 : 1
                  }}
                >
                  {actionLoading ? '...' : 'Send Feedback'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
