import { useEffect, useState, useCallback, useRef } from 'react'
import axios from 'axios'


const api = axios.create({ baseURL: 'http://localhost:8000' })

const getSummary    = ()   => api.get('/conformance/summary').then(r => r.data)
const getConformance = (p) => api.get('/conformance', { params: p }).then(r => r.data)
const getTrace      = (id, ot) => api.get(`/conformance/trace/${id}`, { params: { order_type: ot } }).then(r => r.data)
const getBenchmark  = (ot) => api.get('/conformance/benchmark', { params: { order_type: ot } }).then(r => r.data)
const getHeatmap    = ()   => api.get('/conformance/heatmap').then(r => r.data)

// ── constants ────────────────────────────────────────────────────────────────
const GRADE_COLOR = { A: 'var(--t1)', B: 'var(--t2)', C: 'var(--t3)', D: 'var(--t4)', E: 'var(--t4)' }
const SEV_COLOR   = { CRITICAL: 'var(--t4)', HIGH: 'var(--t3)', MEDIUM: 'var(--t3)', LOW: 'var(--t2)', INFO: 'var(--t3)' }

// ── micro components ─────────────────────────────────────────────────────────
const Pill = ({ label, color = 'var(--t3)', small }) => (
  <span style={{
    display: 'inline-block', padding: small ? '1px 6px' : '2px 8px',
    borderRadius: 3, fontSize: small ? 9 : 10, fontWeight: 700,
    fontFamily: 'var(--mono)', letterSpacing: '0.04em',
    background: color + '22', color, border: `1px solid ${color}44`,
  }}>{label}</span>
)

const Bar = ({ val, color, height = 5 }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <div style={{
      flex: 1, height, background: 'var(--bg3)', borderRadius: 999, overflow: 'hidden',
    }}>
      <div style={{
        width: `${Math.min(100, val * 100)}%`, height: '100%',
        background: color, borderRadius: 999,
        transition: 'width 0.6s cubic-bezier(.23,1,.32,1)',
      }} />
    </div>
    <span style={{
      fontFamily: 'var(--mono)', fontSize: 10, color, width: 38, textAlign: 'right',
    }}>
      {(val * 100).toFixed(1)}%
    </span>
  </div>
)

const Spinner = ({ text = 'Loading…' }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 0', color: 'var(--t4)', fontFamily: 'var(--mono)', fontSize: 12 }}>
    <svg width="14" height="14" viewBox="0 0 14 14" style={{ animation: 'spin 0.7s linear infinite' }}>
      <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="22" strokeDashoffset="8" />
    </svg>
    {text}
  </div>
)

const Err = ({ msg }) => (
  <div style={{ background: 'var(--t4)11', border: '1px solid var(--t4)33', borderRadius: 6, padding: '10px 14px', color: 'var(--t4)', fontFamily: 'var(--mono)', fontSize: 12, marginBottom: 12 }}>
    ⚠ {msg}
  </div>
)

// ── fitness score ring ────────────────────────────────────────────────────────
function ScoreRing({ value, label, color, size = 64 }) {
  const r = (size - 10) / 2
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - value)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg3)" strokeWidth="4" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth="4"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(.23,1,.32,1)' }}
        />
        <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle"
          style={{ fontFamily: 'var(--mono)', fontSize: size * 0.19, fontWeight: 800, fill: color }}>
          {(value * 100).toFixed(0)}%
        </text>
      </svg>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </span>
    </div>
  )
}

