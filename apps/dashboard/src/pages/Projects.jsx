import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { projects } from '../api'

export default function Projects() {
  const navigate = useNavigate()
  const [projectList, setProjectList] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [showGithubPicker, setShowGithubPicker] = useState(false)
  const [githubRepos, setGithubRepos] = useState([])
  const [githubLoading, setGithubLoading] = useState(false)
  const [githubQuery, setGithubQuery] = useState('')
  const [connectingRepo, setConnectingRepo] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    name: '',
    repo_path: '',
    repo_url: '',
    claude_code_command: '',
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
      setFormData({ name: '', repo_path: '', repo_url: '', claude_code_command: '', default_branch: 'main' })
      setShowForm(false)
      loadProjects()
    } catch (err) {
      setError('Failed to create project')
    }
  }

  const handleOpenGithubPicker = async () => {
    try {
      setGithubLoading(true)
      setError('')
      const response = await projects.listGithubRepos()
      setGithubRepos(response.data || [])
      setShowGithubPicker(true)
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to load GitHub repos. Configure GITHUB_TOKEN in Settings.')
    } finally {
      setGithubLoading(false)
    }
  }

  const handleConnectGithubRepo = async (repo) => {
    try {
      setConnectingRepo(repo.full_name)
      setError('')
      await projects.connectGithub({
        repo_url: repo.clone_url || repo.html_url,
        name: repo.full_name,
        default_branch: repo.default_branch || 'main',
      })
      setShowGithubPicker(false)
      setGithubRepos([])
      setGithubQuery('')
      await loadProjects()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to connect GitHub repo')
    } finally {
      setConnectingRepo('')
    }
  }

  const filteredRepos = githubRepos.filter(repo => {
    const q = githubQuery.trim().toLowerCase()
    if (!q) return true
    return (repo.full_name || '').toLowerCase().includes(q)
  })

  if (loading) {
    return <div style={{ padding: '2rem' }}>Loading...</div>
  }

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1>Projects</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={handleOpenGithubPicker}
            disabled={githubLoading}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#24292f',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: githubLoading ? 'not-allowed' : 'pointer',
              opacity: githubLoading ? 0.75 : 1,
            }}
          >
            {githubLoading ? 'Loading Repos...' : 'Connect GitHub Repo'}
          </button>
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
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.25rem' }}>Claude Command Override (optional)</label>
              <input
                type="text"
                name="claude_code_command"
                value={formData.claude_code_command}
                onChange={handleInputChange}
                placeholder='claude --print --allowedTools "Edit,Write,Bash" {prompt_file}'
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

      {showGithubPicker && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.45)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 999,
          }}
          onClick={() => setShowGithubPicker(false)}
        >
          <div
            style={{
              width: 'min(880px, 92vw)',
              maxHeight: '80vh',
              overflow: 'auto',
              backgroundColor: 'white',
              borderRadius: '8px',
              border: '1px solid #ddd',
              padding: '1rem',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h2 style={{ margin: 0 }}>Select GitHub Repository</h2>
              <button
                onClick={() => setShowGithubPicker(false)}
                style={{ background: 'transparent', border: 'none', fontSize: '1.25rem', cursor: 'pointer' }}
              >
                ×
              </button>
            </div>

            <input
              value={githubQuery}
              onChange={(e) => setGithubQuery(e.target.value)}
              placeholder="Search repos..."
              style={{
                width: '100%',
                padding: '0.7rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                boxSizing: 'border-box',
                marginBottom: '0.75rem',
              }}
            />

            <div style={{ display: 'grid', gap: '0.5rem' }}>
              {filteredRepos.map(repo => (
                <div
                  key={repo.full_name}
                  style={{
                    border: '1px solid #e5e5e5',
                    borderRadius: '6px',
                    padding: '0.75rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '1rem',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 'bold' }}>{repo.full_name}</div>
                    {repo.description && <div style={{ fontSize: '0.9rem', color: '#666' }}>{repo.description}</div>}
                    <div style={{ fontSize: '0.85rem', color: '#888' }}>Default branch: {repo.default_branch || 'main'}</div>
                  </div>
                  <button
                    onClick={() => handleConnectGithubRepo(repo)}
                    disabled={connectingRepo === repo.full_name}
                    style={{
                      padding: '0.55rem 0.9rem',
                      backgroundColor: '#007bff',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: connectingRepo === repo.full_name ? 'not-allowed' : 'pointer',
                      opacity: connectingRepo === repo.full_name ? 0.75 : 1,
                    }}
                  >
                    {connectingRepo === repo.full_name ? 'Connecting...' : 'Connect'}
                  </button>
                </div>
              ))}
              {filteredRepos.length === 0 && (
                <div style={{ padding: '1rem', textAlign: 'center', color: '#777' }}>
                  No matching repos found.
                </div>
              )}
            </div>
          </div>
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
            <p style={{ margin: '0.5rem 0', color: '#777', fontSize: '0.9rem' }}>
              <strong>Claude Command:</strong> {project.claude_code_command || 'global default'}
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
