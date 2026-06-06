import { useEffect, useState } from 'react'
import { getSuppliers } from '../api'

export default function Suppliers() {
  const [data,   setData]   = useState(null)
  const [err,    setErr]    = useState(null)
  const [filter, setFilter] = useState('all')

  useEffect(() => { getSuppliers().then(setData).catch(e => setErr(e.message)) }, [])

  if (err)   return <div className="error-box">API error: {err}</div>
  if (!data) return <div className="loading">Loading suppliers...</div>

  const suppliers = filter === 'all'
    ? data.suppliers
    : data.suppliers.filter(s => s.rating === filter)

  const maxEmit = data.suppliers[0]?.total_emissions || 1

  const riskColor = () => 'var(--t3)'
  const riskLabel = emit => {
    if (emit > 80000) return ['CRITICAL', 'red']
    if (emit > 50000) return ['HIGH',     'orange']
    if (emit > 30000) return ['MEDIUM',   'amber']
    return ['LOW', 'green']
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Supplier Intelligence</div>
          <div className="page-sub">Risk matrix · Top emitters · ESG ratings across {data.count} suppliers</div>
        </div>
      </div>

      {/* Top 3 callout */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
        {data.suppliers.slice(0, 3).map((s, i) => (
          <div className="card" key={s.supplier_id} style={{ borderColor: 'var(--b1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t4)' }}>#{i + 1} EMITTER</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--t1)', marginTop: 2 }}>{s.supplier_id}</div>
              </div>
              <span className={`rating rating-${s.rating}`}>{s.rating}</span>
            </div>
            <div className="bar-track" style={{ marginBottom: 8 }}>
              <div className="bar-fill" style={{ width: `${(s.total_emissions / maxEmit) * 100}%`, background: riskColor(s.rating) }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t4)' }}>
                {s.total_emissions.toLocaleString()} kg CO₂e
              </span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t3)' }}>
                {s.violations} violations
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">All Suppliers — Ranked by Emissions</span>
          <div className="filter-bar" style={{ marginBottom: 0 }}>
            {['all','A','B','C','D','E'].map(r => (
              <button key={r}
                onClick={() => setFilter(r)}
                style={{
                  background: filter === r ? 'var(--b2)' : 'var(--bg3)',
                  border: '1px solid var(--b1)',
                  color: filter === r ? 'var(--t1)' : 'var(--t3)',
                  fontFamily: 'var(--mono)', fontSize: 11,
                  padding: '4px 10px', borderRadius: 6, cursor: 'pointer'
                }}>
                {r === 'all' ? 'ALL' : r}
              </button>
            ))}
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Supplier</th>
                <th>Rating</th>
                <th>Carbon Intensity</th>
                <th>Total Emissions</th>
                <th>Events</th>
                <th>Violations</th>
                <th>Risk</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.slice(0, 30).map(s => {
                const [rl, rc] = riskLabel(s.total_emissions)
                return (
                  <tr key={s.supplier_id}>
                    <td style={{ color: 'var(--t2)', fontWeight: 700 }}>{s.supplier_id}</td>
                    <td><span className={`rating rating-${s.rating}`}>{s.rating}</span></td>
                    <td style={{ color: 'var(--t2)' }}>{s.carbon_intensity.toFixed(2)}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="bar-track" style={{ width: 60, height: 5 }}>
                          <div className="bar-fill" style={{ width: `${(s.total_emissions / maxEmit) * 100}%`, background: riskColor(s.rating) }} />
                        </div>
                        {s.total_emissions.toLocaleString()}
                      </div>
                    </td>
                    <td>{s.total_events.toLocaleString()}</td>
                    <td style={{ color: 'var(--t2)' }}>
                      {s.violations}
                    </td>
                    <td><span className={`badge ${rc}`}>{rl}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t4)', marginTop: 12, padding: '10px 12px', background: 'var(--bg3)', borderRadius: 8, border: '1px solid var(--b1)' }}>
          Correlation: 100% of CRITICAL-risk suppliers carry E-rating. All E-rated suppliers should be flagged for ESG audit.
        </div>
      </div>
    </>
  )
}