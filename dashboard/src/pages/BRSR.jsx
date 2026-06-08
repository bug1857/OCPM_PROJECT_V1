import { useEffect, useState } from 'react'
import { SkeletonCards, SkeletonTable } from '../Skeleton'

const BASE = 'http://127.0.0.1:8000'

const api = (path) => fetch(BASE + path).then(r => r.json())

// ── helpers ──────────────────────────────────────────────────────────────────
const fmt  = (n, d = 1) => (typeof n === 'number' ? n.toFixed(d) : '—')
const fmtK = (n) => (typeof n === 'number' ? (n / 1000).toFixed(1) + 'k' : '—')

const STATUS = {
  COMPLIANT: {
    label: 'COMPLIANT',
    color: 'var(--t2)',
    bg: 'var(--bg4)',
  },
  PARTIAL: {
    label: 'PARTIAL',
    color: 'var(--t3)',
    bg: 'var(--bg3)',
  },
  NON_COMPLIANT: {
    label: 'ATTENTION',
    color: 'var(--t4)',
    bg: 'var(--bg3)',
  },
}

const statusFor = (val, thresh1 = 0.8, thresh2 = 0.5) =>
  val >= thresh1 ? STATUS.COMPLIANT : val >= thresh2 ? STATUS.PARTIAL : STATUS.NON_COMPLIANT

// ── section header ────────────────────────────────────────────────────────────
function SectionHead({ code, title, sub }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t4)', letterSpacing: 2 }}>{code}</span>
        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--t2)' }}>{title}</span>
      </div>
      {sub && <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t4)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

// ── evidence row ─────────────────────────────────────────────────────────────
function EvidenceRow({ label, value, status, mono = true }) {
  const s = status || STATUS.COMPLIANT
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '9px 0', borderBottom: '1px solid #181818',
    }}>
      <span style={{ fontSize: 12, color: 'var(--t3)' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontFamily: mono ? 'var(--mono)' : 'inherit', fontSize: 12, color: 'var(--t2)', fontWeight: 700 }}>{value}</span>
        <span style={{
          fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700,
          padding: '2px 7px', borderRadius: 3,
          background: s.bg, color: s.color, border: '1px solid #2f2f2f',
        }}>{s.label}</span>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
