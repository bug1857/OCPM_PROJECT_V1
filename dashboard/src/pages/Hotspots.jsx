import { useEffect, useState } from 'react'
import { SkeletonCards, SkeletonTable } from '../Skeleton'
import { getActivities } from '../api'

const BASE_EF = {
  'Air Freight': 300, 'Road Freight': 120, 'Sea Freight': 50,
  'Warehouse Transfer': 20, 'Customs Clearance': 15, 'Delivery': 10,
  'Goods Issue': 5, 'Supplier Selection': 2, 'Create Order': 1,
}

const ACT_COLOR = () => 'var(--t3)'

export default function Hotspots() {
  const [data, setData] = useState(null)
  const [err,  setErr]  = useState(null)

  useEffect(() => { getActivities().then(setData).catch(e => setErr(e.message)) }, [])

  if (err)   return <div className="error-box">API error: {err}</div>
  if (!data) return <SkeletonCards count={3} />

  const max = data.activities[0]?.total_emissions || 1

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Carbon Hotspot Analysis</div>
          <div className="page-sub">Activity emissions · Conformance gaps · High-impact processes</div>
        </div>
      </div>

      {/* Executive Emission Ranking */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Carbon Hotspot Intelligence</span>
          <span className="card-meta">Ranked by emission factor impact</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 24 }}>
          <div
            style={{
              background: 'var(--bg3)',
              border: '1px solid var(--b1)',
              borderRadius: 14,
              padding: 24,
            }}
          >
            <div style={{ color: 'var(--t4)', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase' }}>
              Largest Carbon Hotspot
            </div>

            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--t1)', marginTop: 12 }}>
              Air Freight
            </div>

            <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1, marginTop: 18, color: 'var(--t1)' }}>
              300
            </div>

            <div style={{ color: 'var(--t3)', marginTop: 8 }}>
              kg CO₂e emission factor
            </div>

            <div
              style={{
                marginTop: 24,
                padding: 14,
                borderRadius: 10,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid var(--b1)',
              }}
            >
              <div style={{ fontSize: 12, color: 'var(--t3)' }}>
                Air freight generates approximately
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--t1)', marginTop: 4 }}>
                6× higher emissions
              </div>
              <div style={{ fontSize: 12, color: 'var(--t4)', marginTop: 4 }}>
                compared to Sea Freight
              </div>
            </div>
          </div>

          <div>
            {[...Object.entries(BASE_EF)]
              .sort((a, b) => b[1] - a[1])
              .map(([name, ef], idx) => (
                <div
                  key={name}
                  style={{
                    marginBottom: 18,
                    paddingBottom: 14,
                    borderBottom: '1px solid var(--b1)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 8,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 6,
                          background: 'var(--bg4)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'var(--t1)',
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        {idx + 1}
                      </div>
                      <span style={{ color: 'var(--t1)', fontWeight: 600 }}>{name}</span>
                    </div>

                    <span
                      style={{
                        fontFamily: 'var(--mono)',
                        color: 'var(--t1)',
                        fontWeight: 700,
                      }}
                    >
                      {ef} kg
                    </span>
                  </div>

                  <div
                    style={{
                      height: 10,
                      background: 'var(--bg3)',
                      borderRadius: 999,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${(ef / 300) * 100}%`,
                        height: '100%',
                        background: 'var(--t3)',
                        borderRadius: 999,
                      }}
                    />
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Real activity totals from API */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Actual Activity Emissions</span>
          <span className="card-meta">From events log · {data.total_activity_co2e.toLocaleString()} kg total</span>
        </div>
        {data.activities.map(a => (
          <div key={a.activity} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t3)', width: 160, minWidth: 160 }}>{a.activity}</span>
            <div className="bar-track" style={{ flex: 1, height: 8 }}>
              <div className="bar-fill" style={{ width: `${(a.total_emissions / max) * 100}%`, background: ACT_COLOR(BASE_EF[a.activity] || 10) }} />
            </div>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t2)', width: 100, textAlign: 'right' }}>
              {a.total_emissions.toLocaleString()}
            </span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t4)', width: 42, textAlign: 'right' }}>{a.pct_of_total}%</span>
          </div>
        ))}
      </div>

      {/* Formula */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Emission Calculation Model</span>
          <span className="card-meta">ActivityEmission = EmissionFactor × SupplierCarbonIntensity</span>
        </div>
        <div className="code-block">
          <span style={{ color: 'var(--t4)' }}>{'//'} Example: S017 (carbon intensity = 2.34)</span><br />
          Air Freight = <span style={{ color: 'var(--t2)' }}>300</span> × <span style={{ color: 'var(--t2)' }}>2.34</span> = <span style={{ color: 'var(--t1)', fontWeight: 700 }}>702.0 kg CO₂e</span><br />
          Road Freight = <span style={{ color: 'var(--t2)' }}>120</span> × <span style={{ color: 'var(--t2)' }}>2.34</span> = <span style={{ color: 'var(--t2)', fontWeight: 700 }}>280.8 kg CO₂e</span><br />
          Sea Freight = <span style={{ color: 'var(--t2)' }}>50</span> × <span style={{ color: 'var(--t2)' }}>2.34</span> = <span style={{ color: 'var(--t3)', fontWeight: 700 }}>117.0 kg CO₂e</span><br />
          <span style={{ color: 'var(--t4)' }}>{'//'} Sea Freight is 83.3% lower than Air for the same supplier</span>
        </div>
      </div>
    </>
  )
}