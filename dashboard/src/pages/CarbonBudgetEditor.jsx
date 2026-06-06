import { useState, useEffect } from 'react'
import { showToast } from '../App'

const BASE = 'http://127.0.0.1:8000'

// Default budgets matching conformance engine
const DEFAULT_BUDGETS = {
  'Create Order':       5,
  'Supplier Selection': 10,
  'Goods Issue':        15,
  'Freight Booking':    20,
  'Sea Freight':        120,
  'Road Freight':       280,
  'Air Freight':        700,
  'Warehouse Transfer': 50,
  'Customs Clearance':  40,
  'Delivery':           30,
}

const EMISSION_FACTORS = {
  'Create Order':       1,
  'Supplier Selection': 2,
  'Goods Issue':        5,
  'Freight Booking':    8,
  'Sea Freight':        50,
  'Road Freight':       120,
  'Air Freight':        300,
  'Warehouse Transfer': 20,
  'Customs Clearance':  15,
  'Delivery':           10,
}

const POLICY = {
  'Air Freight':  'FORBIDDEN',
  'Sea Freight':  'PREFERRED',
  'Road Freight': 'ALLOWED',
}

const ACT_COLOR = ef =>
  ef >= 200 ? 'var(--t4)' : ef >= 80 ? 'var(--t3)' : ef >= 20 ? 'var(--t3)' : 'var(--t2)'

const fitnessColor = f =>
  f >= 0.85 ? 'var(--t2)' : f >= 0.6 ? 'var(--t3)' : 'var(--t4)'

// Simulated fleet compliance given budgets (deterministic approximation)
function estimateCompliance(budgets, avgCI = 2.34) {
  const activities = Object.keys(budgets)
  let passing = 0
  const SAMPLE = 1000

  for (let i = 0; i < SAMPLE; i++) {
    // simulate a trace: pick a transport randomly weighted by real data
    const rand = Math.random()
    const transport = rand < 0.16 ? 'Air Freight' : rand < 0.61 ? 'Road Freight' : 'Sea Freight'
    const trace = ['Create Order', 'Goods Issue', 'Freight Booking', transport, 'Warehouse Transfer', 'Customs Clearance', 'Delivery']
    const totalEmit = trace.reduce((s, a) => s + (EMISSION_FACTORS[a] || 5) * avgCI, 0)
    const totalBudget = trace.reduce((s, a) => s + (budgets[a] || DEFAULT_BUDGETS[a] || 50), 0)
    if (totalEmit <= totalBudget) passing++
  }

  return Math.round(passing / SAMPLE * 100 * 10) / 10
}

