import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { projects, tasks } from '../api'
import TaskForm from '../components/TaskForm'

export default function ProjectDetail() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const [project, setProject] = useState(null)
  const [taskList, setTaskList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isCreatingTask, setIsCreatingTask] = useState(false)
  const [showTaskForm, setShowTaskForm] = useState(false)

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

      <div style={{ marginBottom: '2rem', padding: '1rem', backgroundColor: '#f9f9f9', borderRadius: '8px', border: '1px solid #ddd' }}>
        <h1>{project.name}</h1>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginTop: '1rem' }}>
          <div><strong>Path:</strong> {project.repo_path}</div>
          {project.repo_url && <div><strong>URL:</strong> {project.repo_url}</div>}
          <div><strong>Branch:</strong> {project.default_branch}</div>
          <div><strong>Status:</strong> {project.status}</div>
        </div>
      </div>

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
