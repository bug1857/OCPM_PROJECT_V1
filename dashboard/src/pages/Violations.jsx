import { useEffect, useState } from 'react'
import { SkeletonCards, SkeletonTable } from '../Skeleton'
import { getViolations } from '../api'

export default function Violations() {
  const [data,   setData]   = useState(null)
  const [err,    setErr]    = useState(null)
  const [vtype,  setVtype]  = useState('')
  const [supId,  setSupId]  = useState('')
  const [page,   setPage]   = useState(0)
  const LIMIT = 20

  useEffect(() => {
    setPage(0)
    const params = { limit: LIMIT, offset: 0 }
    if (vtype) params.violation_type = vtype
    if (supId) params.supplier_id    = supId.toUpperCase()
    getViolations(params).then(setData).catch(e => setErr(e.message))
  }, [vtype, supId])

  const goPage = (p) => {
    const params = { limit: LIMIT, offset: p * LIMIT }
    if (vtype) params.violation_type = vtype
    if (supId) params.supplier_id    = supId.toUpperCase()
    getViolations(params).then(d => { setData(d); setPage(p) }).catch(e => setErr(e.message))
  }

  const fitnessColor = () => 'var(--t3)'

  const vtypeBadge = vt => {
    if (!vt) return null
    if (vt.toLowerCase().includes('carbon'))  return <span className="badge red">{vt}</span>
    if (vt.toLowerCase().includes('process')) return <span className="badge orange">{vt}</span>
    return <span className="badge purple">{vt}</span>
  }

  // Always use backend totals. Never derive counts from the current page.
  const carbonCount = Number(data?.carbon_violations || 0)
  const processCount = Number(data?.process_violations || 0)
  const dataCount = Number(data?.data_violations || 0)

  console.log('Violation counts:', {
    carbon: carbonCount,
    process: processCount,
    data: dataCount,
    total: data?.total,
    selectedType: vtype,
  })

  const worstViolation = data?.violations?.reduce((a, b) =>
    (a?.total_emission || a?.total_emissions || 0) > (b?.total_emission || b?.total_emissions || 0) ? a : b,
    null
  )

  // BUG-F1 FIX: avgFitness is now explicitly labeled as page-level average only
  const avgFitness = data?.violations?.length
    ? (data.violations.reduce((s, v) => s + (Number(v.carbon_fitness) || 0), 0) / data.violations.length) || 0
    : 0

  const passRate = Math.round(avgFitness * 100)
  const isFiltered = !!(vtype || supId)

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Sustainability Violations Explorer</div>
          <div className="page-sub">Carbon + Process + Data Quality violations · Filterable · Paginated</div>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
        <div className="card vtype carbon" style={{ padding: '14px 16px' }}>
          <div className="vtype-name" style={{ color: 'var(--t2)' }}>Carbon Violation</div>
          <div className="vtype-sub">Forced Air Freight — budget exceeded</div>
          <div className="vtype-count" style={{ color: 'var(--t2)', marginTop: 8 }}>
            {carbonCount.toLocaleString()}
          </div>
        </div>
        <div className="card vtype process" style={{ padding: '14px 16px' }}>
          <div className="vtype-name" style={{ color: 'var(--t2)' }}>Process Violation</div>
          <div className="vtype-sub">Missing / duplicate warehouse transfer</div>
          <div className="vtype-count" style={{ color: 'var(--t2)', marginTop: 8 }}>
            {processCount.toLocaleString()}
          </div>
        </div>
        <div className="card vtype data" style={{ padding: '14px 16px' }}>
          <div className="vtype-name" style={{ color: 'var(--t2)' }}>Data Quality Issue</div>
          <div className="vtype-sub">Random logging anomaly injection</div>
          <div className="vtype-count" style={{ color: 'var(--t2)', marginTop: 8 }}>
            {dataCount.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Conformance comparison */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Traditional vs Carbon-Aware Conformance</span>
          <span className="card-meta">Core research contribution</span>
        </div>
        <div className="row col-2">
          <div className="card" style={{ background:'var(--bg2)', border:'1px solid var(--b1)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
              <div>
                <div className="conf-label">LEGACY PROCESS VIEW</div>
                <div style={{ fontSize:18, fontWeight:700, color:'var(--t1)' }}>Sequence Conformance</div>
              </div>
              <div className="badge green">PASS</div>
            </div>

            <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap', marginTop:18 }}>
              <div className="pill pass">Create Order</div>
              <span>→</span>
              <div className="pill pass">Goods Issue</div>
              <span>→</span>
              <div className="pill pass">Air Freight</div>
              <span>→</span>
              <div className="pill pass">Delivery</div>
            </div>

            <div style={{ marginTop:24, padding:'14px', border:'1px solid var(--b1)', borderRadius:10 }}>
              <div style={{ fontSize:28, fontWeight:800, color:'var(--t1)' }}>
                {passRate}%
              </div>
              <div className="card-meta">
                Avg carbon fitness — current page {isFiltered ? "(filtered)" : ""}
              </div>
            </div>
          </div>

          <div className="card" style={{ background:'var(--bg2)', border:'1px solid var(--b1)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
              <div>
                <div className="conf-label">SUSTAINABILITY-AWARE VIEW</div>
                <div style={{ fontSize:18, fontWeight:700, color:'var(--t1)' }}>Carbon Conformance</div>
              </div>
              <div className="badge red">FAIL</div>
            </div>

            <div style={{ marginTop:18 }}>
              {worstViolation && (
                <>
                  <div className="pill fail">
                    Worst Case · {worstViolation.order_id}
                  </div>
                  <div style={{ marginTop:12, fontFamily:'var(--mono)', color:'var(--t2)' }}>
                    Supplier {worstViolation.supplier_id}
                  </div>
                  <div style={{ marginTop:8, color:'var(--t4)' }}>
                    Emission: {Number(worstViolation.total_emission ?? worstViolation.total_emissions ?? 0).toLocaleString()} kg CO₂e
                  </div>
                  <div style={{ marginTop:8, color:'var(--t4)', fontWeight:700 }}>
                    Overshoot: +{(worstViolation.total_emissions - (worstViolation.budget ?? worstViolation.carbon_budget ?? 0)).toFixed(1)} kg
                  </div>
                </>
              )}
            </div>

            <div style={{ marginTop:24, padding:'14px', border:'1px solid var(--b1)', borderRadius:10 }}>
              <div style={{ fontSize:28, fontWeight:800, color:'var(--t1)' }}>
                {worstViolation ? `${worstViolation.budget ?? worstViolation.carbon_budget ?? '—'} kg` : '—'}
              </div>
              <div className="card-meta">
                {worstViolation
                  ? `Budget exceeded by ${(worstViolation.total_emissions - (worstViolation.budget ?? worstViolation.carbon_budget ?? 0)).toFixed(1)} kg CO₂e`
                  : 'No violation data available'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filterable table */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Violation Explorer</span>
          {data && <span className="card-meta">{(data.total || 0).toLocaleString()} results</span>}
          {data && <span className="card-meta">Top Supplier: {worstViolation?.supplier_id || 'N/A'}</span>}
        </div>
        <div className="filter-bar">
          <select value={vtype} onChange={e => setVtype(e.target.value)}>
            <option value="">All Types</option>
            <option value="carbon">Carbon</option>
            <option value="process">Process</option>
            <option value="data">Data Quality</option>
          </select>
          <input
            placeholder="Filter by supplier (e.g. S025)"
            value={supId}
            onChange={e => setSupId(e.target.value)}
            style={{ width: 220 }}
          />
        </div>

        {err   && <div className="error-box">{err}</div>}
        {!data && <div className="loading">Loading...</div>}
        {data && (
          <>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Supplier</th>
                  <th>Emission (kg)</th>
                  <th>Budget (kg)</th>
                  <th>Overshoot</th>
                  <th>Carbon Fitness</th>
                  <th>Violation Type</th>
                </tr>
              </thead>
              <tbody>
                {data.violations.map(v => (
                  <tr key={v.order_id}>
                    <td style={{ color: 'var(--t2)', fontWeight: 700 }}>{v.order_id}</td>
                    <td>{v.supplier_id}</td>
                    <td style={{ color: 'var(--t2)' }}>{Number(v.total_emissions || 0).toLocaleString()}</td>
                    <td style={{ color: 'var(--t4)' }}>{v.budget ?? v.carbon_budget ?? '—'}</td>
                    <td style={{
                      color:
                        (v.total_emissions - (v.budget ?? v.carbon_budget ?? 0)) > 500
                          ? 'var(--t4)'
                          : (v.total_emissions - (v.budget ?? v.carbon_budget ?? 0)) > 200
                          ? 'var(--t3)'
                          : 'var(--t2)'
                    }}>+{(v.total_emissions - (v.budget ?? v.carbon_budget ?? 0)).toFixed(1)}</td>
                    <td style={{ color: fitnessColor(v.carbon_fitness), fontWeight: 700 }}>
                      {v.carbon_fitness.toFixed(3)}
                    </td>
                    <td>{vtypeBadge(v.violation_type)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t4)' }}>
                Showing {page * LIMIT + 1}–{Math.min((page + 1) * LIMIT, data.total)} of {(data.total || 0).toLocaleString()}
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => goPage(page - 1)} disabled={page === 0}
                  style={{ background: 'var(--bg3)', border: '1px solid var(--b1)', color: 'var(--t3)', fontFamily: 'var(--mono)', fontSize: 11, padding: '5px 12px', borderRadius: 6, cursor: 'pointer', opacity: page === 0 ? 0.4 : 1 }}>
                  ← Prev
                </button>
                <button onClick={() => goPage(page + 1)} disabled={(page + 1) * LIMIT >= data.total}
                  style={{ background: 'var(--bg3)', border: '1px solid var(--b1)', color: 'var(--t3)', fontFamily: 'var(--mono)', fontSize: 11, padding: '5px 12px', borderRadius: 6, cursor: 'pointer', opacity: (page + 1) * LIMIT >= data.total ? 0.4 : 1 }}>
                  Next →
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}