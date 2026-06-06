import { useEffect, useState } from 'react'
import { SkeletonCards, SkeletonTable } from '../Skeleton'
import { getRecommendations } from '../api'

export default function Recommendations() {
  const [data, setData] = useState(null)
  const [err,  setErr]  = useState(null)

  useEffect(() => { getRecommendations().then(setData).catch(e => setErr(e.message)) }, [])

  if (err)   return <div className="error-box">API error: {err}</div>
  if (!data) return <SkeletonCards count={3} />

  const { fleet_summary: fs, top_recommendations: recs } = data

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Recommendation Engine</div>
          <div className="page-sub">AI-powered substitution · Carbon reduction · Lower-emission routing</div>
        </div>
      </div>

      {/* Fleet summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
        {[
          { label: 'Current Air CO₂e',    val: (fs.current_air_co2e / 1000).toFixed(1) + 'k', color: 'var(--t2)',    unit: 'kg' },
          { label: 'Optimized (Sea)',       val: (fs.optimized_sea_co2e / 1000).toFixed(1) + 'k', color: 'var(--t2)', unit: 'kg' },
          { label: 'Potential Saving',      val: (fs.potential_saving_kg / 1000).toFixed(1) + 'k', color: 'var(--t2)', unit: 'kg CO₂e' },
          { label: 'Reduction %',           val: fs.reduction_pct + '%', color: 'var(--t2)', unit: 'if all air → sea' },
        ].map(k => (
          <div className="kpi" key={k.label} style={{ borderColor: 'var(--b1)' }}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value" style={{ color: k.color, fontSize: 22 }}>{k.val}</div>
            <div className="kpi-sub">{k.unit}</div>
          </div>
        ))}
      </div>

      <div className="row col-2">
        {/* Top 2 rec cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {recs.slice(0, 4).map(r => (
            <div className="card" key={r.order_id} style={{ background:'var(--bg3)', border:'1px solid #2a2a2a', borderRadius:16 }}>
              <div className="card-header">
                <span className="card-title">Case {r.order_id} — {r.supplier_id}</span>
                <span className="card-meta">CI = {r.carbon_intensity.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="rec-from">
                  <span style={{ fontSize: 22 }}></span>
                  <div>
                    <div className="rec-method" style={{ color: 'var(--t2)' }}>Current: {r.current_mode}</div>
                    <div className="rec-emit">{r.current_emission.toLocaleString()} kg CO₂e · budget {r.budget} kg</div>
                  </div>
                </div>
                <div className="rec-arrow" style={{ color:'var(--t4)', fontSize:22 }}>→ Optimization Route</div>
                <div className="rec-to">
                  <span style={{ fontSize: 22 }}></span>
                  <div>
                    <div className="rec-method" style={{ color: 'var(--t1)' }}>Recommended: {r.recommended_mode}</div>
                    <div className="rec-emit">{r.recommended_emission.toLocaleString()} kg CO₂e · within budget</div>
                  </div>
                </div>
                <div className="saving-chip">
                  <div>
                    <div className="saving-label">POTENTIAL SAVING</div>
                    <div className="saving-val">{r.saving_kg.toLocaleString()} kg</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="saving-label">REDUCTION</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 800, color: 'var(--t2)' }}>{r.saving_pct}%</div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* All recs table + ESG readiness */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card">
            <div className="card-header">
              <span className="card-title">Optimization Opportunities</span>
              <span className="card-meta">Sorted by saving potential</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Supplier</th>
                    <th>Current</th>
                    <th>Sea Saving</th>
                    <th>Reduction</th>
                  </tr>
                </thead>
                <tbody>
                  {recs.map(r => (
                    <tr key={r.order_id}>
                      <td style={{ color: 'var(--t1)', fontWeight:700 }}>{r.order_id}</td>
                      <td>{r.supplier_id}</td>
                      <td style={{ color: 'var(--t3)' }}>{r.current_emission.toLocaleString()}</td>
                      <td style={{ color: 'var(--t2)', fontWeight:700 }}>{r.saving_kg.toLocaleString()}</td>
                      <td style={{ color: 'var(--t2)' }}>{r.saving_pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><span className="card-title">Executive Sustainability Readiness</span></div>
            {[
              ['Scope 3 Transport Data','var(--t2)','READY'],
              ['Supplier ESG Scores','var(--t3)','RATED'],
              ['Carbon Budget Conformance','var(--t2)','ACTIVE'],
              ['Carbon Fitness Score','var(--t3)','COMPUTED'],
              ['Process Variant Analysis','var(--t3)','ANALYTICS'],
              ['OCEL 2.0 Integration','var(--t4)','ROADMAP'],
              ['Celonis Integration','var(--t4)','ROADMAP'],
            ].map(([label, color, status]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--b1)', fontSize: 12 }}>
                <span style={{ color: 'var(--t3)' }}>{label}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color }}>{status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}