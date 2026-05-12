export default function ModernTaskRow({ task, selected, onClick, STATUS_STYLE, fg, fgDim, border, fontMono, even, fmtElapsed }) {
  const st = STATUS_STYLE[task.status] || STATUS_STYLE.queued
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 16px', borderBottom: `1px solid ${border}`,
        cursor: 'pointer',
        background: selected ? 'rgba(255,255,255,0.02)' : 'transparent',
        borderLeft: selected ? `2px solid ${st.color}` : '2px solid transparent',
      }}
    >
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '2px 8px', borderRadius: 4, background: st.bg, color: st.color,
        fontSize: 10.5, fontFamily: fontMono, letterSpacing: '0.02em',
        textTransform: 'uppercase', minWidth: 70, justifyContent: 'center',
      }}>
        <span style={{
          width: 5, height: 5, borderRadius: 999, background: st.dot,
          animation: ['executing', 'planning'].includes(task.status) ? 'modPulse 1.4s ease-in-out infinite' : 'none',
        }} />
        {st.label}
      </span>
      <span style={{ width: 52, color: fgDim, fontFamily: fontMono, fontSize: 11.5 }}>{task.id?.slice(0, 8) || '—'}</span>
      <span style={{ flex: 1, color: fg, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.objective || task.title || '—'}</span>
      <span style={{ fontFamily: fontMono, fontSize: 11, color: fgDim, width: 110, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis' }}>{task.project || '—'}</span>
      {task.step && <span style={{ fontFamily: fontMono, fontSize: 11, color: fgDim, width: 36, textAlign: 'right' }}>{task.step}</span>}
      {!task.step && <span style={{ width: 36 }} />}
      <span style={{ fontFamily: fontMono, fontSize: 11, color: fgDim, width: 48, textAlign: 'right' }}>{fmtElapsed(task.started_at)}</span>
    </div>
  )
}