export default function BRSR() {
  const [kpis,    setKpis]    = useState(null)
  const [conf,    setConf]    = useState(null)
  const [trans,   setTrans]   = useState(null)
  const [sups,    setSups]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [printed, setPrinted] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => {
    Promise.all([
      api('/kpis'),
      api('/conformance/summary'),
      api('/transport'),
      api('/suppliers'),
    ]).then(([k, c, t, s]) => {
      setKpis(k); setConf(c); setTrans(t); setSups(s)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const downloadPDF = async () => {
    try {
      setExporting(true)
      setToast('Generating PDF...')

      const res = await fetch(`${BASE}/export-brsr-pdf`)
      if (!res.ok) throw new Error('PDF generation failed')

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)

      const a = document.createElement('a')
      a.href = url
      a.download = `BRSR_Report_${new Date().toISOString().slice(0,10)}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()

      window.URL.revokeObjectURL(url)

      setToast('PDF downloaded successfully')
      setTimeout(() => setToast(''), 3000)

    } catch (e) {
      setToast('Export failed')
      setTimeout(() => setToast(''), 3000)
    } finally {
      setExporting(false)
    }
  }

  if (loading) return <div className="loading">Generating BRSR report...</div>
  if (!kpis || !conf) return (
    <div className="error-box">
      Data not available. Upload events.csv and ensure backend is running.
    </div>
  )

  // ── derived metrics ────────────────────────────────────────────────────────
  // All KPI numbers sourced from /kpis (compute_kpis) — same as Cockpit and Violations
  const complianceRate  = kpis.compliance_pct  ?? 0
  const totalCO2e       = kpis.total_co2e_kg   ?? 0
  const avgEmission     = kpis.avg_emission_kg ?? 0
  const violations      = kpis.violations       ?? 0
  const totalOrders     = kpis.total_orders     ?? 0
  // BUG-F5 FIX: don't substitute compliance_rate for carbon_fitness — they're different metrics.
  // If carbon_fitness data is unavailable, show 0 rather than a misleading proxy.
  const carbonFitness   = (conf?.avg_carbon_fitness > 0 && conf?.avg_carbon_fitness <= 1)
    ? conf.avg_carbon_fitness
    : 0
  const airPct          = trans?.breakdown?.find(b => b.transport_type === 'Air Freight')?.pct_of_total ?? 50
  const seaPct          = trans?.breakdown?.find(b => b.transport_type === 'Sea Freight')?.pct_of_total ?? 20
  const eRatedCount     = sups?.suppliers?.filter(s => s.rating === 'E').length ?? 0
  const totalSuppliers  = sups?.count ?? 50
  const scope3Share     = 71.1

  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })
  const fy    = '2024–25'

  return (
    <>
      <style>{`
@media print {
  .sidebar, .nav-item, .logo, .sidebar-footer { display: none !important; }
  .app { display: block !important; }
  .main { padding: 8px !important; overflow: visible !important; }
  body, html { background: #fff !important; }
  .card { border: 1px solid #ddd !important; break-inside: avoid; }
  .no-print { display: none !important; }
}
      `}</style>

      <div className="page-header">
        <div>
          <div className="page-title">BRSR Report Generator</div>
          <div className="page-sub">
            Business Responsibility & Sustainability Reporting · FY {fy} · GHG Protocol aligned
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }} className="no-print">
          <span className="live-tag">BRSR 2024–25</span>
          <button
            onClick={downloadPDF}
            disabled={exporting}
            style={{
              background: exporting ? 'var(--bg4)' : 'var(--bg3)',
              border: '1px solid var(--b1)',
              color: exporting ? 'var(--t4)' : 'var(--t3)',
              fontFamily: 'var(--mono)',
              fontSize: 11,
              padding: '6px 14px',
              borderRadius: 6,
              cursor: exporting ? 'not-allowed' : 'pointer',
              opacity: exporting ? 0.7 : 1
            }}
          >
            {exporting ? 'Generating PDF...' : 'Export Publication PDF'}
          </button>
        </div>
      </div>

      {toast && (
        <div style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          background: 'var(--bg2)',
          border: '1px solid #333',
          color: 'var(--t1)',
          padding: '10px 14px',
          fontFamily: 'var(--mono)',
          fontSize: 11,
          borderRadius: 6,
          zIndex: 9999
        }}>
          {toast}
        </div>
      )}

      {/* ── Report Header ── */}
      <div className="card" style={{ borderColor: 'var(--b2)', pageBreakInside: 'avoid' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--t4)', letterSpacing: 2, marginBottom: 6 }}>
              BUSINESS RESPONSIBILITY AND SUSTAINABILITY REPORT
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--t1)', marginBottom: 4 }}>
              SustainOCPM — Supply Chain ESG Disclosure
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t4)' }}>
              Financial Year {fy} · Generated {today} · SEBI BRSR Format
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--t4)', marginBottom: 4 }}>FRAMEWORK</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t3)', lineHeight: 1.8 }}>
              GHG Protocol<br />
              SEBI BRSR Core<br />
              BEE (India) Norms<br />
              ISO 14064
            </div>
          </div>
        </div>

        {/* Summary bar */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, marginTop: 20 }}>
          {[
            { label: 'Total Orders',      val: totalOrders.toLocaleString(),           color: 'var(--t2)' },
            { label: 'Compliance Rate',   val: complianceRate.toFixed(1) + '%',         color: 'var(--t2)' },
            { label: 'Total CO₂e',        val: (totalCO2e / 1000).toFixed(0) + 'k kg', color: 'var(--t2)' },
            { label: 'Total Violations',  val: violations.toLocaleString(),              color: 'var(--t2)' },
            { label: 'Carbon Fitness',    val: (carbonFitness * 100).toFixed(1) + '%',  color: 'var(--t2)' },
          ].map(k => (
            <div key={k.label} style={{ background: 'var(--bg3)', borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{k.label}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 800, color: k.color }}>{k.val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── SECTION A: General Disclosures ── */}
      <div className="card" style={{ pageBreakInside: 'avoid' }}>
        <SectionHead code="SECTION A" title="General Disclosures" sub="Entity overview and supply chain profile" />
        <EvidenceRow label="Reporting Entity"            value="SustainOCPM — Louis India Supply Chain" status={STATUS.COMPLIANT} />
        <EvidenceRow label="Reporting Period"            value={`FY ${fy}`}                             status={STATUS.COMPLIANT} />
        <EvidenceRow label="Total Suppliers Monitored"   value={totalSuppliers}                         status={STATUS.COMPLIANT} />
        <EvidenceRow label="Total Orders Tracked"        value={totalOrders.toLocaleString()}           status={STATUS.COMPLIANT} />
        <EvidenceRow label="Process Mining Framework"    value="OCEL 2.0 — Object-Centric Event Log"   status={STATUS.COMPLIANT} />
        <EvidenceRow label="Carbon Attribution Method"   value="ecoinvent EF × Supplier Carbon Intensity" status={STATUS.COMPLIANT} />
        <EvidenceRow label="Conformance Engine"          value="Dual-objective: Sequence + Carbon Budget" status={STATUS.COMPLIANT} />
      </div>

      {/* ── SECTION B: Management & Process ── */}
      <div className="card" style={{ pageBreakInside: 'avoid' }}>
        <SectionHead code="SECTION B" title="Management & Process Governance" sub="Green process model and policy engine" />
        <EvidenceRow
          label="Normative Process Model Defined"
          value="Create Order → Goods Issue → Freight Booking → [Transport] → Warehouse Transfer → Customs Clearance → Delivery"
          status={STATUS.COMPLIANT} mono={false}
        />
        <EvidenceRow label="Air Freight Policy"          value="POLICY-01: Absolute Ban (CRITICAL violation)" status={STATUS.COMPLIANT} />
        <EvidenceRow label="Carbon Budget per Activity"  value="7 activities with defined kg CO₂e caps"       status={STATUS.COMPLIANT} />
        <EvidenceRow label="Supplier ESG Rating System"  value="A–E scale, carbon intensity multiplier"       status={STATUS.COMPLIANT} />
        <EvidenceRow label="Green Policy Rules Active"   value="6 rules (CRITICAL/HIGH/MEDIUM/LOW/INFO)"      status={STATUS.COMPLIANT} />
        <EvidenceRow label="Automated Rerouting Engine"  value="Sea Freight priority, urgent → Road Freight"  status={STATUS.COMPLIANT} />
      </div>

      {/* ── SECTION C: Environmental — Scope 3 ── */}
      <div className="card" style={{ pageBreakInside: 'avoid' }}>
        <SectionHead
          code="SECTION C — PRINCIPLE 6"
          title="Environmental Responsibility — Scope 3 Emissions"
          sub="GHG Protocol Scope 3 · Category 4 (Upstream Transportation)"
        />

        <EvidenceRow
          label="Total Scope 3 CO₂e (Transport)"
          value={`${(totalCO2e * scope3Share / 100 / 1000).toFixed(0)}k kg CO₂e`}
          status={statusFor(complianceRate / 100)}
        />
        <EvidenceRow
          label="Transport Share of Total Emissions"
          value={`${scope3Share}%`}
          status={STATUS.PARTIAL}
        />
        <EvidenceRow
          label="Air Freight Emissions Share"
          value={`${airPct}%`}
          status={airPct > 30 ? STATUS.NON_COMPLIANT : STATUS.COMPLIANT}
        />
        <EvidenceRow
          label="Sea Freight Emissions Share"
          value={`${seaPct}%`}
          status={seaPct >= 40 ? STATUS.COMPLIANT : STATUS.PARTIAL}
        />
        <EvidenceRow
          label="Average Emission per Order"
          value={`${fmt(avgEmission, 1)} kg CO₂e`}
          status={statusFor(avgEmission < 300 ? 1 : 0.5)}
        />
        <EvidenceRow
          label="Carbon Fitness Score (Fleet)"
          value={`${(carbonFitness * 100).toFixed(1)}%`}
          status={statusFor(carbonFitness)}
        />
        <EvidenceRow
          label="Conformance Compliance Rate"
          value={`${fmt(complianceRate, 2)}%`}
          status={statusFor(complianceRate / 100)}
        />

        {/* Emission reduction potential */}
        <div style={{ marginTop: 16, padding: '12px 14px', background: 'var(--bg3)', borderRadius: 8, border: '1px solid var(--b1)' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            Emission Reduction Opportunity
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
            {[
              { label: 'If Air → Sea (83% saving)',  val: `${((totalCO2e * airPct / 100) * 0.83 / 1000).toFixed(0)}k kg` },
              { label: 'Current violations cost',    val: `${(violations * avgEmission / 1000).toFixed(0)}k kg` },
              { label: 'Potential compliance gain',  val: `${fmt(100 - complianceRate, 1)}% orders` },
            ].map(s => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--t4)', marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 800, color: 'var(--t2)' }}>{s.val}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── SECTION C: Supplier ESG ── */}
      <div className="card" style={{ pageBreakInside: 'avoid' }}>
        <SectionHead code="SECTION C — PRINCIPLE 8" title="Supplier ESG Performance" sub="Carbon intensity ratings across supply chain" />
        <EvidenceRow label="Total Suppliers Rated"      value={totalSuppliers}                                              status={STATUS.COMPLIANT} />
        <EvidenceRow label="A-rated Suppliers"          value={sups?.suppliers?.filter(s => s.rating === 'A').length ?? '—'} status={STATUS.COMPLIANT} />
        <EvidenceRow label="E-rated Suppliers (Critical)" value={eRatedCount}                                               status={eRatedCount > 5 ? STATUS.NON_COMPLIANT : STATUS.PARTIAL} />
        <EvidenceRow
          label="Supplier ESG Coverage"
          value="100% of active suppliers"
          status={STATUS.COMPLIANT}
        />
        <EvidenceRow
          label="Carbon Intensity Monitoring"
          value="Continuous — per-order attribution"
          status={STATUS.COMPLIANT}
        />
      </div>

      {/* ── SECTION D: Conformance Evidence ── */}
      <div className="card" style={{ pageBreakInside: 'avoid' }}>
        <SectionHead
          code="SECTION D — RESEARCH EVIDENCE"
          title="Carbon-Aware Conformance Evidence"
          sub="Novel contribution: dual-objective fitness vs traditional sequence-only checking"
        />

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto 1fr',
            gap: 20,
            alignItems: 'stretch',
            marginBottom: 20,
          }}
        >
          <div
            style={{
              background: 'linear-gradient(180deg,#151515,#0f0f0f)',
              border: '1px solid #2a2a2a',
              borderRadius: 14,
              padding: 20,
            }}
          >
            <div style={{ fontSize: 10, color: 'var(--t4)', letterSpacing: 2, textTransform: 'uppercase' }}>
              Traditional Process Mining
            </div>

            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--t1)', marginTop: 10 }}>
              SEQUENCE VALID
            </div>

            <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {['Create Order','Goods Issue','Air Freight','Delivery'].map(step => (
                <span
                  key={step}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 999,
                    background: 'var(--bg4)',
                    border: '1px solid #2f2f2f',
                    fontSize: 11,
                    color: 'var(--t2)',
                  }}
                >
                  {step}
                </span>
              ))}
            </div>

            <div
              style={{
                marginTop: 18,
                padding: 10,
                borderRadius: 8,
                background: 'var(--bg3)',
              }}
            >
              <div style={{ fontSize: 11, color: 'var(--t3)' }}>Sequence Fitness</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--t1)' }}>100%</div>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 26,
              color: 'var(--t3)',
              fontWeight: 800,
            }}
          >
            VS
          </div>

          <div
            style={{
              background: 'linear-gradient(180deg,#151515,#0f0f0f)',
              border: '1px solid #2a2a2a',
              borderRadius: 14,
              padding: 20,
            }}
          >
            <div style={{ fontSize: 10, color: 'var(--t4)', letterSpacing: 2, textTransform: 'uppercase' }}>
              SustainOCPM Carbon-Aware Engine
            </div>

            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--t1)', marginTop: 10 }}>
              CARBON BREACH
            </div>

            <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {['Create Order','Goods Issue','Air Freight','Delivery'].map(step => (
                <span
                  key={step}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 999,
                    background: step === 'Air Freight' ? 'var(--b2)' : 'var(--bg4)',
                    border: '1px solid #3a3a3a',
                    fontSize: 11,
                    color: 'var(--t1)',
                  }}
                >
                  {step}
                </span>
              ))}
            </div>

            <div
              style={{
                marginTop: 18,
                padding: 10,
                borderRadius: 8,
                background: 'var(--bg3)',
              }}
            >
              <div style={{ fontSize: 11, color: 'var(--t3)' }}>Carbon Budget Breach</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--t1)' }}>702 kg</div>
              <div style={{ fontSize: 11, color: 'var(--t4)', marginTop: 4 }}>
                Budget: 120 kg CO₂e
              </div>
            </div>
          </div>
        </div>

        <EvidenceRow label="Dual-Objective Fitness Formula"     value="0.5 × seq_fitness + 0.5 × carbon_fitness" status={STATUS.COMPLIANT} />
        <EvidenceRow label="Carbon Fitness Formula"             value="min(1, budget / actual_emission)"          status={STATUS.COMPLIANT} />
        <EvidenceRow label="Sequence Fitness Method"            value="LCS alignment vs normative model"          status={STATUS.COMPLIANT} />
        <EvidenceRow label="OCEAn Gap Addressed"                value="Conformance checking + automated rerouting" status={STATUS.COMPLIANT} />
        <EvidenceRow label="BRSR Auto-Evidence Generation"      value="This report"                               status={STATUS.COMPLIANT} />
      </div>

      {/* ── SECTION E: Disclosure Readiness ── */}
      <div className="card" style={{ pageBreakInside: 'avoid' }}>
        <SectionHead code="SECTION E" title="BRSR Disclosure Readiness Checklist" sub="SEBI-mandated disclosures for listed entities" />
        {[
          ['Scope 3 Transport Emissions Data',     STATUS.COMPLIANT,     '✓ Available — per-order attribution'],
          ['Supplier ESG Scores',                  STATUS.COMPLIANT,     '✓ A–E Rating with carbon intensity'],
          ['Carbon Budget Conformance per Order',  STATUS.COMPLIANT,     '✓ Dual-objective fitness computed'],
          ['Carbon Fitness Score',                 STATUS.COMPLIANT,     '✓ Fleet-level CEI computed'],
          ['Green Process Model',                  STATUS.COMPLIANT,     '✓ Normative sequence defined'],
          ['Automated Rerouting Suggestions',      STATUS.COMPLIANT,     '✓ Sea/Road Freight alternative paths'],
          ['Process Variant Analysis',             STATUS.PARTIAL,       '⚡ Partial — variants identified, not clustered'],
          ['OCEL 2.0 Full Object Graph',           STATUS.PARTIAL,       '⚡ Events + traces — object relations pending'],
          ['Distance-based Carbon Attribution',    STATUS.NON_COMPLIANT, '✗ Planned — Phase 4'],
          ['Celonis Integration',                  STATUS.NON_COMPLIANT, '✗ Planned'],
        ].map(([label, status, note]) => (
          <EvidenceRow key={label} label={label} value={note} status={status} mono={false} />
        ))}
      </div>

      {/* ── Footer ── */}
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t4)', textAlign: 'center', padding: '20px 0', borderTop: '1px solid var(--b1)', marginTop: 8 }}>
        Generated by SustainOCPM · Indo-Swiss Grant · OCEL 2.0 Carbon-Aware Conformance Engine · {today}
      </div>
    </>
  )
}