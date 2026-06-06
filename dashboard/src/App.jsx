import { useState, useEffect, useRef } from 'react'
import './App.css'
import Cockpit from './pages/Cockpit'
import Transport from './pages/Transport'
import Suppliers from './pages/Suppliers'
import Hotspots from './pages/Hotspots'
import Violations from './pages/Violations'
import Recommendations from './pages/Recommendations'
import ProcessExplorer from './pages/ProcessExplorer'
import Simulator from './pages/Simulator'
import AIIntelligence from './pages/AIIntelligence'
import ProcessGraph from './pages/ProcessGraph'
import ConformanceChecker from './pages/ConformanceChecker'
import EventLogs from './pages/EventLogs'
import BRSR from './pages/BRSR'
import CarbonBudgetEditor from './pages/CarbonBudgetEditor'
import Chart from 'chart.js/auto'
window.Chart = Chart

const NAV = [
  { id: 'cockpit',         label: 'Executive Cockpit',     section: 'Analytics',      icon: '◈' },
  { id: 'process',         label: 'Process Explorer',      section: null,             icon: '⬡' },
  { id: 'transport',       label: 'Transport Emissions',   section: null,             icon: '⟁' },
  { id: 'suppliers',       label: 'Supplier Intelligence', section: null,             icon: '◎' },
  { id: 'hotspots',        label: 'Carbon Hotspots',       section: 'Compliance',     icon: '◉' },
  { id: 'violations',      label: 'Violations',            section: null,             icon: '◻' },
  { id: 'brsr',            label: 'BRSR Report',           section: null,             icon: '▦' },
  { id: 'budget',          label: 'Carbon Budget',         section: null,             icon: '◬' },
  { id: 'conformance',     label: 'Conformance Checker',   section: null,             icon: '◫' },
  { id: 'recommendations', label: 'Recommendations',       section: 'Actions',        icon: '◍' },
  { id: 'simulator',       label: 'Decision Simulator',    section: null,             icon: '◈' },
  { id: 'ai',              label: 'AI Intelligence',       section: 'Intelligence',   icon: '◑' },
  { id: 'processgraph',    label: 'Process Graph',         section: null,             icon: '⬡' },
  { id: 'logs',            label: 'Event Logs',            section: null,             icon: '≡' },
]

const PAGES = {
  cockpit: Cockpit, process: ProcessExplorer, transport: Transport,
  suppliers: Suppliers, hotspots: Hotspots, violations: Violations,
  conformance: ConformanceChecker, recommendations: Recommendations,
  simulator: Simulator, ai: AIIntelligence, processgraph: ProcessGraph,
  logs: EventLogs, brsr: BRSR, budget: CarbonBudgetEditor,
}

// ── Global toast system ──────────────────────────────────────────
export let showToast = () => {}

function ToastHost() {
  const [toasts, setToasts] = useState([])
  showToast = (msg, type = 'info', duration = 2800) => {
    const id = Date.now()
    setToasts(t => [...t, { id, msg, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), duration)
  }
  return (
    <div className="toast-host">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`}>{t.msg}</div>
      ))}
    </div>
  )
}

// ── Progress bar for page transitions ───────────────────────────
function TopBar({ active }) {
  const [width, setWidth] = useState(0)
  const [visible, setVisible] = useState(false)
  const prev = useRef(active)

  useEffect(() => {
    if (prev.current === active) return
    prev.current = active
    setVisible(true)
    setWidth(0)
    const t1 = setTimeout(() => setWidth(60), 10)
    const t2 = setTimeout(() => setWidth(90), 120)
    const t3 = setTimeout(() => setWidth(100), 320)
    const t4 = setTimeout(() => setVisible(false), 520)
    return () => [t1,t2,t3,t4].forEach(clearTimeout)
  }, [active])

  if (!visible) return null
  return (
    <div className="topbar-track">
      <div className="topbar-fill" style={{ width: `${width}%` }} />
    </div>
  )
}

// ── Command palette ──────────────────────────────────────────────
function CommandPalette({ onNavigate, onClose }) {
  const [q, setQ] = useState('')
  const ref = useRef(null)
  useEffect(() => { ref.current?.focus() }, [])

  const results = q.trim()
    ? NAV.filter(n => n.label.toLowerCase().includes(q.toLowerCase()))
    : NAV

  const go = (id) => { onNavigate(id); onClose() }

  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="palette" onClick={e => e.stopPropagation()}>
        <div className="palette-header">
          <span className="palette-icon">⌘</span>
          <input
            ref={ref}
            className="palette-input"
            placeholder="Go to page..."
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') onClose()
              if (e.key === 'Enter' && results[0]) go(results[0].id)
            }}
          />
          <kbd className="palette-esc" onClick={onClose}>esc</kbd>
        </div>
        <div className="palette-results">
          {results.map(n => (
            <button key={n.id} className="palette-item" onClick={() => go(n.id)}>
              <span className="palette-item-icon">{n.icon}</span>
              <span className="palette-item-label">{n.label}</span>
              {n.section && <span className="palette-item-section">{n.section}</span>}
              {n.badge && <span className="palette-item-badge">{n.badge}</span>}
            </button>
          ))}
          {results.length === 0 && (
            <div className="palette-empty">No pages match "{q}"</div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [active, setActive] = useState('cockpit')
  const [palette, setPalette] = useState(false)
  const Page = PAGES[active]
  const current = NAV.find(n => n.id === active)

  const [stats, setStats] = useState(null)

  useEffect(() => {
    fetch('http://localhost:8000/kpis')
      .then(r => r.json())
      .then(setStats)
      .catch(() => {})
  }, [])

  // Keyboard shortcut: Cmd/Ctrl+K
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setPalette(p => !p)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="app">
      <TopBar active={active} />

      <aside className="sidebar">
        <div className="logo">
          <div className="logo-grant">Indo-Swiss Grant · OCEL 2.0</div>
          <div className="logo-title">SustainOCPM</div>
        </div>

        <div className="sidebar-search" onClick={() => setPalette(true)}>
          <span className="sidebar-search-icon">⌘</span>
          <span className="sidebar-search-text">Quick nav…</span>
          <kbd className="sidebar-search-kbd">K</kbd>
        </div>

        <nav>
          {NAV.map(item => (
            <div key={item.id}>
              {item.section && <div className="nav-section">{item.section}</div>}
              <button
                className={`nav-item${active === item.id ? ' active' : ''}`}
                onClick={() => setActive(item.id)}
              >
                <span className="nav-icon-sym">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
                {item.badge && <span className="nav-badge">{item.badge}</span>}
              </button>
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div>Dataset</div>
          <div>Orders · {stats?.total_orders?.toLocaleString?.() || '—'}</div>
          <div>Violations · {stats?.violations?.toLocaleString?.() || '—'}</div>
          <div>Compliance · {stats?.compliance_pct ?? '—'}%</div>
        </div>
      </aside>

      <div className="main-wrap">
        {/* Breadcrumb bar */}
        <div className="breadcrumb">
          <span className="breadcrumb-root">SustainOCPM</span>
          {current?.section && (
            <>
              <span className="breadcrumb-sep">/</span>
              <span className="breadcrumb-section">{current.section}</span>
            </>
          )}
          <span className="breadcrumb-sep">/</span>
          <span className="breadcrumb-page">{current?.label}</span>
        </div>

        <main className="main" key={active}>
          <Page />
        </main>
      </div>

      {palette && (
        <CommandPalette
          onNavigate={setActive}
          onClose={() => setPalette(false)}
        />
      )}

      <ToastHost />
    </div>
  )
}