import React from 'react'

function ErrorToast({ message, onDismiss, accent }) {
  return (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      background: '#1e1010', border: `1px solid ${accent}`, borderRadius: 8,
      padding: '10px 18px', color: accent, fontSize: 13, zIndex: 9999,
      display: 'flex', alignItems: 'center', gap: 12, maxWidth: 480,
      boxShadow: '0 4px 24px rgba(0,0,0,.5)',
    }}>
      <span style={{ flex: 1 }}>{message}</span>
      <button onClick={onDismiss} style={{ background: 'none', border: 'none', color: accent, cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
    </div>
  )
}

import { useLocation, useNavigate } from 'react-router-dom'
import { useMnemeState } from './useMnemeState'
import StatCard from './StatCard'
import ModernTaskRow from './ModernTaskRow'
import ModernApproval from './ModernApproval'
import ModernPalette from './ModernPalette'
import ModernSidebar from './ModernSidebar'
import TaskTemplates from './TaskTemplates'

const TASK_TEMPLATES = [
  { id: 'refactor', glyph: '◆', label: 'Refactor', body: 'Refactor and optimize this module' },
  { id: 'fix', glyph: '✓', label: 'Fix', body: 'Debug and fix this issue' },
  { id: 'doc', glyph: '◯', label: 'Doc', body: 'Write documentation for this feature' },
  { id: 'test', glyph: '▫', label: 'Test', body: 'Write tests for this module' },
]

