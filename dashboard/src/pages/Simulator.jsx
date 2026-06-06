import { useEffect, useState } from 'react'
import { SkeletonCards, SkeletonTable } from '../Skeleton'
import { simulateDecision } from '../api'

const MODES = ['Air Freight', 'Road Freight', 'Sea Freight']

const modeColor = m =>
  m === 'Air Freight'  ? 'var(--t4)'   :
  m === 'Road Freight' ? 'var(--t3)' : 'var(--t2)'

const modeIcon = m =>
  m === 'Air Freight'  ? '' :
  m === 'Road Freight' ? '' : ''

export default function Simulator() {
  const [currentMode, setCurrentMode] = useState('Air Freight')
  const [targetMode,  setTargetMode]  = useState('Sea Freight')
  const [data,        setData]        = useState(null)
  const [err,         setErr]         = useState(null)

  useEffect(() => {
    simulateDecision({ current_mode: currentMode, target_mode: targetMode })
      .then(setData)
      .catch(e => setErr(e.message))
  }, [currentMode, targetMode])

  if (err)   return <div className="error-box">API error: {err}</div>
  if (!data) return <div className="loading">Running simulation...</div>

  const reductionPct = data.reduction_pct
  const barW = Math.max(0, Math.min(100, reductionPct))

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Decision Simulator</div>
          <div className="page-sub">What-if analysis · Carbon reduction modelling · Mode substitution</div>
        </div>
      </div>

      {/* Mode selectors */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Simulation Parameters</span>
          <span className="card-meta">Select transport modes to compare</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 16 }}>
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Current Mode</div>
            <select
              value={currentMode}
              onChange={e => setCurrentMode(e.target.value)}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 8,
                background: 'var(--bg3)', border: '1px solid var(--b1)',
                color: 'var(--t2)', fontFamily: 'var(--mono)', fontSize: 12, outline: 'none',
              }}
            >
              {MODES.map(m => <option key={m}>{m}</option>)}
            </select>
          </div>

          <div style={{ fontFamily: 'var(--mono)', fontSize: 18, color: 'var(--t4)', paddingTop: 20 }}>→</div>

          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Target Mode</div>
            <select
              value={targetMode}
              onChange={e => setTargetMode(e.target.value)}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 8,
                background: 'var(--bg3)', border: '1px solid var(--b1)',
                color: 'var(--t2)', fontFamily: 'var(--mono)', fontSize: 12, outline: 'none',
              }}
            >
              {MODES.map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
        {[
          { label: 'Current CO₂e',   val: `${data.current_emission} kg`, color: modeColor(currentMode) },
          { label: 'Target CO₂e',    val: `${data.target_emission} kg`,  color: modeColor(targetMode) },
          { label: 'Carbon Saved',   val: `${data.saving_kg} kg`,        color: 'var(--t2)' },
          { label: 'Reduction',      val: `${reductionPct}%`,            color: reductionPct > 0 ? 'var(--t2)' : 'var(--t4)' },
        ].map(k => (
          <div className="kpi" key={k.label} style={{ borderColor: 'var(--b1)' }}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value" style={{ color: k.color, fontSize: 20 }}>{k.val}</div>
          </div>
        ))}
      </div>

      <div className="row col-2">
        {/* Mode comparison */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Mode Comparison</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Current */}
            <div style={{ background: 'var(--bg3)', border: '1px solid var(--b1)', borderRadius: 8, padding: '16px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Current</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22 }}>{modeIcon(currentMode)}</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: modeColor(currentMode) }}>{currentMode}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 800, color: 'var(--t1)', marginTop: 2 }}>
                    {data.current_emission} <span style={{ fontSize: 12, color: 'var(--t4)' }}>kg CO₂e</span>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t4)' }}>↓ switch to</div>

            {/* Target */}
            <div style={{ background: 'var(--bg3)', border: `1px solid ${modeColor(targetMode)}33`, borderRadius: 8, padding: '16px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Recommended</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22 }}>{modeIcon(targetMode)}</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: modeColor(targetMode) }}>{targetMode}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 800, color: 'var(--t1)', marginTop: 2 }}>
                    {data.target_emission} <span style={{ fontSize: 12, color: 'var(--t4)' }}>kg CO₂e</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Saving chip */}
            <div style={{ background: 'var(--bg3)', border: '1px solid var(--t2)33', borderRadius: 8, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: 1 }}>Saving</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 800, color: 'var(--t2)', marginTop: 2 }}>{data.saving_kg} kg CO₂e</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: 1 }}>Reduction</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 800, color: 'var(--t2)', marginTop: 2 }}>{reductionPct}%</div>
              </div>
            </div>
          </div>
        </div>

        {/* Impact analysis */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card">
            <div className="card-header">
              <span className="card-title">Reduction Impact</span>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t3)' }}>Carbon reduction achieved</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: 'var(--t2)' }}>{reductionPct}%</span>
              </div>
              <div className="bar-track" style={{ height: 12 }}>
                <div className="bar-fill" style={{ width: `${barW}%`, background: reductionPct > 50 ? 'var(--t2)' : reductionPct > 20 ? 'var(--t3)' : 'var(--t4)' }} />
              </div>
            </div>

            {[
              ['Current',        `${data.current_emission} kg`, modeColor(currentMode)],
              ['Optimized',      `${data.target_emission} kg`,  modeColor(targetMode)],
              ['Saving',         `${data.saving_kg} kg`,        'var(--t2)'],
              ['Avg CI Applied', '2.34',                        'var(--t3)'],
            ].map(([l, v, c]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--b1)', fontFamily: 'var(--mono)', fontSize: 12 }}>
                <span style={{ color: 'var(--t4)' }}>{l}</span>
                <span style={{ color: c, fontWeight: 700 }}>{v}</span>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="card-header"><span className="card-title">AI Recommendation</span></div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--t3)', lineHeight: 2 }}>
              Switching from <span style={{ color: modeColor(currentMode), fontWeight: 700 }}>{currentMode}</span> to{' '}
              <span style={{ color: modeColor(targetMode), fontWeight: 700 }}>{targetMode}</span> reduces
              emissions by <span style={{ color: 'var(--t2)', fontWeight: 700 }}>{reductionPct}%</span> and
              saves <span style={{ color: 'var(--t2)', fontWeight: 700 }}>{data.saving_kg} kg CO₂e</span> per shipment.
            </div>
            {reductionPct > 50 && (
              <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--bg3)', border: '1px solid var(--t2)33', borderRadius: 6, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t2)' }}>
                ✓ Meets BRSR carbon reduction threshold
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}