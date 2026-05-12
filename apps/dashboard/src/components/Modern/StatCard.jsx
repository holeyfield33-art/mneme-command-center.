export default function StatCard({ label, value, sub, surface, border, fg, fgDim, fontMono, accent }) {
  return (
    <div style={{
      background: surface, border: `1px solid ${border}`, borderRadius: 7, padding: '12px 14px',
    }}>
      <div style={{ color: fgDim, fontSize: 11, marginBottom: 6, letterSpacing: '0.02em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, color: fg, fontFamily: fontMono, lineHeight: 1, letterSpacing: '-0.02em' }}>{value}</div>
      <div style={{ fontSize: 11, color: fgDim, marginTop: 6, fontFamily: fontMono }}>{sub}</div>
    </div>
  )
}