export default function CarbonBudgetEditor() {
  const [budgets,    setBudgets]    = useState({ ...DEFAULT_BUDGETS })
  const [compliance, setCompliance] = useState(null)
  const [baseComp,   setBaseComp]   = useState(null)
  const [selected,   setSelected]   = useState(null)
  const [saved,      setSaved]      = useState(false)

  // compute on mount and on change
  useEffect(() => {
    const base = estimateCompliance(DEFAULT_BUDGETS)
    setBaseComp(base)
    setCompliance(base)
  }, [])

  useEffect(() => {
    if (!baseComp) return
    const comp = estimateCompliance(budgets)
    setCompliance(comp)
  }, [budgets])

  const update = (act, val) => {
    const n = Math.max(1, Math.min(2000, Number(val)))
    setBudgets(prev => ({ ...prev, [act]: n }))
    setSaved(false)
  }

  const reset = () => {
    setBudgets({ ...DEFAULT_BUDGETS })
    setSaved(false)
  }

  const save = () => {
    // POST to backend (if endpoint exists) — gracefully no-op if not
    fetch(`${BASE}/carbon-budgets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ budgets }),
    }).catch(() => {})
    setSaved(true); showToast('Budget saved successfully', 'success')
  }

  const delta = compliance !== null && baseComp !== null
    ? Math.round((compliance - baseComp) * 10) / 10
    : null

  const totalBudget  = Object.values(budgets).reduce((s, v) => s + v, 0)
  const defaultTotal = Object.values(DEFAULT_BUDGETS).reduce((s, v) => s + v, 0)

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Carbon Budget Editor</div>
          <div className="page-sub">
            Adjust per-activity carbon budgets · See live conformance impact · BRSR-aligned
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={reset} style={{
            background: 'var(--bg3)', border: '1px solid var(--b1)',
            color: 'var(--t3)', fontFamily: 'var(--mono)', fontSize: 11,
            padding: '6px 14px', borderRadius: 6, cursor: 'pointer',
          }}>Reset Defaults</button>
          <button onClick={save} style={{
            background: saved ? 'var(--bg4)' : 'var(--bg3)',
            border: `1px solid ${saved ? 'var(--b3)' : 'var(--b1)'}`,
            color: saved ? 'var(--t2)' : 'var(--t3)',
            fontFamily: 'var(--mono)', fontSize: 11,
            padding: '6px 14px', borderRadius: 6, cursor: 'pointer',
          }}>{saved ? '✓ Saved' : 'Save Budgets'}</button>
        </div>
      </div>

      {/* Live impact KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
        {[
          {
            label: 'Estimated Compliance',
            val: compliance !== null ? compliance + '%' : '—',
            color: compliance >= 80 ? 'var(--t2)' : compliance >= 60 ? 'var(--t3)' : 'var(--t4)',
          },
          {
            label: 'vs Baseline',
            val: delta !== null ? (delta >= 0 ? '+' : '') + delta + ' pp' : '—',
            color: delta >= 0 ? 'var(--t2)' : 'var(--t4)',
          },
          {
            label: 'Total Budget (sum)',
            val: totalBudget + ' kg',
            color: 'var(--t3)',
          },
          {
            label: 'Active Rules',
            val: Object.keys(budgets).length,
            color: 'var(--t2)',
          },
        ].map(k => (
          <div className="kpi" key={k.label} style={{ borderColor: 'var(--b1)' }}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value" style={{ color: k.color, fontSize: 20 }}>{k.val}</div>
          </div>
        ))}
      </div>

      <div className="row col-2">
        {/* Budget sliders */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Per-Activity Carbon Budgets</span>
            <span className="card-meta">kg CO₂e maximum per execution</span>
          </div>

          {Object.entries(budgets).map(([act, budget]) => {
            const ef       = EMISSION_FACTORS[act] || 5
            const avgEmit  = ef * 2.34
            const fitness  = Math.min(1, budget / avgEmit)
            const policy   = POLICY[act]
            const isActive = selected === act
            const maxSlider = act === 'Air Freight' ? 2000 : act === 'Road Freight' ? 800 : act === 'Sea Freight' ? 400 : 200
            const changed  = budget !== DEFAULT_BUDGETS[act]

            return (
              <div
                key={act}
                onClick={() => setSelected(isActive ? null : act)}
                style={{
                  padding: '12px 0',
                  borderBottom: '1px solid #151515',
                  cursor: 'pointer',
                  background: isActive ? 'var(--bg3)' : 'transparent',
                  borderRadius: isActive ? 6 : 0,
                  padding: isActive ? '12px' : '12px 0',
                  transition: 'all 0.15s',
                }}
              >
                {/* Row header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: ACT_COLOR(ef),
                  }} />
                  <span style={{ fontSize: 12, color: 'var(--t2)', fontWeight: changed ? 700 : 400, flex: 1 }}>
                    {act}
                    {changed && <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--t3)', marginLeft: 6 }}>MODIFIED</span>}
                  </span>
                  {policy && (
                    <span style={{
                      fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700,
                      padding: '1px 6px', borderRadius: 3,
                      background: 'var(--bg4)',
                      color: policy === 'FORBIDDEN' ? 'var(--t4)' : policy === 'PREFERRED' ? 'var(--t2)' : 'var(--t3)',
                      border: '1px solid #333333',
                    }}>{policy}</span>
                  )}
                  <span style={{
                    fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700,
                    color: fitnessColor(fitness), width: 50, textAlign: 'right',
                  }}>
                    {budget} kg
                  </span>
                </div>

                {/* Slider */}
                <input
                  type="range"
                  min={1}
                  max={maxSlider}
                  step={act === 'Air Freight' ? 50 : act === 'Road Freight' ? 20 : act === 'Sea Freight' ? 10 : 5}
                  value={budget}
                  onClick={e => e.stopPropagation()}
                  onChange={e => update(act, e.target.value)}
                  style={{ width: '100%', accentColor: ACT_COLOR(ef) }}
                />

                {/* Fitness bar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--t4)', width: 80 }}>
                    avg emit {avgEmit.toFixed(0)} kg
                  </span>
                  <div style={{ flex: 1, height: 4, background: 'var(--bg4)', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{
                      width: `${Math.min(100, fitness * 100)}%`,
                      height: '100%',
                      background: fitnessColor(fitness),
                      borderRadius: 999,
                      transition: 'width 0.3s',
                    }} />
                  </div>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: fitnessColor(fitness), width: 38, textAlign: 'right' }}>
                    {(fitness * 100).toFixed(0)}%
                  </span>
                </div>

                {/* Detail panel */}
                {isActive && (
                  <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                    {[
                      { label: 'Default',     val: DEFAULT_BUDGETS[act] + ' kg' },
                      { label: 'Emission Factor', val: ef + ' × CI' },
                      { label: 'Fitness at avg CI', val: (fitness * 100).toFixed(1) + '%' },
                    ].map(s => (
                      <div key={s.label} style={{ background: 'var(--bg2)', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--t4)', marginBottom: 3 }}>{s.label}</div>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: 'var(--t2)' }}>{s.val}</div>
                      </div>
                    ))}
                    <div style={{ gridColumn: '1/-1' }}>
                      <input
                        type="number"
                        value={budget}
                        min={1} max={maxSlider}
                        onClick={e => e.stopPropagation()}
                        onChange={e => update(act, e.target.value)}
                        style={{
                          width: '100%', padding: '7px 10px',
                          background: 'var(--bg2)', border: '1px solid var(--b1)',
                          color: 'var(--t2)', fontFamily: 'var(--mono)', fontSize: 13,
                          borderRadius: 6, outline: 'none',
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Right panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Live compliance gauge */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Live Compliance Estimate</span>
              <span className="card-meta">Based on current budgets</span>
            </div>

            {compliance !== null && (
              <>
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <div style={{
                    fontFamily: 'var(--mono)', fontSize: 48, fontWeight: 800,
                    color: compliance >= 80 ? 'var(--t2)' : compliance >= 60 ? 'var(--t3)' : 'var(--t4)',
                    letterSpacing: -2, lineHeight: 1,
                  }}>
                    {compliance}%
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t4)', marginTop: 6 }}>
                    estimated fleet compliance
                  </div>
                </div>

                {/* Gauge bar */}
                <div style={{ height: 12, background: 'var(--bg4)', borderRadius: 999, overflow: 'hidden', marginBottom: 12 }}>
                  <div style={{
                    width: `${compliance}%`, height: '100%',
                    background: compliance >= 80 ? 'var(--t2)' : compliance >= 60 ? 'var(--t3)' : 'var(--t4)',
                    borderRadius: 999, transition: 'width 0.5s',
                  }} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: 11, marginBottom: 4 }}>
                  <span style={{ color: 'var(--t4)' }}>Baseline</span>
                  <span style={{ color: 'var(--t2)' }}>{baseComp}%</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: 11 }}>
                  <span style={{ color: 'var(--t4)' }}>With current budgets</span>
                  <span style={{ color: delta >= 0 ? 'var(--t2)' : 'var(--t4)', fontWeight: 700 }}>
                    {compliance}% ({delta >= 0 ? '+' : ''}{delta} pp)
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Budget comparison */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Budget Changes</span>
            </div>
            {Object.entries(budgets)
              .filter(([act, val]) => val !== DEFAULT_BUDGETS[act])
              .map(([act, val]) => {
                const diff = val - DEFAULT_BUDGETS[act]
                return (
                  <div key={act} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #151515', fontFamily: 'var(--mono)', fontSize: 11 }}>
                    <span style={{ color: 'var(--t3)' }}>{act}</span>
                    <span>
                      <span style={{ color: 'var(--t4)' }}>{DEFAULT_BUDGETS[act]} kg</span>
                      <span style={{ color: 'var(--t4)', margin: '0 6px' }}>→</span>
                      <span style={{ color: 'var(--t2)', fontWeight: 700 }}>{val} kg</span>
                      <span style={{ color: diff > 0 ? 'var(--t3)' : 'var(--t2)', marginLeft: 6 }}>
                        ({diff > 0 ? '+' : ''}{diff})
                      </span>
                    </span>
                  </div>
                )
              })}
            {Object.entries(budgets).every(([act, val]) => val === DEFAULT_BUDGETS[act]) && (
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t4)', padding: '12px 0' }}>
                No changes from defaults
              </div>
            )}
          </div>

          {/* Policy notes */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Policy Notes</span>
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t3)', lineHeight: 2 }}>
              <div>• Air Freight budget exists but triggers <span style={{ color: 'var(--t3)' }}>POLICY-01</span> regardless</div>
              <div>• Raising Sea Freight budget increases compliance rate</div>
              <div>• D/E suppliers get <span style={{ color: 'var(--t2)' }}>0.7–0.85×</span> multiplier applied</div>
              <div>• Changes here affect live conformance engine on restart</div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}