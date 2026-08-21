import { useEffect, useState } from 'react'
import FamilyCalendar from './family/FamilyCalendar.jsx'
import FinancePlanner from './finance/FinancePlanner.jsx'
import HomeHQ from './homehq/HomeHQ.jsx'
import HouseholdToday from './household/HouseholdToday.jsx'
import PillarAnalysis from './household/PillarAnalysis.jsx'
import { HouseholdAccounts, HouseholdLogin, useHouseholdAuth } from './household/HouseholdAuth.jsx'
import { initialsForMember } from './household/memberProfile.js'
import { refreshApplicationData } from './household/appRefresh.js'
import './household/Readability.css'

const PILLARS = [
  { id:'spiritual', label:'Spiritual Maturity', icon:'ti-sun', layer:1, description:'The foundation of everything — your relationship with God and family.', items:[] },
  { id:'health', label:'Health & Nutrition', icon:'ti-heart', layer:2, description:'Stewardship of the body — nourishment and whole-family wellness.', items:[] },
  { id:'fitness', label:'Physical Fitness', icon:'ti-run', layer:2, description:'Strength, discipline, and physical stewardship.', items:[] },
  { id:'household', label:'Household Management', icon:'ti-home', layer:3, description:'The heartbeat of the home — operations, property, and daily life.', items:[
    { id:'property', label:'Projects', icon:'ti-building-estate' },
    { id:'family-calendar', label:'Family Calendar', icon:'ti-calendar-event' },
    { id:'malbec-estate', label:'Malbec Estate', icon:'ti-building-community' },
    { id:'live-intentional', label:'Live Intentional', icon:'ti-compass' },
  ]},
  { id:'education', label:'Education', icon:'ti-book', layer:4, description:'Knowledge and growth — learning across every member of the family.', items:[] },
  { id:'finance', label:'Finance', icon:'ti-building-bank', layer:4, description:'Governance, stewardship, and financial planning for the family.', items:[
    { id:'dashboard', label:'Dashboard', icon:'ti-layout-dashboard' },
    { id:'daily-alignment', label:'Daily Alignment', icon:'ti-target-arrow' },
    { id:'transactions', label:'Transactions', icon:'ti-list' },
    { id:'calendar', label:'Calendar', icon:'ti-calendar' },
    { id:'accounts', label:'Accounts', icon:'ti-building-bank' },
    { id:'budget', label:'Budget', icon:'ti-chart-bar' },
    { id:'recurring', label:'Recurring', icon:'ti-repeat' },
    { id:'reporting', label:'Reporting', icon:'ti-report-analytics' },
    { id:'property', label:'Projects', icon:'ti-building-estate' },
  ]},
  { id:'ministry', label:'Ministry & Fellowship', icon:'ti-users', layer:5, description:'Impartation of the prior six pillars and discipleship of others.', items:[
    { id:'apostolic-sermon-builder', label:'Sermon Builder', icon:'ti-book-2' },
  ]},
]

const FINANCE_VIEWS = new Set(['dashboard','daily-alignment','transactions','calendar','accounts','budget','recurring','reporting'])
const EXTERNAL_SITES = {
  'malbec-estate': { title:'Malbec Estate', description:'Estate and household property management', url:'https://malbecestate.netlify.app/', icon:'ti-building-community', embed:false },
  'live-intentional': { title:'Live Intentional', description:'Intentional living and household planning', url:'https://liveintentional.netlify.app/', icon:'ti-compass', embed:true },
  'apostolic-sermon-builder': { title:'Apostolic Sermon Builder', description:'Sermon preparation and ministry resources', url:'https://apostolicsermonbuilderlseay.netlify.app/', icon:'ti-book-2', embed:true },
}
const DIVIDER_BEFORE = new Set([1,3,4,6])

function ExternalSiteView({ title, description, url, icon, embed }) {
  return <section className="external-site-view" aria-label={title}><header className="external-site-toolbar"><div><p className="external-site-eyebrow">Connected application</p><h1>{title}</h1><p className="external-site-description">{description}</p></div><a className="external-site-open" href={url} target="_blank" rel="noreferrer">Open full screen <i className="ti ti-external-link" aria-hidden="true" /></a></header>{embed?<iframe className="external-site-frame" src={url} title={title} loading="eager" referrerPolicy="strict-origin-when-cross-origin" allow="clipboard-read; clipboard-write" />:<div className="external-site-fallback"><div className="external-site-fallback-icon"><i className={`ti ${icon}`} aria-hidden="true" /></div><h2>{title} is connected</h2><p>{title} currently blocks secure in-app display. Open it below while its hosting security setting is updated.</p><a className="external-site-launch" href={url} target="_blank" rel="noreferrer">Launch {title} <i className="ti ti-arrow-up-right" aria-hidden="true" /></a></div>}</section>
}

