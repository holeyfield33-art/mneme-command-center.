export default function ModernApproval({ a, onApprove, onReject, fg, fgDim, border, surface2, bg, success, danger, accent, warn, fontMono, fmtAgo }) {
  const files = a.files || []
  const age = a.created_at ? Math.floor((Date.now() - new Date(a.created_at).getTime()) / 1000) : 0

  return (
    <div style={{
      background: bg, border: `1px solid ${border}`, borderRadius: 7,
      padding: 12,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: fg, marginBottom: 2 }}>{a.title || a.type || 'Approval'}</div>
          <div style={{ fontSize: 11.5, color: fgDim, fontFamily: fontMono }}>
            <span style={{ color: accent }}>{a.task_id?.slice(0, 8) || 'task'}</span> · {a.summary || 'Review required'}
          </div>
        </div>
        <span style={{ fontSize: 11, color: fgDim, fontFamily: fontMono }}>{fmtAgo(age)} ago</span>
      </div>
      {files.length > 0 && (
        <div style={{ background: surface2, borderRadius: 5, padding: 8, marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {files.map((f, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: fontMono, fontSize: 11.5 }}>
              <span style={{
                width: 14, color: f.action === 'create' ? success : warn, fontWeight: 700,
              }}>{f.action === 'create' ? '+' : '~'}</span>
              <span style={{ flex: 1, color: fg, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.path}</span>
              <span style={{ color: success }}>+{f.adds || 0}</span>
              <span style={{ color: danger }}>−{f.dels || 0}</span>
            </div>
          ))}
        </div>
      )}
      {a.rationale && (
        <div style={{ fontSize: 11.5, color: fgDim, marginBottom: 10, paddingLeft: 8, borderLeft: `2px solid ${border}` }}>
          {a.rationale}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onApprove} style={{
          flex: 1, padding: '6px 10px', borderRadius: 5,
          background: success, color: '#0a1410', border: 'none', cursor: 'pointer',
          fontWeight: 600, fontSize: 12,
        }}>Approve</button>
        <button onClick={onReject} style={{
          flex: 1, padding: '6px 10px', borderRadius: 5,
          background: 'transparent', color: danger, border: `1px solid rgba(248,113,113,.4)`,
          cursor: 'pointer', fontWeight: 600, fontSize: 12,
        }}>Reject</button>
      </div>
    </div>
  )
}
