import { useEffect, useState } from 'react'
import { SkeletonCards, SkeletonTable } from '../Skeleton'
import { getProcessMap, getProcessVariants } from '../api'

const TRANSPORT_COLOR = { 'Air Freight': 'var(--t3)', 'Road Freight': 'var(--t3)', 'Sea Freight': 'var(--t2)', 'Unknown': 'var(--t4)' }

const EF = {
  'Create Order': 1, 'Supplier Selection': 2, 'Goods Issue': 5,
  'Freight Booking': 8, 'Air Freight': 300, 'Sea Freight': 50,
  'Road Freight': 120, 'Customs Clearance': 15,
  'Warehouse Transfer': 20, 'Delivery': 10,
}

export default function ProcessExplorer() {
  const [tab,      setTab]      = useState('network')
  const [mapData,  setMapData]  = useState(null)
  const [varData,  setVarData]  = useState(null)
  const [varLoad,  setVarLoad]  = useState(false)
  const [err,      setErr]      = useState(null)

  useEffect(() => {
    getProcessMap().then(setMapData).catch(e => setErr(e.message))
  }, [])

  useEffect(() => {
    if (tab !== 'variants') return
    if (varData) return          // already loaded
    setVarLoad(true)
    getProcessVariants()
      .then(d => setVarData(d))
      .catch(e => setErr(e?.message || 'Failed to load variants'))
      .finally(() => setVarLoad(false))
  }, [tab])

  const TABS = [
    { id: 'network',  label: 'Process Network' },
    { id: 'variants', label: 'Variant Clustering' },
    { id: 'flows',    label: 'Transition Intelligence' },
  ]

  if (err) return <div className="error-box">API error: {err}</div>

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Process Explorer</div>
          <div className="page-sub">OCEL 2.0 · Object-Centric Process Map · Variant Analysis</div>
        </div>
        <div className="live-tag">LIVE PROCESS MODEL</div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '9px 16px', background: 'none', border: 'none',
            borderBottom: tab === t.id ? '2px solid #f0f0f0' : '2px solid transparent',
            color: tab === t.id ? 'var(--t1)' : 'var(--t3)',
            fontFamily: 'var(--mono)', fontSize: 12, cursor: 'pointer',
            fontWeight: tab === t.id ? 700 : 400,
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── TAB: PROCESS NETWORK ── */}
      {tab === 'network' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Process Activities</span>
            {mapData && <span className="card-meta">{mapData.nodes.length} nodes</span>}
          </div>
          {!mapData
            ? <div className="loading">Loading...</div>
            : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
                {mapData.nodes.map((node, idx) => {
                  const ef = EF[node.id] || 0
                  return (
                    <div key={node.id} style={{
                      background: 'var(--bg3)',
                      border: '1px solid #2a2a2a', borderRadius: 14, padding: 18,
                    }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: 7, background: 'var(--bg5)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--t1)', fontWeight: 700, fontSize: 11, marginBottom: 12,
                      }}>{idx + 1}</div>
                      <div style={{ color: 'var(--t1)', fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{node.id}</div>
                      <div style={{ color: 'var(--t4)', fontSize: 11 }}>Emission factor</div>
                      <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--t2)', marginTop: 4 }}>{ef}</div>
                      <div style={{ color: 'var(--t4)', fontSize: 11 }}>kg CO₂e / exec</div>
                      <div style={{ marginTop: 12, height: 3, background: 'var(--bg5)', borderRadius: 999, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(ef / 3, 100)}%`, height: '100%', background: 'var(--t4)' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          }
        </div>
      )}

      {/* ── TAB: VARIANT CLUSTERING ── */}
      {tab === 'variants' && (
        <>
          {varLoad && <div className="loading">Clustering variants...</div>}

          {varData && !varLoad && (
            <>
              {/* KPI strip */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 16 }}>
                {[
                  { label: 'Total Traces',     val: varData.total_traces.toLocaleString() },
                  { label: 'Unique Variants',  val: varData.unique_variants },
                  { label: 'Data Source',      val: varData.source === 'live' ? '● Live CSV' : '○ Demo' },
                ].map(k => (
                  <div className="kpi" key={k.label} style={{ borderColor: 'var(--b1)' }}>
                    <div className="kpi-label">{k.label}</div>
                    <div className="kpi-value" style={{ fontSize: 20 }}>{k.val}</div>
                  </div>
                ))}
              </div>

              {/* Frequency bar chart */}
              <div className="card" style={{ marginBottom: 14 }}>
                <div className="card-header">
                  <span className="card-title">Variant Frequency Distribution</span>
                  <span className="card-meta">Top {varData.top_variants.length} variants</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {(varData.top_variants || []).map(v => {
                    const barColor = !v.is_normative ? 'var(--t4)' :
                      v.transport_modes?.includes('Air Freight') ? 'var(--t3)' : 'var(--t2)'
                    return (
                      <div key={v.rank} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {/* Rank badge */}
                        <div style={{
                          width: 24, height: 24, borderRadius: 6,
                          background: 'var(--bg4)', border: '1px solid #333',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t4)', flexShrink: 0,
                        }}>{v.rank}</div>

                        {/* Variant label + bar */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, alignItems: 'center' }}>
                            <span style={{
                              fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t3)',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              maxWidth: '70%',
                            }}>{v.variant_str}</span>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                              {!v.is_normative && (
                                <span style={{
                                  fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700,
                                  background: 'var(--t4)22', color: 'var(--t4)',
                                  border: '1px solid var(--t4)44', padding: '1px 5px', borderRadius: 3,
                                }}>NON-NORMATIVE</span>
                              )}
                              {v.transport_modes?.map(m => (
                                <span key={m} style={{
                                  fontFamily: 'var(--mono)', fontSize: 9,
                                  color: TRANSPORT_COLOR[m] || 'var(--t4)',
                                }}>{m}</span>
                              ))}
                              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t2)', fontWeight: 700 }}>
                                {v.frequency_pct}%
                              </span>
                            </div>
                          </div>
                          <div style={{ height: 8, background: 'var(--bg4)', borderRadius: 999, overflow: 'hidden' }}>
                            <div style={{
                              width: `${v.frequency_pct}%`, height: '100%',
                              background: barColor, borderRadius: 999,
                              transition: 'width 0.6s ease',
                            }} />
                          </div>
                        </div>

                        {/* Count */}
                        <span style={{
                          fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t4)',
                          width: 52, textAlign: 'right', flexShrink: 0,
                        }}>{v.count.toLocaleString()}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Emission profile per variant */}
              <div className="card">
                <div className="card-header">
                  <span className="card-title">Emission Profile per Variant</span>
                  <span className="card-meta">avg kg CO₂e per trace</span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Variant (steps)</th>
                        <th>Count</th>
                        <th>Freq %</th>
                        <th>Avg kg CO₂e</th>
                        <th>Min kg</th>
                        <th>Max kg</th>
                        <th>Transport</th>
                        <th>Conformance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(varData.top_variants || []).map(v => (
                        <tr key={v.rank}>
                          <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t4)' }}>{v.rank}</td>
                          <td style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t3)', maxWidth: 260 }}>
                            <span style={{
                              display: 'block', overflow: 'hidden',
                              textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }} title={v.variant_str}>{v.variant_str}</span>
                          </td>
                          <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{v.count.toLocaleString()}</td>
                          <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{v.frequency_pct}%</td>
                          <td style={{
                            fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700,
                            color: v.avg_emission_kg > 500 ? 'var(--t4)' : v.avg_emission_kg > 300 ? 'var(--t3)' : 'var(--t2)',
                          }}>{v.avg_emission_kg.toLocaleString()}</td>
                          <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t4)' }}>{v.min_emission_kg.toLocaleString()}</td>
                          <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t4)' }}>{v.max_emission_kg.toLocaleString()}</td>
                          <td>
                            {v.transport_modes?.map(m => (
                              <span key={m} style={{
                                fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700,
                                color: TRANSPORT_COLOR[m] || 'var(--t4)',
                                marginRight: 4,
                              }}>{m}</span>
                            ))}
                          </td>
                          <td>
                            <span style={{
                              fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700,
                              padding: '2px 6px', borderRadius: 3,
                              background: v.is_normative ? 'var(--t2)22' : 'var(--t4)22',
                              color: v.is_normative ? 'var(--t2)' : 'var(--t4)',
                              border: `1px solid ${v.is_normative ? 'var(--t2)44' : 'var(--t4)44'}`,
                            }}>
                              {v.is_normative ? '✓ NORMATIVE' : '✗ DEVIANT'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{
                  marginTop: 12, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t4)',
                  padding: '10px 12px', background: 'var(--bg3)', borderRadius: 8, border: '1px solid var(--b1)',
                  lineHeight: 1.8,
                }}>
                  <span style={{ color: 'var(--t2)' }}>✓ NORMATIVE</span> = contains all mandatory steps + only Sea/Road Freight. &nbsp;
                  <span style={{ color: 'var(--t4)' }}>✗ DEVIANT</span> = uses Air Freight or skips mandatory activities. &nbsp;
                  Upload events.csv in Event Logs to see live clustering.
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* ── TAB: FLOWS ── */}
      {tab === 'flows' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Transition Intelligence</span>
            {mapData && <span className="card-meta">{mapData.edges.length} transitions</span>}
          </div>
          {!mapData
            ? <div className="loading">Loading...</div>
            : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>From</th><th>To</th><th>Cases</th><th>CO₂e (kg)</th>
                  </tr>
                </thead>
                <tbody>
                  {mapData.edges.map((edge, idx) => (
                    <tr key={idx}>
                      <td style={{ color: 'var(--t2)', fontWeight: 600 }}>{edge.source}</td>
                      <td style={{ color: 'var(--t2)' }}>→ {edge.target}</td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{edge.count.toLocaleString()}</td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: 'var(--t2)' }}>
                        {edge.emissions.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        </div>
      )}
    </>
  )
}