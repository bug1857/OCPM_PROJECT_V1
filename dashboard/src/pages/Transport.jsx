import { useEffect, useState, useRef } from 'react'
import { SkeletonCards, SkeletonTable } from '../Skeleton'
import { getTransport } from '../api'

const EF = [
  { label: 'Air Freight', value: 300, color: 'var(--t4)' },
  { label: 'Road Freight', value: 120, color: 'var(--t3)' },
  { label: 'Sea Freight', value: 50, color: 'var(--t2)' },
  { label: 'Warehouse Transfer', value: 20, color: 'var(--t3)' },
  { label: 'Customs Clearance', value: 15, color: 'var(--t2)' },
  { label: 'Delivery', value: 10, color: 'var(--t3)' },
  { label: 'Goods Issue', value: 5, color: 'var(--t4)' },
]

const COLORS = {
  'Air Freight': 'var(--t4)',
  'Road Freight': 'var(--t3)',
  'Sea Freight': 'var(--t1)'
}

export default function Transport() {
  const [data, setData] = useState(null)
  const [err,  setErr]  = useState(null)
  const chartRef = useRef(null)
  const chartInst = useRef(null)

  useEffect(() => { getTransport().then(setData).catch(e => setErr(e.message)) }, [])

  useEffect(() => {
    if (!data || !chartRef.current) return
    const Chart = window.Chart
    if (!Chart) {
      console.warn('Chart.js not loaded')
      return
    }
    if (chartInst.current) chartInst.current.destroy()
    chartInst.current = new Chart(chartRef.current, {
      type: 'bar',
      data: {
        labels: EF.map(e => e.label),
        datasets: [{ data: EF.map(e => e.value), backgroundColor: EF.map(e => e.color), borderRadius: 4 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => c.raw + ' kg CO₂e' } } },
        scales: {
          x: { ticks: { color: 'var(--t3)', font: { family: 'JetBrains Mono', size: 10 }, maxRotation: 35 }, grid: { color: 'var(--b2)' } },
          y: { ticks: { color: 'var(--t3)', font: { family: 'JetBrains Mono', size: 10 } }, grid: { color: 'var(--b2)' } }
        }
      }
    })
  }, [data])

  if (err)   return <div className="error-box">API error: {err}</div>
  if (!data) return <SkeletonCards count={3} />

  const max = Math.max(...data.breakdown.map(d => d.emissions))

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Transport Emissions Analysis</div>
          <div className="page-sub">Scope 3 · Freight Mode Comparison · {data.total_transport_co2e.toLocaleString()} kg CO₂e total</div>
        </div>
      </div>

      <div className="row col-2">
        <div className="card">
          <div className="card-header">
            <span className="card-title">Emissions by Mode</span>
            <span className="card-meta">kg CO₂e</span>
          </div>
          {data.breakdown.map(d => (
            <div className="t-row" key={d.transport_type}>
              <span className="t-label">{d.transport_type}</span>
              <div className="bar-track" style={{ flex: 1, height: 10 }}>
                <div className="bar-fill" style={{ width: `${(d.emissions / max) * 100}%`, background: COLORS[d.transport_type] || 'var(--t3)' }} />
              </div>
              <span className="t-val">{d.emissions.toLocaleString()}</span>
              <span className="t-pct">{d.pct_of_total}%</span>
            </div>
          ))}
          <div className="inner" style={{ marginTop: 16, borderColor: 'var(--b2)' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t4)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Key Insight</div>
            <div style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.7 }}>
              Air Freight generates <span style={{ fontWeight: 700, color: 'var(--t1)' }}>3.25×</span> more emissions than Sea Freight.
              Substitution could save an estimated <span style={{ fontWeight: 700, color: 'var(--t1)' }}>533,656 kg CO₂e</span>.
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Emission Factor Comparison</span>
            <span className="card-meta">kg CO₂e per unit (base)</span>
          </div>
          {!window.Chart && (
            <div className="error-box" style={{ marginBottom: 12 }}>
              Chart.js is not loaded. Install chart.js and import it in main.jsx.
            </div>
          )}
          <div style={{ position: 'relative', width: '100%', height: 240 }}>
            <canvas ref={chartRef} />
          </div>
        </div>
      </div>

      {/* Donut summary */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Transport vs Total Emissions</span>
          <span className="card-meta">71.1% of all CO₂e comes from transport</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
          {data.breakdown.map(d => (
            <div className="inner" key={d.transport_type} style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t4)', marginBottom: 6 }}>{d.transport_type.toUpperCase()}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 800, color: 'var(--t1)', letterSpacing: -1 }}>
                {(d.emissions / 1000).toFixed(1)}k
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t4)', marginTop: 2 }}>kg CO₂e</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: 'var(--t1)', marginTop: 6 }}>{d.pct_of_total}%</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t4)' }}>{d.frequency.toLocaleString()} events</div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}