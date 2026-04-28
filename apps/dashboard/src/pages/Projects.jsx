import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { projects } from '../api'

export default function Projects() {
  const navigate = useNavigate()
  const [projectList, setProjectList] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    name: '',
    repo_path: '',
    repo_url: '',
    default_branch: 'main'
  })

  useEffect(() => {
    loadProjects()
  }, [])

  const loadProjects = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await projects.list()
      setProjectList(response.data)
    } catch (err) {
      setError('Failed to load projects')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      await projects.create(formData)
      setFormData({ name: '', repo_path: '', repo_url: '', default_branch: 'main' })
      setShowForm(false)
      loadProjects()
    } catch (err) {
      setError('Failed to create project')
    }
  }

  if (loading) {
    return <div style={{ padding: '2rem' }}>Loading...</div>
  }

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1>Projects</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          {showForm ? 'Cancel' : 'Add Project'}
        </button>
      </div>

      {error && <div style={{ color: 'red', marginBottom: '1rem', padding: '1rem', backgroundColor: '#ffe6e6', borderRadius: '4px' }}>{error}</div>}

      {showForm && (
        <div style={{ marginBottom: '2rem', padding: '1rem', backgroundColor: '#f9f9f9', borderRadius: '8px', border: '1px solid #ddd' }}>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.25rem' }}>Project Name *</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                required
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  boxSizing: 'border-box'
                }}
              />
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.25rem' }}>Repo Path *</label>
              <input
                type="text"
                name="repo_path"
                value={formData.repo_path}
                onChange={handleInputChange}
                placeholder="/path/to/repo"
                required
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  boxSizing: 'border-box'
                }}
              />
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.25rem' }}>Repo URL</label>
              <input
                type="text"
                name="repo_url"
                value={formData.repo_url}
                onChange={handleInputChange}
                placeholder="https://github.com/user/repo"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  boxSizing: 'border-box'
                }}
              />
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.25rem' }}>Default Branch</label>
              <input
                type="text"
                name="default_branch"
                value={formData.default_branch}
                onChange={handleInputChange}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  boxSizing: 'border-box'
                }}
              />
            </div>
            <button
              type="submit"
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Create Project
            </button>
          </form>
        </div>
      )}

      <div style={{ display: 'grid', gap: '1rem' }}>
        {projectList.map(project => (
          <div
            key={project.id}
            onClick={() => navigate(`/project/${project.id}`)}
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
            <h3>{project.name}</h3>
            <p style={{ margin: '0.5rem 0', color: '#777', fontSize: '0.9rem' }}>
              <strong>Path:</strong> {project.repo_path}
            </p>
            {project.repo_url && (
              <p style={{ margin: '0.5rem 0', color: '#777', fontSize: '0.9rem' }}>
                <strong>URL:</strong> {project.repo_url}
              </p>
            )}
            <p style={{ margin: '0.5rem 0', color: '#777', fontSize: '0.9rem' }}>
              <strong>Branch:</strong> {project.default_branch}
            </p>
          </div>
        ))}
      </div>

      {projectList.length === 0 && (
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <p>No projects yet. Create one to get started!</p>
        </div>
      )}
    </div>
  )
}
