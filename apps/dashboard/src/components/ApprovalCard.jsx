import React, { useEffect, useMemo, useState } from 'react'

export default function ApprovalCard({ approval, task, onApprove, onReject, onModify }) {
  const [showPreview, setShowPreview] = useState(false)
  const [nowMs, setNowMs] = useState(Date.now())

  useEffect(() => {
    const timerId = window.setInterval(() => setNowMs(Date.now()), 30000)
    return () => window.clearInterval(timerId)
  }, [])

  const files = useMemo(() => {
    const maybeFiles = approval?.plan_details?.files
    if (!Array.isArray(maybeFiles)) return []
    return maybeFiles.filter((file) => file && file.path)
  }, [approval])

  const confidenceModel = useMemo(() => {
    const risk = (approval?.risk_level || 'medium').toLowerCase()
    const fileCount = files.length
    const summaryLength = (approval?.summary || '').length

    const baseByRisk = {
      low: { confidence: 86, blast: 'contained' },
      medium: { confidence: 71, blast: 'moderate' },
      high: { confidence: 58, blast: 'broad' },
    }

    const base = baseByRisk[risk] || baseByRisk.medium
    const confidencePenalty = Math.min(18, Math.floor(fileCount / 2) + (summaryLength > 1200 ? 6 : 0))
    const confidence = Math.max(32, base.confidence - confidencePenalty)

    let confidenceBand = 'High'
    if (confidence < 75) confidenceBand = 'Medium'
    if (confidence < 55) confidenceBand = 'Low'

    return {
      confidence,
      confidenceBand,
      blastRadius: fileCount >= 8 ? 'repo-wide' : base.blast,
      changedFiles: fileCount,
    }
  }, [approval, files])

  const slaState = useMemo(() => {
    const risk = (approval?.risk_level || 'medium').toLowerCase()
    const createdAt = approval?.created_at ? new Date(approval.created_at).getTime() : null

    if (!createdAt || Number.isNaN(createdAt)) {
      return {
        label: 'No SLA data',
        overdue: false,
      }
    }

    const limitHoursByRisk = {
      low: 24,
      medium: 8,
      high: 2,
    }

    const limitHours = limitHoursByRisk[risk] || limitHoursByRisk.medium
    const dueAtMs = createdAt + (limitHours * 60 * 60 * 1000)
    const diffMs = dueAtMs - nowMs
    const overdue = diffMs < 0

    const absMinutes = Math.floor(Math.abs(diffMs) / 60000)
    const hours = Math.floor(absMinutes / 60)
    const minutes = absMinutes % 60
    const timeLabel = `${hours}h ${minutes}m`

    return {
      label: overdue ? `Overdue by ${timeLabel}` : `${timeLabel} remaining`,
      overdue,
    }
  }, [approval, nowMs])

  const riskAccent = {
    low: '#2f9e6f',
    medium: '#d9822b',
    high: '#c44236',
  }[(approval?.risk_level || 'medium').toLowerCase()] || '#d9822b'

  const decisionBrief = useMemo(() => {
    const reasons = []

    if (confidenceModel.changedFiles >= 8) {
      reasons.push('Large file surface area detected across the repository')
    } else if (confidenceModel.changedFiles >= 4) {
      reasons.push('Moderate multi-file change scope')
    } else {
      reasons.push('Contained change set')
    }

    if (slaState.overdue) {
      reasons.push('SLA has expired and needs immediate operator action')
    } else {
      reasons.push('SLA window is still active')
    }

    if (confidenceModel.confidenceBand === 'Low') {
      reasons.push('Low confidence score indicates high uncertainty in change quality')
    } else if (confidenceModel.confidenceBand === 'Medium') {
      reasons.push('Medium confidence score warrants review attention')
    } else {
      reasons.push('High confidence score supports streamlined review')
    }

    let recommendation = 'Approve if core acceptance criteria are satisfied'
    if (slaState.overdue || confidenceModel.confidenceBand === 'Low') {
      recommendation = 'Use Modify or Reject until risk is reduced and evidence is stronger'
    }

    return { reasons, recommendation }
  }, [confidenceModel, slaState])

  return (
    <div
      className="mneme-surface mneme-enter"
      style={{
        padding: '1.5rem',
        backgroundColor: 'white',
        borderRadius: '8px',
        border: `2px solid ${riskAccent}`
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

      <div
        style={{
          marginTop: '1rem',
          padding: '0.9rem',
          borderRadius: '8px',
          backgroundColor: '#f5f9fc',
          border: '1px solid #d9e3ec',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '0.75rem',
        }}
      >
        <div>
          <div style={{ fontSize: '0.76rem', color: '#5b6a79' }}>Confidence</div>
          <div style={{ fontWeight: 700, color: '#223649' }}>{confidenceModel.confidence}% ({confidenceModel.confidenceBand})</div>
        </div>
        <div>
          <div style={{ fontSize: '0.76rem', color: '#5b6a79' }}>Blast Radius</div>
          <div style={{ fontWeight: 700, color: '#223649' }}>{confidenceModel.blastRadius}</div>
        </div>
        <div>
          <div style={{ fontSize: '0.76rem', color: '#5b6a79' }}>Changed Files</div>
          <div style={{ fontWeight: 700, color: '#223649' }}>{confidenceModel.changedFiles}</div>
        </div>
        <div>
          <div style={{ fontSize: '0.76rem', color: '#5b6a79' }}>SLA Timer</div>
          <div style={{ fontWeight: 700, color: slaState.overdue ? '#c44236' : '#223649' }}>{slaState.label}</div>
        </div>
      </div>

      <div
        style={{
          marginTop: '0.85rem',
          padding: '0.85rem',
          borderRadius: '8px',
          border: '1px solid #dbe5ee',
          backgroundColor: '#fbfdff',
        }}
      >
        <div style={{ fontSize: '0.8rem', color: '#5b6a79', marginBottom: '0.3rem' }}>Decision Brief</div>
        <ul style={{ margin: 0, paddingLeft: '1.1rem', color: '#30465c', fontSize: '0.88rem' }}>
          {decisionBrief.reasons.map((reason, index) => (
            <li key={`${approval.id}-reason-${index}`} style={{ marginBottom: '0.25rem' }}>
              {reason}
            </li>
          ))}
        </ul>
        <div style={{ marginTop: '0.45rem', fontSize: '0.84rem', color: '#223649' }}>
          <strong>Recommended action:</strong> {decisionBrief.recommendation}
        </div>
      </div>

      <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#f9f9f9', borderRadius: '4px', maxHeight: '300px', overflowY: 'auto' }}>
        <strong>Plan:</strong>
        <pre style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word', margin: '0.5rem 0 0 0' }}>
          {approval.summary}
        </pre>
      </div>

      {files.length > 0 && (
        <div style={{ marginTop: '1rem', border: '1px solid #eee', borderRadius: '6px', overflow: 'hidden' }}>
          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            style={{
              width: '100%',
              textAlign: 'left',
              padding: '0.75rem 1rem',
              border: 'none',
              backgroundColor: '#f4f7fb',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            {showPreview ? 'Hide Diff Preview' : 'Show Diff Preview'} ({files.length} file{files.length > 1 ? 's' : ''})
          </button>

          {showPreview && (
            <div style={{ padding: '0.75rem 1rem' }}>
              {files.map((file, index) => (
                <div key={`${file.path}-${index}`} style={{ marginBottom: '0.75rem', backgroundColor: '#fafafa', border: '1px solid #efefef', borderRadius: '4px' }}>
                  <div style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid #efefef', fontWeight: 'bold' }}>
                    {file.path}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', padding: '0.75rem' }}>
                    <div style={{ backgroundColor: '#fff1f1', border: '1px solid #ffd5d5', borderRadius: '4px', padding: '0.5rem' }}>
                      <div style={{ fontSize: '0.8rem', color: '#b24141', marginBottom: '0.25rem' }}>Before</div>
                      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordWrap: 'break-word', fontFamily: 'monospace', fontSize: '0.82rem' }}>N/A</pre>
                    </div>
                    <div style={{ backgroundColor: '#f1fff5', border: '1px solid #c8efd6', borderRadius: '4px', padding: '0.5rem' }}>
                      <div style={{ fontSize: '0.8rem', color: '#2f7a4f', marginBottom: '0.25rem' }}>After</div>
                      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordWrap: 'break-word', fontFamily: 'monospace', fontSize: '0.82rem' }}>{file.changes || 'Planned update'}</pre>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem' }}>
        <button
          onClick={() => onApprove(approval.id)}
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
          Approve
        </button>
        <button
          onClick={() => onReject(approval.id)}
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
          Reject
        </button>
        <button
          onClick={() => onModify(approval.id)}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: '#fd7e14',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '1rem'
          }}
        >
          Modify
        </button>
      </div>
    </div>
  )
}