function SettingsPage({ currentMember, role }) {
  const card={background:'var(--glass)',border:'1px solid var(--glass-border)',borderRadius:16,padding:'24px 28px',marginBottom:12}
  const title={fontSize:15,fontWeight:600,color:'var(--white)',margin:0}
  const sub={fontSize:13,color:'var(--muted)',margin:'4px 0 0',lineHeight:1.5}
  const badge={fontSize:11,padding:'4px 10px',borderRadius:10,background:'rgba(197,164,109,.12)',border:'1px solid rgba(197,164,109,.22)',color:'var(--gold)'}
  const label={fontSize:11,letterSpacing:'.1em',textTransform:'uppercase',color:'var(--gold)',margin:'28px 0 14px',display:'block',fontWeight:600}
  const handleExport=()=>{const keys=['lslj_finance_v9','plaid_actuals_cache','lslj_budget_v1','lslj_actuals_v1','fp_goals','homehq_items_v1','family_calendar_events_v1'];const data={};keys.forEach(k=>{try{data[k]=JSON.parse(localStorage.getItem(k)||'null')}catch{}});const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`brevity-backup-${new Date().toISOString().slice(0,10)}.json`;a.click()}
  return <div className="settings-page" style={{maxWidth:820,margin:'0 auto',padding:'48px 32px'}}>
    <h1 style={{fontFamily:'var(--font-serif)',fontSize:42,fontWeight:400,color:'var(--white)',margin:'0 0 8px'}}>Settings</h1>
    <p style={{color:'var(--muted)',fontSize:15,margin:'0 0 32px'}}>Manage household accounts, shared data and integrations.</p>
    <span style={label}>Household Identity</span>
    <div style={card}><div className="settings-card-row" style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:20,marginBottom:18}}><div><p style={title}>Signed in as {currentMember}</p><p style={sub}>Your authenticated identity controls My Day and member-specific views on every device.</p></div><span style={badge}>{role === 'admin' ? 'Administrator' : 'Member'}</span></div><HouseholdAccounts sessionMember={currentMember} role={role}/></div>
    <span style={label}>Data</span>
    <div style={card}><div className="settings-card-row" style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:20}}><div><p style={title}>Export Legacy Data</p><p style={sub}>Download a backup of finance, project and browser-calendar records still stored locally.</p></div><button onClick={handleExport} style={{padding:'9px 18px',borderRadius:10,background:'rgba(197,164,109,.1)',border:'1px solid rgba(197,164,109,.25)',color:'var(--gold)',fontSize:13,cursor:'pointer'}}>Export JSON</button></div></div>
    <span style={label}>Integrations</span>
    <div style={card}><p style={title}>Brevity AI + Apple Calendar</p><p style={sub}>AI analysis and calendar credentials remain server-protected. Household sign-in is separate from Apple/OpenAI credentials.</p></div>
  </div>
}

function AuthLoading() {
  return <div className="household-auth-page"><div className="household-auth-card"><img src="/brevity-logo.png" alt="Brevity" className="household-auth-logo"/><p className="household-auth-kicker">Household Operating System</p><h1>Loading Brevity…</h1></div></div>
}

