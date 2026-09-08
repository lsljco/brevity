import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import HouseholdToday from './household/HouseholdToday.jsx'
import { HouseholdAccounts, HouseholdLogin, useHouseholdAuth } from './household/HouseholdAuth.jsx'
import { initialsForMember } from './household/memberProfile.js'
import { refreshApplicationData } from './household/appRefresh.js'
import { startSharedStateSync, syncSharedState } from './household/sharedState.js'
import BrevityAssistant from './assistant/BrevityAssistant.jsx'
import { getActionMode } from './assistant/assistantApi.js'
import SermonDeviceRescue from './household/SermonDeviceRescue.jsx'
import { popNavigationLocation, pushNavigationLocation } from './navigationHistory.js'
import './household/Readability.css'
import './AppDeferred.css'

const FamilyCalendar = lazy(() => import('./family/FamilyCalendar.jsx'))
const PillarAnalysis = lazy(() => import('./household/PillarAnalysis.jsx'))
const FinancePlanner = lazy(() => import('./finance/FinancePlanner.jsx'))
const HomeHQ = lazy(() => import('./homehq/HomeHQ.jsx'))
const MealPlanner = lazy(() => import('./meals/MealPlanner.jsx'))
const EstateWorkspace = lazy(() => import('./estate/EstateWorkspace.jsx'))
const HouseholdMaintenance = lazy(() => import('./household/HouseholdMaintenance.jsx'))

const PILLARS = [
  { id:'spiritual', label:'Spiritual Maturity', icon:'ti-sun', layer:1, description:'The foundation of everything — your relationship with God and family.', items:[] },
  { id:'health', label:'Health & Nutrition', icon:'ti-heart', layer:2, description:'Stewardship of the body — nourishment and whole-family wellness.', items:[
    { id:'meal-plan', label:'Meal Plan', icon:'ti-tools-kitchen-2' },
  ] },
  { id:'fitness', label:'Physical Fitness', icon:'ti-run', layer:2, description:'Strength, discipline, and physical stewardship.', items:[] },
  { id:'household', label:'Household Management', icon:'ti-home', layer:3, description:'The heartbeat of the home — operations, property, and daily life.', items:[
    { id:'property', label:'Projects', icon:'ti-building-estate' },
    { id:'household-maintenance', label:'Household Operations', icon:'ti-broom' },
    { id:'family-calendar', label:'Family Calendar', icon:'ti-calendar-event' },
    { id:'malbec-estate', label:'Malbec Estate', icon:'ti-building-community' },
    { id:'live-intentional', label:'Live Intentional', icon:'ti-compass' },
  ]},
  { id:'education', label:'Education', icon:'ti-book', layer:4, description:'Knowledge and growth — learning across every member of the family.', items:[] },
  { id:'finance', label:'Finance', icon:'ti-building-bank', layer:4, description:'Governance, stewardship, and financial planning for the family.', items:[
    { id:'dashboard', label:'Dashboard', icon:'ti-layout-dashboard' },
    { id:'daily-alignment', label:'Meetings', icon:'ti-users-group' },
    { id:'scenario-modeling', label:'Scenario Modeling', icon:'ti-chart-arrows' },
    { id:'transactions', label:'Transactions', icon:'ti-list' },
    { id:'calendar', label:'Cash Forecast', icon:'ti-calendar-dollar' },
    { id:'accounts', label:'Accounts', icon:'ti-building-bank' },
    { id:'budget', label:'Budget', icon:'ti-chart-bar' },
    { id:'recurring', label:'Recurring', icon:'ti-repeat' },
    { id:'reporting', label:'Reporting', icon:'ti-report-analytics' },
  ]},
  { id:'ministry', label:'Ministry & Fellowship', icon:'ti-users', layer:5, description:'Impartation of the prior six pillars and discipleship of others.', items:[
    { id:'apostolic-sermon-builder', label:'Sermon Builder', icon:'ti-book-2' },
  ]},
]

