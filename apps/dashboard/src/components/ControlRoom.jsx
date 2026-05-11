import React, { useState, useEffect } from 'react'
import { system, skills as skillsApi } from '../api'
import { useLayers } from '../context/LayerContext'

/**
 * ControlRoom - Layer 3 Advanced Control Panel
 * 
 * Modal providing access to:
 * - Settings and configuration
 * - Vault management (Phase 0)
 * - Audit log viewer (Phase 0)
 * - Advanced controls and policies
 * - Cost guardrails
 * - Model management
 */
export default function ControlRoom() {
  const { layers, hideModal } = useLayers()
  const [tab, setTab] = useState('settings')
  const [vaultStatus, setVaultStatus] = useState(null)
  const [auditLogs, setAuditLogs] = useState([])
  const [form, setForm] = useState({
    VAULT_AUTO_LOCK_SECONDS: '1800',
    REAUTH_WINDOW_SECONDS: '300',
    REQUIRE_REAUTH_FOR_REMOTE_PUSH: 'true',
    DAILY_COST_LIMIT_USD: '10',
    TASK_COST_LIMIT_USD: '1',
    ENFORCE_COST_LIMITS: 'true',
    MODEL_PROVIDER: 'anthropic',
    ANTHROPIC_MODEL: 'claude-opus-4-5',
    OPENAI_MODEL: 'gpt-4o',
    GOOGLE_MODEL: 'gemini-2.5-pro',
    OLLAMA_MODEL: 'llama3.1',
  })
  const [runtime, setRuntime] = useState(null)
  const [skills, setSkills] = useState([])
  const [newSkill, setNewSkill] = useState({
    slug: '',
    name: '',
    description: '',
    category: 'implementation',
    max_risk_level: 'medium',
    required_approval: true,
  })
  const [editingSkillId, setEditingSkillId] = useState(null)
  const [editingSkillForm, setEditingSkillForm] = useState({
    name: '',
    description: '',
    category: 'implementation',
    max_risk_level: 'medium',
    required_approval: true,
  })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [skillsSaving, setSkillsSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const layer = layers?.layer3

  if (!layer?.visible) return null

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        setError('')

        const [runtimeRes, vaultRes, auditRes] = await Promise.allSettled([
          system.getRuntimeStatus(),
          system.getVaultStatus(),
          system.getAuditEvents(100),
        ])
        const skillsRes = await skillsApi.list()

        if (runtimeRes.status === 'fulfilled') {
          const data = runtimeRes.value.data
          setRuntime(data)
          setForm((prev) => ({
            ...prev,
            VAULT_AUTO_LOCK_SECONDS: String(data.vault_auto_lock_seconds ?? prev.VAULT_AUTO_LOCK_SECONDS),
            REAUTH_WINDOW_SECONDS: String(data.reauth_window_seconds ?? prev.REAUTH_WINDOW_SECONDS),
            REQUIRE_REAUTH_FOR_REMOTE_PUSH: String(data.require_reauth_for_remote_push ?? true),
            DAILY_COST_LIMIT_USD: String(data.cost_guardrails?.daily_cost_limit_usd ?? prev.DAILY_COST_LIMIT_USD),
            TASK_COST_LIMIT_USD: String(data.cost_guardrails?.task_cost_limit_usd ?? prev.TASK_COST_LIMIT_USD),
            ENFORCE_COST_LIMITS: String(data.cost_guardrails?.enforce_cost_limits ?? true),
            MODEL_PROVIDER: data.model_provider || prev.MODEL_PROVIDER,
            ANTHROPIC_MODEL: data.available_providers?.anthropic?.model || prev.ANTHROPIC_MODEL,
            OPENAI_MODEL: data.available_providers?.openai?.model || prev.OPENAI_MODEL,
            GOOGLE_MODEL: data.available_providers?.google?.model || prev.GOOGLE_MODEL,
            OLLAMA_MODEL: data.available_providers?.ollama?.model || prev.OLLAMA_MODEL,
          }))
        }

        if (vaultRes.status === 'fulfilled') {
          setVaultStatus(vaultRes.value.data)
        } else {
          setVaultStatus(null)
        }

        if (auditRes.status === 'fulfilled') {
          setAuditLogs(auditRes.value.data || [])
        } else {
          setAuditLogs([])
        }

        setSkills(skillsRes?.data || [])
      } finally {
        setLoading(false)
      }
    }

    if (layer?.visible) {
      loadData()
    }
  }, [])

  const getActiveModel = () => {
    if (form.MODEL_PROVIDER === 'anthropic') return form.ANTHROPIC_MODEL
    if (form.MODEL_PROVIDER === 'openai') return form.OPENAI_MODEL
    if (form.MODEL_PROVIDER === 'google') return form.GOOGLE_MODEL
    if (form.MODEL_PROVIDER === 'ollama') return form.OLLAMA_MODEL
    return ''
  }

  const saveControlRoomSettings = async () => {
    try {
      setSaving(true)
      setSaved(false)
      setError('')

      await system.updateSettings({
        VAULT_AUTO_LOCK_SECONDS: form.VAULT_AUTO_LOCK_SECONDS,
        REAUTH_WINDOW_SECONDS: form.REAUTH_WINDOW_SECONDS,
        REQUIRE_REAUTH_FOR_REMOTE_PUSH: form.REQUIRE_REAUTH_FOR_REMOTE_PUSH,
        DAILY_COST_LIMIT_USD: form.DAILY_COST_LIMIT_USD,
        TASK_COST_LIMIT_USD: form.TASK_COST_LIMIT_USD,
        ENFORCE_COST_LIMITS: form.ENFORCE_COST_LIMITS,
        MODEL_PROVIDER: form.MODEL_PROVIDER,
        ANTHROPIC_MODEL: form.ANTHROPIC_MODEL,
        OPENAI_MODEL: form.OPENAI_MODEL,
        GOOGLE_MODEL: form.GOOGLE_MODEL,
        OLLAMA_MODEL: form.OLLAMA_MODEL,
      })

      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to save control room settings')
    } finally {
      setSaving(false)
    }
  }

  const getTabs = () => [
    { id: 'settings', label: '⚙️ Settings', icon: '⚙️' },
    { id: 'vault', label: '🔐 Vault', icon: '🔐' },
    { id: 'audit', label: '📋 Audit Log', icon: '📋' },
    { id: 'skills', label: '🧩 Skills', icon: '🧩' },
    { id: 'guardrails', label: '💰 Guardrails', icon: '💰' },
    { id: 'models', label: '🧠 Models', icon: '🧠' }
  ]

  const reloadSkills = async () => {
    const res = await skillsApi.list()
    setSkills(res?.data || [])
  }

  const handleCreateSkill = async () => {
    try {
      setSkillsSaving(true)
      setError('')
      await skillsApi.create({
        slug: newSkill.slug,
        name: newSkill.name,
        description: newSkill.description,
        category: newSkill.category,
        max_risk_level: newSkill.max_risk_level,
        required_approval: newSkill.required_approval,
        enabled: true,
        tool_allowlist: [],
        skill_config: {},
      })
      setNewSkill({
        slug: '',
        name: '',
        description: '',
        category: 'implementation',
        max_risk_level: 'medium',
        required_approval: true,
      })
      await reloadSkills()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to create skill')
    } finally {
      setSkillsSaving(false)
    }
  }

  const handleToggleSkill = async (skillId) => {
    try {
      setSkillsSaving(true)
      setError('')
      await skillsApi.toggle(skillId)
      await reloadSkills()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to toggle skill')
    } finally {
      setSkillsSaving(false)
    }
  }

  const handleDeleteSkill = async (skillId) => {
    try {
      setSkillsSaving(true)
      setError('')
      await skillsApi.remove(skillId)
      await reloadSkills()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to delete skill')
    } finally {
      setSkillsSaving(false)
    }
  }

  const startEditSkill = (skill) => {
    setEditingSkillId(skill.id)
    setEditingSkillForm({
      name: skill.name || '',
      description: skill.description || '',
      category: skill.category || 'implementation',
      max_risk_level: skill.max_risk_level || 'medium',
      required_approval: !!skill.required_approval,
    })
  }

  const cancelEditSkill = () => {
    setEditingSkillId(null)
    setEditingSkillForm({
      name: '',
      description: '',
      category: 'implementation',
      max_risk_level: 'medium',
      required_approval: true,
    })
  }

  const saveEditSkill = async (skillId) => {
    try {
      setSkillsSaving(true)
      setError('')
      await skillsApi.update(skillId, {
        name: editingSkillForm.name,
        description: editingSkillForm.description,
        category: editingSkillForm.category,
        max_risk_level: editingSkillForm.max_risk_level,
        required_approval: editingSkillForm.required_approval,
      })
      await reloadSkills()
      cancelEditSkill()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to update skill')
    } finally {
      setSkillsSaving(false)
    }
  }

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
    }}>
      <div style={{
        backgroundColor: '#2c3e50',
        color: 'white',
        borderRadius: '0.5rem',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        maxWidth: '1000px',
        maxHeight: '85vh',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        width: '95vw'
      }}>
        {/* Header */}
        <div style={{
          padding: '1.5rem',
          borderBottom: '1px solid #34495e',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0
        }}>
          <h2 style={{ margin: 0, fontSize: '1.5rem' }}>🎛️ Control Room</h2>
          <button
            onClick={() => hideModal('layer3')}
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

        {/* Tab navigation */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid #34495e',
          flexShrink: 0,
          overflowX: 'auto'
        }}>
          {getTabs().map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                flex: '1',
                padding: '1rem 1.5rem',
                backgroundColor: tab === t.id ? '#3498db' : 'transparent',
                color: 'white',
                border: 'none',
                borderBottom: tab === t.id ? '3px solid #2980b9' : 'none',
                cursor: 'pointer',
                fontSize: '0.9rem',
                fontWeight: 'bold',
                whiteSpace: 'nowrap'
              }}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ padding: '2rem', flex: 1, overflow: 'auto' }}>
          {tab === 'settings' && (
            <div>
              <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.1rem' }}>System Settings</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                <div style={{ backgroundColor: '#34495e', padding: '1rem', borderRadius: '0.5rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                    Auto-lock timeout (seconds)
                  </label>
                  <input
                    type="number"
                    value={form.VAULT_AUTO_LOCK_SECONDS}
                    onChange={(e) => setForm((prev) => ({ ...prev, VAULT_AUTO_LOCK_SECONDS: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '0.25rem',
                      border: 'none',
                      boxSizing: 'border-box',
                      backgroundColor: '#2c3e50',
                      color: 'white'
                    }}
                  />
                </div>
                <div style={{ backgroundColor: '#34495e', padding: '1rem', borderRadius: '0.5rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                    Re-auth window (seconds)
                  </label>
                  <input
                    type="number"
                    value={form.REAUTH_WINDOW_SECONDS}
                    onChange={(e) => setForm((prev) => ({ ...prev, REAUTH_WINDOW_SECONDS: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '0.25rem',
                      border: 'none',
                      boxSizing: 'border-box',
                      backgroundColor: '#2c3e50',
                      color: 'white'
                    }}
                  />
                </div>
              </div>
              <div style={{ marginTop: '1.5rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={form.REQUIRE_REAUTH_FOR_REMOTE_PUSH === 'true'}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        REQUIRE_REAUTH_FOR_REMOTE_PUSH: e.target.checked ? 'true' : 'false',
                      }))
                    }
                  />
                  <span>Require re-auth for remote push</span>
                </label>
              </div>
            </div>
          )}

          {tab === 'vault' && (
            <div>
              <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.1rem' }}>🔐 Vault Management</h3>
              {vaultStatus ? (
                <div>
                  <div style={{ backgroundColor: '#34495e', padding: '1rem', borderRadius: '0.5rem', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span>Vault Status:</span>
                      <span style={{
                        color: vaultStatus.unlocked ? '#27ae60' : '#e74c3c',
                        fontWeight: 'bold'
                      }}>
                        {vaultStatus.unlocked ? '🔓 Unlocked' : '🔒 Locked'}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.9rem', opacity: 0.8 }}>
                      Stored secrets: {vaultStatus.secret_count || 0}
                    </div>
                  </div>
                  <div style={{
                    backgroundColor: '#1a252f',
                    padding: '1rem',
                    borderRadius: '0.5rem',
                    fontSize: '0.9rem'
                  }}>
                    <p>Your secrets are encrypted locally with AES-256-GCM using a passphrase you provide.</p>
                    <p style={{ marginBottom: 0 }}>The vault auto-locks after 30 minutes of inactivity.</p>
                  </div>
                </div>
              ) : (
                <div style={{
                  backgroundColor: '#1a252f',
                  padding: '1.5rem',
                  borderRadius: '0.5rem',
                  textAlign: 'center',
                  opacity: 0.8
                }}>
                  Vault service not available in this build
                </div>
              )}
            </div>
          )}

          {tab === 'audit' && (
            <div>
              <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.1rem' }}>📋 Security Audit Log</h3>
              {auditLogs.length > 0 ? (
                <div style={{
                  backgroundColor: '#1a252f',
                  borderRadius: '0.5rem',
                  maxHeight: '400px',
                  overflowY: 'auto'
                }}>
                  {auditLogs.map((log, idx) => (
                    <div
                      key={log.id || idx}
                      style={{
                        padding: '0.75rem 1rem',
                        borderBottom: idx < auditLogs.length - 1 ? '1px solid #34495e' : 'none',
                        fontSize: '0.85rem'
                      }}
                    >
                      <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>
                        {log.operation}
                      </div>
                      <div style={{ opacity: 0.8, fontSize: '0.8rem' }}>
                        {log.actor} • {new Date(log.created_at).toLocaleString()} • {log.status}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{
                  backgroundColor: '#1a252f',
                  padding: '1.5rem',
                  borderRadius: '0.5rem',
                  textAlign: 'center',
                  opacity: 0.8
                }}>
                  No audit events yet
                </div>
              )}
            </div>
          )}

          {tab === 'skills' && (
            <div>
              <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.1rem' }}>🧩 Skills Registry</h3>
              <div style={{
                backgroundColor: '#1a252f',
                borderRadius: '0.5rem',
                padding: '1rem',
                marginBottom: '1rem'
              }}>
                <div style={{ marginBottom: '0.75rem', fontWeight: 'bold' }}>Add New Skill</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <input
                    type="text"
                    placeholder="slug (e.g. repo-policy-check)"
                    value={newSkill.slug}
                    onChange={(e) => setNewSkill((prev) => ({ ...prev, slug: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '0.25rem',
                      border: 'none',
                      boxSizing: 'border-box',
                      backgroundColor: '#2c3e50',
                      color: 'white'
                    }}
                  />
                  <input
                    type="text"
                    placeholder="display name"
                    value={newSkill.name}
                    onChange={(e) => setNewSkill((prev) => ({ ...prev, name: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '0.25rem',
                      border: 'none',
                      boxSizing: 'border-box',
                      backgroundColor: '#2c3e50',
                      color: 'white'
                    }}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <input
                    type="text"
                    placeholder="description"
                    value={newSkill.description}
                    onChange={(e) => setNewSkill((prev) => ({ ...prev, description: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '0.25rem',
                      border: 'none',
                      boxSizing: 'border-box',
                      backgroundColor: '#2c3e50',
                      color: 'white'
                    }}
                  />
                  <select
                    value={newSkill.category}
                    onChange={(e) => setNewSkill((prev) => ({ ...prev, category: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '0.25rem',
                      border: 'none',
                      boxSizing: 'border-box',
                      backgroundColor: '#2c3e50',
                      color: 'white'
                    }}
                  >
                    <option value="planning">planning</option>
                    <option value="implementation">implementation</option>
                    <option value="testing">testing</option>
                    <option value="review">review</option>
                    <option value="operations">operations</option>
                  </select>
                  <select
                    value={newSkill.max_risk_level}
                    onChange={(e) => setNewSkill((prev) => ({ ...prev, max_risk_level: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '0.25rem',
                      border: 'none',
                      boxSizing: 'border-box',
                      backgroundColor: '#2c3e50',
                      color: 'white'
                    }}
                  >
                    <option value="low">low risk</option>
                    <option value="medium">medium risk</option>
                    <option value="high">high risk</option>
                  </select>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="checkbox"
                      checked={newSkill.required_approval}
                      onChange={(e) => setNewSkill((prev) => ({ ...prev, required_approval: e.target.checked }))}
                    />
                    Requires approval
                  </label>
                  <button
                    onClick={handleCreateSkill}
                    disabled={skillsSaving || !newSkill.slug.trim() || !newSkill.name.trim()}
                    style={{
                      padding: '0.5rem 0.9rem',
                      backgroundColor: '#16a085',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.25rem',
                      cursor: 'pointer',
                      fontWeight: 'bold'
                    }}
                  >
                    {skillsSaving ? 'Saving...' : 'Create Skill'}
                  </button>
                </div>
              </div>

              <div style={{
                backgroundColor: '#1a252f',
                borderRadius: '0.5rem',
                maxHeight: '360px',
                overflowY: 'auto'
              }}>
                {skills.length === 0 && (
                  <div style={{ padding: '1rem', opacity: 0.8 }}>No skills registered yet.</div>
                )}
                {skills.map((skill, idx) => (
                  <div
                    key={skill.id}
                    style={{
                      padding: '0.9rem 1rem',
                      borderBottom: idx < skills.length - 1 ? '1px solid #34495e' : 'none',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '0.75rem'
                    }}
                  >
                    {editingSkillId === skill.id ? (
                      <>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                            <input
                              type="text"
                              value={editingSkillForm.name}
                              onChange={(e) => setEditingSkillForm((prev) => ({ ...prev, name: e.target.value }))}
                              style={{ width: '100%', padding: '0.45rem', borderRadius: '0.25rem', border: 'none', backgroundColor: '#2c3e50', color: 'white' }}
                            />
                            <input
                              type="text"
                              value={editingSkillForm.description}
                              onChange={(e) => setEditingSkillForm((prev) => ({ ...prev, description: e.target.value }))}
                              style={{ width: '100%', padding: '0.45rem', borderRadius: '0.25rem', border: 'none', backgroundColor: '#2c3e50', color: 'white' }}
                            />
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0.5rem' }}>
                            <select
                              value={editingSkillForm.category}
                              onChange={(e) => setEditingSkillForm((prev) => ({ ...prev, category: e.target.value }))}
                              style={{ width: '100%', padding: '0.45rem', borderRadius: '0.25rem', border: 'none', backgroundColor: '#2c3e50', color: 'white' }}
                            >
                              <option value="planning">planning</option>
                              <option value="implementation">implementation</option>
                              <option value="testing">testing</option>
                              <option value="review">review</option>
                              <option value="operations">operations</option>
                            </select>
                            <select
                              value={editingSkillForm.max_risk_level}
                              onChange={(e) => setEditingSkillForm((prev) => ({ ...prev, max_risk_level: e.target.value }))}
                              style={{ width: '100%', padding: '0.45rem', borderRadius: '0.25rem', border: 'none', backgroundColor: '#2c3e50', color: 'white' }}
                            >
                              <option value="low">low</option>
                              <option value="medium">medium</option>
                              <option value="high">high</option>
                            </select>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                              <input
                                type="checkbox"
                                checked={editingSkillForm.required_approval}
                                onChange={(e) => setEditingSkillForm((prev) => ({ ...prev, required_approval: e.target.checked }))}
                              />
                              approval
                            </label>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            onClick={() => saveEditSkill(skill.id)}
                            disabled={skillsSaving || !editingSkillForm.name.trim()}
                            style={{ padding: '0.4rem 0.7rem', backgroundColor: '#16a085', color: 'white', border: 'none', borderRadius: '0.25rem', cursor: 'pointer' }}
                          >
                            Save
                          </button>
                          <button
                            onClick={cancelEditSkill}
                            disabled={skillsSaving}
                            style={{ padding: '0.4rem 0.7rem', backgroundColor: '#7f8c8d', color: 'white', border: 'none', borderRadius: '0.25rem', cursor: 'pointer' }}
                          >
                            Cancel
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 'bold' }}>{skill.name} <span style={{ opacity: 0.7, fontWeight: 400 }}>({skill.slug})</span></div>
                          <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>
                            {skill.category} • max risk: {skill.max_risk_level} • approval: {skill.required_approval ? 'required' : 'optional'}
                          </div>
                          {skill.description && (
                            <div style={{ fontSize: '0.8rem', opacity: 0.75, marginTop: '0.2rem' }}>{skill.description}</div>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            onClick={() => startEditSkill(skill)}
                            disabled={skillsSaving}
                            style={{
                              padding: '0.4rem 0.7rem',
                              backgroundColor: '#2980b9',
                              color: 'white',
                              border: 'none',
                              borderRadius: '0.25rem',
                              cursor: 'pointer'
                            }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleToggleSkill(skill.id)}
                            disabled={skillsSaving}
                            style={{
                              padding: '0.4rem 0.7rem',
                              backgroundColor: skill.enabled ? '#f39c12' : '#27ae60',
                              color: 'white',
                              border: 'none',
                              borderRadius: '0.25rem',
                              cursor: 'pointer'
                            }}
                          >
                            {skill.enabled ? 'Disable' : 'Enable'}
                          </button>
                          <button
                            onClick={() => handleDeleteSkill(skill.id)}
                            disabled={skillsSaving}
                            style={{
                              padding: '0.4rem 0.7rem',
                              backgroundColor: '#c0392b',
                              color: 'white',
                              border: 'none',
                              borderRadius: '0.25rem',
                              cursor: 'pointer'
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'guardrails' && (
            <div>
              <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.1rem' }}>💰 Cost Guardrails</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                <div style={{ backgroundColor: '#34495e', padding: '1rem', borderRadius: '0.5rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                    Daily cost limit ($)
                  </label>
                  <input
                    type="number"
                    value={form.DAILY_COST_LIMIT_USD}
                    onChange={(e) => setForm((prev) => ({ ...prev, DAILY_COST_LIMIT_USD: e.target.value }))}
                    step="0.01"
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '0.25rem',
                      border: 'none',
                      boxSizing: 'border-box',
                      backgroundColor: '#2c3e50',
                      color: 'white'
                    }}
                  />
                </div>
                <div style={{ backgroundColor: '#34495e', padding: '1rem', borderRadius: '0.5rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                    Per-task limit ($)
                  </label>
                  <input
                    type="number"
                    value={form.TASK_COST_LIMIT_USD}
                    onChange={(e) => setForm((prev) => ({ ...prev, TASK_COST_LIMIT_USD: e.target.value }))}
                    step="0.01"
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '0.25rem',
                      border: 'none',
                      boxSizing: 'border-box',
                      backgroundColor: '#2c3e50',
                      color: 'white'
                    }}
                  />
                </div>
              </div>
              <div style={{ marginTop: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={form.ENFORCE_COST_LIMITS === 'true'}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        ENFORCE_COST_LIMITS: e.target.checked ? 'true' : 'false',
                      }))
                    }
                  />
                  <span>Enforce cost hard stops</span>
                </label>
              </div>
              <div style={{ marginTop: '1rem', backgroundColor: '#1a252f', padding: '1rem', borderRadius: '0.5rem' }}>
                <div style={{ marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  Daily budget: ${Number(form.DAILY_COST_LIMIT_USD || 0).toFixed(2)}
                </div>
                <div style={{
                  width: '100%',
                  height: '0.5rem',
                  backgroundColor: '#34495e',
                  borderRadius: '0.25rem',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: '0%',
                    height: '100%',
                    backgroundColor: '#f39c12'
                  }} />
                </div>
              </div>
            </div>
          )}

          {tab === 'models' && (
            <div>
              <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.1rem' }}>🧠 Model Configuration</h3>
              <div style={{ marginBottom: '1rem', backgroundColor: '#34495e', padding: '1rem', borderRadius: '0.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                  Active Provider
                </label>
                <select
                  value={form.MODEL_PROVIDER}
                  onChange={(e) => setForm((prev) => ({ ...prev, MODEL_PROVIDER: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    borderRadius: '0.25rem',
                    border: 'none',
                    boxSizing: 'border-box',
                    backgroundColor: '#2c3e50',
                    color: 'white'
                  }}
                >
                  <option value="anthropic">Anthropic</option>
                  <option value="openai">OpenAI</option>
                  <option value="google">Google</option>
                  <option value="ollama">Ollama</option>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
                {[
                  'claude-opus-4-5',
                  'claude-sonnet-4-5',
                  'gpt-4o',
                  'gpt-4o-mini',
                  'gemini-2.5-pro',
                  'gemini-2.5-flash',
                  'qwen2.5-coder',
                  'llama3.1',
                ].map(model => (
                  <label
                    key={model}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '1rem',
                      backgroundColor: '#34495e',
                      borderRadius: '0.25rem',
                      cursor: 'pointer'
                    }}
                  >
                    <input
                      type="radio"
                      name="model"
                      checked={getActiveModel() === model}
                      onChange={() => {
                        if (form.MODEL_PROVIDER === 'anthropic') {
                          setForm((prev) => ({ ...prev, ANTHROPIC_MODEL: model }))
                        }
                        if (form.MODEL_PROVIDER === 'openai') {
                          setForm((prev) => ({ ...prev, OPENAI_MODEL: model }))
                        }
                        if (form.MODEL_PROVIDER === 'google') {
                          setForm((prev) => ({ ...prev, GOOGLE_MODEL: model }))
                        }
                        if (form.MODEL_PROVIDER === 'ollama') {
                          setForm((prev) => ({ ...prev, OLLAMA_MODEL: model }))
                        }
                      }}
                    />
                    <span style={{ flex: 1 }}>{model}</span>
                    <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>
                      {runtime?.model_provider === form.MODEL_PROVIDER ? 'active provider' : 'available'}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {error && (
          <div style={{ padding: '0 1rem 1rem', color: '#ffdada' }}>{error}</div>
        )}
        {saved && (
          <div style={{ padding: '0 1rem 1rem', color: '#a7f3c1' }}>Settings saved.</div>
        )}

        {/* Footer */}
        <div style={{
          padding: '1rem',
          borderTop: '1px solid #34495e',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '0.75rem',
          flexShrink: 0
        }}>
          <button
            onClick={async () => {
              await saveControlRoomSettings()
              hideModal('layer3')
            }}
            disabled={saving}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#3498db',
              color: 'white',
              border: 'none',
              borderRadius: '0.25rem',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            {saving ? 'Saving...' : 'Save & Close'}
          </button>
        </div>
      </div>
    </div>
  )
}
