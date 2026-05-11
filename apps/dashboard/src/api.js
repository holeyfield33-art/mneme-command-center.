import axios from 'axios'

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const apiClient = axios.create({
  baseURL: API_URL
})

// Add token to requests
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Better error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      console.error('API Error:', {
        status: error.response.status,
        data: error.response.data,
        url: error.response.config.url
      })
    }
    return Promise.reject(error)
  }
)

export const auth = {
  login: (password) => apiClient.post('/auth/login', { password })
}

export const skills = {
  list: (params = {}) => apiClient.get('/api/v1/skills', { params }),
  create: (data) => apiClient.post('/api/v1/skills', data),
  update: (id, data) => apiClient.put(`/api/v1/skills/${id}`, data),
  toggle: (id) => apiClient.post(`/api/v1/skills/${id}/toggle`),
  remove: (id) => apiClient.delete(`/api/v1/skills/${id}`),
}

export const projects = {
  list: () => apiClient.get('/projects'),
  get: (id) => apiClient.get(`/projects/${id}`),
  create: (data) => apiClient.post('/projects', data),
  update: (id, data) => apiClient.put(`/projects/${id}`, data),
  delete: (id) => apiClient.delete(`/projects/${id}`),
  connectGithub: (data) => apiClient.post('/projects/connect-github', data),
  listGithubRepos: () => apiClient.get('/projects/github-repos'),
  setModel: (id, provider, model) => apiClient.put(`/projects/${id}`, { model_provider: provider, model_name: model })
}

export const tasks = {
  list: (projectId, status) => {
    let url = '/tasks'
    const params = new URLSearchParams()
    if (projectId) params.append('project_id', projectId)
    if (status) params.append('status', status)
    if (params.toString()) url += `?${params.toString()}`
    return apiClient.get(url)
  },
  get: (id) => apiClient.get(`/tasks/${id}`),
  create: (data) => apiClient.post('/tasks', data),
  getLogs: (id) => apiClient.get(`/tasks/${id}/logs`),
  rerunClaude: (id) => apiClient.post(`/tasks/${id}/rerun-claude`),
  getArtifact: (id, artifactType) => apiClient.get(`/tasks/${id}/artifacts/${artifactType}`),
  getGithubPrStatus: (id) => apiClient.get(`/tasks/${id}/github-pr-status`),
  addLog: (id, level, message) => apiClient.post(`/tasks/${id}/logs`, { level, message }),
  updateStatus: (id, status) => apiClient.put(`/tasks/${id}/status`, null, { params: { new_status: status } }),
  enableOrchestration: (id) => apiClient.post(`/tasks/${id}/orchestration/enable`),
  startOrchestrationPhase: (id, phaseType, context = {}) =>
    apiClient.post(`/tasks/${id}/orchestration/start-phase`, context, { params: { phase_type: phaseType } }),
  orchestrationInitialize: (id) => apiClient.post(`/api/v1/tasks/${id}/orchestration/initialize`),
  orchestrationPhases: (id) => apiClient.get(`/api/v1/tasks/${id}/orchestration/phases`),
  orchestrationStatus: (id) => apiClient.get(`/api/v1/tasks/${id}/orchestration/status`),
  orchestrationLog: (id, limit = 50, offset = 0) =>
    apiClient.get(`/api/v1/tasks/${id}/orchestration/log`, { params: { limit, offset } }),
  orchestrationCheckpoints: (id) => apiClient.get(`/api/v1/tasks/${id}/orchestration/checkpoints`),
  orchestrationRollback: (id, fromPhase) =>
    apiClient.post(`/api/v1/tasks/${id}/orchestration/rollback`, null, {
      params: fromPhase ? { from_phase: fromPhase } : undefined,
    }),
  orchestrationResume: (id, checkpointId) =>
    apiClient.post(`/api/v1/tasks/${id}/orchestration/resume`, { checkpoint_id: checkpointId }),
  orchestrationCompletePhase: (id, phaseType, output = {}) =>
    apiClient.post(`/api/v1/tasks/${id}/orchestration/phases/${phaseType}/complete`, output),
  orchestrationFailPhase: (id, phaseType, error) =>
    apiClient.post(`/api/v1/tasks/${id}/orchestration/phases/${phaseType}/fail`, null, { params: { error } }),
  getCost: (id) => apiClient.get(`/tasks/${id}/cost`),
}

export const approvals = {
  list: (status, taskId) => {
    let url = '/approvals'
    const params = new URLSearchParams()
    if (status) params.append('status', status)
    if (taskId) params.append('task_id', taskId)
    if (params.toString()) url += `?${params.toString()}`
    return apiClient.get(url)
  },
  approve: (id) => apiClient.post(`/approvals/${id}/approve`),
  reject: (id) => apiClient.post(`/approvals/${id}/reject`),
  modify: (id, reasonCode, details) => apiClient.post(`/approvals/${id}/modify`, {
    reason_code: reasonCode,
    details,
  })
}

export const worker = {
  getStatus: () => apiClient.get('/worker/status'),
  launch: () => apiClient.post('/worker/launch'),
  stop: () => apiClient.post('/worker/stop'),
  getProcessStatus: () => apiClient.get('/worker/process-status')
}

export const system = {
  emergencyStop: () => apiClient.post('/system/emergency-stop'),
  clearEmergencyStop: () => apiClient.post('/system/emergency-stop/clear'),
  getEmergencyStopStatus: () => apiClient.get('/system/emergency-stop/status'),
  getRuntimeStatus: () => apiClient.get('/system/runtime-status'),
  getVaultStatus: () => apiClient.get('/api/v1/vault/status'),
  getAuditEvents: (limit = 100) => apiClient.get('/api/v1/audit/events', { params: { limit } }),
  updateSettings: (data) => apiClient.put('/system/settings', data),
}