const FINANCE_VIEWS = new Set(['dashboard','daily-alignment','scenario-modeling','transactions','calendar','accounts','budget','recurring','reporting'])
// Keep tablet navigation collapsed by default as well. Feature breakpoints are
// based on the viewport, so an expanded 240px rail at 768px can otherwise leave
// less usable content width than their phone layouts expect.
const MOBILE_NAVIGATION_QUERY = '(max-width: 900px)'
const SIDEBAR_STATE_KEY = 'brevity_sidebar_state'
const isCompactNavigation = () => typeof window !== 'undefined' && window.matchMedia(MOBILE_NAVIGATION_QUERY).matches
const savedDesktopSidebarState = () => typeof window === 'undefined' || localStorage.getItem(SIDEBAR_STATE_KEY) !== 'collapsed'
const initialSidebarExpanded = () => !isCompactNavigation() && savedDesktopSidebarState()
const EXTERNAL_SITES = {
  'live-intentional': { title:'Live Intentional', description:'Intentional living and household planning', url:'https://liveintentional.netlify.app/', icon:'ti-compass', embed:true },
  'apostolic-sermon-builder': { title:'Apostolic Sermon Builder', description:'Account-synchronized sermon preparation and ministry resources', url:'/apostolic-builder/', icon:'ti-book-2', embed:true },
}
const DIVIDER_BEFORE = new Set([1,3,4,6])

function navigationLabel(pillarId, viewId) {
  if (viewId === 'today') return 'Today'
  if (viewId === 'settings') return 'Settings'
  const pillar = PILLARS.find(item => item.id === pillarId)
  if (viewId === 'pillar-analysis') return pillar?.label || 'Pillar overview'
  return pillar?.items.find(item => item.id === viewId)?.label || pillar?.label || 'Previous screen'
}

function ExternalSiteView({ title, description, url, icon, embed, currentMember }) {
  const frameRef=useRef(null)
  const targetOrigin=useMemo(()=>{try{return new URL(url,window.location.href).origin}catch{return''}},[url])
  const sendMember=()=>{if(embed&&currentMember&&targetOrigin)frameRef.current?.contentWindow?.postMessage({type:'brevity-authenticated-member',member:currentMember},targetOrigin)}
  useEffect(()=>{
    if(!embed||!currentMember||!targetOrigin)return
    const receive=event=>{if(event.origin===targetOrigin&&event.data?.type==='live-intentional-ready')sendMember()}
    window.addEventListener('message',receive)
    return()=>window.removeEventListener('message',receive)
  },[embed,currentMember,targetOrigin])
  return <section className="external-site-view" aria-label={title}><header className="external-site-toolbar"><div><p className="external-site-eyebrow">Connected application</p><h1>{title}</h1><p className="external-site-description">{description}</p></div><a className="external-site-open" href={url} target="_blank" rel="noreferrer">Open full screen <i className="ti ti-external-link" aria-hidden="true" /></a></header>{embed?<iframe ref={frameRef} onLoad={sendMember} className="external-site-frame" src={url} title={title} loading="eager" referrerPolicy="strict-origin-when-cross-origin" allow="clipboard-read; clipboard-write" />:<div className="external-site-fallback"><div className="external-site-fallback-icon"><i className={`ti ${icon}`} aria-hidden="true" /></div><h2>{title} is connected</h2><p>{title} currently blocks secure in-app display. Open it below while its hosting security setting is updated.</p><a className="external-site-launch" href={url} target="_blank" rel="noreferrer">Launch {title} <i className="ti ti-arrow-up-right" aria-hidden="true" /></a></div>}</section>
}

