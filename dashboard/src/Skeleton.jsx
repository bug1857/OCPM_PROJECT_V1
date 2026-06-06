// Skeleton loading components — import and use instead of plain "Loading..." text

export function SkeletonKPIs() {
  return (
    <div className="skeleton-kpi-grid">
      {[...Array(5)].map((_,i) => (
        <div key={i} className="skeleton skeleton-kpi" />
      ))}
    </div>
  )
}

export function SkeletonCards({ count = 2 }) {
  return (
    <>
      {[...Array(count)].map((_,i) => (
        <div key={i} className="skeleton skeleton-card" />
      ))}
    </>
  )
}

export function SkeletonTable({ rows = 8 }) {
  return (
    <div>
      <div className="skeleton skeleton-row" style={{ width: '100%', height: 32, marginBottom: 12 }} />
      {[...Array(rows)].map((_,i) => (
        <div key={i} className="skeleton skeleton-row" style={{ width: `${85 + Math.random()*15}%` }} />
      ))}
    </div>
  )
}

export function SkeletonPage() {
  return (
    <>
      <div className="skeleton" style={{ height: 24, width: 260, marginBottom: 8 }} />
      <div className="skeleton" style={{ height: 14, width: 380, marginBottom: 24 }} />
      <SkeletonKPIs />
      <div style={{ marginTop: 12 }}><SkeletonCards count={2} /></div>
    </>
  )
}