function fmtElapsed(started_at) {
  if (!started_at) return '—'
  const diff = Date.now() - new Date(started_at).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h`
}

function fmtAgo(seconds) {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  return `${Math.floor(seconds / 3600)}h`
}

export default function ModernLayout({ layout = 'top', accent = 'amber', onLayoutChange, onAccentChange, onLogout }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [s, act, status] = useMnemeState()
  const [taskFilter, setTaskFilter] = React.useState('active')
  const [composer, setComposer] = React.useState({ project: '', objective: '', template: null })
  const [paletteOpen, setPaletteOpen] = React.useState(false)

  // Color palette
  const ACCENT = accent === 'green' ? '#34d399' : accent === 'cyan' ? '#67e8f9' : '#f5b945'
  const ACCENT_SOFT = accent === 'green' ? 'rgba(52,211,153,.12)' : accent === 'cyan' ? 'rgba(103,232,249,.12)' : 'rgba(245,185,69,.12)'
  const SUCCESS = '#34d399'
  const DANGER = '#f87171'
  const WARN = '#fbbf24'
  const INFO = '#60a5fa'
  const BG = '#0c0c0d'
  const SURFACE = '#131316'
  const SURFACE_2 = '#191a1e'
  const BORDER = '#26262b'
  const BORDER_SOFT = '#1f1f24'
  const FG = '#e6e4e0'
  const FG_DIM = '#86847f'
  const FG_DIMMER = '#56544f'

  const FONT_SANS = '"Geist","Inter",system-ui,-apple-system,sans-serif'
  const FONT_MONO = '"Geist Mono","JetBrains Mono",ui-monospace,monospace'

  const visibleTasks = s.tasks.filter(t =>
    taskFilter === 'all' ? true :
    taskFilter === 'active' ? ['executing', 'planning', 'queued', 'paused'].includes(t.status) :
    t.status === taskFilter
  )

  React.useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setPaletteOpen(o => !o)
      }
      if (e.key === 'Escape') setPaletteOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  React.useEffect(() => {
    if (!composer.project && s.projects.length > 0) {
      setComposer(c => ({ ...c, project: s.projects[0].id }))
    }
  }, [composer.project, s.projects])

  const STATUS_STYLE = {
    executing: { color: ACCENT, dot: ACCENT, bg: ACCENT_SOFT, label: 'Executing' },
    planning: { color: INFO, dot: INFO, bg: 'rgba(96,165,250,.10)', label: 'Planning' },
    queued: { color: FG_DIM, dot: FG_DIM, bg: 'rgba(134,132,127,.10)', label: 'Queued' },
    paused: { color: WARN, dot: WARN, bg: 'rgba(251,191,36,.10)', label: 'Paused' },
    done: { color: SUCCESS, dot: SUCCESS, bg: 'rgba(52,211,153,.08)', label: 'Done' },
    failed: { color: DANGER, dot: DANGER, bg: 'rgba(248,113,113,.10)', label: 'Failed' },
  }

  const navItems = [
    { label: 'Overview', path: '/overview' },
    { label: 'Tasks', path: '/dashboard' },
    { label: 'Approvals', path: '/approvals' },
    { label: 'Projects', path: '/projects' },
    { label: 'Workers', path: '/workers' },
    { label: 'Settings', path: '/settings' },
    { label: 'Audit', path: '/audit' },
  ]

  return (
    <div style={{
      width: '100%', height: '100vh', background: BG, color: FG,
      fontFamily: FONT_SANS, fontSize: 13, lineHeight: 1.55, overflow: 'hidden',
      position: 'relative', display: 'flex',
    }}>
      {layout === 'sidebar' && (
        <ModernSidebar
          accent={ACCENT}
          fg={FG}
          fgDim={FG_DIM}
          fgDimmer={FG_DIMMER}
          surface={SURFACE}
          border={BORDER}
          state={s}
          fontMono={FONT_MONO}
          currentPath={location.pathname}
          onNavigate={navigate}
        />
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Top bar */}
        <header style={{
          height: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 20px', borderBottom: `1px solid ${BORDER}`,
          background: BG,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            {layout !== 'sidebar' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: 5, background: ACCENT,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: BG, fontWeight: 700, fontSize: 12, fontFamily: FONT_MONO,
                }}>m</div>
                <span style={{ fontWeight: 600, letterSpacing: '-0.01em' }}>mneme</span>
              </div>
            )}
            {layout !== 'sidebar' && (
              <nav style={{ display: 'flex', gap: 4 }}>
                {navItems.map((it) => {
                  const active = location.pathname === it.path
                  return (
                  <button key={it.label} onClick={() => navigate(it.path)} style={{
                    background: active ? SURFACE_2 : 'transparent',
                    color: active ? FG : FG_DIM,
                    border: 'none', padding: '6px 12px', borderRadius: 6, fontSize: 13,
                    fontFamily: FONT_SANS, cursor: 'pointer',
                  }}>
                    {it.label}
                    {it.label === 'Approvals' && s.approvals.length > 0 ? (
                      <span style={{ marginLeft: 6, color: WARN, fontFamily: FONT_MONO, fontSize: 11 }}>{s.approvals.length}</span>
                    ) : null}
                  </button>
                )})}
              </nav>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => setPaletteOpen(true)} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px',
              background: SURFACE, border: `1px solid ${BORDER}`, color: FG_DIM,
              borderRadius: 6, cursor: 'pointer', fontSize: 12, fontFamily: FONT_SANS,
            }}>
              <span>Search or jump…</span>
              <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: FG_DIMMER, padding: '1px 5px', border: `1px solid ${BORDER}`, borderRadius: 3 }}>⌘K</span>
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: FONT_MONO, fontSize: 11, color: FG_DIM }}>
              <span style={{
                width: 6, height: 6, borderRadius: 999,
                background: status.sseConnected ? SUCCESS : WARN,
                boxShadow: status.sseConnected ? `0 0 8px ${SUCCESS}` : `0 0 8px ${WARN}`,
              }} />
              {status.sseConnected ? 'live' : 'reconnecting'}
            </div>
            <button onClick={act.toggleEmergencyStop} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 12px', borderRadius: 6,
              background: s.emergencyStop ? DANGER : 'transparent',
              border: `1px solid ${s.emergencyStop ? DANGER : 'rgba(248,113,113,.4)'}`,
              color: s.emergencyStop ? '#1a0a0a' : DANGER,
              fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: FONT_SANS,
            }}>
              <svg width="11" height="11" viewBox="0 0 12 12"><rect width="12" height="12" rx="2" fill="currentColor" /></svg>
              {s.emergencyStop ? 'Stop engaged' : 'Emergency stop'}
            </button>
          </div>
        </header>

        {/* Body */}
        <div style={{ flex: 1, padding: 20, display: 'grid', gridTemplateColumns: '1.4fr 1fr', gridTemplateRows: 'auto auto 1fr', gap: 16, minHeight: 0, overflow: 'hidden' }}>

          {/* Stat strip — full width */}
          <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
            <StatCard label="Active tasks" value={s.tasks.filter(t => ['executing', 'planning', 'queued', 'paused'].includes(t.status)).length} sub="2 executing · 1 queued" surface={SURFACE} border={BORDER_SOFT} fg={FG} fgDim={FG_DIM} fontMono={FONT_MONO} accent={ACCENT} />
            <StatCard label="Pending approval" value={s.approvals.length} sub={s.approvals.length ? 'oldest 12s' : 'queue empty'} surface={SURFACE} border={BORDER_SOFT} fg={FG} fgDim={FG_DIM} fontMono={FONT_MONO} accent={s.approvals.length ? WARN : FG_DIM} />
            <StatCard label="Workers" value={`${s.workers.filter(w => w.status === 'online').length}/${s.workers.length}`} sub={s.workers[0]?.hostname || '—'} surface={SURFACE} border={BORDER_SOFT} fg={FG} fgDim={FG_DIM} fontMono={FONT_MONO} accent={SUCCESS} />
            <StatCard label="Spend · today" value="$1.34" sub="≈ 5 tasks" surface={SURFACE} border={BORDER_SOFT} fg={FG} fgDim={FG_DIM} fontMono={FONT_MONO} accent={ACCENT} />
            <StatCard label="Throughput · 24h" value="11" sub="9 done · 2 fail" surface={SURFACE} border={BORDER_SOFT} fg={FG} fgDim={FG_DIM} fontMono={FONT_MONO} accent={ACCENT} />
          </div>

          {/* Tasks panel */}
          <div style={{
            gridRow: 'span 2', minHeight: 0,
            background: SURFACE, border: `1px solid ${BORDER_SOFT}`, borderRadius: 8,
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: `1px solid ${BORDER_SOFT}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>Tasks</span>
                <div style={{ display: 'flex', gap: 2, padding: 2, background: SURFACE_2, borderRadius: 6 }}>
                  {[
                    { k: 'active', l: 'Active' },
                    { k: 'all', l: 'All' },
                    { k: 'done', l: 'Done' },
                    { k: 'failed', l: 'Failed' },
                  ].map(f => (
                    <button key={f.k} onClick={() => setTaskFilter(f.k)} style={{
                      padding: '4px 10px', borderRadius: 4, border: 'none', cursor: 'pointer',
                      background: taskFilter === f.k ? BG : 'transparent',
                      color: taskFilter === f.k ? FG : FG_DIM,
                      fontFamily: FONT_SANS, fontSize: 12,
                    }}>{f.l}</button>
                  ))}
                </div>
              </div>
              <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: FG_DIM }}>{visibleTasks.length} task{visibleTasks.length === 1 ? '' : 's'}</span>
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              {visibleTasks.map((t, i) => (
                <ModernTaskRow
                  key={t.id} task={t}
                  selected={t.id === s.selectedTaskId}
                  onClick={() => { act.selectTask(t.id); navigate(`/task/${t.id}`) }}
                  STATUS_STYLE={STATUS_STYLE}
                  fg={FG} fgDim={FG_DIM} border={BORDER_SOFT}
                  fontMono={FONT_MONO}
                  even={i % 2 === 0}
                  fmtElapsed={fmtElapsed}
                />
              ))}
            </div>
          </div>

          {/* Approvals panel */}
          <div style={{
            background: SURFACE, border: `1px solid ${BORDER_SOFT}`, borderRadius: 8,
            display: 'flex', flexDirection: 'column', minHeight: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: `1px solid ${BORDER_SOFT}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>Approvals</span>
                {s.approvals.length > 0 && (
                  <span style={{
                    padding: '1px 7px', background: 'rgba(251,191,36,.14)', color: WARN,
                    fontFamily: FONT_MONO, fontSize: 11, borderRadius: 999,
                  }}>{s.approvals.length} pending</span>
                )}
              </div>
              <span style={{ color: FG_DIM, fontSize: 11, fontFamily: FONT_MONO }}>auto-refresh on</span>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {s.approvals.length === 0 && (
                <div style={{ padding: '32px 0', textAlign: 'center', color: FG_DIM }}>
                  <div style={{ fontSize: 28, color: SUCCESS, marginBottom: 6 }}>✓</div>
                  <div style={{ fontSize: 12 }}>Nothing waiting on you.</div>
                </div>
              )}
              {s.approvals.map(a => (
                <ModernApproval key={a.id} a={a}
                  onApprove={() => act.approve(a.id)} onReject={() => act.reject(a.id)}
                  fg={FG} fgDim={FG_DIM} border={BORDER_SOFT} surface2={SURFACE_2}
                  bg={BG} success={SUCCESS} danger={DANGER} accent={ACCENT} warn={WARN}
                  fontMono={FONT_MONO}
                  fmtAgo={fmtAgo}
                />
              ))}
            </div>
          </div>

          {/* Composer panel */}
          <div style={{
            background: SURFACE, border: `1px solid ${BORDER_SOFT}`, borderRadius: 8,
            display: 'flex', flexDirection: 'column', minHeight: 0,
          }}>
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${BORDER_SOFT}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>New task</span>
              <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: FG_DIM }}>⌘ ⏎ to dispatch</span>
            </div>
            <div style={{ padding: 16, flex: 1, overflow: 'auto' }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                {TASK_TEMPLATES.map(tpl => (
                  <button key={tpl.id} onClick={() => setComposer(c => ({ ...c, template: tpl.id, objective: tpl.body }))}
                    style={{
                      padding: '4px 10px', borderRadius: 999,
                      background: composer.template === tpl.id ? ACCENT_SOFT : SURFACE_2,
                      color: composer.template === tpl.id ? ACCENT : FG_DIM,
                      border: `1px solid ${composer.template === tpl.id ? ACCENT : BORDER_SOFT}`,
                      cursor: 'pointer', fontSize: 11.5, fontFamily: FONT_SANS,
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                    <span style={{ fontFamily: FONT_MONO }}>{tpl.glyph}</span>{tpl.label}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                <span style={{ color: FG_DIM, fontSize: 12 }}>in</span>
                <select value={composer.project} onChange={e => setComposer(c => ({ ...c, project: e.target.value }))}
                  style={{
                    background: SURFACE_2, color: FG, border: `1px solid ${BORDER_SOFT}`,
                    fontFamily: FONT_MONO, fontSize: 12, padding: '4px 8px', borderRadius: 5,
                  }}>
                  {s.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <textarea
                value={composer.objective}
                onChange={e => setComposer(c => ({ ...c, objective: e.target.value }))}
                placeholder="What should the worker do? e.g. Add Stripe webhook signature verification…"
                style={{
                  width: '100%', minHeight: 60, background: BG,
                  border: `1px solid ${BORDER_SOFT}`, color: FG, padding: 10, borderRadius: 6,
                  fontFamily: FONT_SANS, fontSize: 13, resize: 'none', outline: 'none', boxSizing: 'border-box',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                <button
                  onClick={() => { act.createTask({ project_id: composer.project, objective: composer.objective }); setComposer({ project: composer.project, objective: '', template: null }); }}
                  disabled={!composer.objective.trim()}
                  style={{
                    padding: '6px 14px', borderRadius: 6,
                    background: ACCENT, border: 'none', color: BG, fontWeight: 600,
                    fontFamily: FONT_SANS, fontSize: 12, cursor: composer.objective.trim() ? 'pointer' : 'not-allowed',
                    opacity: composer.objective.trim() ? 1 : 0.4,
                  }}>
                  Dispatch task →
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom: stream */}
        <div style={{
          height: 168, borderTop: `1px solid ${BORDER}`,
          background: SURFACE, display: 'flex', flexDirection: 'column', minHeight: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 20px', borderBottom: `1px solid ${BORDER_SOFT}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12 }}>
              <span style={{ fontWeight: 600 }}>Live stream</span>
              <span style={{ color: FG_DIM, fontFamily: FONT_MONO }}>/events</span>
              <span style={{ color: FG_DIM }}>· tail 18 / {s.logs.length}</span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {['all', 'tasks', 'approvals', 'audit'].map((t, i) => (
                <span key={t} style={{
                  padding: '2px 7px', borderRadius: 4, fontSize: 11, fontFamily: FONT_MONO,
                  background: i === 0 ? SURFACE_2 : 'transparent', color: i === 0 ? FG : FG_DIM,
                  border: `1px solid ${i === 0 ? BORDER : 'transparent'}`, cursor: 'pointer',
                }} onClick={() => {
                  if (t === 'tasks') navigate('/dashboard')
                  if (t === 'approvals') navigate('/approvals')
                  if (t === 'audit') navigate('/audit')
                }}>{t}</span>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column-reverse', padding: '6px 20px' }}>
            <div>
              {s.logs.slice(-9).map((l, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, fontFamily: FONT_MONO, fontSize: 11.5, lineHeight: 1.7 }}>
                  <span style={{ color: FG_DIMMER, width: 64 }}>{l.ts}</span>
                  <span style={{
                    color: l.level === 'warn' ? WARN : l.level === 'event' ? ACCENT : FG_DIM, width: 50,
                  }}>{l.level === 'warn' ? 'warn' : l.level === 'event' ? 'event' : l.src}</span>
                  <span style={{ color: ACCENT, width: 52 }}>{l.task}</span>
                  <span style={{ color: FG, flex: 1 }}>{l.msg}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {paletteOpen && (
        <ModernPalette
          onClose={() => setPaletteOpen(false)}
          onNavigate={navigate}
          onCreateTask={() => {
            setPaletteOpen(false)
            const el = document.querySelector('textarea')
            if (el) el.focus()
          }}
          onEmergencyStop={act.toggleEmergencyStop}
          state={s}
          accent={ACCENT} surface={SURFACE} surface2={SURFACE_2} border={BORDER}
          fg={FG} fgDim={FG_DIM} bg={BG} fontMono={FONT_MONO}
        />
      )}

      {status.error && (
        <ErrorToast message={status.error} onDismiss={act.clearError} accent={DANGER} />
      )}
      <style>{`@keyframes modPulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.35 } }`}</style>
    </div>
  )
}
