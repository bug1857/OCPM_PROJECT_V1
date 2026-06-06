import { useEffect, useState } from 'react'
import { SkeletonCards, SkeletonTable } from '../Skeleton'
import { getProcessMap } from '../api'

const S = {
  page: { padding: 0 },
  header: { marginBottom: 28 },
  title: { fontSize: 22, fontWeight: 800, color: 'var(--t1)', letterSpacing: -0.5 },
  sub: { fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t4)', marginTop: 3 },

  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },

  nodeGrid: { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginTop: 4 },
  nodeCard: {
    background: 'var(--bg3)',
    border: '1px solid #2a2a2a',
    borderRadius: 16,
    padding: '18px',
    fontFamily: 'var(--sans)',
    transition: 'all .25s ease',
    position: 'relative',
    overflow: 'hidden',
  },

  edgeRow: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 0', borderBottom: '1px solid var(--b1)',
    fontFamily: 'var(--mono)', fontSize: 11,
  },
  edgeSource: { color: 'var(--t2)', width: 160, minWidth: 160, fontWeight: 700 },
  edgeArrow: { color: 'var(--t4)', width: 20 },
  edgeTarget: { color: 'var(--t3)', flex: 1 },
  edgeStat: { textAlign: 'right', color: 'var(--t4)', width: 80 },
  edgeEmit: { textAlign: 'right', color: 'var(--t2)', width: 100 },

  badge: (pct) => ({
    display: 'inline-block',
    padding: '5px 10px',
    borderRadius: 999,
    fontFamily: 'var(--mono)',
    fontSize: 10,
    fontWeight: 700,
    background: 'rgba(255,255,255,0.04)',
    color: 'var(--t1)',
    border: '1px solid rgba(255,255,255,0.08)',
  }),
}

const emitColor = e => e > 500000 ? 'var(--t1)' : e > 100000 ? 'var(--t2)' : e > 30000 ? 'var(--t3)' : 'var(--t4)'

export default function ProcessExplorer() {
  const [data, setData] = useState(null)
  const [err,  setErr]  = useState(null)

  useEffect(() => { getProcessMap().then(setData).catch(e => setErr(e.message)) }, [])

  if (err)   return <div className="error-box">API error: {err}</div>
  if (!data) return <SkeletonCards count={3} />

  const maxEmit = Math.max(...data.edges.map(e => e.emissions))

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Process Explorer</div>
          <div className="page-sub">OCEL 2.0 · Object-Centric Process Map · Emission-Weighted Flows</div>
        </div>
      </div>

      <div style={S.grid}>
        {/* Activities */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Process Activities</span>
            <span className="card-meta">{data.nodes.length} nodes</span>
          </div>
          <div style={S.nodeGrid}>
            {data.nodes.map(n => {
              const EMISSION_FACTORS = {
                'Create Order': 1,
                'Supplier Selection': 2,
                'Goods Issue': 5,
                'Freight Booking': 20,
                'Air Freight': 300,
                'Sea Freight': 50,
                'Road Freight': 120,
                'Customs Clearance': 15,
                'Warehouse Transfer': 20,
                'Delivery': 10,
              }

              const emission = EMISSION_FACTORS[n.id] || 0
              const isBottleneck = emission >= 100

              return (
                <div
                  key={n.id}
                  style={{
                    ...S.nodeCard,
                    border: '1px solid #2a2a2a',
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: 'var(--bg5)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--t1)',
                      fontWeight: 700,
                      marginBottom: 14,
                    }}
                  >
                    {data.nodes.indexOf(n) + 1}
                  </div>

                  <div style={{ fontWeight: 700, color: 'var(--t1)', fontSize: 15 }}>
                    {n.id}
                  </div>

                  <div style={{ marginTop: 8, color: 'var(--t4)', fontSize: 12 }}>
                    Carbon Factor
                  </div>

                  <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--t2)', marginTop: 6 }}>
                    {emission}
                  </div>

                  <div style={{ color: 'var(--t4)', fontSize: 11 }}>
                    kg CO₂e / execution
                  </div>

                  <div
                    style={{
                      marginTop: 16,
                      height: 4,
                      borderRadius: 999,
                      background: 'var(--bg5)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.min(emission * 3, 100)}%`,
                        height: '100%',
                        background: 'var(--t4)',
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Stats */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Flow Statistics</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { label: 'Total Flows',   val: data.edges.length },
              { label: 'Total Cases',   val: '10,000' },
              { label: 'Peak Emission', val: `${(maxEmit/1000).toFixed(0)}k kg` },
              { label: 'Air Dominance', val: '50.0%' },
            ].map(s => (
              <div className="inner" key={s.label} style={{
                textAlign: 'center',
                background: 'var(--bg3)',
                borderRadius: 14,
                border: '1px solid #262626',
                padding: 20,
              }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{s.label}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 800, color: 'var(--t1)' }}>{s.val}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Edges */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Transition Intelligence</span>
          <span className="card-meta">{data.edges.length} transitions</span>
        </div>

        {/* Header row */}
        <div style={{ display: 'flex', gap: 10, padding: '6px 0 10px', borderBottom: '1px solid var(--b1)' }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: 1, width: 160, minWidth: 160 }}>From</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: 1, width: 20 }} />
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: 1, flex: 1 }}>To</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: 1, width: 80, textAlign: 'right' }}>Cases</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: 1, width: 100, textAlign: 'right' }}>CO₂e (kg)</span>
        </div>

        {data.edges.map((edge, idx) => {
          const pct = Math.round(edge.emissions / maxEmit * 100)
          return (
            <div style={S.edgeRow} key={idx}>
              <span style={S.edgeSource}>{edge.source}</span>
              <span style={S.edgeArrow}>→</span>
              <span style={S.edgeTarget}>{edge.target}</span>
              <div style={{ width: 80, textAlign: 'right' }}>
                <span style={S.badge(pct)}>{edge.count.toLocaleString()}</span>
              </div>
              <span style={{ ...S.edgeEmit, color: emitColor(edge.emissions), fontWeight: 700 }}>
                {edge.emissions.toLocaleString()}
              </span>
            </div>
          )
        })}

        <div style={{ marginTop: 14, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t4)', padding: '10px 12px', background: 'var(--bg3)', borderRadius: 14, border: '1px solid var(--b1)' }}>
          Highest carbon concentration is observed in the Air Freight corridor. Shifting volume toward Sea Freight can significantly reduce supply-chain emissions while preserving process conformance.
        </div>
      </div>
    </>
  )
}