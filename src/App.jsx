import { useState } from 'react'
import FinancePlanner from './finance/FinancePlanner.jsx'
import HomeHQ from './homehq/HomeHQ.jsx'

// ── 7 Family Pillars ─────────────────────────────────────────────────────────
const PILLARS = [
  // ── Layer 1: Man — Spiritual
  {
    id: 'spiritual', label: 'Spiritual Maturity', icon: 'ti-sun', layer: 1,
    description: 'The foundation of everything — your relationship with God and family.',
    items: []
  },
  // ── Layer 2: Man — Physical
  {
    id: 'health', label: 'Health & Nutrition', icon: 'ti-heart', layer: 2,
    description: 'Stewardship of the body — nourishment and whole-family wellness.',
    items: []
  },
  {
    id: 'fitness', label: 'Physical Fitness', icon: 'ti-run', layer: 2,
    description: 'Strength, discipline, and physical stewardship.',
    items: []
  },
  // ── Layer 3: Heartbeat — Home
  {
    id: 'household', label: 'Household Management', icon: 'ti-home', layer: 3,
    description: 'The heartbeat of the home — operations, property, and daily life.',
    items: [
      { id: 'property', label: 'Property', icon: 'ti-building-estate' },
    ]
  },
  // ── Layer 4: External — Knowledge & Stewardship
  {
    id: 'education', label: 'Education', icon: 'ti-book', layer: 4,
    description: 'Knowledge and growth — learning across every member of the family.',
    items: []
  },
  {
    id: 'finance', label: 'Finance', icon: 'ti-building-bank', layer: 4,
    description: 'Governance, stewardship, and financial planning for the family.',
    items: [
      { id: 'dashboard',    label: 'Dashboard',    icon: 'ti-layout-dashboard' },
      { id: 'transactions', label: 'Transactions', icon: 'ti-list'             },
      { id: 'calendar',     label: 'Calendar',     icon: 'ti-calendar'         },
      { id: 'accounts',     label: 'Accounts',     icon: 'ti-building-bank'    },
      { id: 'budget',       label: 'Budget',       icon: 'ti-chart-bar'        },
      { id: 'reporting',    label: 'Reporting',    icon: 'ti-report-analytics' },
      { id: 'property',     label: 'Property',     icon: 'ti-building-estate'  },
    ]
  },
  // ── Layer 5: Impartation — Ministry
  {
    id: 'ministry', label: 'Ministry & Fellowship', icon: 'ti-users', layer: 5,
    description: 'Impartation of the prior six pillars and discipleship of others.',
    items: []
  },
]

const FINANCE_VIEWS = new Set(['dashboard','transactions','calendar','accounts','budget','reporting'])

// Divider before these pillar indices (layer boundaries)
const DIVIDER_BEFORE = new Set([1, 3, 4, 6])

// ── Placeholder for pillars under construction ────────────────────────────────
function PillarPlaceholder({ pillar }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100%', gap: 24, padding: 40,
      textAlign: 'center'
    }}>
      <div style={{
        width: 96, height: 96, borderRadius: '50%',
        background: 'linear-gradient(145deg, rgba(197,164,109,0.12), rgba(197,164,109,0.04))',
        border: '1.5px solid rgba(197,164,109,0.22)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 0 48px rgba(197,164,109,0.06)'
      }}>
        <i className={`ti ${pillar.icon}`} style={{ fontSize: 42, color: 'var(--gold)' }} />
      </div>
      <div>
        <h2 style={{
          margin: '0 0 12px', fontFamily: 'var(--font-serif)',
          fontSize: 34, fontWeight: 400, color: 'var(--white)', letterSpacing: '-0.01em'
        }}>
          {pillar.label}
        </h2>
        <p style={{
          margin: '0 0 28px', color: 'var(--muted)', fontSize: 14,
          maxWidth: 400, lineHeight: 1.7
        }}>
          {pillar.description}
        </p>
        <span style={{
          display: 'inline-block', padding: '7px 22px', borderRadius: 24,
          border: '1px solid rgba(197,164,109,0.20)',
          background: 'rgba(197,164,109,0.06)',
          fontSize: 11, color: 'rgba(197,164,109,0.65)',
          letterSpacing: '0.12em', textTransform: 'uppercase'
        }}>
          Coming Soon
        </span>
      </div>
    </div>
  )
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [expandedPillar, setExpandedPillar] = useState('finance')
  const [activeView,     setActiveView]     = useState('dashboard')
  const [activePillar,   setActivePillar]   = useState('finance')

  const navigateTo = (pillarId, viewId) => {
    setActivePillar(pillarId)
    setActiveView(viewId)
    setExpandedPillar(pillarId)
  }

  const handlePillarClick = (pillar) => {
    if (pillar.items.length === 0) {
      setActivePillar(pillar.id)
      setActiveView('__placeholder__')
    } else {
      setExpandedPillar(prev => prev === pillar.id ? null : pillar.id)
    }
  }

  const renderContent = () => {
    if (activeView === 'property') {
      return <HomeHQ />
    }
    if (FINANCE_VIEWS.has(activeView) && activePillar === 'finance') {
      return <FinancePlanner view={activeView} setView={(v) => navigateTo('finance', v)} />
    }
    const pillar = PILLARS.find(p => p.id === activePillar)
    return pillar ? <PillarPlaceholder pillar={pillar} /> : null
  }

  return (
    <div className="app-shell">

      {/* ── Sidebar ── */}
      <aside className="app-sidebar">

        <div className="sidebar-logo">
          <img src="/brevity-logo.png" alt="Brevity" className="sidebar-brand-logo" />
        </div>

        <nav className="sidebar-nav">
          {PILLARS.map((pillar, idx) => {
            const isExpanded     = expandedPillar === pillar.id
            const hasItems       = pillar.items.length > 0
            const isPillarActive = activePillar === pillar.id

            return (
              <div key={pillar.id}>
                {DIVIDER_BEFORE.has(idx) && <div className="sidebar-divider" />}

                <div className="pillar-group">
                  <button
                    className={`pillar-header${isPillarActive ? ' pillar-header--active' : ''}`}
                    onClick={() => handlePillarClick(pillar)}
                  >
                    <i className={`ti ${pillar.icon}`} />
                    <span className="pillar-label">{pillar.label}</span>
                    {hasItems && (
                      <i className={`ti ti-chevron-${isExpanded ? 'up' : 'down'} pillar-chevron`} />
                    )}
                  </button>

                  {hasItems && isExpanded && (
                    <div className="pillar-items">
                      {pillar.items.map(item => {
                        const isItemActive = activePillar === pillar.id && activeView === item.id
                        return (
                          <button
                            key={`${pillar.id}-${item.id}`}
                            className={`sidebar-nav-item${isItemActive ? ' active' : ''}`}
                            onClick={() => navigateTo(pillar.id, item.id)}
                          >
                            <i className={`ti ${item.icon}`} />
                            <span>{item.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </nav>

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
        {renderContent()}
      </main>

    </div>
  )
}
