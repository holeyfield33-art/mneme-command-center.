import React, { useState, useEffect } from 'react'
import { projects } from '../api'

/**
 * RepoPickerModal - Enhanced GitHub Repository Discovery
 * 
 * Features:
 * - Search by repo name, owner
 * - Filter by language, stars, updated date
 * - Show repo details (description, language, stars, updated)
 * - Quick connect button
 */
export default function RepoPickerModal({ isOpen, onClose, onSelect }) {
  const [repos, setRepos] = useState([])
  const [filteredRepos, setFilteredRepos] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [languageFilter, setLanguageFilter] = useState('')
  const [starsFilter, setStarsFilter] = useState('all')
  const [connecting, setConnecting] = useState('')

  useEffect(() => {
    if (isOpen) {
      loadRepos()
    }
  }, [isOpen])

  useEffect(() => {
    filterRepos()
  }, [repos, searchQuery, languageFilter, starsFilter])

  const loadRepos = async () => {
    try {
      setLoading(true)
      setError('')
      const res = await projects.listGithubRepos()
      setRepos(res.data || [])
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to load repositories')
    } finally {
      setLoading(false)
    }
  }

  const filterRepos = () => {
    let filtered = repos

    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter(r =>
        r.name?.toLowerCase().includes(q) ||
        r.full_name?.toLowerCase().includes(q) ||
        r.description?.toLowerCase().includes(q)
      )
    }

    // Language filter
    if (languageFilter) {
      filtered = filtered.filter(r => r.language === languageFilter)
    }

    // Stars filter
    if (starsFilter !== 'all') {
      const [min, max] = starsFilter === '100+' ? [100, Infinity] : starsFilter.split('-').map(Number)
      filtered = filtered.filter(r => (r.stargazers_count || 0) >= min && (r.stargazers_count || 0) <= max)
    }

    setFilteredRepos(filtered)
  }

  const handleConnect = async (repo) => {
    try {
      setConnecting(repo.full_name)
      const res = await projects.connectGithub({
        repo_url: repo.clone_url || repo.html_url,
        name: repo.full_name,
        default_branch: repo.default_branch || 'main'
      })
      onSelect?.(res.data)
      onClose?.()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to connect repository')
    } finally {
      setConnecting('')
    }
  }

  if (!isOpen) return null

  const languages = [...new Set(repos.map(r => r.language).filter(Boolean))]
  const starOptions = ['all', '0-10', '10-50', '50-100', '100+']

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000
    }} onClick={onClose}>
      <div
        style={{
          backgroundColor: '#2c3e50',
          color: 'white',
          borderRadius: '0.5rem',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          maxWidth: '900px',
          maxHeight: '80vh',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          width: '90vw'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '1.5rem',
          borderBottom: '1px solid #34495e',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h2 style={{ margin: 0, fontSize: '1.5rem' }}>🔍 Browse Repositories</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'white',
              fontSize: '1.5rem',
              cursor: 'pointer',
              padding: 0
            }}
          >
            ✕
          </button>
        </div>

        {/* Filters */}
        <div style={{
          padding: '1rem',
          borderBottom: '1px solid #34495e',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr 1fr',
          gap: '1rem'
        }}>
          <input
            type="text"
            placeholder="Search repositories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              padding: '0.5rem',
              borderRadius: '0.25rem',
              border: 'none',
              backgroundColor: '#1a252f',
              color: 'white',
              fontSize: '0.9rem',
              gridColumn: '1 / 3'
            }}
          />

          <select
            value={languageFilter}
            onChange={(e) => setLanguageFilter(e.target.value)}
            style={{
              padding: '0.5rem',
              borderRadius: '0.25rem',
              border: 'none',
              backgroundColor: '#1a252f',
              color: 'white'
            }}
          >
            <option value="">All Languages</option>
            {languages.map(lang => (
              <option key={lang} value={lang}>{lang}</option>
            ))}
          </select>

          <select
            value={starsFilter}
            onChange={(e) => setStarsFilter(e.target.value)}
            style={{
              padding: '0.5rem',
              borderRadius: '0.25rem',
              border: 'none',
              backgroundColor: '#1a252f',
              color: 'white'
            }}
          >
            {starOptions.map(opt => (
              <option key={opt} value={opt}>
                {opt === 'all' ? 'All Stars' : `${opt} ⭐`}
              </option>
            ))}
          </select>
        </div>

        {/* Error message */}
        {error && (
          <div style={{
            padding: '1rem',
            backgroundColor: '#e74c3c',
            color: 'white',
            borderBottom: '1px solid #c0392b'
          }}>
            {error}
          </div>
        )}

        {/* Repositories list */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1rem'
        }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: '2rem', opacity: 0.7 }}>
              Loading repositories...
            </div>
          )}

          {!loading && filteredRepos.length === 0 && (
            <div style={{ textAlign: 'center', padding: '2rem', opacity: 0.7 }}>
              No repositories found
            </div>
          )}

          {filteredRepos.map((repo) => (
            <div
              key={repo.id}
              style={{
                backgroundColor: '#34495e',
                padding: '1rem',
                marginBottom: '0.75rem',
                borderRadius: '0.25rem',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: '1rem'
              }}
            >
              <div style={{ flex: 1 }}>
                <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '1rem' }}>
                  {repo.full_name}
                </h4>
                {repo.description && (
                  <p style={{
                    margin: '0.25rem 0 0.5rem 0',
                    fontSize: '0.9rem',
                    opacity: 0.8,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {repo.description}
                  </p>
                )}
                <div style={{
                  display: 'flex',
                  gap: '1rem',
                  fontSize: '0.8rem',
                  opacity: 0.7,
                  flexWrap: 'wrap'
                }}>
                  {repo.language && <span>📝 {repo.language}</span>}
                  {repo.stargazers_count && <span>⭐ {repo.stargazers_count}</span>}
                  {repo.updated_at && (
                    <span>📅 Updated {new Date(repo.updated_at).toLocaleDateString()}</span>
                  )}
                </div>
              </div>

              <button
                onClick={() => handleConnect(repo)}
                disabled={connecting === repo.full_name}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: connecting === repo.full_name ? '#95a5a6' : '#3498db',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.25rem',
                  cursor: connecting === repo.full_name ? 'not-allowed' : 'pointer',
                  fontSize: '0.9rem',
                  whiteSpace: 'nowrap',
                  fontWeight: 'bold'
                }}
              >
                {connecting === repo.full_name ? 'Connecting...' : 'Connect'}
              </button>
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
