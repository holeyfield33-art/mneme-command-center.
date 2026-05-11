import React, { useState } from 'react'
import { tasks } from '../api'
import { useNavigate } from 'react-router-dom'

/**
 * TaskTemplates - Guided Task Creation without CLI
 * 
 * Provides templates for:
 * - Bug fixes
 * - Feature development
 * - Refactoring
 * - Testing
 * - Documentation
 */
export default function TaskTemplates({ projectId, onClose }) {
  const navigate = useNavigate()
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    acceptance_criteria: '',
    test_plan: '',
    risk_level: 'medium',
    priority: 'normal'
  })
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const templates = [
    {
      id: 'bug-fix',
      name: 'Bug Fix',
      icon: '🐛',
      description: 'Fix a reported issue',
      defaults: {
        title: 'Fix: ',
        description: '## Problem\nDescribe the bug here.\n\n## Expected Behavior\nWhat should happen.\n\n## Actual Behavior\nWhat actually happens.',
        acceptance_criteria: '- Bug is fixed\n- No regressions\n- Tests pass',
        risk_level: 'medium'
      }
    },
    {
      id: 'feature',
      name: 'Feature Development',
      icon: '✨',
      description: 'Build a new feature',
      defaults: {
        title: 'Feature: ',
        description: '## Description\nWhat is this feature?\n\n## User Value\nWhy is this important?\n\n## Implementation Notes\nTechnical considerations.',
        acceptance_criteria: '- Feature is implemented\n- Tests are written\n- Documentation is updated',
        risk_level: 'medium'
      }
    },
    {
      id: 'refactor',
      name: 'Refactoring',
      icon: '♻️',
      description: 'Improve code quality',
      defaults: {
        title: 'Refactor: ',
        description: '## Goal\nWhat are we improving?\n\n## Scope\nWhat files/modules are affected?\n\n## Benefits\nHow does this improve the codebase?',
        acceptance_criteria: '- Code is cleaner\n- Tests pass\n- Performance is same or better',
        risk_level: 'low'
      }
    },
    {
      id: 'test',
      name: 'Testing',
      icon: '✓',
      description: 'Add tests or improve coverage',
      defaults: {
        title: 'Test: ',
        description: '## What to test\nDescribe the scenario.\n\n## Expected coverage\nWhich files/functions?',
        acceptance_criteria: '- Tests are written\n- Coverage increases\n- All tests pass',
        risk_level: 'low'
      }
    },
    {
      id: 'docs',
      name: 'Documentation',
      icon: '📖',
      description: 'Documentation and comments',
      defaults: {
        title: 'Docs: ',
        description: '## What to document\nDescribe the documentation needed.\n\n## Location\nWhere should this live?',
        acceptance_criteria: '- Documentation is written\n- Examples are clear\n- Links are correct',
        risk_level: 'low'
      }
    }
  ]

  const handleSelectTemplate = (template) => {
    setSelectedTemplate(template)
    setFormData({
      ...formData,
      title: template.defaults.title,
      description: template.defaults.description,
      acceptance_criteria: template.defaults.acceptance_criteria,
      risk_level: template.defaults.risk_level
    })
  }

  const handleCreateTask = async () => {
    try {
      if (!formData.title.trim() || !projectId) {
        setError('Please fill in the task title')
        return
      }

      setCreating(true)
      setError('')

      const response = await tasks.create(projectId, {
        title: formData.title,
        description: formData.description,
        acceptance_criteria: formData.acceptance_criteria,
        test_plan: formData.test_plan,
        risk_level: formData.risk_level,
        priority: formData.priority,
        template: selectedTemplate?.id
      })

      onClose?.()
      navigate(`/task/${response.data.id}`)
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to create task')
    } finally {
      setCreating(false)
    }
  }

  if (!selectedTemplate) {
    return (
      <div>
        <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.1rem' }}>
          Choose a Task Template
        </h3>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '1rem'
        }}>
          {templates.map(template => (
            <button
              key={template.id}
              onClick={() => handleSelectTemplate(template)}
              style={{
                padding: '1.5rem 1rem',
                backgroundColor: '#34495e',
                color: 'white',
                border: 'none',
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
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>
                {template.icon}
              </div>
              <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>
                {template.name}
              </div>
              <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>
                {template.description}
              </div>
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <button
        onClick={() => setSelectedTemplate(null)}
        style={{
          marginBottom: '1rem',
          padding: '0.4rem 0.8rem',
          backgroundColor: '#7f8c8d',
          color: 'white',
          border: 'none',
          borderRadius: '0.2rem',
          cursor: 'pointer'
        }}
      >
        ← Back
      </button>

      <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.1rem' }}>
        {selectedTemplate.icon} {selectedTemplate.name}
      </h3>

      {error && (
        <div style={{
          backgroundColor: '#e74c3c',
          color: 'white',
          padding: '0.75rem',
          borderRadius: '0.25rem',
          marginBottom: '1rem',
          fontSize: '0.9rem'
        }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', fontSize: '0.9rem' }}>
            Task Title
          </label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="Enter task title..."
            style={{
              width: '100%',
              padding: '0.5rem',
              borderRadius: '0.25rem',
              border: 'none',
              backgroundColor: '#1a252f',
              color: 'white',
              boxSizing: 'border-box'
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', fontSize: '0.9rem' }}>
            Description
          </label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={6}
            style={{
              width: '100%',
              padding: '0.5rem',
              borderRadius: '0.25rem',
              border: 'none',
              backgroundColor: '#1a252f',
              color: 'white',
              boxSizing: 'border-box',
              fontFamily: 'monospace',
              fontSize: '0.85rem'
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', fontSize: '0.9rem' }}>
            Acceptance Criteria
          </label>
          <textarea
            value={formData.acceptance_criteria}
            onChange={(e) => setFormData({ ...formData, acceptance_criteria: e.target.value })}
            rows={3}
            style={{
              width: '100%',
              padding: '0.5rem',
              borderRadius: '0.25rem',
              border: 'none',
              backgroundColor: '#1a252f',
              color: 'white',
              boxSizing: 'border-box',
              fontFamily: 'monospace',
              fontSize: '0.85rem'
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', fontSize: '0.9rem' }}>
            Test Plan (optional)
          </label>
          <textarea
            value={formData.test_plan}
            onChange={(e) => setFormData({ ...formData, test_plan: e.target.value })}
            rows={3}
            placeholder="How will this be tested?"
            style={{
              width: '100%',
              padding: '0.5rem',
              borderRadius: '0.25rem',
              border: 'none',
              backgroundColor: '#1a252f',
              color: 'white',
              boxSizing: 'border-box',
              fontFamily: 'monospace',
              fontSize: '0.85rem'
            }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', fontSize: '0.9rem' }}>
              Risk Level
            </label>
            <select
              value={formData.risk_level}
              onChange={(e) => setFormData({ ...formData, risk_level: e.target.value })}
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '0.25rem',
                border: 'none',
                backgroundColor: '#1a252f',
                color: 'white'
              }}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', fontSize: '0.9rem' }}>
              Priority
            </label>
            <select
              value={formData.priority}
              onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '0.25rem',
                border: 'none',
                backgroundColor: '#1a252f',
                color: 'white'
              }}
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
        </div>

        <button
          onClick={handleCreateTask}
          disabled={creating}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: creating ? '#95a5a6' : '#27ae60',
            color: 'white',
            border: 'none',
            borderRadius: '0.25rem',
            cursor: creating ? 'not-allowed' : 'pointer',
            fontWeight: 'bold'
          }}
        >
          {creating ? 'Creating...' : 'Create Task'}
        </button>
      </div>
    </div>
  )
}
