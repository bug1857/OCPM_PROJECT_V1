import { useState, useRef } from 'react'

const BASE = 'http://127.0.0.1:8000'

const fitnessColor = f =>
  f >= 0.85 ? 'var(--t2)' : f >= 0.5 ? 'var(--t3)' : 'var(--t4)'

const seqColor = f =>
  f >= 0.9 ? 'var(--t2)' : f >= 0.6 ? 'var(--t3)' : 'var(--t4)'

const transportBadgeColor = t =>
  t === 'Air Freight'  ? 'var(--t4)' :
  t === 'Road Freight' ? 'var(--t3)' :
  t === 'Sea Freight'  ? 'var(--t2)' : 'var(--t4)'

export default function EventLogs() {
  const [stats,    setStats]    = useState(null)
  const [traces,   setTraces]   = useState([])
  const [total,    setTotal]    = useState(0)
  const [page,     setPage]     = useState(0)
  const [selected, setSelected] = useState(null)
  const [detail,   setDetail]   = useState(null)
  const [loading,  setLoading]  = useState(false)
  const [uploading,setUploading]= useState(false)
  const [err,      setErr]      = useState('')
  const [violOnly, setViolOnly] = useState(false)
  const fileRef = useRef()
  const LIMIT = 20

  const upload = async (file) => {
    if (!file) return
    setUploading(true)
    setErr('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res  = await fetch(`${BASE}/upload-csv`, { method: 'POST', body: fd })
      const data = await res.json()
      if (data.error) { setErr(data.error); return }
      setStats(data.stats)
      loadTraces(0, false)
    } catch (e) {
      setErr('Upload failed: ' + e.message)
    } finally {
      setUploading(false)
    }
  }

  const loadTraces = async (p = 0, vOnly = violOnly) => {
    setLoading(true)
    try {
      const res  = await fetch(`${BASE}/event-log/traces?limit=${LIMIT}&offset=${p * LIMIT}&violation_only=${vOnly}`)
      const data = await res.json()
      setTraces(data.traces || [])
      setTotal(data.total  || 0)
      setPage(p)
    } catch (e) {
      setErr(e.message)
    } finally {
      setLoading(false)
    }
  }

  const loadDetail = async (orderId) => {
    setSelected(orderId)
    const res  = await fetch(`${BASE}/event-log/trace/${orderId}`)
    const data = await res.json()
    setDetail(data)
  }

  const toggleViolOnly = () => {
    const next = !violOnly
    setViolOnly(next)
    loadTraces(0, next)
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Event Log Explorer</div>
          <div className="page-sub">OCEL 2.0 · Upload CSV · Trace-level analysis · Token replay</div>
        </div>
      </div>

      {/* Upload */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Load Event Log</span>
          <span className="card-meta">CSV · events.csv format</span>
        </div>

        <div
          style={{
            border: '2px dashed var(--b2)', borderRadius: 10,
            padding: '28px', textAlign: 'center', cursor: 'pointer',
            background: 'var(--bg3)',
            transition: 'border-color 0.2s',
          }}
          onClick={() => fileRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); upload(e.dataTransfer.files[0]) }}
        >
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t4)', marginBottom: 8 }}>
            DRAG & DROP OR CLICK TO UPLOAD
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t4)' }}>
            event_id · order_id · supplier_id · activity · timestamp · carbon_factor · carbon_budget
          </div>
          {uploading && (
            <div style={{ marginTop: 12, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t3)' }}>
              Parsing traces...
            </div>
          )}
        </div>
        <input
          ref={fileRef} type="file" accept=".csv"
          style={{ display: 'none' }}
          onChange={e => upload(e.target.files[0])}
        />
        {err && <div className="error-box" style={{ marginTop: 10 }}>{err}</div>}
      </div>

      {/* Stats */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 10 }}>
          {[
            { label: 'Traces',          val: stats.total_traces?.toLocaleString() },
            { label: 'Carbon Violations',val: stats.carbon_violations?.toLocaleString(), warn: true },
            { label: 'Process Violations', val: (stats.process_violations ?? stats.seq_violations)?.toLocaleString(), warn: true },
            { label: 'Compliance',      val: stats.compliance_rate + '%' },
            { label: 'Avg CO₂ Fitness', val: stats.avg_carbon_fitness?.toFixed(3) },
            { label: 'Total CO₂e',      val: (stats.total_emission / 1000).toFixed(1) + 'k kg' },
          ].map(k => (
            <div className="kpi" key={k.label} style={{ borderColor: 'var(--b1)' }}>
              <div className="kpi-label">{k.label}</div>
              <div className="kpi-value" style={{ fontSize: 18, color: k.warn ? 'var(--t4)' : 'var(--t2)' }}>
                {k.val}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Trace table */}
      {traces.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Trace Explorer</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="card-meta">{total.toLocaleString()} traces</span>
              <button
                onClick={toggleViolOnly}
                style={{
                  background: violOnly ? 'var(--bg3)' : 'var(--bg3)',
                  border: `1px solid ${violOnly ? 'var(--t4)66' : 'var(--b1)'}`,
                  color: violOnly ? 'var(--t4)' : 'var(--t3)',
                  fontFamily: 'var(--mono)', fontSize: 10,
                  padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                }}
              >
                {violOnly ? '✗ Violations Only' : 'All Traces'}
              </button>
            </div>
          </div>

          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '100px 80px 70px 100px 90px 90px 1fr', gap: 8, padding: '6px 0 10px', borderBottom: '1px solid var(--b1)' }}>
            {['Order', 'Supplier', 'Rating', 'Transport', 'CO₂ Fitness', 'Seq Fitness', 'Activities'].map(h => (
              <span key={h} style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: 1 }}>{h}</span>
            ))}
          </div>

          {loading
            ? <div className="loading">Loading traces...</div>
            : traces.map(t => (
              <div
                key={t.order_id}
                onClick={() => loadDetail(t.order_id)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '100px 80px 70px 100px 90px 90px 1fr',
                  gap: 8, padding: '9px 0',
                  borderBottom: '1px solid #111',
                  cursor: 'pointer',
                  background: selected === t.order_id ? 'var(--bg3)' : 'transparent',
                  borderRadius: 4,
                }}
              >
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t2)', fontWeight: 700 }}>{t.order_id}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t3)' }}>{t.supplier_id}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>
                  <span style={{
                    background: 'var(--bg4)', border: '1px solid #333',
                    padding: '1px 6px', borderRadius: 3, fontWeight: 700,
                    color: { A:'var(--t2)',B:'var(--t3)',C:'var(--t3)',D:'var(--t3)',E:'var(--t4)' }[t.supplier_rating] || 'var(--t4)'
                  }}>{t.supplier_rating}</span>
                </span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: transportBadgeColor(t.transport_used) }}>{t.transport_used}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: fitnessColor(t.carbon_fitness) }}>
                  {(t.carbon_fitness ?? 0).toFixed(3)}
                </span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: seqColor(t.seq_fitness) }}>
                  {(t.seq_fitness ?? 0).toFixed(3)}
                </span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.activities?.join(' → ')}
                </span>
              </div>
            ))
          }

          {/* Pagination */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t4)' }}>
              {page * LIMIT + 1}–{Math.min((page + 1) * LIMIT, total)} of {total.toLocaleString()}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              {[['← Prev', page - 1, page === 0], ['Next →', page + 1, (page + 1) * LIMIT >= total]].map(([label, p, disabled]) => (
                <button key={label} onClick={() => !disabled && loadTraces(p)} disabled={disabled}
                  style={{
                    background: 'var(--bg3)', border: '1px solid var(--b1)',
                    color: 'var(--t3)', fontFamily: 'var(--mono)', fontSize: 11,
                    padding: '5px 12px', borderRadius: 6, cursor: disabled ? 'default' : 'pointer',
                    opacity: disabled ? 0.4 : 1,
                  }}>{label}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Trace detail */}
      {detail && detail.summary && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Trace Detail — {detail.summary.order_id}</span>
            <button onClick={() => { setDetail(null); setSelected(null) }}
              style={{ background: 'none', border: '1px solid var(--b1)', color: 'var(--t3)', fontFamily: 'var(--mono)', fontSize: 10, padding: '3px 8px', borderRadius: 4, cursor: 'pointer' }}>
              Close
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 16 }}>
            {[
              { label: 'Supplier',      val: detail.summary.supplier_id },
              { label: 'Total CO₂e',   val: detail.summary.total_emission + ' kg' },
              { label: 'Budget',        val: detail.summary.carbon_budget + ' kg' },
              { label: 'Carbon Fitness',val: detail.summary.carbon_fitness?.toFixed(4),
                color: fitnessColor(detail.summary.carbon_fitness) },
              { label: 'Seq Fitness',  val: detail.summary.seq_fitness?.toFixed(4),
                color: seqColor(detail.summary.seq_fitness) },
              { label: 'Transport',    val: detail.summary.transport_used },
              { label: 'Carbon OK',    val: detail.summary.carbon_ok ? '✓ PASS' : '✗ FAIL',
                color: detail.summary.carbon_ok ? 'var(--t2)' : 'var(--t4)' },
              { label: 'Events',       val: detail.summary.event_count },
            ].map(k => (
              <div className="inner" key={k.label}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{k.label}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color: k.color || 'var(--t2)' }}>{k.val}</div>
              </div>
            ))}
          </div>

          {detail.summary.missing_steps?.length > 0 && (
            <div style={{ marginBottom: 10, padding: '8px 12px', background: 'var(--bg3)', border: '1px solid var(--t4)33', borderRadius: 6, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t4)' }}>
              Missing steps: {detail.summary.missing_steps.join(', ')}
            </div>
          )}

          {/* Event timeline */}
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Event Timeline</div>
          {detail.events?.map((e, i) => (
            <div key={e.event_id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '7px 0', borderBottom: '1px solid #111',
              fontFamily: 'var(--mono)', fontSize: 11,
            }}>
              <span style={{ color: 'var(--t4)', width: 28 }}>{i + 1}.</span>
              <span style={{ color: 'var(--t2)', width: 180, fontWeight: 600 }}>{e.activity}</span>
              <span style={{ color: 'var(--t4)', flex: 1 }}>{e.timestamp}</span>
              <span style={{ color: e.carbon_factor > 100 ? 'var(--t4)' : e.carbon_factor > 30 ? 'var(--t3)' : 'var(--t3)', width: 80, textAlign: 'right' }}>
                {e.carbon_factor} kg
              </span>
              {e.violation_type && e.violation_type.toUpperCase() !== 'NONE' && e.violation_type.trim() !== '' && (
                <span style={{ background: 'var(--bg3)', border: '1px solid var(--t4)33', color: 'var(--t4)', padding: '1px 6px', borderRadius: 3, fontSize: 9 }}>
                  {e.violation_type}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!stats && !uploading && (
        <div style={{ textAlign: 'center', padding: '60px 0', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t4)' }}>
          Upload events.csv to begin trace analysis
        </div>
      )}
    </>
  )
}