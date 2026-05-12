import React from 'react'
import { api } from '../../api'

/**
 * Custom hook to manage Mneme state from the API
 */
export function useMnemeState() {
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
          workers: workersRes.data?.workers || [],
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
    const interval = setInterval(fetchData, 3000)
    return () => clearInterval(interval)
  }, [])

  const actions = {
    selectTask: (taskId) => setState(s => ({ ...s, selectedTaskId: taskId })),
    createTask: async (payload) => {
      try {
        await api.post('/tasks', payload)
        setState(s => ({ ...s, tasks: [...s.tasks, { id: Math.random(), ...payload }] }))
      } catch (err) {
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

  return [state, actions, { loading, error }]
}
