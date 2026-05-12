export default function ModernPalette({ onClose, state, accent, surface, surface2, border, fg, fgDim, bg, fontMono }) {
  const items = [
    { glyph: '⏵', label: 'New task in mneme-command-center', kbd: '⏎' },
    { glyph: '◐', label: `Approvals (${state.approvals ? state.approvals.length : 0})`, kbd: 'g a' },
    { glyph: '◼', label: 'Engage emergency stop', kbd: '⌘ .' },
    { glyph: '☰', label: 'Tasks', kbd: 'g t' },
    { glyph: '▤', label: 'Open project · aurora-ledger', kbd: '' },
    { glyph: '⌘', label: 'Settings · Runtime', kbd: '' },
  ]
  return (
    <div onClick={onClose} style={{
      position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', justifyContent: 'center', paddingTop: 80, zIndex: 50,
      backdropFilter: 'blur(4px)',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 520, background: surface, border: `1px solid ${border}`, borderRadius: 10,
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)', overflow: 'hidden',
      }}>
        <input autoFocus placeholder="Type a command or search…" style={{
          width: '100%', background: bg, color: fg, border: 'none', borderBottom: `1px solid ${border}`,
          padding: '14px 18px', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
        }} />
        <div style={{ padding: 6 }}>
          {items.map((it, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '8px 12px', borderRadius: 6, cursor: 'pointer',
              background: i === 0 ? surface2 : 'transparent', color: fg,
            }}>
              <span style={{ width: 16, color: accent, fontFamily: fontMono }}>{it.glyph}</span>
              <span style={{ flex: 1 }}>{it.label}</span>
              {it.kbd && <span style={{ fontFamily: fontMono, fontSize: 11, color: fgDim }}>{it.kbd}</span>}
            </div>
          ))}
        </div>
        <div style={{ padding: '8px 14px', borderTop: `1px solid ${border}`, fontFamily: fontMono, fontSize: 11, color: fgDim, display: 'flex', gap: 16 }}>
          <span>↑↓ navigate</span><span>⏎ select</span><span>esc close</span>
        </div>
      </div>
    </div>
  )
}
