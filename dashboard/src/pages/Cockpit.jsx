import { useEffect, useState } from 'react'
import { SkeletonPage } from '../Skeleton'
import { getKPIs } from '../api'

export default function Cockpit() {
  const [data, setData] = useState(null)
  const [err,  setErr]  = useState(null)

  useEffect(() => { getKPIs().then(setData).catch(e => setErr(e.message)) }, [])

  if (err)   return <div className="error-box">API error: {err}</div>
  if (!data) return <SkeletonPage />

  const transportPct = 71.1
  const fitnessData = [
    { label: 'Standard Orders (budget: 150 kg)', score: 0.62, color: 'var(--t3)' },
    { label: 'International Orders (budget: 250 kg)', score: 0.79, color: 'var(--t2)' },
    { label: 'Urgent Orders (budget: 300 kg)', score: 0.84, color: 'var(--t1)' },
    { label: 'Worst Case O08863 via S025', score: 0.33, color: 'var(--t4)' },
  ]

  const compliance = Number(data.compliance_pct) || 0
  const circ = 2 * Math.PI * 65
  const greenDash = circ * (compliance / 100)
  const redDash   = circ * ((100 - compliance) / 100)

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Executive Sustainability Cockpit</div>
          <div className="page-sub">OCEL 2.0 · Object-Centric Process Mining · ESG Compliance</div>
        </div>
        <div className="live-tag">LIVE ANALYSIS</div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid">
        <div className="kpi blue">
          <div className="kpi-label">Total Orders</div>
          <div className="kpi-value blue">{data.total_orders.toLocaleString()}</div>
          <div className="kpi-sub">50 suppliers · 20 warehouses</div>
        </div>
        <div className="kpi red">
          <div className="kpi-label">Violations</div>
          <div className="kpi-value red">{data.violations.toLocaleString()}</div>
          <div className="kpi-sub">{(100 - data.compliance_pct).toFixed(2)}% of orders</div>
        </div>
        <div className="kpi green">
          <div className="kpi-label">Compliance Rate</div>
          <div className="kpi-value green">{data.compliance_pct}%</div>
          <div className="kpi-sub">{(data.total_orders - data.violations).toLocaleString()} passing</div>
        </div>
        <div className="kpi amber">
          <div className="kpi-label">Avg Emission</div>
          <div className="kpi-value amber">{Math.round(data.avg_emission_kg)}</div>
          <div className="kpi-sub">kg CO₂e per order</div>
        </div>
        <div className="kpi purple">
          <div className="kpi-label">Total CO₂e</div>
          <div className="kpi-value purple">{((data.total_co2e_kg || 0) / 1e6).toFixed(2)}M</div>
          <div className="kpi-sub">kg · Scope 3 emissions</div>
        </div>
      </div>

      <div className="row col-3-2" style={{ marginBottom: '20px' }}>

        <div className="card">
          <div className="card-header">
            <span className="card-title">AI Sustainability Summary</span>
            <span className="card-meta">Executive Intelligence Layer</span>
          </div>

          <div style={{ lineHeight: '2' }}>
            <div>• {data.violations.toLocaleString()} sustainability violations detected</div>
            <div>• Transport contributes 71.1% of total emissions</div>
            <div>• Air Freight remains the dominant carbon risk factor</div>
            <div>• Potential reduction opportunity: 65%</div>
            <div>• AI-powered sustainability optimization active</div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">AI Model Status</span>
            <span className="card-meta">Random Forest Risk Engine</span>
          </div>

          <div style={{ display: 'grid', gap: '10px' }}>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Accuracy</span>
              <strong style={{ color: 'var(--t1)' }}>86.0%</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Precision</span>
              <strong style={{ color: 'var(--t2)' }}>90.7%</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Recall</span>
              <strong style={{ color: 'var(--t3)' }}>65.6%</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>F1 Score</span>
              <strong style={{ color: 'var(--t1)' }}>76.1%</strong>
            </div>

            <div style={{ marginTop: '10px' }}>
              <span className="pill pass">Research Intelligence Active</span>
            </div>
          </div>
        </div>

      </div>

      <div className="row col-3-2">
        {/* Carbon Fitness */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Carbon Fitness Score — by Order Type</span>
            <span className="card-meta">CarbonFitness = min(1, Budget / Actual)</span>
          </div>
          {fitnessData.map(f => (
            <div className="fitness-row" key={f.label}>
              <span className="fitness-label">{f.label}</span>
              <div className="fitness-bar-wrap">
                <div className="fitness-bar" style={{ width: `${f.score * 100}%`, background: f.color }} />
              </div>
              <span className="fitness-score" style={{ color: f.color }}>{f.score.toFixed(2)}</span>
            </div>
          ))}
          <div className="inner" style={{ marginTop: 16 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
              Transport Contribution to Total Emissions
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="bar-track" style={{ flex: 1, height: 14 }}>
                <div className="bar-fill" style={{ width: `${transportPct}%`, background: 'var(--t3)' }} />
              </div>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 800, color: 'var(--t1)' }}>{transportPct}%</span>
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t4)', marginTop: 4 }}>
              1,615,069 kg of {data.total_co2e_kg.toLocaleString()} kg total
            </div>
          </div>
        </div>

        {/* Gauge */}
        <div className="card">
          <div className="card-header"><span className="card-title">Compliance Status</span></div>
          <div className="gauge-wrap">
            <div style={{ position: 'relative', width: 160, height: 160 }}>
              <svg viewBox="0 0 160 160" width="160" height="160">
                <circle cx="80" cy="80" r="65" fill="none" stroke="var(--bg4)" strokeWidth="12" />
                <circle cx="80" cy="80" r="65" fill="none" stroke="var(--t2)" strokeWidth="12"
                  strokeDasharray={`${greenDash} ${circ}`} strokeLinecap="round"
                  transform="rotate(-90 80 80)" />
                <circle cx="80" cy="80" r="65" fill="none" stroke="var(--b3)" strokeWidth="12"
                  strokeDasharray={`${redDash} ${circ}`} strokeLinecap="round" opacity="0.5"
                  transform={`rotate(${-90 + (compliance / 100) * 360} 80 80)`} />
              </svg>
              <div className="gauge-center">
                <div className="gauge-pct">{data.compliance_pct}</div>
                <div className="gauge-lbl">% COMPLIANT</div>
              </div>
            </div>
            <div className="pills">
              <span className="pill pass">{(data.total_orders - data.violations).toLocaleString()} Compliant</span>
              <span className="pill fail">{data.violations.toLocaleString()} Exceptions</span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
            <div className="inner" style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t4)', marginBottom: 4 }}>MAX EMISSION</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 800, color: 'var(--t3)' }}>{data.max_emission_kg} kg</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t4)' }}>CO₂e</div>
            </div>
            <div className="inner" style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t4)', marginBottom: 4 }}>SCOPE 3 SHARE</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 800, color: 'var(--t1)' }}>71.1%</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t4)' }}>transport</div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}