function SettingsPage({ currentMember, role, theme, onThemeChange, onSignOut }) {
  const card={background:'var(--glass)',border:'1px solid var(--glass-border)',borderRadius:16,padding:'24px 28px',marginBottom:12}
  const title={fontSize:15,fontWeight:600,color:'var(--white)',margin:0}
  const sub={fontSize:13,color:'var(--muted)',margin:'4px 0 0',lineHeight:1.5}
  const badge={fontSize:11,padding:'4px 10px',borderRadius:10,background:'rgba(197,164,109,.12)',border:'1px solid rgba(197,164,109,.22)',color:'var(--gold)'}
  const label={fontSize:11,letterSpacing:'.1em',textTransform:'uppercase',color:'var(--gold)',margin:'28px 0 14px',display:'block',fontWeight:600}
  const isAdministrator=role==='admin'
  const backupKeys=['lslj_finance_v9','plaid_actuals_cache','lslj_budget_v1','lslj_actuals_v1','lslj_tx_overrides_v1','lslj_tx_rules_v1','brevity_finance_categories_v1','brevity_finance_scenarios_v1','fp_goals','homehq_items_v1','family_calendar_events_v1','brevity_daily_financial_alignment_v1','brevity_finance_meetings_v1','brevity_household_maintenance_v1']
  const handleExport=()=>{if(!isAdministrator)return;const data={format:'brevity-recovery-cache',schemaVersion:2,scope:'local-recovery-cache',exportedAt:new Date().toISOString(),records:{}};backupKeys.forEach(k=>{const raw=localStorage.getItem(k);if(raw!=null){try{data.records[k]=JSON.parse(raw)}catch{data.records[k]=raw}}});const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`brevity-recovery-cache-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href)}
  return <div className="settings-page" style={{maxWidth:820,margin:'0 auto',padding:'48px 32px'}}>
    <h1 style={{fontFamily:'var(--font-serif)',fontSize:42,fontWeight:400,color:'var(--white)',margin:'0 0 8px'}}>Settings</h1>
    <p style={{color:'var(--muted)',fontSize:15,margin:'0 0 32px'}}>Review household accounts, shared data, and integration status.</p>
    <span style={label}>Household Identity</span>
    <div style={card}><div className="settings-card-row" style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:20,marginBottom:18}}><div className="settings-profile-summary"><div className="sidebar-user-avatar" aria-hidden="true">{initialsForMember(currentMember)}</div><div><p style={title}>{currentMember}</p><p style={sub}>Signed-in household profile</p></div></div><span style={badge}>{role === 'admin' ? 'Administrator' : 'Member'}</span></div><HouseholdAccounts sessionMember={currentMember} role={role}/></div>
    <span style={label}>Preferences</span>
    <div style={card} className="settings-preferences"><div className="settings-preference-row"><div><p style={title}>Appearance</p><p style={sub}>Choose the display mode that is most comfortable for you.</p></div><button type="button" className="settings-action-button" onClick={onThemeChange}><i className={`ti ${theme==='dark'?'ti-sun':'ti-moon'}`} aria-hidden="true"/>{theme==='dark'?'Use Light Mode':'Use Dark Mode'}</button></div><div className="settings-preference-row"><div><p style={title}>Account session</p><p style={sub}>Sign out of {currentMember}'s Brevity profile on this device.</p></div><button type="button" className="settings-action-button settings-action-button--danger" onClick={onSignOut}><i className="ti ti-logout" aria-hidden="true"/>Sign Out</button></div></div>
    <span style={label}>Data</span>
    <div style={card}><div className="settings-card-row" style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:20}}><div><p style={title}>Local Recovery Cache</p><p style={sub}>Brevity's authenticated household service is authoritative for synchronized household records. Administrator export remains available for safekeeping. Restore is unavailable until a complete recovery can require Action Mode review, permission enforcement, exact-version checks, Audit History, and safe Undo.</p></div><div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{isAdministrator?<button type="button" onClick={handleExport} style={{padding:'9px 18px',borderRadius:10,background:'rgba(197,164,109,.1)',border:'1px solid rgba(197,164,109,.25)',color:'var(--gold)',fontSize:13,cursor:'pointer'}}>Export Recovery Cache</button>:<span style={badge}>Export: administrator only</span>}<button type="button" disabled title="Recovery restore is unavailable until it supports reviewed, version-protected changes with Audit History and safe Undo." style={{padding:'9px 18px',borderRadius:10,background:'rgba(255,255,255,.03)',border:'1px solid rgba(255,255,255,.08)',color:'var(--muted)',fontSize:13,cursor:'not-allowed',opacity:.7}}>Restore Recovery Cache unavailable</button></div></div></div>
    <SermonDeviceRescue/>
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
  const [navigationHistory,setNavigationHistory]=useState([])
  const appMainRef=useRef(null)
  const [theme,setTheme]=useState(()=>localStorage.getItem('brevity_theme')||'dark')
  const [sidebarExpanded,setSidebarExpanded]=useState(initialSidebarExpanded)
  const [refreshState,setRefreshState]=useState({status:'idle',message:'',issues:[],expanded:false})
  const [sharedReady,setSharedReady]=useState(false)
  const [actionPermissionState,setActionPermissionState]=useState({status:'loading',member:'',permissions:null,error:''})
  const [actionPermissionRevision,setActionPermissionRevision]=useState(0)

  const refreshAll=(member,{requestBankUpdate=false}={})=>{
    const financeReadOnly=auth.role!=='admin'
    const shouldRequestBankUpdate=requestBankUpdate&&!financeReadOnly
    setRefreshState({status:'loading',message:shouldRequestBankUpdate?'Requesting the latest transactions from your bank…':'Refreshing bank data, Family Calendar, and Today…',issues:[],expanded:false})
    return refreshApplicationData({currentMember:member,requestBankUpdate:shouldRequestBankUpdate,financeReadOnly})
      .then(detail=>{
        const issues=detail.issues||[]
        const bankPending=detail.finance?.transactionRefresh?.stillProcessing
        const message=issues.length
          ? `Refresh completed with ${issues.length} integration item${issues.length===1?'':'s'} needing attention.`
          : bankPending
            ? 'The bank accepted the update request. Brevity will show new transactions as soon as Plaid makes them available; refresh again shortly if they are still pending.'
            : `All Brevity data refreshed at ${new Date(detail.refreshedAt).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}.`
        setRefreshState({status:issues.length?'warning':'ready',message,issues,expanded:false})
        return detail
      })
      .catch(error=>{setRefreshState({status:'error',message:error.message||'Brevity refresh failed.',issues:[],expanded:false});throw error})
  }

  useEffect(()=>{document.documentElement.setAttribute('data-theme',theme);localStorage.setItem('brevity_theme',theme)},[theme])
  useEffect(()=>{
    const query=window.matchMedia(MOBILE_NAVIGATION_QUERY)
    const handleNavigationModeChange=event=>setSidebarExpanded(event.matches?false:savedDesktopSidebarState())
    query.addEventListener?.('change',handleNavigationModeChange)
    return()=>query.removeEventListener?.('change',handleNavigationModeChange)
  },[])
  useEffect(()=>{
    if(refreshState.status!=='ready')return
    const timer=setTimeout(()=>setRefreshState({status:'idle',message:'',issues:[],expanded:false}),4500)
    return()=>clearTimeout(timer)
  },[refreshState.status])
  useEffect(()=>{
    if(!auth.authenticated||!auth.member)return
    let cancelled=false
    setSharedReady(false)
    syncSharedState()
      .then(result=>{if(result.rejected.length)throw result.rejected[0].reason})
      .catch(error=>setRefreshState({status:'warning',message:error.message||'Household records could not be synchronized. Local changes remain on this device.',issues:[{id:'household-sync',source:'Household Sync',message:error.message||'Household records could not be synchronized.',action:'Retry the refresh. Local changes remain protected on this device.'}],expanded:false}))
      .finally(()=>{
        if(cancelled)return
        setSharedReady(true)
        refreshAll(auth.member).catch(error=>console.error('[Brevity] Startup refresh failed:',error))
      })
    return()=>{cancelled=true}
  },[auth.authenticated,auth.member])
  useEffect(()=>{
    if(!auth.authenticated||!sharedReady)return
    return startSharedStateSync({
      onError:error=>setRefreshState({status:'warning',message:error.message||'Household records could not be synchronized. Local changes remain on this device.',issues:[{id:'household-sync',source:'Household Sync',message:error.message||'Household records could not be synchronized.',action:'Retry the refresh. Local changes remain protected on this device.'}],expanded:false}),
    })
  },[auth.authenticated,sharedReady])
  useEffect(()=>{
    if(!auth.authenticated||!auth.member){setActionPermissionState({status:'loading',member:'',permissions:null,error:''});return}
    if(auth.role==='admin'){
      setActionPermissionState({status:'ready',member:auth.member,permissions:{planning:true,calendar:true,projects:true,finance:true},error:''})
      return
    }
    if(!sharedReady){setActionPermissionState({status:'loading',member:auth.member,permissions:null,error:''});return}
    let cancelled=false
    setActionPermissionState({status:'loading',member:auth.member,permissions:null,error:''})
    getActionMode()
      .then(result=>{
        if(cancelled)return
        const permissions=result?.permissions?.[auth.member]
        if(!permissions)throw new Error(`No Action Mode permissions were returned for ${auth.member}.`)
        setActionPermissionState({status:'ready',member:auth.member,permissions,error:''})
      })
      .catch(error=>{
        if(cancelled)return
        setActionPermissionState({status:'error',member:auth.member,permissions:null,error:error.message||'Action Mode permissions could not be verified.'})
      })
    return()=>{cancelled=true}
  },[auth.authenticated,auth.member,auth.role,sharedReady,actionPermissionRevision])

  if(auth.loading) return <AuthLoading/>
  if(!auth.authenticated) return <HouseholdLogin bootstrapRequired={auth.bootstrapRequired} onLogin={auth.login} onBootstrap={auth.bootstrap} error={auth.error}/>
  if(!sharedReady) return <AuthLoading/>

  const currentMember=auth.member
  const closeSidebarAfterNavigation=()=>{if(isCompactNavigation())setSidebarExpanded(false)}
  const toggleSidebar=()=>setSidebarExpanded(current=>{const next=!current;if(!isCompactNavigation())localStorage.setItem(SIDEBAR_STATE_KEY,next?'expanded':'collapsed');return next})
  const navigateTo=(pillarId,viewId)=>{
    const current={pillarId:activePillar,viewId:activeView,label:navigationLabel(activePillar,activeView),scrollTop:appMainRef.current?.scrollTop||0}
    const next={pillarId,viewId,label:navigationLabel(pillarId,viewId)}
    setNavigationHistory(history=>pushNavigationLocation(history,current,next))
    setActivePillar(pillarId)
    setActiveView(viewId)
    setExpandedPillar(pillarId||null)
    closeSidebarAfterNavigation()
    requestAnimationFrame(()=>{if(appMainRef.current)appMainRef.current.scrollTop=0})
  }
  const returnToPreviousView=()=>{
    const result=popNavigationLocation(navigationHistory)
    if(!result.previous)return
    setNavigationHistory(result.history)
    setActivePillar(result.previous.pillarId)
    setActiveView(result.previous.viewId)
    setExpandedPillar(result.previous.pillarId||null)
    closeSidebarAfterNavigation()
    requestAnimationFrame(()=>requestAnimationFrame(()=>{if(appMainRef.current)appMainRef.current.scrollTop=result.previous.scrollTop||0}))
  }
  const openPillar=pillarId=>navigateTo(pillarId,'pillar-analysis')
  const handlePillarClick=pillar=>{openPillar(pillar.id);if(pillar.items.length)setExpandedPillar(pillar.id);else closeSidebarAfterNavigation()}
  const navigateFromFinance=viewId=>navigateTo(viewId==='property'?'household':'finance',viewId)
  const handleRefreshStatus=()=>{setActionPermissionRevision(value=>value+1);return refreshAll(currentMember,{requestBankUpdate:true})}
  const activePillarRecord=PILLARS.find(pillar=>pillar.id===activePillar)
  const activeItem=activePillarRecord?.items.find(item=>item.id===activeView)
  const assistantPageLabel=activeView==='today'?'Today':activeView==='settings'?'Settings':activeItem?.label||activePillarRecord?.label||activeView
  const canEditPlanning=auth.role==='admin'||(actionPermissionState.status==='ready'&&actionPermissionState.member===currentMember&&actionPermissionState.permissions?.planning===true)
  const canEditProjects=auth.role==='admin'||(actionPermissionState.status==='ready'&&actionPermissionState.member===currentMember&&actionPermissionState.permissions?.projects===true)
  const planningAccessStatus=auth.role==='admin'?'ready':actionPermissionState.member===currentMember?actionPermissionState.status:'loading'
  const handleActionCompleted=async()=>{setActionPermissionRevision(value=>value+1);await syncSharedState();await refreshAll(currentMember).catch(()=>{})}

  const renderContent=()=>{
    if(activeView==='today')return <HouseholdToday currentMember={currentMember} canEditPlanning={canEditPlanning} planningAccessStatus={planningAccessStatus} isAdministrator={auth.role==='admin'} onOpenPillar={pillarId=>pillarId==='health'?navigateTo('health','meal-plan'):openPillar(pillarId)} onOpenMealPlan={()=>navigateTo('health','meal-plan')} onOpenCalendar={()=>navigateTo('household','family-calendar')}/>
    if(activeView==='settings')return <SettingsPage currentMember={currentMember} role={auth.role} theme={theme} onThemeChange={()=>setTheme(value=>value==='dark'?'light':'dark')} onSignOut={auth.logout}/>
    if(activeView==='property')return <Suspense fallback={<div className="app-view-loading">Loading Projects…</div>}><HomeHQ readOnly={!canEditProjects} canDelete={auth.role==='admin'} currentMember={currentMember}/></Suspense>
    if(activeView==='household-maintenance')return <Suspense fallback={<div className="app-view-loading">Loading Household Operations…</div>}><HouseholdMaintenance currentMember={currentMember} canEdit={canEditPlanning} isAdmin={auth.role==='admin'}/></Suspense>
    if(activeView==='malbec-estate')return <Suspense fallback={<div className="app-view-loading">Loading Malbec Estate…</div>}><EstateWorkspace role={auth.role}/></Suspense>
    if(activeView==='family-calendar')return <Suspense fallback={<div className="app-view-loading">Loading Family Calendar…</div>}><FamilyCalendar currentMember="Family" title="Family Calendar" subtitle="All household commitments · Apple events plus Brevity-managed source records"/></Suspense>
    if(activeView==='meal-plan')return <Suspense fallback={<div className="app-view-loading">Loading Meal Plan…</div>}><MealPlanner currentMember={currentMember}/></Suspense>
    if(EXTERNAL_SITES[activeView])return <ExternalSiteView {...EXTERNAL_SITES[activeView]} currentMember={currentMember}/>
    if(FINANCE_VIEWS.has(activeView)&&activePillar==='finance')return <Suspense fallback={<div className="app-view-loading">Loading Finance…</div>}><div className="finance-access-shell">{auth.role!=='admin'&&<section className="finance-read-only-notice" role="status"><i className="ti ti-lock" aria-hidden="true"/><div><strong>Financial records are read-only for {currentMember}</strong><span>{canEditPlanning?'Your planning access still allows reviewed edits to Finance Meeting narrative, saved notes, transcripts, and ordinary commitments. ':''}Financial corrections, forecasts, budgets, transactions, financial-effect details, and bank administration require the household administrator; bank connection changes are disabled for every member in this release.</span></div></section>}<FinancePlanner view={activeView} setView={navigateFromFinance} currentMember={currentMember} readOnly={auth.role!=='admin'} meetingPlanningReadOnly={!canEditPlanning}/></div></Suspense>
    const pillar=PILLARS.find(p=>p.id===activePillar)
    return pillar?<Suspense fallback={<div className="app-view-loading">Loading {pillar.label} analysis…</div>}><PillarAnalysis pillar={pillar} currentMember={currentMember}/></Suspense>:null
  }

  return <div className="app-shell"><BrevityAssistant currentMember={currentMember} role={auth.role} activeView={activeView} activePillar={activePillar} pageLabel={assistantPageLabel} onActionCompleted={handleActionCompleted}/><aside id="primary-navigation-drawer" aria-label="Primary navigation" className={`app-sidebar${sidebarExpanded?' is-expanded':''}`}><div className="sidebar-logo"><img src="/brevity-logo.png" alt="Brevity" className="sidebar-brand-logo"/><button type="button" className="sidebar-collapse-toggle" aria-label={sidebarExpanded?'Collapse navigation':'Expand navigation'} title={sidebarExpanded?'Collapse navigation':'Expand navigation'} aria-expanded={sidebarExpanded} aria-controls="primary-navigation-drawer" onClick={event=>{event.stopPropagation();toggleSidebar()}}><i className={`ti ti-layout-sidebar-left-${sidebarExpanded?'collapse':'expand'}`} aria-hidden="true"/></button></div><nav className="sidebar-nav"><button type="button" aria-label="Today" title="Today" className={`sidebar-nav-item${activeView==='today'?' active':''}`} onClick={()=>navigateTo('','today')}><i className="ti ti-home-2"/><span>Today</span></button><div className="sidebar-divider"/>{PILLARS.map((pillar,idx)=>{const isExpanded=expandedPillar===pillar.id;const hasItems=pillar.items.length>0;const isPillarActive=activePillar===pillar.id;return <div key={pillar.id}>{DIVIDER_BEFORE.has(idx)&&<div className="sidebar-divider"/>}<div className="pillar-group"><button type="button" aria-label={pillar.label} title={pillar.label} className={`pillar-header${isPillarActive?' pillar-header--active':''}`} onClick={()=>handlePillarClick(pillar)}><i className={`ti ${pillar.icon}`}/><span className="pillar-label">{pillar.label}</span>{hasItems&&<i className={`ti ti-chevron-${isExpanded?'up':'down'} pillar-chevron`}/>}</button>{hasItems&&isExpanded&&<div className="pillar-items">{pillar.items.map(item=><button type="button" aria-label={item.label} title={item.label} key={`${pillar.id}-${item.id}`} className={`sidebar-nav-item${activePillar===pillar.id&&activeView===item.id?' active':''}`} onClick={()=>navigateTo(pillar.id,item.id)}><i className={`ti ${item.icon}`}/><span>{item.label}</span></button>)}</div>}</div></div>})}</nav><div className="sidebar-footer"><button type="button" aria-label="Open settings" title="Settings" className={`sidebar-settings-button${activeView==='settings'?' active':''}`} onClick={()=>navigateTo('','settings')}><i className="ti ti-settings" aria-hidden="true"/><span>Settings</span><i className="ti ti-chevron-right sidebar-settings-chevron" aria-hidden="true"/></button></div></aside>{sidebarExpanded&&<button type="button" className="mobile-sidebar-backdrop" aria-label="Close navigation" onClick={()=>setSidebarExpanded(false)}/>}<nav className="mobile-app-nav" aria-label="Primary mobile navigation"><button type="button" className={activeView==='today'?'active':''} onClick={()=>navigateTo('','today')}><i className="ti ti-home-2"/><span>Today</span></button><button type="button" className={activeView==='family-calendar'?'active':''} onClick={()=>navigateTo('household','family-calendar')}><i className="ti ti-calendar-event"/><span>Calendar</span></button><button type="button" aria-expanded={sidebarExpanded} aria-controls="primary-navigation-drawer" onClick={()=>setSidebarExpanded(value=>!value)}><i className="ti ti-menu-2"/><span>Menu</span></button></nav><main ref={appMainRef} className="app-main">{navigationHistory.length>0&&<nav className="app-context-navigation" aria-label="Screen history"><button type="button" onClick={returnToPreviousView} aria-label={`Back to ${navigationHistory.at(-1).label}`}><i className="ti ti-arrow-left" aria-hidden="true"/><span>Back to {navigationHistory.at(-1).label}</span></button></nav>}{refreshState.status!=='idle'&&<section className={`app-refresh-status app-refresh-status--${refreshState.status}${refreshState.expanded?' is-expanded':''}`} role="status" aria-live="polite"><div className="app-refresh-status-row"><span>{refreshState.message}</span><div>{refreshState.issues?.length>0&&<button type="button" onClick={()=>setRefreshState(current=>({...current,expanded:!current.expanded}))}>{refreshState.expanded?'Hide details':'View details'}</button>}{refreshState.status!=='loading'&&<button type="button" onClick={handleRefreshStatus}>Refresh all</button>}</div></div>{refreshState.expanded&&refreshState.issues?.length>0&&<div className="app-refresh-issues">{refreshState.issues.map(issue=><article key={issue.id}><strong>{issue.source}</strong><span>{issue.message}</span><small>{issue.action}</small></article>)}</div>}</section>}<div style={{display:'contents'}}>{renderContent()}</div></main></div>
}
