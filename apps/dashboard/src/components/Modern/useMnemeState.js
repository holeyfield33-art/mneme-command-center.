import React from 'react'
import { api } from '../../api'
import useSSE from '../../useSSE'

/**
 * Custom hook to manage Mneme state from the API with real-time SSE updates
 */
export function useMnemeState() {
  const { isConnected, lastEvent } = useSSE()
  const [state, setState] = React.useState({
    projects: [],
    tasks: [],
    approvals: [],
    workers: [],
    logs: [],
    selectedTaskId: null,
    emergencyStop: false,
  })
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(null)

  // Initial data fetch
  React.useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        const [projectsRes, tasksRes, approvalsRes, workersRes, statusRes] = await Promise.all([
          api.get('/projects'),
          api.get('/tasks'),
          api.get('/approvals'),
          api.get('/worker/status'),
          api.get('/system/runtime-status'),
        ])

        setState(prev => ({
          ...prev,
          projects: projectsRes.data || [],
          tasks: tasksRes.data || [],
          approvals: approvalsRes.data || [],
          workers: Array.isArray(workersRes.data)
            ? workersRes.data
            : (workersRes.data?.workers || []),
          emergencyStop: statusRes.data?.emergency_stop || false,
        }))
      } catch (err) {
        setError(err.message)
        console.error('Failed to fetch state:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
    // Fallback poll every 10s even with SSE for consistency
    const interval = setInterval(fetchData, 10000)
    return () => clearInterval(interval)
  }, [])

  // Listen to SSE events for real-time updates
  React.useEffect(() => {
    if (!lastEvent) return

    const { type, data } = lastEvent
    setState(prev => {
      switch (type) {
        case 'task_created':
          return { ...prev, tasks: [...prev.tasks, data] }
        
        case 'task_updated':
        case 'task_status_changed':
          return {
            ...prev,
            tasks: prev.tasks.map(t =>
              t.id === (data.id || data.task_id)
                ? { ...t, ...data, id: t.id }
                : t
            ),
          }
        
        case 'task_log_added':
          return {
            ...prev,
            logs: [...prev.logs, data],
          }
        
        case 'approval_created':
          return { ...prev, approvals: [...prev.approvals, { ...data, id: data.id || data.approval_id }] }
        
        case 'approval_updated':
          return {
            ...prev,
            approvals: prev.approvals.map(a =>
              a.id === (data.id || data.approval_id)
                ? { ...a, ...data, id: a.id }
                : a
            ),
          }
        
        case 'phase_started':
        case 'phase_completed':
        case 'phase_failed':
          // Update corresponding task status based on phase events
          return {
            ...prev,
            tasks: prev.tasks.map(t =>
              t.id === data.task_id ? { ...t, status: data.phase_status } : t
            ),
          }

        case 'worker_status_changed': {
          const idx = prev.workers.findIndex(w => w.worker_id === data.worker_id)
          if (idx === -1) {
            return { ...prev, workers: [...prev.workers, data] }
          }
          const workers = [...prev.workers]
          workers[idx] = { ...workers[idx], ...data }
          return { ...prev, workers }
        }
        
        default:
          return prev
      }
    })
  }, [lastEvent])

  const actions = {
    selectTask: (taskId) => setState(s => ({ ...s, selectedTaskId: taskId })),
    createTask: async (payload) => {
      try {
        const selectedProject = state.projects.find(p => p.name === payload.project || p.id === payload.project_id)
        const requestBody = {
          project_id: payload.project_id || selectedProject?.id,
          objective: payload.objective,
          mode: payload.mode || 'interactive',
          risk_level: payload.risk_level || 'medium',
        }
        if (!requestBody.project_id) {
          throw new Error('Select a valid project before dispatching a task.')
        }
        const res = await api.post('/tasks', requestBody)
        setState(s => ({ ...s, tasks: [...s.tasks, res.data || { id: Math.random(), ...payload }] }))
      } catch (err) {
        setError(err?.response?.data?.detail || err.message || 'Failed to create task')
        console.error('Failed to create task:', err)
      }
    },
    approve: async (approvalId) => {
      try {
        await api.post(`/approvals/${approvalId}/approve`)
        setState(s => ({ ...s, approvals: s.approvals.filter(a => a.id !== approvalId) }))
      } catch (err) {
        console.error('Failed to approve:', err)
      }
    },
    reject: async (approvalId, reason) => {
      try {
        await api.post(`/approvals/${approvalId}/reject`, { reason })
        setState(s => ({ ...s, approvals: s.approvals.filter(a => a.id !== approvalId) }))
      } catch (err) {
        console.error('Failed to reject:', err)
      }
    },
    toggleEmergencyStop: async () => {
      try {
        const endpoint = state.emergencyStop ? '/system/emergency-stop/clear' : '/system/emergency-stop'
        await api.post(endpoint)
        setState(s => ({ ...s, emergencyStop: !s.emergencyStop }))
      } catch (err) {
        console.error('Failed to toggle emergency stop:', err)
      }
    },
  }

  return [state, actions, { loading, error, sseConnected: isConnected }]
}

