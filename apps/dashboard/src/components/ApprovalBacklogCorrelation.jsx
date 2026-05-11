import React, { useMemo } from 'react'

/**
 * ApprovalBacklogCorrelation
 *
 * Given the current pending approvals and enriched task details,
 * groups the backlog by project and shows which projects are the
 * biggest blockers, along with per-project risk breakdown.
 *
 * Props:
 *   approvals    – array of pending approval objects
 *   taskDetails  – map of task_id → task object (must have project_id, project_name or title)
 */
export default function ApprovalBacklogCorrelation({ approvals, taskDetails }) {
  const projectGroups = useMemo(() => {
    const map = {}

    approvals.forEach((approval) => {
      const task = taskDetails[approval.task_id]
      const projectId = task?.project_id || '__unknown__'
      const projectName = task?.project_name || task?.project?.name || `Project ${projectId}`

      if (!map[projectId]) {
        map[projectId] = {
          projectId,
          projectName,
          total: 0,
          high: 0,
          medium: 0,
          low: 0,
          taskIds: new Set(),
          approvalIds: [],
        }
      }

      const risk = String(approval?.risk_level || 'medium').toLowerCase()
      map[projectId].total += 1
      if (risk === 'high') map[projectId].high += 1
      else if (risk === 'low') map[projectId].low += 1
      else map[projectId].medium += 1

      if (approval.task_id) map[projectId].taskIds.add(approval.task_id)
      map[projectId].approvalIds.push(approval.id)
    })

    return Object.values(map)
      .map((g) => ({ ...g, taskCount: g.taskIds.size }))
      .sort((a, b) => {
        // Sort by high-risk count descending, then total descending
        if (b.high !== a.high) return b.high - a.high
        return b.total - a.total
      })
  }, [approvals, taskDetails])

  if (!approvals.length) return null

  const maxTotal = Math.max(...projectGroups.map((g) => g.total), 1)

  return (
    <div
      className="mneme-surface mneme-enter"
      style={{ padding: '0.9rem 1rem', marginBottom: '1.1rem' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
        <h3 style={{ margin: 0, fontSize: '1rem' }}>Backlog Correlation by Project</h3>
        <span
          style={{
            fontSize: '0.72rem',
            fontWeight: 700,
            backgroundColor: '#1f7a8c22',
            color: '#1f7a8c',
            borderRadius: '999px',
            padding: '0.15rem 0.5rem',
          }}
        >
          {projectGroups.length} project{projectGroups.length !== 1 ? 's' : ''} blocked
        </span>
      </div>

      <div style={{ display: 'grid', gap: '0.55rem' }}>
        {projectGroups.map((group) => {
          const barPct = Math.round((group.total / maxTotal) * 100)
          return (
            <div key={group.projectId} style={{ display: 'grid', gap: '0.25rem' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  alignItems: 'baseline',
                  gap: '0.5rem',
                }}
              >
                <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#223649' }}>
                  {group.projectName === `Project ${group.projectId}` && group.projectId === '__unknown__'
                    ? 'Unknown Project'
                    : group.projectName}
                </span>
                <span style={{ fontSize: '0.78rem', color: '#526170', whiteSpace: 'nowrap' }}>
                  {group.total} approval{group.total !== 1 ? 's' : ''} · {group.taskCount} task{group.taskCount !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Progress bar */}
              <div
                style={{
                  height: '6px',
                  borderRadius: '999px',
                  backgroundColor: '#e4ecf3',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${barPct}%`,
                    borderRadius: '999px',
                    backgroundColor: group.high > 0 ? '#c44236' : group.medium > 0 ? '#d9822b' : '#2f9e6f',
                    transition: 'width 0.4s ease',
                  }}
                />
              </div>

              {/* Risk pills */}
              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                {group.high > 0 && (
                  <span
                    style={{
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      backgroundColor: '#c4423622',
                      color: '#c44236',
                      borderRadius: '999px',
                      padding: '0.1rem 0.45rem',
                    }}
                  >
                    {group.high} high
                  </span>
                )}
                {group.medium > 0 && (
                  <span
                    style={{
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      backgroundColor: '#d9822b22',
                      color: '#b86c22',
                      borderRadius: '999px',
                      padding: '0.1rem 0.45rem',
                    }}
                  >
                    {group.medium} medium
                  </span>
                )}
                {group.low > 0 && (
                  <span
                    style={{
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      backgroundColor: '#2f9e6f22',
                      color: '#1e7453',
                      borderRadius: '999px',
                      padding: '0.1rem 0.45rem',
                    }}
                  >
                    {group.low} low
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
