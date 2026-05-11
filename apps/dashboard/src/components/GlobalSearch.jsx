import React, { useState, useEffect } from 'react'
import { projects, tasks, approvals } from '../api'
import { useNavigate } from 'react-router-dom'

/**
 * GlobalSearch - Cross-Project Discovery
 * 
 * Searchable interface for finding:
 * - Projects by name/description
 * - Tasks across projects by title/status
 * - Approvals by action
 * - Runs/artifacts
 */
export default function GlobalSearch({ isOpen, onClose }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchScope, setSearchScope] = useState('all') // all, projects, tasks, approvals

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }

    const search = async () => {
      try {
        setLoading(true)
        const q = query.toLowerCase()
        const allResults = []

        if (searchScope === 'all' || searchScope === 'projects') {
          const projectsRes = await projects.list()
          const projectMatches = projectsRes.data?.filter(p =>
            p.name?.toLowerCase().includes(q) ||
            p.repo_url?.toLowerCase().includes(q)
          ) || []
          allResults.push(...projectMatches.map(p => ({
            type: 'project',
            id: p.id,
            title: p.name,
            subtitle: p.repo_url,
            icon: '📁'
          })))
        }

        if (searchScope === 'all' || searchScope === 'tasks') {
          const tasksRes = await tasks.list()
          const taskMatches = tasksRes.data?.filter(t =>
            t.title?.toLowerCase().includes(q) ||
            t.description?.toLowerCase().includes(q)
          ) || []
          allResults.push(...taskMatches.map(t => ({
            type: 'task',
            id: t.id,
            title: t.title,
            subtitle: `Status: ${t.status} • Project: ${t.project_id}`,
            icon: '✓'
          })))
        }

        if (searchScope === 'all' || searchScope === 'approvals') {
          const approvalsRes = await approvals.list('all')
          const approvalMatches = approvalsRes.data?.filter(a =>
            a.action?.toLowerCase().includes(q) ||
            a.description?.toLowerCase().includes(q)
          ) || []
          allResults.push(...approvalMatches.map(a => ({
            type: 'approval',
            id: a.id,
            title: a.action,
            subtitle: `Status: ${a.status} • Risk: ${a.risk_level}`,
            icon: '⚠️'
          })))
        }

        setResults(allResults.slice(0, 50))
      } catch (err) {
        console.error('Search failed:', err)
      } finally {
        setLoading(false)
      }
    }

    const timer = setTimeout(search, 300)
    return () => clearTimeout(timer)
  }, [query, searchScope])

  const handleResultClick = (result) => {
    switch (result.type) {
      case 'project':
        navigate(`/project/${result.id}`)
        break
      case 'task':
        navigate(`/task/${result.id}`)
        break
      case 'approval':
        navigate('/approvals')
        break
      default:
        break
    }
    onClose?.()
  }

  if (!isOpen) return null

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      zIndex: 50,
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'center',
      paddingTop: '5rem'
    }} onClick={onClose}>
      <div
        style={{
          backgroundColor: '#2c3e50',
          color: 'white',
          borderRadius: '0.5rem',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          width: '90%',
          maxWidth: '600px',
          maxHeight: '70vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search bar */}
        <div style={{
          padding: '1.5rem',
          borderBottom: '1px solid #34495e'
        }}>
          <input
            type="text"
            placeholder="Search projects, tasks, approvals..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            style={{
              width: '100%',
              padding: '0.75rem 1rem',
              borderRadius: '0.25rem',
              border: 'none',
              backgroundColor: '#1a252f',
              color: 'white',
              fontSize: '1rem',
              boxSizing: 'border-box',
              marginBottom: '0.75rem'
            }}
          />

          {/* Scope filters */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {['all', 'projects', 'tasks', 'approvals'].map(scope => (
              <button
                key={scope}
                onClick={() => setSearchScope(scope)}
                style={{
                  padding: '0.35rem 0.75rem',
                  backgroundColor: searchScope === scope ? '#3498db' : '#34495e',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.25rem',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: searchScope === scope ? 'bold' : 'normal'
                }}
              >
                {scope.charAt(0).toUpperCase() + scope.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Results */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1rem'
        }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: '2rem', opacity: 0.7 }}>
              Searching...
            </div>
          )}

          {!loading && results.length === 0 && query && (
            <div style={{ textAlign: 'center', padding: '2rem', opacity: 0.7 }}>
              No results found for "{query}"
            </div>
          )}

          {!loading && results.length === 0 && !query && (
            <div style={{ textAlign: 'center', padding: '2rem', opacity: 0.7 }}>
              Start typing to search...
            </div>
          )}

          {results.map((result, idx) => (
            <div
              key={idx}
              onClick={() => handleResultClick(result)}
              style={{
                padding: '0.75rem',
                marginBottom: '0.5rem',
                backgroundColor: '#34495e',
                borderRadius: '0.25rem',
                cursor: 'pointer',
                transition: 'all 0.2s',
                ':hover': { backgroundColor: '#457183' }
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#457183'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#34495e'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '1.25rem' }}>{result.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontWeight: 'bold',
                    fontSize: '0.95rem',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {result.title}
                  </div>
                  <div style={{
                    fontSize: '0.8rem',
                    opacity: 0.7,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {result.subtitle}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          padding: '1rem',
          borderTop: '1px solid #34495e',
          display: 'flex',
          justifyContent: 'flex-end'
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#7f8c8d',
              color: 'white',
              border: 'none',
              borderRadius: '0.25rem',
              cursor: 'pointer'
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
