export default function ModernSidebar({ accent, fg, fgDim, fgDimmer, surface, border, state, fontMono, currentPath = '/', onNavigate }) {
  const items = [
    { k: 'overview', label: 'Overview', icon: '◆', path: '/overview' },
    { k: 'tasks', label: 'Tasks', icon: '☰', path: '/dashboard', count: state.tasks ? state.tasks.length : 0 },
    { k: 'approvals', label: 'Approvals', icon: '◐', path: '/approvals', count: state.approvals ? state.approvals.length : 0, alert: state.approvals && state.approvals.length > 0 },
    { k: 'projects', label: 'Projects', icon: '▤', path: '/projects', count: state.projects ? state.projects.length : 0 },
    { k: 'workers', label: 'Workers', icon: '◇', path: '/workers', count: state.workers ? state.workers.length : 0 },
    { k: 'audit', label: 'Audit', icon: '◎', path: '/audit' },
  ]
  return (
    <aside style={{
      width: 224, background: '#0a0a0b', borderRight: `1px solid ${border}`,
      display: 'flex', flexDirection: 'column', padding: '14px 10px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px 14px' }}>
        <div style={{
          width: 22, height: 22, borderRadius: 5, background: accent,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#0c0c0d', fontWeight: 700, fontSize: 12, fontFamily: fontMono,
        }}>m</div>
        <span style={{ fontWeight: 600, color: fg }}>mneme</span>
        <span style={{ marginLeft: 'auto', fontFamily: fontMono, fontSize: 11, color: fgDimmer }}>0.2</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {items.map(it => {
          const active = currentPath === it.path
          return (
          <div key={it.k} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '6px 10px', borderRadius: 5, cursor: 'pointer',
            background: active ? '#1a1a1f' : 'transparent',
            color: active ? fg : fgDim,
            fontSize: 13,
          }} onClick={() => onNavigate?.(it.path)}>
            <span style={{ width: 14, fontFamily: fontMono, color: active ? accent : fgDim }}>{it.icon}</span>
            <span style={{ flex: 1 }}>{it.label}</span>
            {it.count != null && (
              <span style={{
                fontFamily: fontMono, fontSize: 11,
                color: it.alert ? '#fbbf24' : fgDimmer,
                background: it.alert ? 'rgba(251,191,36,.12)' : 'transparent',
                padding: it.alert ? '0 6px' : 0, borderRadius: 3,
              }}>{it.count}</span>
            )}
          </div>
          )
        })}
      </div>

      <div style={{
        marginTop: 'auto', padding: 10, borderTop: `1px solid ${border}`,
        fontSize: 11, color: fgDim, fontFamily: fontMono,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: '#34d399', boxShadow: '0 0 6px #34d399' }} />
          worker · {state.workers && state.workers[0] ? state.workers[0].hostname : 'offline'}
        </div>
        <div style={{ color: fgDimmer }}>uptime 04:21:08 · cpu 32%</div>
      </div>
    </aside>
  )
}
