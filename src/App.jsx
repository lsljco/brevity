import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import HouseholdToday from './household/HouseholdToday.jsx'
import PillarAnalysis from './household/PillarAnalysis.jsx'
import { HouseholdAccounts, HouseholdLogin, useHouseholdAuth } from './household/HouseholdAuth.jsx'
import { initialsForMember } from './household/memberProfile.js'
import { refreshApplicationData } from './household/appRefresh.js'
import { startSharedStateSync, syncSharedState } from './household/sharedState.js'
import BrevityAssistant from './assistant/BrevityAssistant.jsx'
import './household/Readability.css'
import './AppDeferred.css'

const FamilyCalendar = lazy(() => import('./family/FamilyCalendar.jsx'))
const FinancePlanner = lazy(() => import('./finance/FinancePlanner.jsx'))
const HomeHQ = lazy(() => import('./homehq/HomeHQ.jsx'))

const PILLARS = [
  { id:'spiritual', label:'Spiritual Maturity', icon:'ti-sun', layer:1, description:'The foundation of everything — your relationship with God and family.', items:[] },
  { id:'health', label:'Health & Nutrition', icon:'ti-heart', layer:2, description:'Stewardship of the body — nourishment and whole-family wellness.', items:[] },
  { id:'fitness', label:'Physical Fitness', icon:'ti-run', layer:2, description:'Strength, discipline, and physical stewardship.', items:[] },
  { id:'household', label:'Household Management', icon:'ti-home', layer:3, description:'The heartbeat of the home — operations, property, and daily life.', items:[
    { id:'property', label:'Projects', icon:'ti-building-estate' },
    { id:'my-planner', label:'My Planner', icon:'ti-calendar-user' },
    { id:'family-calendar', label:'Family Calendar', icon:'ti-calendar-event' },
    { id:'malbec-estate', label:'Malbec Estate', icon:'ti-building-community' },
    { id:'live-intentional', label:'Live Intentional', icon:'ti-compass' },
  ]},
  { id:'education', label:'Education', icon:'ti-book', layer:4, description:'Knowledge and growth — learning across every member of the family.', items:[] },
  { id:'finance', label:'Finance', icon:'ti-building-bank', layer:4, description:'Governance, stewardship, and financial planning for the family.', items:[
    { id:'dashboard', label:'Dashboard', icon:'ti-layout-dashboard' },
    { id:'daily-alignment', label:'Daily Alignment', icon:'ti-target-arrow' },
    { id:'scenario-modeling', label:'Scenario Modeling', icon:'ti-chart-arrows' },
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

const FINANCE_VIEWS = new Set(['dashboard','daily-alignment','scenario-modeling','transactions','calendar','accounts','budget','recurring','reporting'])
const EXTERNAL_SITES = {
  'malbec-estate': { title:'Malbec Estate', description:'Estate and household property management', url:'https://malbecestate.netlify.app/', icon:'ti-building-community', embed:false },
  'live-intentional': { title:'Live Intentional', description:'Intentional living and household planning', url:'https://liveintentional.netlify.app/', icon:'ti-compass', embed:true },
  'apostolic-sermon-builder': { title:'Apostolic Sermon Builder', description:'Sermon preparation and ministry resources', url:'https://apostolicsermonbuilderlseay.netlify.app/', icon:'ti-book-2', embed:true },
}
const DIVIDER_BEFORE = new Set([1,3,4,6])

function ExternalSiteView({ title, description, url, icon, embed, currentMember }) {
  const frameRef=useRef(null)
  const targetOrigin=useMemo(()=>{try{return new URL(url).origin}catch{return''}},[url])
  const sendMember=()=>{if(embed&&currentMember&&targetOrigin)frameRef.current?.contentWindow?.postMessage({type:'brevity-authenticated-member',member:currentMember},targetOrigin)}
  useEffect(()=>{
    if(!embed||!currentMember||!targetOrigin)return
    const receive=event=>{if(event.origin===targetOrigin&&event.data?.type==='live-intentional-ready')sendMember()}
    window.addEventListener('message',receive)
    return()=>window.removeEventListener('message',receive)
  },[embed,currentMember,targetOrigin])
  return <section className="external-site-view" aria-label={title}><header className="external-site-toolbar"><div><p className="external-site-eyebrow">Connected application</p><h1>{title}</h1><p className="external-site-description">{description}</p></div><a className="external-site-open" href={url} target="_blank" rel="noreferrer">Open full screen <i className="ti ti-external-link" aria-hidden="true" /></a></header>{embed?<iframe ref={frameRef} onLoad={sendMember} className="external-site-frame" src={url} title={title} loading="eager" referrerPolicy="strict-origin-when-cross-origin" allow="clipboard-read; clipboard-write" />:<div className="external-site-fallback"><div className="external-site-fallback-icon"><i className={`ti ${icon}`} aria-hidden="true" /></div><h2>{title} is connected</h2><p>{title} currently blocks secure in-app display. Open it below while its hosting security setting is updated.</p><a className="external-site-launch" href={url} target="_blank" rel="noreferrer">Launch {title} <i className="ti ti-arrow-up-right" aria-hidden="true" /></a></div>}</section>
}

function SettingsPage({ currentMember, role }) {
  const card={background:'var(--glass)',border:'1px solid var(--glass-border)',borderRadius:16,padding:'24px 28px',marginBottom:12}
  const title={fontSize:15,fontWeight:600,color:'var(--white)',margin:0}
  const sub={fontSize:13,color:'var(--muted)',margin:'4px 0 0',lineHeight:1.5}
  const badge={fontSize:11,padding:'4px 10px',borderRadius:10,background:'rgba(197,164,109,.12)',border:'1px solid rgba(197,164,109,.22)',color:'var(--gold)'}
  const label={fontSize:11,letterSpacing:'.1em',textTransform:'uppercase',color:'var(--gold)',margin:'28px 0 14px',display:'block',fontWeight:600}
  const importRef=useRef(null)
  const backupKeys=['lslj_finance_v9','plaid_actuals_cache','lslj_budget_v1','lslj_actuals_v1','lslj_bal_overrides_v1','lslj_tx_overrides_v1','lslj_tx_rules_v1','brevity_finance_categories_v1','brevity_finance_scenarios_v1','fp_goals','homehq_items_v1','family_calendar_events_v1','brevity_daily_financial_alignment_v1']
  const handleExport=()=>{const data={exportedAt:new Date().toISOString(),records:{}};backupKeys.forEach(k=>{const raw=localStorage.getItem(k);if(raw!=null){try{data.records[k]=JSON.parse(raw)}catch{data.records[k]=raw}}});const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`brevity-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href)}
  const handleImport=event=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;const reader=new FileReader();reader.onload=()=>{try{const parsed=JSON.parse(reader.result);const records=parsed.records||parsed;const valid=backupKeys.filter(key=>Object.prototype.hasOwnProperty.call(records,key));if(!valid.length)throw new Error('No recognized Brevity records were found.');if(!window.confirm(`Restore ${valid.length} Brevity record${valid.length===1?'':'s'} from this backup?`))return;valid.forEach(key=>localStorage.setItem(key,JSON.stringify(records[key])));window.location.reload()}catch(error){window.alert(error.message||'This is not a valid Brevity backup.')}};reader.readAsText(file)}
  return <div className="settings-page" style={{maxWidth:820,margin:'0 auto',padding:'48px 32px'}}>
    <h1 style={{fontFamily:'var(--font-serif)',fontSize:42,fontWeight:400,color:'var(--white)',margin:'0 0 8px'}}>Settings</h1>
    <p style={{color:'var(--muted)',fontSize:15,margin:'0 0 32px'}}>Manage household accounts, shared data and integrations.</p>
    <span style={label}>Household Identity</span>
    <div style={card}><div className="settings-card-row" style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:20,marginBottom:18}}><div><p style={title}>Signed in as {currentMember}</p><p style={sub}>Your authenticated identity controls My Day and member-specific views on every device.</p></div><span style={badge}>{role === 'admin' ? 'Administrator' : 'Member'}</span></div><HouseholdAccounts sessionMember={currentMember} role={role}/></div>
    <span style={label}>Data</span>
    <div style={card}><div className="settings-card-row" style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:20}}><div><p style={title}>Backup and Restore</p><p style={sub}>Download a complete Brevity JSON backup or restore one. Shared records also synchronize securely after sign-in.</p></div><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button onClick={handleExport} style={{padding:'9px 18px',borderRadius:10,background:'rgba(197,164,109,.1)',border:'1px solid rgba(197,164,109,.25)',color:'var(--gold)',fontSize:13,cursor:'pointer'}}>Export JSON</button><button onClick={()=>importRef.current?.click()} style={{padding:'9px 18px',borderRadius:10,background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.12)',color:'var(--soft-white)',fontSize:13,cursor:'pointer'}}>Restore JSON</button><input ref={importRef} type="file" accept="application/json,.json" onChange={handleImport} style={{display:'none'}}/></div></div></div>
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
  const [refreshState,setRefreshState]=useState({status:'idle',message:''})
  const [sharedReady,setSharedReady]=useState(false)

  const refreshAll=member=>{
    setRefreshState({status:'loading',message:'Refreshing bank data, calendars, Today, and all seven analyses…'})
    return refreshApplicationData({currentMember:member})
      .then(detail=>{
        const issues=(detail.finance?.errors?.length||0)+(detail.analyses||[]).filter(result=>result.status==='rejected').length+(detail.calendar?.error?1:0)
        setRefreshState({status:issues?'warning':'ready',message:issues?`Refresh completed with ${issues} item${issues===1?'':'s'} needing attention.`:`All Brevity data refreshed at ${new Date(detail.refreshedAt).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}.`})
        return detail
      })
      .catch(error=>{setRefreshState({status:'error',message:error.message||'Brevity refresh failed.'});throw error})
  }

  useEffect(()=>{document.documentElement.setAttribute('data-theme',theme);localStorage.setItem('brevity_theme',theme)},[theme])
  useEffect(()=>{
    if(refreshState.status!=='ready')return
    const timer=setTimeout(()=>setRefreshState({status:'idle',message:''}),4500)
    return()=>clearTimeout(timer)
  },[refreshState.status])
  useEffect(()=>{
    if(!sidebarExpanded||typeof window==='undefined'||!window.matchMedia('(hover: none)').matches)return
    const timer=setTimeout(()=>setSidebarExpanded(false),4000)
    return()=>clearTimeout(timer)
  },[sidebarExpanded])
  useEffect(()=>{
    if(!auth.authenticated||!auth.member)return
    let cancelled=false
    setSharedReady(false)
    syncSharedState()
      .then(result=>{if(result.rejected.length)throw result.rejected[0].reason})
      .catch(error=>setRefreshState({status:'warning',message:error.message||'Household records could not be synchronized. Local changes remain on this device.'}))
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
      onRemoteChange:keys=>setRefreshState({status:'warning',message:`New household changes were synchronized (${keys.length} record${keys.length===1?'':'s'}). Refresh this view to display them.`}),
      onError:error=>setRefreshState({status:'warning',message:error.message||'Household records could not be synchronized. Local changes remain on this device.'}),
    })
  },[auth.authenticated,sharedReady])

  if(auth.loading) return <AuthLoading/>
  if(!auth.authenticated) return <HouseholdLogin bootstrapRequired={auth.bootstrapRequired} onLogin={auth.login} onBootstrap={auth.bootstrap} error={auth.error}/>
  if(!sharedReady) return <AuthLoading/>

  const currentMember=auth.member
  const navigateTo=(pillarId,viewId)=>{setActivePillar(pillarId);setActiveView(viewId);setExpandedPillar(pillarId);setSidebarExpanded(false)}
  const openPillar=pillarId=>{setActivePillar(pillarId);setActiveView('pillar-analysis');setExpandedPillar(pillarId)}
  const handlePillarClick=pillar=>{openPillar(pillar.id);if(pillar.items.length)setExpandedPillar(pillar.id);else setSidebarExpanded(false)}
  const sharedReloadNeeded=refreshState.message.startsWith('New household changes')
  const handleRefreshStatus=()=>sharedReloadNeeded?window.location.reload():refreshAll(currentMember)
  const activePillarRecord=PILLARS.find(pillar=>pillar.id===activePillar)
  const activeItem=activePillarRecord?.items.find(item=>item.id===activeView)
  const assistantPageLabel=activeView==='today'?'Today':activeView==='settings'?'Settings':activeItem?.label||activePillarRecord?.label||activeView

  const renderContent=()=>{
    if(activeView==='today')return <HouseholdToday currentMember={currentMember} onOpenPillar={openPillar}/>
    if(activeView==='settings')return <SettingsPage currentMember={currentMember} role={auth.role}/>
    if(activeView==='property')return <Suspense fallback={<div className="app-view-loading">Loading Projects…</div>}><HomeHQ/></Suspense>
    if(activeView==='my-planner')return <Suspense fallback={<div className="app-view-loading">Loading My Planner…</div>}><FamilyCalendar currentMember={currentMember} includeFamily lockMember title="My Planner" subtitle={`${currentMember}'s commitments plus shared Family events`}/></Suspense>
    if(activeView==='family-calendar')return <Suspense fallback={<div className="app-view-loading">Loading Family Calendar…</div>}><FamilyCalendar currentMember="Family" title="Family Calendar" subtitle="All household commitments · Two-way sync with the shared Apple Family Calendar"/></Suspense>
    if(EXTERNAL_SITES[activeView])return <ExternalSiteView {...EXTERNAL_SITES[activeView]} currentMember={currentMember}/>
    if(FINANCE_VIEWS.has(activeView)&&activePillar==='finance')return <Suspense fallback={<div className="app-view-loading">Loading Finance…</div>}><FinancePlanner view={activeView} setView={v=>navigateTo('finance',v)}/></Suspense>
    const pillar=PILLARS.find(p=>p.id===activePillar)
    return pillar?<PillarAnalysis pillar={pillar} currentMember={currentMember}/>:null
  }

  return <div className="app-shell"><BrevityAssistant currentMember={currentMember} activeView={activeView} activePillar={activePillar} pageLabel={assistantPageLabel}/><aside className={`app-sidebar${sidebarExpanded?' is-expanded':''}`} onPointerEnter={event=>{if(event.pointerType==='mouse')setSidebarExpanded(true)}} onPointerLeave={event=>{if(event.pointerType==='mouse')setSidebarExpanded(false)}} onFocus={event=>{if(event.currentTarget.matches(':focus-visible'))setSidebarExpanded(true)}} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setSidebarExpanded(false)}}><div className="sidebar-logo"><img src="/brevity-logo.png" alt="Brevity" className="sidebar-brand-logo"/><button type="button" className="sidebar-collapse-toggle" aria-label={sidebarExpanded?'Collapse navigation':'Expand navigation'} aria-expanded={sidebarExpanded} onClick={event=>{event.stopPropagation();setSidebarExpanded(value=>!value)}}><i className={`ti ti-layout-sidebar-left-${sidebarExpanded?'collapse':'expand'}`} aria-hidden="true"/></button></div><nav className="sidebar-nav"><button className={`sidebar-nav-item${activeView==='today'?' active':''}`} onClick={()=>{setActiveView('today');setActivePillar('');setExpandedPillar(null);setSidebarExpanded(false)}}><i className="ti ti-home-2"/><span>Today</span></button><div className="sidebar-divider"/>{PILLARS.map((pillar,idx)=>{const isExpanded=expandedPillar===pillar.id;const hasItems=pillar.items.length>0;const isPillarActive=activePillar===pillar.id;return <div key={pillar.id}>{DIVIDER_BEFORE.has(idx)&&<div className="sidebar-divider"/>}<div className="pillar-group"><button className={`pillar-header${isPillarActive?' pillar-header--active':''}`} onClick={()=>handlePillarClick(pillar)}><i className={`ti ${pillar.icon}`}/><span className="pillar-label">{pillar.label}</span>{hasItems&&<i className={`ti ti-chevron-${isExpanded?'up':'down'} pillar-chevron`}/>}</button>{hasItems&&isExpanded&&<div className="pillar-items">{pillar.items.map(item=><button key={`${pillar.id}-${item.id}`} className={`sidebar-nav-item${activePillar===pillar.id&&activeView===item.id?' active':''}`} onClick={()=>navigateTo(pillar.id,item.id)}><i className={`ti ${item.icon}`}/><span>{item.label}</span></button>)}</div>}</div></div>})}</nav><div className="sidebar-footer"><button className="sidebar-footer-item" onClick={()=>setTheme(t=>t==='dark'?'light':'dark')}><i className={`ti ${theme==='dark'?'ti-sun':'ti-moon'}`}/><span>{theme==='dark'?'Light Mode':'Dark Mode'}</span></button><button className="sidebar-footer-item" onClick={()=>{setActiveView('settings');setActivePillar('');setSidebarExpanded(false)}}><i className="ti ti-settings"/><span>Settings</span></button><button className="sidebar-footer-item" onClick={auth.logout}><i className="ti ti-logout"/><span>Sign Out</span></button><div className="sidebar-user"><div className="sidebar-user-avatar">{initialsForMember(currentMember)}</div><div className="sidebar-user-details"><div className="sidebar-user-name">{currentMember}</div><div className="sidebar-user-role">{auth.role === 'admin' ? 'Household Administrator' : 'Household Member'}</div></div></div></div></aside><main className="app-main">{refreshState.status!=='idle'&&<div className={`app-refresh-status app-refresh-status--${refreshState.status}`} role="status" aria-live="polite"><span>{refreshState.message}</span>{refreshState.status!=='loading'&&<button type="button" onClick={handleRefreshStatus}>{sharedReloadNeeded?'Reload view':'Refresh all'}</button>}</div>}{renderContent()}</main></div>
}