export default function App() {
  const auth = useHouseholdAuth()
  const [expandedPillar,setExpandedPillar]=useState(null)
  const [activeView,setActiveView]=useState('today')
  const [activePillar,setActivePillar]=useState('')
  const [theme,setTheme]=useState(()=>localStorage.getItem('brevity_theme')||'dark')
  const [sidebarExpanded,setSidebarExpanded]=useState(false)

  useEffect(()=>{document.documentElement.setAttribute('data-theme',theme);localStorage.setItem('brevity_theme',theme)},[theme])
  useEffect(()=>{
    if(!auth.authenticated||!auth.member)return
    refreshApplicationData({currentMember:auth.member}).catch(error=>console.error('[Brevity] Startup refresh failed:',error))
  },[auth.authenticated,auth.member])

  if(auth.loading) return <AuthLoading/>
  if(!auth.authenticated) return <HouseholdLogin bootstrapRequired={auth.bootstrapRequired} onLogin={auth.login} onBootstrap={auth.bootstrap} error={auth.error}/>

  const currentMember=auth.member
  const navigateTo=(pillarId,viewId)=>{setActivePillar(pillarId);setActiveView(viewId);setExpandedPillar(pillarId);setSidebarExpanded(false)}
  const openPillar=pillarId=>{setActivePillar(pillarId);setActiveView('pillar-analysis');setExpandedPillar(pillarId)}
  const handlePillarClick=pillar=>{openPillar(pillar.id);if(pillar.items.length)setExpandedPillar(pillar.id);else setSidebarExpanded(false)}

  const renderContent=()=>{
    if(activeView==='today')return <HouseholdToday currentMember={currentMember} onOpenPillar={openPillar}/>
    if(activeView==='settings')return <SettingsPage currentMember={currentMember} role={auth.role}/>
    if(activeView==='property')return <HomeHQ/>
    if(activeView==='family-calendar')return <FamilyCalendar/>
    if(EXTERNAL_SITES[activeView])return <ExternalSiteView {...EXTERNAL_SITES[activeView]}/>
    if(FINANCE_VIEWS.has(activeView)&&activePillar==='finance')return <FinancePlanner view={activeView} setView={v=>navigateTo('finance',v)}/>
    const pillar=PILLARS.find(p=>p.id===activePillar)
    return pillar?<PillarAnalysis pillar={pillar} currentMember={currentMember}/>:null
  }

  return <div className="app-shell"><aside className={`app-sidebar${sidebarExpanded?' is-expanded':''}`} onMouseEnter={()=>setSidebarExpanded(true)} onMouseLeave={()=>setSidebarExpanded(false)} onFocus={()=>setSidebarExpanded(true)} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setSidebarExpanded(false)}}><div className="sidebar-logo"><img src="/brevity-logo.png" alt="Brevity" className="sidebar-brand-logo"/><button type="button" className="sidebar-collapse-toggle" aria-label={sidebarExpanded?'Collapse navigation':'Expand navigation'} aria-expanded={sidebarExpanded} onClick={event=>{event.stopPropagation();setSidebarExpanded(value=>!value)}}><i className={`ti ti-layout-sidebar-left-${sidebarExpanded?'collapse':'expand'}`} aria-hidden="true"/></button></div><nav className="sidebar-nav"><button className={`sidebar-nav-item${activeView==='today'?' active':''}`} onClick={()=>{setActiveView('today');setActivePillar('');setExpandedPillar(null);setSidebarExpanded(false)}}><i className="ti ti-home-2"/><span>Today</span></button><div className="sidebar-divider"/>{PILLARS.map((pillar,idx)=>{const isExpanded=expandedPillar===pillar.id;const hasItems=pillar.items.length>0;const isPillarActive=activePillar===pillar.id;return <div key={pillar.id}>{DIVIDER_BEFORE.has(idx)&&<div className="sidebar-divider"/>}<div className="pillar-group"><button className={`pillar-header${isPillarActive?' pillar-header--active':''}`} onClick={()=>handlePillarClick(pillar)}><i className={`ti ${pillar.icon}`}/><span className="pillar-label">{pillar.label}</span>{hasItems&&<i className={`ti ti-chevron-${isExpanded?'up':'down'} pillar-chevron`}/>}</button>{hasItems&&isExpanded&&<div className="pillar-items">{pillar.items.map(item=><button key={`${pillar.id}-${item.id}`} className={`sidebar-nav-item${activePillar===pillar.id&&activeView===item.id?' active':''}`} onClick={()=>navigateTo(pillar.id,item.id)}><i className={`ti ${item.icon}`}/><span>{item.label}</span></button>)}</div>}</div></div>})}</nav><div className="sidebar-footer"><button className="sidebar-footer-item" onClick={()=>setTheme(t=>t==='dark'?'light':'dark')}><i className={`ti ${theme==='dark'?'ti-sun':'ti-moon'}`}/><span>{theme==='dark'?'Light Mode':'Dark Mode'}</span></button><button className="sidebar-footer-item" onClick={()=>{setActiveView('settings');setActivePillar('');setSidebarExpanded(false)}}><i className="ti ti-settings"/><span>Settings</span></button><button className="sidebar-footer-item" onClick={auth.logout}><i className="ti ti-logout"/><span>Sign Out</span></button><div className="sidebar-user"><div className="sidebar-user-avatar">{initialsForMember(currentMember)}</div><div className="sidebar-user-details"><div className="sidebar-user-name">{currentMember}</div><div className="sidebar-user-role">{auth.role === 'admin' ? 'Household Administrator' : 'Household Member'}</div></div></div></div></aside><main className="app-main">{renderContent()}</main></div>
}