// ── step timeline inside drawer ───────────────────────────────────────────────
function StepTimeline({ steps }) {
  return (
    <div style={{ position: 'relative' }}>
      {/* Vertical line */}
      <div style={{
        position: 'absolute', left: 16, top: 20, bottom: 20, width: 1,
        background: 'var(--b1)',
      }} />
      {steps.map((s, i) => {
        const viol = s.is_violation || s.is_duplicate
        return (
          <div key={i} style={{
            display: 'flex', gap: 12, alignItems: 'flex-start',
            marginBottom: 10, position: 'relative',
          }}>
            {/* Node */}
            <div style={{
              width: 33, height: 33, borderRadius: '50%', flexShrink: 0, zIndex: 1,
              background: viol ? 'var(--t4)22' : s.carbon_fitness >= 1 ? 'var(--t2)22' : 'var(--bg3)',
              border: `2px solid ${viol ? 'var(--t4)' : s.carbon_fitness >= 1 ? 'var(--t2)' : 'var(--b1)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 800,
              color: viol ? 'var(--t4)' : s.carbon_fitness >= 1 ? 'var(--t2)' : 'var(--t3)',
            }}>{s.step}</div>

            {/* Body */}
            <div style={{
              flex: 1, background: viol ? 'var(--t4)0a' : 'var(--bg3)',
              border: `1px solid ${viol ? 'var(--t4)33' : 'var(--b1)'}`,
              borderRadius: 6, padding: '8px 12px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: 12, fontWeight: 700,
                    color: viol ? 'var(--t4)' : 'var(--t2)',
                  }}>{s.activity}</span>
                  {!s.in_normative_model && <Pill label="OFF-MODEL" color="var(--t3)" small />}
                  {s.is_violation && <Pill label="VIOLATION" color="var(--t4)" small />}
                  {s.is_duplicate && <Pill label="DUPLICATE" color="#b794f4" small />}
                </div>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: viol ? 'var(--t4)' : 'var(--t3)' }}>
                  {s.emission_kg} kg
                </span>
              </div>
              <div style={{ display: 'flex', gap: 14 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t4)' }}>
                  budget {s.budget_kg} kg
                </span>
                {s.overrun_kg > 0 && (
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t3)' }}>
                    +{s.overrun_kg} kg over
                  </span>
                )}
                <span style={{
                  fontFamily: 'var(--mono)', fontSize: 10,
                  color: s.carbon_fitness < 1 ? 'var(--t3)' : 'var(--t2)',
                }}>
                  fit {(s.carbon_fitness * 100).toFixed(1)}%
                </span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t4)' }}>
                  Σ {s.cumulative_emission} kg
                </span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── explainability box ────────────────────────────────────────────────────────
function ExplainBox({ explanation, policyViolations }) {
  if (!explanation) return null
  return (
    <div style={{
      background: 'var(--bg3)', border: '1px solid var(--b1)',
      borderRadius: 8, padding: 14, marginBottom: 16,
    }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t4)', marginBottom: 8, letterSpacing: '0.06em' }}>
        EXPLAINABILITY
      </div>

      {explanation.reasons.map((r, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
          <span style={{ color: 'var(--t4)', fontSize: 11, flexShrink: 0 }}>WHY</span>
          <span style={{ fontSize: 11, color: 'var(--t2)' }}>{r}</span>
        </div>
      ))}
      {explanation.rules_triggered.map((r, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
          <span style={{ color: 'var(--t3)', fontSize: 11, flexShrink: 0, fontFamily: 'var(--mono)' }}>RULE</span>
          <span style={{ fontSize: 11, color: 'var(--t3)', fontFamily: 'var(--mono)' }}>{r}</span>
        </div>
      ))}
      {explanation.recommended_fixes.map((r, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
          <span style={{ color: 'var(--t2)', fontSize: 11, flexShrink: 0 }}>FIX</span>
          <span style={{ fontSize: 11, color: 'var(--t2)' }}>{r}</span>
        </div>
      ))}

      {policyViolations?.filter(p => p.severity !== 'INFO').map((p, i) => (
        <div key={i} style={{
          marginTop: 8, padding: '6px 10px',
          background: (SEV_COLOR[p.severity] || 'var(--t3)') + '11',
          border: `1px solid ${(SEV_COLOR[p.severity] || 'var(--t3)')}33`,
          borderRadius: 5,
        }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 2 }}>
            <Pill label={p.severity} color={SEV_COLOR[p.severity] || 'var(--t3)'} small />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t4)' }}>{p.rule_id}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t2)' }}>{p.name}</span>
          </div>
          <div style={{ fontSize: 10, color: 'var(--t4)', paddingLeft: 2 }}>{p.fix}</div>
        </div>
      ))}
    </div>
  )
}

// ── benchmark comparison widget ───────────────────────────────────────────────
function BenchmarkWidget({ benchmark }) {
  if (!benchmark) return null
  const { traditional, carbon_aware, delta } = benchmark
  return (
    <div style={{
      background: 'var(--bg3)', border: '1px solid var(--b1)',
      borderRadius: 8, padding: 14, marginBottom: 16,
    }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t4)', marginBottom: 10, letterSpacing: '0.06em' }}>
        TRADITIONAL vs CARBON-AWARE
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div style={{ background: 'var(--bg2)', borderRadius: 6, padding: 10 }}>
          <div style={{ fontSize: 10, color: 'var(--t4)', marginBottom: 4, fontFamily: 'var(--mono)' }}>Sequence Only</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 800, color: 'var(--t3)' }}>
            {(traditional.score * 100).toFixed(1)}%
          </div>
          <Pill label={traditional.grade} color={GRADE_COLOR[traditional.grade]} />
        </div>
        <div style={{ background: 'var(--bg2)', borderRadius: 6, padding: 10 }}>
          <div style={{ fontSize: 10, color: 'var(--t4)', marginBottom: 4, fontFamily: 'var(--mono)' }}>Dual-Objective</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 800, color: 'var(--t3)' }}>
            {(carbon_aware.score * 100).toFixed(1)}%
          </div>
          <Pill label={carbon_aware.grade} color={GRADE_COLOR[carbon_aware.grade]} />
        </div>
      </div>
      {delta < -0.01 && (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t3)', background: 'var(--t3)11', padding: '5px 8px', borderRadius: 4 }}>
          Carbon-aware is {Math.abs((delta * 100)).toFixed(1)} pp stricter – hidden violation uncovered
        </div>
      )}
    </div>
  )
}

// ── trace drawer ──────────────────────────────────────────────────────────────
function TraceDrawer({ orderId, orderType, onClose }) {
  const [trace, setTrace]   = useState(null)
  const [err,   setErr]     = useState('')
  const [tab,   setTab]     = useState('replay')

  useEffect(() => {
    setTrace(null); setErr('')
    getTrace(orderId, orderType)
      .then(setTrace)
      .catch(() => setErr('Failed to load trace'))
  }, [orderId, orderType])

  const TABS = [
    { id: 'replay',  label: 'Trace Replay'  },
    { id: 'explain', label: 'Explainability' },
    { id: 'bench',   label: 'Benchmark'     },
    { id: 'route',   label: 'Green Route'   },
  ]

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.72)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        zIndex: 999,
        transition: 'all .25s ease',
      }} />

      {/* Drawer */}
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 'min(1100px, 92vw)',
        height: '88vh',
        background: 'rgba(12,12,12,0.88)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 24,
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        boxShadow: '0 40px 120px rgba(0,0,0,.75)',
        zIndex: 1000,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--b1)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          position: 'sticky', top: 0,
          background: 'rgba(12,12,12,.92)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          zIndex: 2,
        }}>
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t4)', marginBottom: 2, letterSpacing: '0.05em' }}>
              CONFORMANCE TRACE
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--t2)' }}>{orderId}</div>
            {trace && (
              <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                <Pill label={trace.grade} color={GRADE_COLOR[trace.grade]} />
                <Pill label={trace.violation_type || 'N/A'} color="var(--t3)" />
                <Pill label={`Rating ${trace.supplier_rating}`} color="#b794f4" />
              </div>
            )}
          </div>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.08)',
            color: 'var(--t3)', cursor: 'pointer', padding: '4px 10px',
            borderRadius: 8, fontFamily: 'var(--mono)', fontSize: 11,
          }}>✕</button>
        </div>

        {err && <div style={{ padding: '0 20px', marginTop: 12 }}><Err msg={err} /></div>}
        {!trace && !err && <div style={{ padding: '0 20px' }}><Spinner text="Running trace analysis…" /></div>}

        {trace && (
          <div style={{ flex: 1, overflow: 'auto', padding: '0 20px 24px' }}>
            {/* Fitness rings */}
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', padding: '20px 0 16px' }}>
              <ScoreRing value={trace.carbon_fitness}   label="Carbon Fit"  color="#f5f5f5" />
              <ScoreRing value={trace.sequence_fitness} label="Sequence Fit" color="#d0d0d0" />
              <ScoreRing value={trace.combined_fitness} label="Combined"     color="#a8a8a8" size={72} />
            </div>

            {/* Key stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
              {[
                { l: 'Actual',   v: `${trace.actual_emission.toLocaleString()} kg`, c: 'var(--t1)' },
                { l: 'Budget',   v: `${trace.budget} kg`,     c: 'var(--t2)' },
                { l: 'Saving',   v: `${trace.potential_saving.toLocaleString()} kg`, c: 'var(--t2)' },
              ].map(s => (
                <div key={s.l} style={{
                  background: 'var(--bg3)', border: '1px solid var(--b1)',
                  borderRadius: 6, padding: '8px 10px', textAlign: 'center',
                }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--t4)', marginBottom: 3 }}>{s.l}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 800, color: s.c }}>{s.v}</div>
                </div>
              ))}
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 2, marginBottom: 16, borderBottom: '1px solid var(--b1)' }}>
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)} style={{
                  padding: '7px 12px', background: 'none', border: 'none',
                  borderBottom: tab === t.id ? '2px solid #f0f0f0' : '2px solid transparent',
                  color: tab === t.id ? 'var(--t1)' : 'var(--t3)',
                  fontFamily: 'var(--mono)', fontSize: 11, cursor: 'pointer',
                  fontWeight: tab === t.id ? 700 : 400,
                }}>{t.label}</button>
              ))}
            </div>

            {tab === 'replay' && <StepTimeline steps={trace.steps} />}

            {tab === 'explain' && (
              <ExplainBox
                explanation={trace.explanation}
                policyViolations={trace.policy_violations}
              />
            )}

            {tab === 'bench' && <BenchmarkWidget benchmark={trace.benchmark} />}

            {tab === 'route' && (
              <div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t4)', marginBottom: 10, letterSpacing: '0.05em' }}>
                  GREEN ALTERNATIVE PATH
                </div>
                {trace.alt_steps?.map((s, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
                  }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t4)', width: 18 }}>{i + 1}.</span>
                    <div style={{
                      flex: 1, padding: '6px 10px', borderRadius: 5,
                      background: 'var(--bg3)', border: '1px solid var(--t2)22',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                      <span style={{ fontSize: 12, color: 'var(--t2)', fontWeight: 600 }}>{s.activity}</span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t4)' }}>{s.emission_kg} kg</span>
                    </div>
                  </div>
                ))}
                <div style={{
                  marginTop: 12, padding: '10px 12px',
                  background: 'var(--t2)11', border: '1px solid var(--t2)33',
                  borderRadius: 6, fontFamily: 'var(--mono)', fontSize: 11,
                }}>
                  <span style={{ color: 'var(--t2)', fontWeight: 700 }}>
                    {trace.alt_emission} kg CO₂e
                  </span>
                  <span style={{ color: 'var(--t4)', margin: '0 8px' }}>vs</span>
                  <span style={{ color: 'var(--t3)', fontWeight: 600 }}>
                    {trace.actual_emission.toLocaleString()} kg actual
                  </span>
                  <span style={{ color: 'var(--t4)', margin: '0 8px' }}>→ saves</span>
                  <span style={{ color: 'var(--t2)', fontWeight: 800 }}>
                    {trace.potential_saving.toLocaleString()} kg
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}

// ── fleet benchmark panel ─────────────────────────────────────────────────────
function FleetBenchmarkPanel({ orderType }) {
  const [bm,  setBm]  = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    getBenchmark(orderType)
      .then(setBm)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [orderType])

  if (loading) return <Spinner text="Computing benchmark…" />
  if (!bm) return null

  const tradGrade = bm.grade_shift?.traditional  || {}
  const caGrade   = bm.grade_shift?.carbon_aware || {}
  const grades    = ['A','B','C','D','E']

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      {/* Scores */}
      <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: 14 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t4)', marginBottom: 10, letterSpacing: '0.06em' }}>
          FLEET FITNESS SCORES
        </div>
        <div style={{ display: 'flex', gap: 20, marginBottom: 12 }}>
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--t4)' }}>Traditional</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 24, fontWeight: 800, color: 'var(--t3)' }}>
              {(bm.traditional_conformance.avg_fitness * 100).toFixed(1)}%
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--t4)' }}>
              pass {bm.traditional_conformance.pass_rate_pct}%
            </div>
          </div>
          <div style={{ color: 'var(--b1)', fontSize: 28, alignSelf: 'center' }}>→</div>
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--t4)' }}>Carbon-Aware</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 24, fontWeight: 800, color: 'var(--t3)' }}>
              {(bm.carbon_aware_conformance.avg_fitness * 100).toFixed(1)}%
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--t4)' }}>
              pass {bm.carbon_aware_conformance.pass_rate_pct}%
            </div>
          </div>
        </div>
        <div style={{
          background: 'var(--t3)11', border: '1px solid var(--t3)33',
          borderRadius: 5, padding: '8px 10px', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t3)',
        }}>
          {bm.research_finding?.cases_downgraded} traces downgraded by carbon-aware check
          <br />
          <span style={{ color: 'var(--t4)' }}>avg penalty: {(bm.research_finding?.avg_penalty_delta * 100).toFixed(2)} pp</span>
        </div>
      </div>

      {/* Grade shift */}
      <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: 14 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t4)', marginBottom: 10, letterSpacing: '0.06em' }}>
          GRADE SHIFT
        </div>
        {grades.map(g => {
          const tCount = tradGrade[g] || 0
          const cCount = caGrade[g]   || 0
          const max    = Math.max(...grades.flatMap(x => [tradGrade[x] || 0, caGrade[x] || 0]), 1)
          return (
            <div key={g} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 800, color: GRADE_COLOR[g], width: 14 }}>{g}</span>
              {/* Traditional */}
              <div style={{ flex: 1, height: 7, background: 'var(--bg2)', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{ width: `${tCount / max * 100}%`, height: '100%', background: 'var(--t3)44', borderRadius: 999 }} />
              </div>
              {/* Carbon-aware */}
              <div style={{ flex: 1, height: 7, background: 'var(--bg2)', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{ width: `${cCount / max * 100}%`, height: '100%', background: GRADE_COLOR[g], borderRadius: 999 }} />
              </div>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--t4)', width: 52, textAlign: 'right' }}>
                {tCount} → {cCount}
              </span>
            </div>
          )
        })}
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--t4)', marginTop: 6 }}>
          blue = traditional · color = carbon-aware
        </div>
      </div>
    </div>
  )
}

// ── heatmap panel ─────────────────────────────────────────────────────────────
function HeatmapPanel() {
  const [hm, setHm] = useState(null)
  const [tab, setTab] = useState('activity')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    setLoading(true)
    getHeatmap()
      .then(data => {
        if (mounted) setHm(data)
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [])

  if (loading) return <Spinner text="Building heatmap…" />

  if (!hm) {
    return (
      <div style={{ padding: 16, color: 'var(--t4)', fontFamily: 'var(--mono)' }}>
        Heatmap data unavailable
      </div>
    )
  }

  const actMax = Math.max(...hm.activity_intensity.map(a => a.emission_factor), 1)
  const supMax = Math.max(...(hm.supplier_violation_rate || []).map(s => s.total_violations), 1)

  return (
    <div>
      <div style={{ display: 'flex', gap: 2, marginBottom: 14, borderBottom: '1px solid var(--b1)', paddingBottom: 8 }}>
        {[['activity', 'Activity × Intensity'], ['supplier', 'Supplier × Violation Rate']].map(([id, lbl]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            padding: '5px 12px', background: 'none', border: 'none',
            borderBottom: tab === id ? '2px solid var(--t2)' : '2px solid transparent',
            color: tab === id ? 'var(--t2)' : 'var(--t3)',
            fontFamily: 'var(--mono)', fontSize: 11, cursor: 'pointer', fontWeight: tab === id ? 700 : 400,
          }}>{lbl}</button>
        ))}
      </div>

      {tab === 'activity' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {hm.activity_intensity.map(a => {
            const pct = a.emission_factor / actMax
            const color = a.is_forbidden ? 'var(--t4)' : a.emission_factor > 100 ? 'var(--t3)' : a.emission_factor > 20 ? 'var(--t3)' : 'var(--t2)'
            return (
              <div key={a.activity} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 160, fontSize: 11, color: 'var(--t2)', fontWeight: a.is_forbidden ? 700 : 400 }}>
                  {a.activity}
                  {a.is_forbidden && <span style={{ color: 'var(--t4)', marginLeft: 4, fontSize: 9 }}>●</span>}
                </div>
                <div style={{ flex: 1, height: 20, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
                  <div style={{
                    width: `${pct * 100}%`, height: '100%',
                    background: color + 'cc', borderRadius: 3,
                    transition: 'width 0.6s cubic-bezier(.23,1,.32,1)',
                  }} />
                  <span style={{
                    position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                    fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--t4)',
                  }}>{a.emission_factor} kg/CI</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {tab === 'supplier' && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--mono)', fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--b1)' }}>
                {['Supplier', 'Rating', 'Total Violations', 'Carbon Violations', 'Violation Rate'].map(h => (
                  <th key={h} style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--t4)', fontWeight: 600, fontSize: 10 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(hm.supplier_violation_rate || []).map((s, i) => {
                const rateColor = s.violation_rate > 0.7 ? 'var(--t4)' : s.violation_rate > 0.4 ? 'var(--t3)' : 'var(--t2)'
                return (
                  <tr key={i} style={{ borderBottom: '1px solid var(--b1)', opacity: 0.92 }}>
                    <td style={{ padding: '5px 8px', color: 'var(--t2)', fontWeight: 700 }}>{s.supplier_id}</td>
                    <td style={{ padding: '5px 8px' }}><Pill label={s.rating} color={GRADE_COLOR[s.rating] || 'var(--t3)'} small /></td>
                    <td style={{ padding: '5px 8px', color: 'var(--t2)' }}>{s.total_violations}</td>
                    <td style={{ padding: '5px 8px', color: 'var(--t3)' }}>{s.carbon_violations}</td>
                    <td style={{ padding: '5px 8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 60, height: 5, background: 'var(--bg3)', borderRadius: 999, overflow: 'hidden' }}>
                          <div style={{ width: `${s.violation_rate * 100}%`, height: '100%', background: rateColor, borderRadius: 999 }} />
                        </div>
                        <span style={{ color: rateColor }}>{(s.violation_rate * 100).toFixed(0)}%</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════
const LIMIT = 25

export default function ConformanceChecker() {
  const [summary,    setSummary]    = useState(null)
  const [data,       setData]       = useState(null)
  const [loading,    setLoading]    = useState(false)
  const [err,        setErr]        = useState('')
  const [page,       setPage]       = useState(0)
  const [selected,   setSelected]   = useState(null)
  const [activeTab,  setActiveTab]  = useState('traces')

  // Filters
  const [supFilter,  setSupFilter]  = useState('')
  const [orderType,  setOrderType]  = useState('standard')
  const [violOnly,   setViolOnly]   = useState(false)
  const [sevFilter,  setSevFilter]  = useState('')
  const [gradeFilter,setGradeFilter]= useState('')

  useEffect(() => {
    getSummary().then(setSummary).catch(() => {})
    load(0)
  }, [])

  const load = useCallback((p = 0, overrides = {}) => {
    setLoading(true); setErr('')
    const params = {
      limit: LIMIT, offset: p * LIMIT,
      violation_only: overrides.violOnly   ?? violOnly,
      order_type:     overrides.orderType  ?? orderType,
    }
    const sup = overrides.supFilter ?? supFilter
    const sev = overrides.sevFilter ?? sevFilter
    const grd = overrides.gradeFilter ?? gradeFilter
    if (sup) params.supplier_id = sup.toUpperCase()
    if (sev) params.severity    = sev
    if (grd) params.grade       = grd
    getConformance(params)
      .then(d => { setData(d); setPage(p) })
      .catch(() => setErr('Failed to load conformance data'))
      .finally(() => setLoading(false))
  }, [violOnly, orderType, supFilter, sevFilter, gradeFilter])

  const applyFilters = () => load(0)

  const MAIN_TABS = [
    { id: 'traces',    label: 'Trace Explorer' },
    { id: 'fleet',     label: 'Fleet Overview' },
    { id: 'benchmark', label: 'Benchmark'      },
    { id: 'heatmap',   label: 'Heatmap'        },
    { id: 'model',     label: 'Process Model'  },
  ]

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>

      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <div className="page-title">Conformance Checker</div>
          <div className="page-sub">
            Carbon-Aware · Dual-Objective Fitness · Sequence + Emission Budget · Green Policy Engine
          </div>
        </div>
        <span className="live-tag">RESEARCH CORE</span>
      </div>

      {/* ── Summary KPIs ── */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Total Violations',    val: summary.total_violations.toLocaleString(),         cls: 'red'    },
            { label: 'Carbon Violations',   val: summary.carbon_violations.toLocaleString(),         cls: 'red'    },
            { label: 'Process Violations',  val: summary.process_violations.toLocaleString(),        cls: 'orange' },
            { label: 'Data Issues',         val: summary.data_violations.toLocaleString(),           cls: 'purple' },
            { label: 'Avg Carbon Fitness',  val: (summary.avg_carbon_fitness * 100).toFixed(1) + '%', cls: 'green' },
            { label: 'Compliance Rate',     val: summary.compliance_rate_pct + '%',                  cls: 'green'  },
          ].map(k => (
            <div key={k.label} className={`kpi ${k.cls}`}>
              <div className="kpi-label">{k.label}</div>
              <div className={`kpi-value ${k.cls}`}>{k.val}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Main Tabs ── */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 16, borderBottom: '1px solid var(--b1)' }}>
        {MAIN_TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            padding: '9px 16px', background: 'none', border: 'none',
            borderBottom: activeTab === t.id ? '2px solid #f0f0f0' : '2px solid transparent',
            color: activeTab === t.id ? 'var(--t1)' : 'var(--t3)',
            fontFamily: 'var(--mono)', fontSize: 12, cursor: 'pointer',
            fontWeight: activeTab === t.id ? 700 : 400,
          }}>{t.label}</button>
        ))}
      </div>

      {/* ══════ TAB: FLEET OVERVIEW ══════ */}
      {activeTab === 'fleet' && data?.fleet_summary && (() => {
        const fs = data.fleet_summary
        return (
          <div>
            {/* Fitness bars */}
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header">
                <span className="card-title">Dual-Objective Fitness</span>
                <span className="card-meta">Token-replay inspired · carbon × sequence</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {[
                    { label: 'Carbon Fitness',   formula: 'min(1, budget / actual)',           val: fs.avg_carbon_fitness,   color: 'var(--t2)' },
                    { label: 'Sequence Fitness', formula: 'LCS(trace, model) / max(|t|,|m|)',  val: fs.avg_sequence_fitness, color: 'var(--t3)' },
                    { label: 'Combined',         formula: '0.5 × seq + 0.5 × carbon',          val: fs.avg_combined_fitness, color: 'var(--t3)' },
                  ].map(s => (
                    <div key={s.label}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                        <span className="kpi-label">{s.label}</span>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t4)' }}>{s.formula}</span>
                      </div>
                      <Bar val={s.val} color={s.color} height={8} />
                    </div>
                  ))}
                  <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 4,
                  }}>
                    {[
                      { l: 'CEI',     v: (fs.carbon_efficiency_index * 100).toFixed(1) + '%', c: 'var(--t2)' },
                      { l: 'Saving',  v: fs.total_potential_saving_kg.toLocaleString() + ' kg', c: 'var(--t2)' },
                      { l: 'Budget',  v: fs.total_budget_kg.toLocaleString() + ' kg', c: 'var(--t3)' },
                    ].map(s => (
                      <div key={s.l} style={{ background: 'var(--bg3)', borderRadius: 6, padding: '8px 10px' }}>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--t4)', marginBottom: 3 }}>{s.l}</div>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 800, color: s.c }}>{s.v}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Grade dist */}
                <div>
                  <div className="kpi-label" style={{ marginBottom: 10 }}>Grade Distribution</div>
                  {['A','B','C','D','E'].map(g => {
                    const count = fs.grade_distribution[g] || 0
                    const pct   = data.total > 0 ? count / data.total : 0
                    return (
                      <div key={g} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 800, color: GRADE_COLOR[g], width: 14 }}>{g}</span>
                        <div style={{ flex: 1, height: 8, background: 'var(--bg3)', borderRadius: 999, overflow: 'hidden' }}>
                          <div style={{ width: `${pct * 100}%`, height: '100%', background: GRADE_COLOR[g], borderRadius: 999, transition: 'width 0.6s ease' }} />
                        </div>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t3)', width: 36, textAlign: 'right' }}>{count}</span>
                      </div>
                    )
                  })}

                  <div className="kpi-label" style={{ marginTop: 16, marginBottom: 10 }}>Severity</div>
                  {['CRITICAL','HIGH','MEDIUM','LOW'].map(sev => {
                    const count = fs.severity_distribution?.[sev] || 0
                    return (
                      <div key={sev} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: SEV_COLOR[sev], width: 52 }}>{sev}</span>
                        <div style={{ flex: 1, height: 6, background: 'var(--bg3)', borderRadius: 999, overflow: 'hidden' }}>
                          <div style={{ width: `${data.total > 0 ? count / data.total * 100 : 0}%`, height: '100%', background: SEV_COLOR[sev], borderRadius: 999 }} />
                        </div>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t3)', width: 32, textAlign: 'right' }}>{count}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Research benchmark quick view */}
            {fs.benchmark_comparison && (
              <div className="card">
                <div className="card-header">
                  <span className="card-title">Research: Traditional vs Carbon-Aware</span>
                  <span className="card-meta">Core novelty of this system</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: 12 }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--t4)', marginBottom: 4 }}>Traditional Avg</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 24, fontWeight: 800, color: 'var(--t3)' }}>
                      {(fs.benchmark_comparison.traditional_avg_fitness * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: 12 }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--t4)', marginBottom: 4 }}>Carbon-Aware Avg</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 24, fontWeight: 800, color: 'var(--t3)' }}>
                      {(fs.benchmark_comparison.carbon_aware_avg_fitness * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div style={{ background: 'var(--t3)11', border: '1px solid var(--t3)33', borderRadius: 8, padding: 12 }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--t4)', marginBottom: 4 }}>Carbon Penalty</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 24, fontWeight: 800, color: 'var(--t3)' }}>
                      −{(fs.benchmark_comparison.penalty_delta * 100).toFixed(1)} pp
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: 10, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t4)', lineHeight: 1.6 }}>
                  {fs.benchmark_comparison.description}
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* ══════ TAB: BENCHMARK ══════ */}
      {activeTab === 'benchmark' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Fleet Benchmark</span>
            <span className="card-meta">Traditional sequence-only vs dual-objective carbon-aware</span>
          </div>
          <FleetBenchmarkPanel orderType={orderType} />
        </div>
      )}

      {/* ══════ TAB: HEATMAP ══════ */}
      {activeTab === 'heatmap' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Emission Heatmaps</span>
            <span className="card-meta">Activity intensity · Supplier violation rate</span>
          </div>
          <HeatmapPanel key="heatmap-loaded" />
        </div>
      )}

      {/* ══════ TAB: PROCESS MODEL ══════ */}
      {activeTab === 'model' && summary && (
        <div>
          <div className="row col-2">
            {/* Normative model */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">Normative Green Process Model</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'wrap', marginBottom: 16 }}>
                {summary.normative_model.map((act, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
                    <div style={{
                      padding: '6px 12px', borderRadius: 4, fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 700,
                      background: 'var(--t2)11', border: '1px solid var(--t2)33', color: 'var(--t2)',
                    }}>{act}</div>
                    {i < summary.normative_model.length - 1 && (
                      <span style={{ color: 'var(--t4)', margin: '0 4px' }}>→</span>
                    )}
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t4)' }}>Transport allowed:</span>
                {summary.allowed_transport.map(t => <Pill key={t} label={t} color="var(--t2)" />)}
                <Pill label="Air Freight = VIOLATION" color="var(--t4)" />
              </div>
            </div>

            {/* Carbon budgets */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">Per-Activity Carbon Budgets</span>
              </div>
              {Object.entries(summary.carbon_budgets || {})
                .sort(([,a],[,b]) => b - a)
                .map(([act, budget]) => {
                  const max = 700
                  const color = budget >= 700 ? 'var(--t4)' : budget >= 200 ? 'var(--t3)' : budget >= 50 ? 'var(--t3)' : 'var(--t2)'
                  return (
                    <div key={act} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <div style={{ width: 148, fontSize: 11, color: 'var(--t2)' }}>{act}</div>
                      <div style={{ flex: 1, height: 16, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
                        <div style={{ width: `${budget / max * 100}%`, height: '100%', background: color + 'aa', transition: 'width 0.5s ease' }} />
                        <span style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--t4)' }}>
                          {budget} kg
                        </span>
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>

          {/* Green Policy Rules */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Green Policy Engine</span>
              <span className="card-meta">{summary.green_policy_rules?.length} active rules</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              {(summary.green_policy_rules || []).map(r => (
                <div key={r.rule_id} style={{
                  background: 'var(--bg3)', border: `1px solid ${(SEV_COLOR[r.severity] || 'var(--t3)')}33`,
                  borderRadius: 8, padding: 12,
                }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                    <Pill label={r.severity} color={SEV_COLOR[r.severity] || 'var(--t3)'} small />
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t4)' }}>{r.rule_id}</span>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t2)', marginBottom: 3 }}>{r.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--t4)' }}>{r.description}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Traditional vs Carbon-Aware comparison */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Traditional vs Carbon-Aware Conformance</span>
              <span className="card-meta">Research contribution</span>
            </div>
            <div className="row col-2">
              <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: 16 }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t3)', marginBottom: 8, fontWeight: 700 }}>
                  TRADITIONAL (Sequence Only)
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--t2)', lineHeight: 2 }}>
                  Create Order →<br />
                  Goods Issue →<br />
                  <span style={{ color: 'var(--t3)' }}>Air Freight</span> →<br />
                  Delivery
                </div>
                <div style={{ marginTop: 8, padding: '6px 8px', background: 'var(--t2)11', borderRadius: 5 }}>
                  <span style={{ color: 'var(--t2)', fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700 }}>
                    ✓ SEQUENCE: PASS
                  </span>
                </div>
              </div>
              <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: 16 }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t3)', marginBottom: 8, fontWeight: 700 }}>
                  CARBON-AWARE (This System)
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--t2)', lineHeight: 2 }}>
                  Create Order →<br />
                  Goods Issue →<br />
                  <span style={{ color: 'var(--t4)' }}>Air Freight (702 kg)</span> →<br />
                  Delivery
                </div>
                <div style={{ marginTop: 8, padding: '6px 8px', background: 'var(--t4)11', borderRadius: 5 }}>
                  <span style={{ color: 'var(--t4)', fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700 }}>
                    ✗ CARBON: FAIL (budget 120 kg)
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════ TAB: TRACE EXPLORER ══════ */}
      {activeTab === 'traces' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Trace Explorer</span>
            {data && <span className="card-meta">{data.total.toLocaleString()} traces matched</span>}
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              placeholder="Supplier ID (e.g. S025)"
              value={supFilter}
              onChange={e => setSupFilter(e.target.value)}
              style={{
                background: 'var(--bg3)', border: '1px solid var(--b1)',
                color: 'var(--t2)', fontFamily: 'var(--mono)', fontSize: 11,
                padding: '7px 12px', borderRadius: 6, outline: 'none', width: 180,
              }}
            />
            <select value={orderType} onChange={e => setOrderType(e.target.value)}
              style={{ background: 'var(--bg3)', border: '1px solid var(--b1)', color: 'var(--t2)', fontFamily: 'var(--mono)', fontSize: 11, padding: '7px 12px', borderRadius: 6, outline: 'none' }}>
              <option value="standard">Standard (150 kg)</option>
              <option value="international">International (250 kg)</option>
              <option value="urgent">Urgent (350 kg)</option>
            </select>
            <select value={sevFilter} onChange={e => setSevFilter(e.target.value)}
              style={{ background: 'var(--bg3)', border: '1px solid var(--b1)', color: 'var(--t2)', fontFamily: 'var(--mono)', fontSize: 11, padding: '7px 12px', borderRadius: 6, outline: 'none' }}>
              <option value="">All Severities</option>
              {['CRITICAL','HIGH','MEDIUM','LOW'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={gradeFilter} onChange={e => setGradeFilter(e.target.value)}
              style={{ background: 'var(--bg3)', border: '1px solid var(--b1)', color: 'var(--t2)', fontFamily: 'var(--mono)', fontSize: 11, padding: '7px 12px', borderRadius: 6, outline: 'none' }}>
              <option value="">All Grades</option>
              {['A','B','C','D','E'].map(g => <option key={g} value={g}>Grade {g}</option>)}
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t3)', cursor: 'pointer' }}>
              <input type="checkbox" checked={violOnly} onChange={e => setViolOnly(e.target.checked)} />
              Violations only
            </label>
            <button onClick={applyFilters} style={{
              background: 'var(--bg3)', border: '1px solid var(--t2)', color: 'var(--t2)',
              fontFamily: 'var(--mono)', fontSize: 11, padding: '7px 14px', borderRadius: 6,
              cursor: 'pointer', fontWeight: 700,
            }}>Apply</button>
          </div>

          {err     && <Err msg={err} />}
          {loading && <Spinner text="Running conformance check…" />}

          {data && !loading && (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      {['Order','Supplier','Rating','Actual kg','Budget kg','Carbon','Sequence','Combined','Grade','Severity','Transport','Saving kg',''].map(h => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.traces.map(t => (
                      <tr key={t.order_id} style={{ cursor: 'pointer' }} onClick={() => setSelected(t.order_id)}>
                        <td style={{ color: 'var(--t1)', fontWeight: 700 }}>{t.order_id}</td>
                        <td>{t.supplier_id}</td>
                        <td><Pill label={t.supplier_rating || '?'} color={GRADE_COLOR[t.supplier_rating] || 'var(--t3)'} small /></td>
                        <td style={{ color: 'var(--t4)', fontFamily: 'var(--mono)', fontSize: 11 }}>{t.actual_emission.toLocaleString()}</td>
                        <td style={{ color: 'var(--t4)', fontFamily: 'var(--mono)', fontSize: 11 }}>{t.budget}</td>
                        <td>
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700,
                            color: t.carbon_fitness < 0.5 ? 'var(--t4)' : t.carbon_fitness < 0.85 ? 'var(--t3)' : 'var(--t2)',
                          }}>
                            {(t.carbon_fitness * 100).toFixed(1)}%
                          </span>
                        </td>
                        <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t3)' }}>
                          {(t.sequence_fitness * 100).toFixed(1)}%
                        </td>
                        <td style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: 'var(--t3)' }}>
                          {(t.combined_fitness * 100).toFixed(1)}%
                        </td>
                        <td><Pill label={t.grade} color={GRADE_COLOR[t.grade]} /></td>
                        <td><Pill label={t.severity} color={SEV_COLOR[t.severity] || 'var(--t3)'} small /></td>
                        <td style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t4)' }}>
                          {t.transport_used}
                        </td>
                        <td style={{ color: 'var(--t2)', fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700 }}>
                          {t.potential_saving.toLocaleString()}
                        </td>
                        <td>
                          <button
                            onClick={e => { e.stopPropagation(); setSelected(t.order_id) }}
                            style={{
                              background: 'rgba(255,255,255,0.04)',
                              border: '1px solid rgba(255,255,255,0.08)',
                              color: 'var(--t2)',
                              fontFamily: 'var(--mono)',
                              fontSize: 10,
                              padding: '5px 10px',
                              borderRadius: 8,
                              cursor: 'pointer',
                            }}>
                            Trace →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t4)' }}>
                  {page * LIMIT + 1}–{Math.min((page + 1) * LIMIT, data.total)} of {data.total.toLocaleString()}
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => load(page - 1)} disabled={page === 0}
                    style={{ background: 'var(--bg3)', border: '1px solid var(--b1)', color: 'var(--t3)', fontFamily: 'var(--mono)', fontSize: 11, padding: '5px 12px', borderRadius: 6, cursor: 'pointer', opacity: page === 0 ? 0.4 : 1 }}>
                    ← Prev
                  </button>
                  <button onClick={() => load(page + 1)} disabled={(page + 1) * LIMIT >= data.total}
                    style={{ background: 'var(--bg3)', border: '1px solid var(--b1)', color: 'var(--t3)', fontFamily: 'var(--mono)', fontSize: 11, padding: '5px 12px', borderRadius: 6, cursor: 'pointer', opacity: (page + 1) * LIMIT >= data.total ? 0.4 : 1 }}>
                    Next →
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Trace drawer */}
      {selected && (
        <TraceDrawer
          orderId={selected}
          orderType={orderType}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  )
}