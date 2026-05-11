import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { projects, tasks } from '../api'
import TaskForm from '../components/TaskForm'
import TaskDependencyGraph from '../components/TaskDependencyGraph'

const PROVIDER_MODELS = {
  anthropic: ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-3-5-haiku-20241022'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o3', 'o4-mini'],
  google: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
  ollama: ['llama3.1', 'llama3.2', 'qwen2.5-coder', 'codestral', 'mistral'],
}

export default function ProjectDetail() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const [project, setProject] = useState(null)
  const [taskList, setTaskList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isCreatingTask, setIsCreatingTask] = useState(false)
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [modelProvider, setModelProvider] = useState('')
  const [modelName, setModelName] = useState('')
  const [savingModel, setSavingModel] = useState(false)
  const [savedModelMessage, setSavedModelMessage] = useState('')
  const [useGlobalModel, setUseGlobalModel] = useState(false)

  const loadProject = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const [projectRes, tasksRes] = await Promise.all([
        projects.get(projectId),
        tasks.list(projectId)
      ])
      setProject(projectRes.data)
      setTaskList(tasksRes.data)
      const isGlobal = !projectRes.data.model_provider && !projectRes.data.model_name
      setUseGlobalModel(isGlobal)
      setModelProvider(projectRes.data.model_provider || 'anthropic')
      setModelName(projectRes.data.model_name || '')
    } catch (err) {
      setError('Failed to load project')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    loadProject()
  }, [loadProject])

  useEffect(() => {
    const onSSE = (event) => {
      const eventProjectId = event?.detail?.data?.project_id
      if (!eventProjectId || eventProjectId === projectId) {
        loadProject()
      }
    }

    window.addEventListener('mneme:sse', onSSE)
    return () => window.removeEventListener('mneme:sse', onSSE)
  }, [loadProject, projectId])

  const handleCreateTask = async (taskPayload) => {
    try {
      setIsCreatingTask(true)
      await tasks.create({
        project_id: projectId,
        ...taskPayload
      })
      setShowTaskForm(false)
      loadProject()
    } catch (err) {
      setError('Failed to create task')
    } finally {
      setIsCreatingTask(false)
    }
  }

  const handleSaveModel = async () => {
    try {
      setSavingModel(true)
      setSavedModelMessage('')
      setError('')
      await projects.setModel(
        projectId,
        useGlobalModel ? null : modelProvider,
        useGlobalModel ? null : modelName
      )
      await loadProject()
      setSavedModelMessage(useGlobalModel ? 'Project now inherits global model settings.' : 'Project model override saved.')
      setTimeout(() => setSavedModelMessage(''), 3000)
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to update project model settings')
    } finally {
      setSavingModel(false)
    }
  }

  if (loading) {
    return <div style={{ padding: '2rem' }}>Loading...</div>
  }

  if (!project) {
    return <div style={{ padding: '2rem' }}>Project not found</div>
  }

  return (
    <div style={{ padding: '2rem' }}>
      <button
        onClick={() => navigate('/projects')}
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
        ← Back to Projects
      </button>

      {error && <div style={{ color: 'red', marginBottom: '1rem', padding: '1rem', backgroundColor: '#ffe6e6', borderRadius: '4px' }}>{error}</div>}
      {savedModelMessage && <div style={{ color: '#1c6b2f', marginBottom: '1rem', padding: '1rem', backgroundColor: '#e8f8ec', borderRadius: '4px', border: '1px solid #b9e5c5' }}>{savedModelMessage}</div>}

      <div style={{ marginBottom: '2rem', padding: '1rem', backgroundColor: '#f9f9f9', borderRadius: '8px', border: '1px solid #ddd' }}>
        <h1>{project.name}</h1>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginTop: '1rem' }}>
          <div><strong>Path:</strong> {project.repo_path}</div>
          {project.repo_url && <div><strong>URL:</strong> {project.repo_url}</div>}
          <div><strong>Branch:</strong> {project.default_branch}</div>
          <div><strong>Status:</strong> {project.status}</div>
          <div><strong>Model Provider:</strong> {project.model_provider || 'global default'}</div>
          <div><strong>Model Name:</strong> {project.model_name || 'provider default'}</div>
          <div style={{ gridColumn: '1 / -1' }}><strong>Agent CLI Command Override:</strong> {project.claude_code_command || 'global default'}</div>
        </div>

        <div style={{ marginTop: '1rem', padding: '0.75rem', backgroundColor: 'white', borderRadius: '6px', border: '1px solid #ddd' }}>
          <h3 style={{ margin: '0 0 0.75rem 0' }}>Model Override</h3>
          <div style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <input
              id="inherit-global-model"
              type="checkbox"
              checked={useGlobalModel}
              onChange={(e) => setUseGlobalModel(e.target.checked)}
            />
            <label htmlFor="inherit-global-model" style={{ fontWeight: 600 }}>
              Inherit global provider and model
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0.75rem', alignItems: 'end' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 'bold' }}>Provider</label>
              <select
                value={modelProvider}
                disabled={useGlobalModel}
                onChange={(e) => {
                  const provider = e.target.value
                  setModelProvider(provider)
                  const defaults = PROVIDER_MODELS[provider] || []
                  if (!defaults.includes(modelName)) {
                    setModelName(defaults[0] || '')
                  }
                }}
                style={{ width: '100%', padding: '0.55rem', border: '1px solid #ccc', borderRadius: '4px' }}
              >
                {Object.keys(PROVIDER_MODELS).map(provider => (
                  <option key={provider} value={provider}>{provider}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 'bold' }}>Model</label>
              <input
                value={modelName}
                disabled={useGlobalModel}
                onChange={(e) => setModelName(e.target.value)}
                list="provider-models"
                placeholder="provider default"
                style={{ width: '100%', padding: '0.55rem', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }}
              />
              <datalist id="provider-models">
                {(PROVIDER_MODELS[modelProvider] || []).map(model => (
                  <option key={model} value={model} />
                ))}
              </datalist>
            </div>
            <button
              onClick={handleSaveModel}
              disabled={savingModel}
              style={{
                padding: '0.6rem 1rem',
                backgroundColor: '#0d6efd',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: savingModel ? 'not-allowed' : 'pointer',
                opacity: savingModel ? 0.7 : 1,
                fontWeight: 'bold'
              }}
            >
              {savingModel ? 'Saving...' : 'Save'}
            </button>
          </div>
          <p style={{ margin: '0.6rem 0 0', fontSize: '0.85rem', color: '#666' }}>
            Use global defaults for simple setup, or set a project-specific provider/model for custom behavior.
          </p>
        </div>
      </div>

      <TaskDependencyGraph tasks={taskList} />

      <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Tasks ({taskList.length})</h2>
        <button
          onClick={() => setShowTaskForm(!showTaskForm)}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          {showTaskForm ? 'Cancel' : 'Create Task'}
        </button>
      </div>

      {showTaskForm && (
        <TaskForm
          onSubmit={handleCreateTask}
          onCancel={() => setShowTaskForm(false)}
          isSubmitting={isCreatingTask}
        />
      )}

      <div style={{ display: 'grid', gap: '1rem' }}>
        {taskList.map(task => (
          <div
            key={task.id}
            onClick={() => navigate(`/task/${task.id}`)}
            style={{
              padding: '1.5rem',
              backgroundColor: 'white',
              borderRadius: '8px',
              border: '1px solid #ddd',
              cursor: 'pointer',
              transition: 'box-shadow 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)'}
            onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div>
                <h3 style={{ margin: '0 0 0.5rem 0' }}>{task.objective}</h3>
                <p style={{ margin: '0', color: '#777', fontSize: '0.9rem' }}>
                  <strong>Mode:</strong> {task.mode} | <strong>Risk:</strong> {task.risk_level}
                </p>
              </div>
              <span
                style={{
                  padding: '0.25rem 0.75rem',
                  backgroundColor:
                    task.status === 'queued' ? '#ffc107' :
                    task.status === 'planning' ? '#17a2b8' :
                    task.status === 'waiting_for_plan_approval' ? '#ff6b6b' :
                    task.status === 'plan_approved' ? '#28a745' :
                    '#6c757d',
                  color: 'white',
                  borderRadius: '4px',
                  fontSize: '0.9rem'
                }}
              >
                {task.status}
              </span>
            </div>
          </div>
        ))}
      </div>

      {taskList.length === 0 && (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#777' }}>
          <p>No tasks yet. Create one to get started!</p>
        </div>
      )}
    </div>
  )
}
