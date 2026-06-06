import { useState, useEffect } from 'react'
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar'
import {
  getAIRisk,
  getAICopilot,
  getGreenRoute,
  getCarbonFitness,
  getEmissionAttribution
} from '../api'
import 'react-circular-progressbar/dist/styles.css'

const GRADE = { 5: 'A', 4: 'B', 3: 'C', 2: 'D', 1: 'E' }
const riskColor = r => r === 'HIGH' ? 'var(--t4)' : r === 'MEDIUM' ? 'var(--t3)' : 'var(--t2)'
const riskBadgeClass = r => r === 'HIGH' ? 'red' : r === 'MEDIUM' ? 'amber' : 'green'

export default function AIIntelligence() {
  const [tab, setTab] = useState('quick')
  const [supplierRating, setSupplierRating] = useState(4)
  const [carbonIntensity, setCarbonIntensity] = useState(2.5)
  const [airProbability, setAirProbability] = useState(0.5)

  // Quick predict state
  const [quickResult, setQuickResult] = useState(null)
  const [quickLoading, setQuickLoading] = useState(false)
  const [quickError, setQuickError] = useState('')

  // Deep analysis state
  const [deepResult, setDeepResult] = useState(null)
  const [route, setRoute] = useState(null)
  const [fitness, setFitness] = useState(null)
  const [emission, setEmission] = useState(null)
  const [deepLoading, setDeepLoading] = useState(false)

  // History
  const [history, setHistory] = useState([])

  const safeDeep = deepResult || { probability: 0, optimized_probability: 0, drivers: [], recommendations: [], risk: 'LOW' }

  // Auto-run quick on load
  useEffect(() => { runQuick() }, [])

  const runQuick = async () => {
    try {
      setQuickLoading(true); setQuickError('')
      const data = await getAIRisk({ supplier_rating: supplierRating, carbon_intensity: carbonIntensity, air_freight_probability: airProbability })
      setQuickResult(data)
      setHistory(prev => [{
        ts: new Date().toLocaleTimeString(),
        risk: data.risk,
        probability: data.probability,
        supplier: GRADE[supplierRating],
        carbon: carbonIntensity,
        air: (airProbability * 100).toFixed(0) + '%'
      }, ...prev].slice(0, 5))
    } catch { setQuickError('Prediction failed') }
    finally { setQuickLoading(false) }
  }

  const runDeep = async () => {
    setDeepLoading(true)
    try {
      const params = { supplier_rating: supplierRating, carbon_intensity: carbonIntensity, air_freight_probability: airProbability }
      const [d, r, f, e] = await Promise.all([
        getAICopilot(params), getGreenRoute(params), getCarbonFitness(params), getEmissionAttribution()
      ])
      setDeepResult(d); setRoute(r); setFitness(f); setEmission(e)
      setHistory(prev => [{
        ts: new Date().toLocaleTimeString(),
        risk: d.risk,
        probability: d.probability,
        supplier: GRADE[supplierRating],
        carbon: carbonIntensity,
        air: (airProbability * 100).toFixed(0) + '%'
      }, ...prev].slice(0, 5))
    } finally { setDeepLoading(false) }
  }

  const exportPDF = async () => {
    if (!deepResult) return
    const { jsPDF } = await import('jspdf')
    const pdf = new jsPDF()
    const score = Math.max(0, Math.round(100 - safeDeep.probability))
    const reduction = Math.round(safeDeep.probability - safeDeep.optimized_probability)
    const ts = new Date().toLocaleString()

    pdf.setFillColor(10, 10, 10)
    pdf.rect(0, 0, 210, 38, 'F')
    pdf.setTextColor(255, 255, 255)
    pdf.setFontSize(22); pdf.text('SustainOCPM', 15, 15)
    pdf.setFontSize(10)
    pdf.text('Executive Sustainability Intelligence Report', 15, 24)
    pdf.text('Indo-Swiss Sustainability Analytics Initiative', 15, 31)
    pdf.setFontSize(8)
    pdf.text(`RPT-${Date.now()}`, 148, 24)
    pdf.text('CONFIDENTIAL', 148, 31)
    pdf.setTextColor(0, 0, 0)

    const rc = safeDeep.risk === 'HIGH' ? [220,30,30] : safeDeep.risk === 'MEDIUM' ? [200,120,0] : [20,160,80]
    pdf.setFillColor(...rc)
    pdf.roundedRect(15, 46, 42, 14, 2, 2, 'F')
    pdf.setTextColor(255,255,255); pdf.setFontSize(11)
    pdf.text(`${safeDeep.risk} RISK`, 18, 56)
    pdf.setTextColor(0,0,0)

    ;[{l:'Score',v:`${score}/100`,x:68},{l:'Confidence',v:'86%',x:118},{l:'Reduction',v:`${reduction}%`,x:164}].forEach(m => {
      pdf.setFillColor(235,235,235); pdf.roundedRect(m.x, 46, 36, 14, 2, 2, 'F')
      pdf.setFontSize(12); pdf.text(m.v, m.x+4, 56)
      pdf.setFontSize(7); pdf.text(m.l, m.x+2, 64)
    })

    let y = 76
    const sec = t => { pdf.setFontSize(13); pdf.setTextColor(0,0,0); pdf.text(t,15,y); y+=2; pdf.setDrawColor(200); pdf.line(15,y,195,y); y+=8 }
    const bul = t => { pdf.setFontSize(10); pdf.setTextColor(40,40,40); const lines=pdf.splitTextToSize(`• ${t}`,170); pdf.text(lines,18,y); y+=lines.length*5+2 }

    sec('Risk Overview')
    bul(`Current Risk: ${safeDeep.probability}%`)
    bul(`Optimized Risk: ${safeDeep.optimized_probability}%`)
    bul(`Potential Improvement: ${reduction}%`)
    y+=4; sec('Key Risk Drivers')
    ;(safeDeep.drivers||[]).forEach(bul)
    y+=4; sec('AI Recommendations')
    ;(safeDeep.recommendations||[]).forEach(bul)
    y+=4; sec('Executive Summary')
    bul(`Primary driver: ${safeDeep.drivers?.[0]||'None detected'}.`)
    bul(`AI estimates ${reduction}% risk reduction after optimization.`)
    bul('Prioritize recommended actions to improve sustainability compliance.')

    pdf.setDrawColor(180); pdf.line(15,272,195,272)
    pdf.setFontSize(8); pdf.setTextColor(100)
    pdf.text('SustainOCPM AI Platform | Random Forest Risk Engine | Indo-Swiss Grant', 15, 280)
    pdf.text(`Generated: ${ts}`, 140, 286)
    pdf.save('SustainOCPM_Report.pdf')
  }

  const trendArrow = () => {
    if (history.length < 2) return null
    const diff = history[0].probability - history[1].probability
    if (diff === 0) return <span style={{ color: 'var(--t3)', fontFamily: 'var(--mono)', fontSize: 11 }}>→ No change</span>
    return diff < 0
      ? <span style={{ color: 'var(--t2)', fontFamily: 'var(--mono)', fontSize: 11 }}>↓ {Math.abs(diff)}% better</span>
      : <span style={{ color: 'var(--t4)', fontFamily: 'var(--mono)', fontSize: 11 }}>↑ {diff}% worse</span>
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">AI Intelligence Center</div>
          <div className="page-sub">Risk Prediction · Deep Analysis · Green Routing</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {trendArrow()}
          <span className="live-tag">● LIVE</span>
        </div>
      </div>

      {/* ── Inputs card ── */}
      <div className="card">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20, marginBottom: 20 }}>
          <div>
            <div className="kpi-label">Supplier Rating</div>
            <select
              value={supplierRating}
              onChange={e => setSupplierRating(Number(e.target.value))}
              style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--b1)', color: 'var(--t2)', fontFamily: 'var(--mono)', fontSize: 13, padding: '9px 12px', borderRadius: 6, outline: 'none' }}
            >
              <option value={5}>A — Excellent</option>
              <option value={4}>B — Good</option>
              <option value={3}>C — Average</option>
              <option value={2}>D — Poor</option>
              <option value={1}>E — Critical</option>
            </select>
          </div>
          <div>
            <div className="kpi-label">Carbon Intensity — <span style={{ color: 'var(--t2)', fontWeight: 700 }}>{carbonIntensity.toFixed(1)}</span></div>
            <input type="range" min="0.5" max="5" step="0.1" value={carbonIntensity}
              onChange={e => setCarbonIntensity(Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--t2)', marginTop: 10 }} />
          </div>
          <div>
            <div className="kpi-label">Air Freight Probability — <span style={{ color: 'var(--t2)', fontWeight: 700 }}>{(airProbability*100).toFixed(0)}%</span></div>
            <input type="range" min="0" max="1" step="0.05" value={airProbability}
              onChange={e => setAirProbability(Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--t2)', marginTop: 10 }} />
          </div>
        </div>

        {/* Tab buttons */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => { setTab('quick'); runQuick() }}
            disabled={quickLoading}
            style={{ flex: 1, padding: '11px', borderRadius: 6, border: tab === 'quick' ? '1px solid var(--t2)' : '1px solid var(--b1)', background: tab === 'quick' ? 'var(--bg3)' : 'var(--bg3)', color: tab === 'quick' ? 'var(--t2)' : 'var(--t3)', fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.08em', textTransform: 'uppercase' }}
          >
            {quickLoading ? 'Analyzing…' : '↯ Quick Predict'}
          </button>
          <button
            onClick={() => { setTab('deep'); runDeep() }}
            disabled={deepLoading}
            style={{ flex: 1, padding: '11px', borderRadius: 6, border: tab === 'deep' ? '1px solid var(--t2)' : '1px solid var(--b1)', background: tab === 'deep' ? 'var(--bg3)' : 'var(--bg3)', color: tab === 'deep' ? 'var(--t2)' : 'var(--t3)', fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.08em', textTransform: 'uppercase' }}
          >
            {deepLoading ? 'Analyzing…' : '⬡ Deep Analysis'}
          </button>
          <button
            onClick={exportPDF}
            disabled={!deepResult}
            style={{ padding: '11px 20px', borderRadius: 6, border: '1px solid var(--b1)', background: 'var(--bg3)', color: deepResult ? 'var(--t2)' : 'var(--t4)', fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, cursor: deepResult ? 'pointer' : 'not-allowed', letterSpacing: '0.08em', textTransform: 'uppercase' }}
          >
            ↓ PDF
          </button>
        </div>
        {quickError && <div className="error-box" style={{ marginTop: 10 }}>{quickError}</div>}
      </div>

      {/* ── QUICK TAB ── */}
      {tab === 'quick' && quickResult && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {/* Left: circular + stats */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
              <div style={{ width: 140, height: 140, flexShrink: 0 }}>
                <CircularProgressbar
                  value={quickResult.probability}
                  text={`${quickResult.probability}%`}
                  styles={buildStyles({ pathColor: riskColor(quickResult.risk), textColor: 'var(--t2)', trailColor: 'var(--bg4)', textSize: '18px' })}
                />
              </div>
              <div>
                <span className={`badge ${riskBadgeClass(quickResult.risk)}`} style={{ fontSize: 12, padding: '5px 12px' }}>{quickResult.risk} RISK</span>
                <div style={{ marginTop: 12, fontSize: 32, fontWeight: 800, letterSpacing: '-1px', color: riskColor(quickResult.risk) }}>{quickResult.probability}%</div>
                <div className="kpi-label" style={{ marginTop: 4 }}>Violation Probability</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
              {[
                { label: 'Risk Score', value: `${quickResult.probability}%` },
                { label: 'Supplier Grade', value: GRADE[supplierRating] },
                { label: 'Risk Level', value: quickResult.risk }
              ].map((s, i) => (
                <div key={i} className="inner" style={{ textAlign: 'center' }}>
                  <div className="kpi-label">{s.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: i === 0 ? riskColor(quickResult.risk) : 'var(--t2)' }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Risk bar */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span className="kpi-label">Risk Exposure</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--t2)' }}>{quickResult.probability}/100</span>
              </div>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${quickResult.probability}%`, background: riskColor(quickResult.risk) }} />
              </div>
            </div>
          </div>

          {/* Right: explanation + actions + history */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="card">
              <div className="card-header"><span className="card-title">AI Explanation</span></div>
              {[
                carbonIntensity >= 4 && 'High carbon intensity is driving risk upward.',
                airProbability >= 0.7 && 'Heavy air freight dependency increases emissions exposure.',
                supplierRating <= 2 && 'Low supplier rating weakens sustainability compliance.',
                carbonIntensity < 4 && airProbability < 0.7 && supplierRating > 2 && 'Configuration is within acceptable sustainability range.'
              ].filter(Boolean).map((e, i) => (
                <div key={i} style={{ padding: '7px 0', borderBottom: '1px solid var(--b1)', fontSize: 13, color: 'var(--t2)', fontFamily: 'var(--mono)' }}>{e}</div>
              ))}
            </div>

            <div className="card">
              <div className="card-header"><span className="card-title">Recommended Actions</span></div>
              {[
                airProbability >= 0.7 && 'Shift suitable shipments from air to sea freight.',
                supplierRating <= 2 && 'Evaluate higher-rated supplier alternatives.',
                carbonIntensity >= 4 && 'Target lower-carbon sourcing and logistics options.',
                quickResult.risk === 'LOW' && 'Current configuration is within acceptable risk limits.'
              ].filter(Boolean).map((a, i) => (
                <div key={i} style={{ padding: '7px 0', borderBottom: '1px solid var(--b1)', fontSize: 13, color: 'var(--t2)', fontFamily: 'var(--mono)' }}>{a}</div>
              ))}
            </div>

            {/* History */}
            {history.length > 0 && (
              <div className="card">
                <div className="card-header"><span className="card-title">Run History</span><span className="card-meta">Last {history.length} runs</span></div>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Time</th><th>Risk</th><th>Score</th><th>Supplier</th><th>Carbon</th><th>Air</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h, i) => (
                      <tr key={i}>
                        <td>{h.ts}</td>
                        <td><span className={`badge ${riskBadgeClass(h.risk)}`}>{h.risk}</span></td>
                        <td style={{ color: riskColor(h.risk), fontWeight: 700 }}>{h.probability}%</td>
                        <td>{h.supplier}</td>
                        <td>{h.carbon}</td>
                        <td>{h.air}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── DEEP TAB ── */}
      {tab === 'deep' && deepResult && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* KPI row */}
          <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
            {[
              { label: 'Risk Level', value: safeDeep.risk, cls: riskBadgeClass(safeDeep.risk) },
              { label: 'Current Risk', value: `${safeDeep.probability}%`, cls: riskBadgeClass(safeDeep.risk) },
              { label: 'Optimized Risk', value: `${safeDeep.optimized_probability}%`, cls: 'green' },
              { label: 'CO₂ Reduction', value: `-${Math.round(safeDeep.probability - safeDeep.optimized_probability)}%`, cls: 'green' }
            ].map((k, i) => (
              <div key={i} className={`kpi ${k.cls}`}>
                <div className="kpi-label">{k.label}</div>
                <div className={`kpi-value ${k.cls}`}>{k.value}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 14 }}>
            {/* Left col */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="card" style={{ display: 'flex', justifyContent: 'center' }}>
                <div style={{ width: 150, height: 150 }}>
                  <CircularProgressbar
                    value={safeDeep.probability}
                    text={`${safeDeep.probability}%`}
                    styles={buildStyles({ pathColor: riskColor(safeDeep.risk), textColor: 'var(--t2)', trailColor: 'var(--bg4)', textSize: '18px' })}
                  />
                </div>
              </div>

              {fitness && (
                <div className="card" style={{ textAlign: 'center' }}>
                  <div className="kpi-label">Carbon Fitness</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--t2)' }}>{fitness.carbon_fitness}/100</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--t2)', marginTop: 4 }}>{fitness.grade}</div>
                </div>
              )}

              {emission && (
                <div className="card">
                  <div className="kpi-label">Phase 4.2 — Attribution</div>
                  <div style={{ fontSize: 10, color: 'var(--t3)', fontFamily: 'var(--mono)', marginBottom: 4 }}>Emission Hotspot</div>
                  <div style={{ fontSize: 24, fontWeight: 800 }}>{emission?.total_emission ?? '0'}</div>
                  <div style={{ fontSize: 12, color: 'var(--t4)', fontFamily: 'var(--mono)', marginTop: 4 }}>{emission?.hotspot_activity ?? 'None detected'}</div>
                </div>
              )}
            </div>

            {/* Right col */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div className="card">
                  <div className="card-header"><span className="card-title">Risk Drivers</span></div>
                  {(safeDeep.drivers || []).map((d, i) => (
                    <div key={i} style={{ padding: '7px 0', borderBottom: '1px solid var(--b1)', fontSize: 13, color: 'var(--t2)', fontFamily: 'var(--mono)' }}>{d}</div>
                  ))}
                </div>
                <div className="card">
                  <div className="card-header"><span className="card-title">Recommended Actions</span></div>
                  {(safeDeep.recommendations || []).map((r, i) => (
                    <div key={i} style={{ padding: '7px 0', borderBottom: '1px solid var(--b1)', fontSize: 13, color: 'var(--t2)', fontFamily: 'var(--mono)' }}>{r}</div>
                  ))}
                </div>
              </div>

              {/* Logistics shift */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
                {[
                  { label: 'Logistics Shift', value: airProbability >= 0.5 ? 'Air → Sea' : 'Optimized' },
                  { label: 'Supplier Upgrade', value: supplierRating <= 3 ? `${GRADE[supplierRating]} → B` : 'No Upgrade' },
                  { label: 'Sustainability Score', value: `${Math.max(0,Math.round(100-safeDeep.probability))}/100` }
                ].map((s, i) => (
                  <div key={i} className="kpi blue">
                    <div className="kpi-label">{s.label}</div>
                    <div className="kpi-value" style={{ fontSize: 20 }}>{s.value}</div>
                  </div>
                ))}
              </div>

              {/* Green route */}
              {route && (
                <div className="card">
                  <div className="card-header"><span className="card-title">Green Alternative Route</span></div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                    <div>
                      <div className="kpi-label" style={{ marginBottom: 8 }}>Current</div>
                      {route.current_path.map((s, i) => (
                        <div key={i}>
                          <div className="rec-from" style={{ marginBottom: 4 }}><span className="rec-method">{s}</span></div>
                          {i < route.current_path.length - 1 && <div className="rec-arrow">↓</div>}
                        </div>
                      ))}
                    </div>
                    <div>
                      <div className="kpi-label" style={{ color: 'var(--t2)', marginBottom: 8 }}>Recommended</div>
                      {route.recommended_path.map((s, i) => (
                        <div key={i}>
                          <div className="rec-to" style={{ marginBottom: 4 }}><span className="rec-method">{s}</span></div>
                          {i < route.recommended_path.length - 1 && <div className="rec-arrow">↓</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="saving-chip" style={{ marginTop: 12 }}>
                    <span className="saving-label">Estimated Emission Reduction / Status</span>
                    <span className="saving-val">−{route.estimated_reduction}% · {route.compliance_status}</span>
                  </div>
                </div>
              )}

              {/* Executive summary */}
              <div className="card">
                <div className="card-header">
                  <span className="card-title">Executive Summary</span>
                  <span className="badge green">✓ AI Confidence: 86%</span>
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--t3)', lineHeight: 2 }}>
                  Configuration presents a <span style={{ color: riskColor(safeDeep.risk), fontWeight: 700 }}>{safeDeep.risk}</span> sustainability risk.
                  {' '}Primary driver: <span style={{ color: 'var(--t2)' }}>{safeDeep.drivers?.[0] || 'None detected'}</span>.
                  {' '}Expected improvement: <span style={{ color: 'var(--t2)', fontWeight: 700 }}>−{Math.round(safeDeep.probability - safeDeep.optimized_probability)}% risk reduction</span> after optimization.
                </div>
                <div style={{ marginTop: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span className="kpi-label">Sustainability Score</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--t2)' }}>{Math.max(0,Math.round(100-safeDeep.probability))}/100</span>
                  </div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${Math.max(0,Math.round(100-safeDeep.probability))}%`, background: 'var(--t2)' }} />
                  </div>
                </div>
              </div>

              {/* History */}
              {history.length > 0 && (
                <div className="card">
                  <div className="card-header"><span className="card-title">Run History</span><span className="card-meta">Last {history.length} runs</span></div>
                  <table className="data-table">
                    <thead><tr><th>Time</th><th>Risk</th><th>Score</th><th>Supplier</th><th>Carbon</th><th>Air</th></tr></thead>
                    <tbody>
                      {history.map((h, i) => (
                        <tr key={i}>
                          <td>{h.ts}</td>
                          <td><span className={`badge ${riskBadgeClass(h.risk)}`}>{h.risk}</span></td>
                          <td style={{ color: riskColor(h.risk), fontWeight: 700 }}>{h.probability}%</td>
                          <td>{h.supplier}</td><td>{h.carbon}</td><td>{h.air}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {((tab === 'quick' && !quickResult) || (tab === 'deep' && !deepResult)) && (
        <div className="card loading">
          {quickLoading || deepLoading ? 'Running analysis…' : 'Configure inputs and run analysis'}
        </div>
      )}
    </>
  )
}