import { useState } from 'react'
import FinancePlanner from './finance/FinancePlanner.jsx'
import HomeHQ from './homehq/HomeHQ.jsx'

const NAV = [
  { id: 'dashboard',    label: 'Dashboard',    icon: 'ti-layout-dashboard' },
  { id: 'transactions', label: 'Transactions', icon: 'ti-list'             },
  { id: 'calendar',     label: 'Calendar',     icon: 'ti-calendar'         },
  { id: 'accounts',     label: 'Accounts',     icon: 'ti-building-bank'    },
  { id: 'budget',       label: 'Budget',       icon: 'ti-chart-bar'        },
  { id: 'reporting',    label: 'Reporting',    icon: 'ti-report-analytics' },
]

export default function App() {
  const [view,      setView]      = useState('dashboard')
  const [showHome,  setShowHome]  = useState(false)

  return (
    <div className="app-shell">

      {/* ── Sidebar ── */}
      <aside className="app-sidebar">

        {/* Logo — Brevity brand mark */}
        <div className="sidebar-logo">
          <img
            src="/brevity-logo.png"
            alt="Brevity"
            className="sidebar-brand-logo"
          />
        </div>

        {/* Nav */}
        <nav className="sidebar-nav">
          <div className="sidebar-section-label">Finance</div>
          {NAV.map(item => (
            <button key={item.id}
              className={`sidebar-nav-item ${view === item.id && !showHome ? 'active' : ''}`}
              onClick={() => { setView(item.id); setShowHome(false) }}
            >
              <i className={`ti ${item.icon}`} />
              <span>{item.label}</span>
            </button>
          ))}

          <div className="sidebar-divider" />
          <div className="sidebar-section-label">Property</div>
          <button
            className={`sidebar-nav-item ${showHome ? 'active' : ''}`}
            onClick={() => setShowHome(true)}
          >
            <i className="ti ti-building-estate" />
            <span>Projects</span>
          </button>
        </nav>

        {/* Footer */}
        <div className="sidebar-footer">
          <button className="sidebar-footer-item">
            <i className="ti ti-settings" />
            <span>Settings</span>
          </button>
          <button className="sidebar-footer-item">
            <i className="ti ti-logout" />
            <span>Sign Out</span>
          </button>
          <div className="sidebar-user">
            <div className="sidebar-user-avatar">LJ</div>
            <div>
              <div className="sidebar-user-name">Larry Jenkins</div>
              <div className="sidebar-user-role">Family Office</div>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="app-main">
        {!showHome && <FinancePlanner view={view} setView={setView} />}
        {showHome  && <HomeHQ />}
      </main>

    </div>
  )
}
