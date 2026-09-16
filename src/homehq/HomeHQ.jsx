import { useState, useEffect, useRef } from 'react'
import {
  HOUSEHOLD_MEMBERS as MEMBERS,
  PROJECT_STORAGE_KEY as STORAGE_KEY,
  normalizeProjectItem,
  parseProjectDate,
  projectDateKey,
  readJson,
} from './projectData.js'
import {
  projectCreateOperation,
  projectDeleteOperation,
  projectUpdateOperation,
  requestProjectActionReview,
} from './projectActionReview.js'
import { SHARED_STATE_EVENT } from '../household/sharedState.js'

const ROOMS      = ["Kitchen","Bathroom","Living Room","Bedroom","Basement","Garage","Exterior","Attic","Yard"];
const TYPES      = ["Renovation","Maintenance","Repair"];
const STATUSES   = ["To Do","In Progress","Done"];
const PRIORITIES = ["High","Medium","Low"];
const EMPTY_FORM = {
  title:"", type:"Renovation", room:"Kitchen", roomCustom:"", status:"To Do", priority:"Medium",
  assignee:"", raci:{responsible:[],accountable:[],consulted:[],informed:[]},
  pushToFamilyCalendar:false, startDate:"", due:"", estcost:"", actcost:"",
  cname:"", cphone:"", cemail:"", caddress:"",
  bizLicense:false, coi:false, workersComp:false,
  notes:"", photos:[], files:[]
};
const newProjectForm = currentMember => ({
  ...EMPTY_FORM,
  raci:{
    responsible:MEMBERS.includes(currentMember)?[currentMember]:[],
    accountable:[],
    consulted:[],
    informed:[],
  },
  photos:[],
  files:[],
});

// ── Glass card styles ────────────────────────────────────────────────────────
const HQ_STYLES = `
  .hq-card {
    background: linear-gradient(145deg, rgba(255,255,255,0.075), rgba(255,255,255,0.035));
    border: 1.5px solid rgba(197,164,109,0.18);
    border-radius: 20px;
    overflow: hidden;
    backdrop-filter: blur(24px) saturate(140%);
    -webkit-backdrop-filter: blur(24px) saturate(140%);
    box-shadow: 0 18px 60px rgba(0,0,0,0.32);
    transition: border-color .2s, transform .2s, box-shadow .2s;
    position: relative;
  }
  .hq-card::after {
    content: '';
    position: absolute;
    inset: auto 0 0 0;
    height: 2px;
    background: linear-gradient(90deg, transparent, rgba(197,164,109,0.55), transparent);
    pointer-events: none;
  }
  .hq-card:hover {
    border-color: rgba(197,164,109,0.46);
    transform: translateY(-4px);
    box-shadow: 0 24px 80px rgba(0,0,0,0.46), 0 0 30px rgba(197,164,109,0.08);
  }
  .hq-card.hq-card--expanded {
    border-color: rgba(197,164,109,0.5);
    box-shadow: 0 8px 40px rgba(0,0,0,0.5);
    transform: none;
  }
  .hq-stat-card {
    background: linear-gradient(145deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03));
    border: 1px solid rgba(197,164,109,0.16);
    border-radius: 14px;
    padding: 16px 20px;
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    box-shadow: 0 8px 32px rgba(0,0,0,0.24);
    position: relative;
    overflow: hidden;
    transition: border-color .2s, box-shadow .2s;
  }
  .hq-stat-card::after {
    content: '';
    position: absolute;
    inset: auto 0 0 0;
    height: 1.5px;
    background: linear-gradient(90deg, transparent, rgba(197,164,109,0.45), transparent);
    pointer-events: none;
  }
  .hq-topbar {
    min-width: 0;
    position: relative !important;
    top: auto !important;
  }
  .hq-topbar-actions,
  .hq-content,
  .hq-stats,
  .hq-filters,
  .hq-proj-grid,
  .hq-modal-form { min-width: 0; }
  .hq-proj-grid {
    grid-template-columns: repeat(auto-fill, minmax(min(320px, 100%), 1fr)) !important;
  }
  .hq-project-costs { flex-wrap: wrap; }
  .hq-modal-backdrop { z-index: 1700 !important; }
  .hq-lightbox { z-index: 1800 !important; }
  .hq-lightbox-header { z-index: 1801 !important; }
  .hq-toast { z-index: 1750 !important; }
  .hq-project-calendar-scroll {
    max-width: 100%;
    overflow-x: auto;
    overscroll-behavior-inline: contain;
    -webkit-overflow-scrolling: touch;
  }
  @media (max-width: 900px) {
    .hq-topbar { flex-wrap: wrap; padding: 16px 20px !important; }
    .hq-topbar-actions { flex-wrap: wrap; justify-content: flex-end; }
    .hq-content { padding: 20px !important; }
    .hq-stats { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 10px !important; }
  }
  @media (max-width: 640px) {
    .hq-topbar { align-items: stretch !important; flex-direction: column; padding: 14px 16px !important; }
    .hq-topbar-actions { display: grid !important; grid-template-columns: repeat(2, minmax(0, 1fr)); width: 100%; }
    .hq-topbar-actions button { width: 100%; min-height: 44px; padding: 8px 10px !important; }
    .hq-tabs { padding-inline: 12px !important; }
    .hq-tabs > div { min-height: 48px; padding: 13px 15px !important; }
    .hq-content { width: 100%; padding: 18px 14px calc(112px + env(safe-area-inset-bottom)) !important; }
    .hq-stats { gap: 8px !important; }
    .hq-stat-card { min-width: 0; padding: 13px 12px; }
    .hq-filters > input,
    .hq-filters > select { flex: 1 1 100% !important; width: 100% !important; min-width: 0 !important; }
    .hq-project-card-actions button,
    .hq-project-calendar-toolbar button { min-width: 44px !important; height: 44px !important; }
    .hq-project-costs > div:last-child { margin-left: 0 !important; }
    .hq-project-calendar-scroll { margin-inline: -2px; }
    .hq-project-calendar-grid { min-width: 680px; }
    .hq-modal-backdrop {
      align-items: stretch !important;
      padding: max(8px, env(safe-area-inset-top)) 8px max(8px, env(safe-area-inset-bottom)) !important;
    }
    .hq-modal-card {
      max-height: calc(100dvh - max(16px, env(safe-area-inset-top)) - max(16px, env(safe-area-inset-bottom))) !important;
      padding: 22px 16px calc(20px + env(safe-area-inset-bottom)) !important;
      border-radius: 16px !important;
    }
    .hq-modal-close { width: 44px !important; height: 44px !important; top: 8px !important; right: 8px !important; }
    .hq-modal-form { grid-template-columns: minmax(0, 1fr) !important; }
    .hq-modal-form > * { grid-column: auto !important; min-width: 0; }
    .hq-room-fields { flex-direction: column; }
    .hq-modal-footer { position: sticky; bottom: calc(-20px - env(safe-area-inset-bottom)); padding: 12px 0 calc(20px + env(safe-area-inset-bottom)); background: rgba(12,12,12,.98); }
    .hq-modal-footer button { flex: 1; min-height: 44px; padding-inline: 12px !important; }
    .hq-attachment-row { flex-wrap: wrap; }
    .hq-attachment-row > div { flex-basis: calc(100% - 44px); }
    .hq-attachment-row > button,
    .hq-attachment-row > a { display: inline-flex; min-width: 44px !important; min-height: 44px !important; align-items: center; justify-content: center; }
    .hq-lightbox { padding: max(72px, calc(52px + env(safe-area-inset-top))) 12px calc(20px + env(safe-area-inset-bottom)) !important; }
    .hq-lightbox-header { padding: max(14px, env(safe-area-inset-top)) 12px 12px !important; gap: 8px; }
    .hq-lightbox-header button,
    .hq-lightbox-header a { display: inline-flex; min-width: 44px; min-height: 44px; align-items: center; justify-content: center; }
    .hq-toast { left: 12px !important; right: 12px !important; bottom: calc(92px + env(safe-area-inset-bottom)) !important; text-align: center; }
  }
  @media (max-width: 380px) {
    .hq-topbar-actions,
    .hq-stats { grid-template-columns: minmax(0, 1fr) !important; }
  }
`

// ── Design tokens ───────────────────────────────────────────────────────────
const G = '#C5A46D';      // champagne gold
const W = 'rgba(247,243,234,0.90)';
const W2 = 'rgba(247,243,234,0.65)';
const W3 = 'rgba(247,243,234,0.40)';
const BORDER = 'rgba(255,255,255,0.08)';
const GLASS  = 'rgba(255,255,255,0.04)';
const GLASS2 = 'rgba(255,255,255,0.07)';
const RED    = '#f87171';
const GREEN  = '#4ade80';

const TYPE_COLOR = { Renovation: G,        Maintenance: GREEN, Repair: RED };
const TYPE_BG    = { Renovation: 'rgba(197,164,109,0.14)', Maintenance: 'rgba(74,222,128,0.12)', Repair: 'rgba(248,113,113,0.14)' };
const STAT_COLOR = { "To Do": W3, "In Progress": G, "Done": GREEN };
const STAT_BG    = { "To Do": 'rgba(255,255,255,0.06)', "In Progress": 'rgba(197,164,109,0.14)', "Done": 'rgba(74,222,128,0.12)' };
const PRIO_COLOR = { High: RED, Medium: G, Low: GREEN };
const PRIO_BG    = { High: 'rgba(248,113,113,0.14)', Medium: 'rgba(197,164,109,0.14)', Low: 'rgba(74,222,128,0.12)' };

// Architectural room images — moody, neutral, luxury
const ROOM_IMG = {
  'Kitchen':     '/kitchen.jpg',
  'Bathroom':    'https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?w=1200&h=800&fit=crop&auto=format&q=100',
  'Living Room': 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=1200&h=800&fit=crop&auto=format&q=100',
  'Bedroom':     'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=1200&h=800&fit=crop&auto=format&q=100',
  'Basement':    'https://images.unsplash.com/photo-1586023492125-27b5856a0de4?w=1200&h=800&fit=crop&auto=format&q=100',
  'Garage':      'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1200&h=800&fit=crop&auto=format&q=100',
  'Exterior':    'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&h=800&fit=crop&auto=format&q=100',
  'Attic':       'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=1200&h=800&fit=crop&auto=format&q=100',
  'Yard':        'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=1200&h=800&fit=crop&auto=format&q=100',
  'default':     'https://images.unsplash.com/photo-1484154218962-a197022b5858?w=1200&h=800&fit=crop&auto=format&q=100',
};

function getRoomImg(item) {
  return (item.photos && item.photos.length > 0)
    ? item.photos[0]
    : (ROOM_IMG[item.room] || ROOM_IMG['default']);
}

// ── Shared UI atoms ──────────────────────────────────────────────────────────
function Badge({text,fg,bg}){
  return <span style={{padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,color:fg,background:bg,letterSpacing:.3,whiteSpace:"nowrap"}}>{text}</span>;
}
function Lbl({children}){
  return <div style={{fontSize:11,fontWeight:700,letterSpacing:1,textTransform:"uppercase",color:W3,marginBottom:4}}>{children}</div>;
}
function FField({label,full,children}){
  return (
    <div style={{gridColumn:full?"1/-1":undefined,display:"flex",flexDirection:"column",gap:5}}>
      <Lbl>{label}</Lbl>
      {children}
    </div>
  );
}

function MemberMultiSelect({label,role,value=[],onChange}){
  const toggle = member => onChange(value.includes(member) ? value.filter(v=>v!==member) : [...value,member]);
  return (
    <FField label={`${label} (${role})`} full>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",padding:"10px 12px",background:GLASS,borderRadius:8,border:`1.5px solid ${BORDER}`}}>
        {MEMBERS.map(member=>{
          const selected=value.includes(member);
          return <button type="button" key={member} onClick={()=>toggle(member)} aria-pressed={selected}
            style={{padding:"6px 11px",borderRadius:20,cursor:"pointer",fontSize:12,fontWeight:600,
              border:`1px solid ${selected?G:BORDER}`,background:selected?'rgba(197,164,109,0.18)':GLASS,
              color:selected?G:W2}}>{member}</button>;
        })}
      </div>
    </FField>
  );
}

const FI = {
  padding:"10px 14px",
  border:`1.5px solid ${BORDER}`,
  borderRadius:8,fontSize:14,
  color:W,
  background:'rgba(255,255,255,0.06)',
  outline:"none",
  width:"100%",
  colorScheme:"dark",
};

function CostInput({label, field, form, setForm}){
  const [display, setDisplay] = useState(form[field] ? "$"+parseFloat(form[field]).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}) : "");
  function handleChange(e){
    const raw = e.target.value.replace(/[^0-9.]/g,"");
    const parts = raw.split(".");
    const cleaned = parts[0]+(parts.length>1?"."+parts[1].slice(0,2):"");
    setDisplay(raw === "" ? "" : "$"+cleaned);
    setForm(p=>({...p,[field]:cleaned}));
  }
  function handleBlur(){
    const n = parseFloat(form[field]);
    if(!isNaN(n)){
      setForm(p=>({...p,[field]:n.toFixed(2)}));
      setDisplay("$"+n.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}));
    } else {
      setDisplay("");
    }
  }
  function handleFocus(){ setDisplay(form[field]?"$"+form[field]:""); }
  return (
    <FField label={label}>
      <input style={{...FI,textAlign:"right"}} value={display} onChange={handleChange} onBlur={handleBlur} onFocus={handleFocus} placeholder="$0.00"/>
    </FField>
  );
}

function loadItems(){
  const items=readJson(localStorage,STORAGE_KEY,[]);
  return Array.isArray(items)?items.map(normalizeProjectItem):[];
}
function fmtPhone(val){
  const d = val.replace(/\D/g,"").slice(0,10);
  if(d.length<=3) return d;
  if(d.length<=6) return "("+d.slice(0,3)+") "+d.slice(3);
  return "("+d.slice(0,3)+") "+d.slice(3,6)+"-"+d.slice(6);
}
function fmtCost(val){
  const n = parseFloat(String(val).replace(/[^0-9.]/g,""));
  return isNaN(n) ? "" : n.toFixed(2);
}
function displayCost(val){
  if(!val && val !== 0) return "—";
  const n = parseFloat(val);
  return isNaN(n) ? "—" : "$"+n.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
}
function roomLabel(item){
  return item.room === "Other" && item.roomCustom ? item.roomCustom : item.room;
}

// ── GANTT ──────────────────────────────────────────────────────────────────
function GanttView({items,onEdit,readOnly=false}){
  const [groupBy,setGroupBy]=useState("room");
  const [colorBy,setColorBy]=useState("status");
  const today=new Date(); today.setHours(0,0,0,0);
  const ganttItems=items.filter(i=>i.due);
  if(!ganttItems.length) return(
    <div style={{textAlign:"center",padding:"60px 20px",color:W3}}>
      <div style={{fontSize:18,fontWeight:600,marginBottom:8,color:W2}}>No timeline data yet</div>
      <div style={{fontSize:14}}>Add a due date to items to see them on the timeline.</div>
    </div>
  );
  const allDates=ganttItems.flatMap(i=>[i.startDate&&parseProjectDate(i.startDate),i.due&&parseProjectDate(i.due)].filter(Boolean));
  let minDate=new Date(Math.min(...allDates)); minDate.setDate(minDate.getDate()-7);
  let maxDate=new Date(Math.max(...allDates)); maxDate.setDate(maxDate.getDate()+14);
  if(today<minDate){minDate=new Date(today);minDate.setDate(minDate.getDate()-7);}
  if(today>maxDate){maxDate=new Date(today);maxDate.setDate(maxDate.getDate()+14);}
  const totalDays=Math.ceil((maxDate-minDate)/86400000);
  const DAY_W=28,LABEL_W=200;
  function dayOffset(date){const d=parseProjectDate(date);d.setHours(0,0,0,0);return Math.max(0,Math.round((d-minDate)/86400000));}
  const months=[];
  let mc=new Date(minDate.getFullYear(),minDate.getMonth(),1);
  while(mc<=maxDate){
    const next=new Date(mc.getFullYear(),mc.getMonth()+1,1);
    const s=Math.max(0,dayOffset(mc)),e=Math.min(totalDays,dayOffset(next));
    months.push({label:mc.toLocaleString("default",{month:"short",year:"numeric"}),left:s*DAY_W,width:(e-s)*DAY_W});
    mc=next;
  }
  const groups={};
  ganttItems.forEach(i=>{
    const k=groupBy==="room"?roomLabel(i):groupBy==="type"?i.type:((i.raci?.responsible||[]).join(', ')||"Unassigned");
    if(!groups[k])groups[k]=[];
    groups[k].push(i);
  });
  function barColor(item){
    if(colorBy==="status") return STAT_COLOR[item.status]||W3;
    if(colorBy==="type")   return TYPE_COLOR[item.type]||W3;
    return PRIO_COLOR[item.priority]||W3;
  }
  const todayLeft=dayOffset(today)*DAY_W;
  const legendItems=colorBy==="status"?Object.entries(STAT_COLOR):colorBy==="type"?Object.entries(TYPE_COLOR):Object.entries(PRIO_COLOR);
  const btnBase={padding:"6px 14px",borderRadius:20,border:`1.5px solid ${BORDER}`,cursor:"pointer",fontSize:12,fontWeight:700,textTransform:"capitalize",background:GLASS,color:W2};
  return(
    <div>
      <div style={{display:"flex",gap:10,marginBottom:16,alignItems:"center",flexWrap:"wrap"}}>
        <span style={{fontSize:13,fontWeight:600,color:W3}}>Group by:</span>
        {["room","type","assignee"].map(k=>(
          <button key={k} onClick={()=>setGroupBy(k)} style={{...btnBase,borderColor:groupBy===k?G:'rgba(255,255,255,0.08)',background:groupBy===k?'rgba(197,164,109,0.18)':GLASS,color:groupBy===k?G:W2}}>{k}</button>
        ))}
        <span style={{marginLeft:12,fontSize:13,fontWeight:600,color:W3}}>Color by:</span>
        {["status","type","priority"].map(k=>(
          <button key={k} onClick={()=>setColorBy(k)} style={{...btnBase,borderColor:colorBy===k?G:BORDER,background:colorBy===k?'rgba(197,164,109,0.18)':GLASS,color:colorBy===k?G:W2}}>{k}</button>
        ))}
      </div>
      <div style={{display:"flex",gap:14,marginBottom:14,flexWrap:"wrap"}}>
        {legendItems.map(([k,c])=>(
          <div key={k} style={{display:"flex",alignItems:"center",gap:5,fontSize:12,color:W2}}>
            <div style={{width:13,height:13,borderRadius:3,background:c,flexShrink:0}}/>{k}
          </div>
        ))}
      </div>
      <div style={{overflowX:"auto",background:GLASS,borderRadius:14,border:`1.5px solid ${BORDER}`,backdropFilter:"blur(20px)"}}>
        <div style={{minWidth:LABEL_W+totalDays*DAY_W+40,position:"relative"}}>
          <div style={{display:"flex",borderBottom:`1px solid ${BORDER}`,background:"rgba(0,0,0,0.3)",position:"sticky",top:0,zIndex:10}}>
            <div style={{width:LABEL_W,minWidth:LABEL_W,borderRight:`1px solid ${BORDER}`,padding:"10px 14px",fontSize:11,fontWeight:700,letterSpacing:1,textTransform:"uppercase",color:W3}}>Task</div>
            <div style={{flex:1,position:"relative",height:38,overflow:"hidden"}}>
              {months.map((m,i)=>(
                <div key={i} style={{position:"absolute",left:m.left,width:m.width,borderRight:`1px solid ${BORDER}`,padding:"10px 8px",fontSize:12,fontWeight:700,color:W2,overflow:"hidden",whiteSpace:"nowrap"}}>{m.label}</div>
              ))}
              <div style={{position:"absolute",left:todayLeft,top:0,bottom:0,width:2,background:G,opacity:.8,zIndex:5,pointerEvents:"none"}}/>
            </div>
          </div>
          {Object.entries(groups).map(([group,gItems])=>(
            <div key={group}>
              <div style={{display:"flex",background:"rgba(197,164,109,0.06)",borderTop:`1px solid ${BORDER}`,borderBottom:`1px solid ${BORDER}`}}>
                <div style={{width:LABEL_W,minWidth:LABEL_W,padding:"7px 14px",fontSize:11,fontWeight:800,letterSpacing:.5,color:G,textTransform:"uppercase"}}>{group}</div>
                <div style={{flex:1,position:"relative"}}>
                  <div style={{position:"absolute",left:todayLeft,top:0,bottom:0,width:2,background:G,opacity:.3,pointerEvents:"none"}}/>
                </div>
              </div>
              {gItems.map(item=>{
                const start=item.startDate?parseProjectDate(item.startDate):parseProjectDate(item.due);
                const end=parseProjectDate(item.due);
                const s=dayOffset(start),e=dayOffset(end);
                const barLeft=s*DAY_W, barW=Math.max((e-s)*DAY_W,20);
                const isOverdue=end<today&&item.status!=="Done";
                const bc=barColor(item);
                return(
                  <div key={item.id} style={{display:"flex",borderBottom:`1px solid rgba(255,255,255,0.04)`,minHeight:44,alignItems:"center"}}>
                    <div onClick={()=>{if(!readOnly)onEdit(item)}} style={{width:LABEL_W,minWidth:LABEL_W,borderRight:`1px solid ${BORDER}`,padding:"8px 14px",fontSize:13,fontWeight:500,color:W,display:"flex",alignItems:"center",gap:6,cursor:readOnly?"default":"pointer",overflow:"hidden"}}>
                      <span style={{width:9,height:9,borderRadius:"50%",background:bc,flexShrink:0}}/>
                      <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{item.title}</span>
                      {isOverdue&&<span title="Overdue" style={{color:RED,fontSize:11}}>!</span>}
                    </div>
                    <div style={{flex:1,position:"relative",height:44}}>
                      <div style={{position:"absolute",left:todayLeft,top:0,bottom:0,width:2,background:G,opacity:.25,pointerEvents:"none",zIndex:1}}/>
                      <div onClick={()=>{if(!readOnly)onEdit(item)}} title={item.title+"\n"+item.due+"\n"+item.status} style={{position:"absolute",left:barLeft+4,top:"50%",transform:"translateY(-50%)",width:barW,height:24,background:bc,borderRadius:6,cursor:readOnly?"default":"pointer",display:"flex",alignItems:"center",paddingLeft:8,fontSize:11,fontWeight:700,color:"rgba(0,0,0,0.85)",overflow:"hidden",whiteSpace:"nowrap",boxShadow:"0 2px 8px rgba(0,0,0,.4)",opacity:item.status==="Done"?.55:1,textDecoration:item.status==="Done"?"line-through":"none",border:isOverdue?`2px solid ${RED}`:"none",zIndex:2}}>
                        {barW>70?item.title:""}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div style={{marginTop:10,fontSize:12,color:W3}}>{readOnly?'Items need a due date to appear here.':'Click any task name or bar to edit. Items need a due date to appear here.'}</div>
    </div>
  );
}

// ── BUDGET ─────────────────────────────────────────────────────────────────
function BudgetView({items}){
  const totalEst=items.reduce((s,i)=>s+(parseFloat(i.estcost)||0),0);
  const totalAct=items.reduce((s,i)=>s+(parseFloat(i.actcost)||0),0);
  const byRoom={};
  items.forEach(i=>{
    const r=roomLabel(i)||"Other";
    if(!byRoom[r])byRoom[r]={est:0,act:0,count:0};
    byRoom[r].est+=parseFloat(i.estcost)||0;
    byRoom[r].act+=parseFloat(i.actcost)||0;
    byRoom[r].count++;
  });
  const TH={background:"rgba(0,0,0,0.5)",color:W3,padding:"11px 16px",textAlign:"left",fontSize:11,fontWeight:700,letterSpacing:1,textTransform:"uppercase"};
  const TD={padding:"11px 16px",borderBottom:`1px solid ${BORDER}`,fontSize:14,color:W};
  const THR={...TH,textAlign:"right"};
  const TDR={...TD,textAlign:"right"};
  return(
    <div>
      <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:20,fontWeight:600,marginBottom:14,color:W}}>Budget by Room</div>
      <div style={{overflowX:"auto",marginBottom:28}}>
        <table style={{width:"100%",borderCollapse:"collapse",background:GLASS,borderRadius:12,overflow:"hidden",backdropFilter:"blur(20px)",border:`1px solid ${BORDER}`}}>
          <thead><tr><th style={TH}>Room</th><th style={TH}>Items</th><th style={THR}>Estimated</th><th style={THR}>Actual</th><th style={THR}>Variance</th></tr></thead>
          <tbody>
            {Object.entries(byRoom).map(([r,v])=>(
              <tr key={r}>
                <td style={TD}>{r}</td><td style={TD}>{v.count}</td>
                <td style={TDR}>{displayCost(v.est)}</td>
                <td style={TDR}>{displayCost(v.act)}</td>
                <td style={{...TDR,color:v.act>v.est?RED:GREEN,fontWeight:600}}>{v.act>=v.est?"+":"-"}{displayCost(Math.abs(v.act-v.est))}</td>
              </tr>
            ))}
            <tr style={{background:"rgba(197,164,109,0.08)"}}>
              <td style={{...TD,fontWeight:700,color:G}}>TOTAL</td><td style={{...TD,fontWeight:700,color:G}}>{items.length}</td>
              <td style={{...TDR,fontWeight:700,color:G}}>{displayCost(totalEst)}</td>
              <td style={{...TDR,fontWeight:700,color:G}}>{displayCost(totalAct)}</td>
              <td style={{...TDR,fontWeight:700,color:totalAct>totalEst?RED:GREEN}}>{totalAct>=totalEst?"+":"-"}{displayCost(Math.abs(totalAct-totalEst))}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:20,fontWeight:600,marginBottom:14,color:W}}>All Items — Cost Detail</div>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",background:GLASS,borderRadius:12,overflow:"hidden",backdropFilter:"blur(20px)",border:`1px solid ${BORDER}`}}>
          <thead><tr><th style={TH}>Item</th><th style={TH}>Type</th><th style={TH}>Status</th><th style={TH}>Assigned</th><th style={THR}>Estimated</th><th style={THR}>Actual</th></tr></thead>
          <tbody>
            {items.map(i=>(
              <tr key={i.id}>
                <td style={TD}>{i.title}</td><td style={TD}>{i.type}</td><td style={TD}>{i.status}</td>
                <td style={TD}>{(i.raci?.responsible||[]).join(', ')||"—"}</td>
                <td style={TDR}>{displayCost(i.estcost)}</td>
                <td style={TDR}>{displayCost(i.actcost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── CONTRACTORS ────────────────────────────────────────────────────────────
function ContractorsView({items}){
  const map={};
  items.forEach(i=>{if(i.cname){if(!map[i.cname])map[i.cname]={phone:i.cphone,email:i.cemail,address:i.caddress,bizLicense:i.bizLicense,coi:i.coi,workersComp:i.workersComp,jobs:[]};map[i.cname].jobs.push(i.title);}});
  const keys=Object.keys(map);
  if(!keys.length) return(
    <div style={{textAlign:"center",padding:"60px 20px",color:W3}}>
      <div style={{fontSize:18,fontWeight:600,marginBottom:8,color:W2}}>No contractors yet</div>
      <div style={{fontSize:14}}>Add contractor info when creating items.</div>
    </div>
  );
  return(
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(290px,1fr))",gap:16}}>
      {keys.map(name=>{
        const c=map[name];
        return(
          <div key={name} style={{background:GLASS,border:`1.5px solid ${BORDER}`,borderRadius:14,padding:20,backdropFilter:"blur(20px)"}}>
            <div style={{fontSize:15,fontWeight:700,marginBottom:10,color:W,letterSpacing:.3}}>{name}</div>
            {c.phone&&<div style={{fontSize:13,marginBottom:6,color:W2}}><a href={"tel:"+c.phone} style={{color:G,textDecoration:"none"}}>{c.phone}</a></div>}
            {c.email&&<div style={{fontSize:13,marginBottom:6,color:W2}}><a href={"mailto:"+c.email} style={{color:G,textDecoration:"none"}}>{c.email}</a></div>}
            {c.address&&<div style={{fontSize:13,marginBottom:8,color:W2}}>{c.address}</div>}
            {(c.bizLicense||c.coi||c.workersComp)&&(
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
                {c.bizLicense&&<span style={{fontSize:11,fontWeight:700,color:GREEN,background:'rgba(74,222,128,0.12)',borderRadius:20,padding:"3px 8px"}}>License ✓</span>}
                {c.coi&&<span style={{fontSize:11,fontWeight:700,color:G,background:'rgba(197,164,109,0.14)',borderRadius:20,padding:"3px 8px"}}>COI ✓</span>}
                {c.workersComp&&<span style={{fontSize:11,fontWeight:700,color:G,background:'rgba(197,164,109,0.12)',borderRadius:20,padding:"3px 8px"}}>W/C ✓</span>}
              </div>
            )}
            <div style={{fontSize:12,color:W3}}>Jobs: {c.jobs.join(", ")}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── CALENDAR ───────────────────────────────────────────────────────────────
function CalendarView({items, onEdit, readOnly=false}){
  const today = new Date();
  const [viewYear,  setViewYear]  = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const dayNames   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  const dateMap = {};
  items.forEach(item => {
    if(!item.due) return;
    const key = item.due;
    if(!dateMap[key]) dateMap[key] = [];
    dateMap[key].push(item);
  });

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth+1, 0).getDate();
  const cells = [];
  for(let i=0;i<firstDay;i++) cells.push(null);
  for(let d=1;d<=daysInMonth;d++) cells.push(d);
  while(cells.length % 7 !== 0) cells.push(null);

  function prevMonth(){ if(viewMonth===0){setViewMonth(11);setViewYear(y=>y-1);}else setViewMonth(m=>m-1); }
  function nextMonth(){ if(viewMonth===11){setViewMonth(0);setViewYear(y=>y+1);}else setViewMonth(m=>m+1); }
  function goToday(){ setViewYear(today.getFullYear()); setViewMonth(today.getMonth()); }

  const todayStr = projectDateKey(today);
  const monthPrefix = viewYear+"-"+(String(viewMonth+1).padStart(2,"0"));
  const monthItems  = items.filter(i=>i.due&&i.due.startsWith(monthPrefix));
  const monthEst    = monthItems.reduce((s,i)=>s+(parseFloat(i.estcost)||0),0);
  const monthAct    = monthItems.reduce((s,i)=>s+(parseFloat(i.actcost)||0),0);

  const navBtn = {width:34,height:34,borderRadius:8,border:`1.5px solid ${BORDER}`,background:GLASS,cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",color:W};

  return(
    <div>
      <div className="hq-project-calendar-toolbar" style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20,flexWrap:"wrap",gap:12}}>
        <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:22,fontWeight:600,color:W}}>{monthNames[viewMonth]} {viewYear}</div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <button onClick={prevMonth} style={navBtn}>‹</button>
          <button onClick={goToday} style={{...navBtn,width:"auto",padding:"0 14px",fontSize:12,fontWeight:700,color:G,borderColor:'rgba(197,164,109,0.3)'}}>Today</button>
          <button onClick={nextMonth} style={navBtn}>›</button>
        </div>
      </div>

      <div style={{display:"flex",gap:12,marginBottom:18,flexWrap:"wrap"}}>
        {[["Items this month",monthItems.length,W],["Estimated",displayCost(monthEst),G],["Actual",displayCost(monthAct),GREEN]].map(([l,v,c])=>(
          <div key={l} style={{background:GLASS,border:`1px solid ${BORDER}`,borderRadius:10,padding:"10px 18px",fontSize:13,backdropFilter:"blur(20px)"}}>
            <span style={{color:W3,fontWeight:600,marginRight:8}}>{l}:</span>
            <span style={{fontWeight:700,color:c}}>{v}</span>
          </div>
        ))}
      </div>

      <div className="hq-project-calendar-scroll" tabIndex="0" aria-label="Project calendar; scroll horizontally on small screens">
        <div className="hq-project-calendar-grid" style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:2}}>
          {dayNames.map(d=>(
            <div key={d} style={{textAlign:"center",padding:"8px 0",fontSize:11,fontWeight:800,letterSpacing:1,textTransform:"uppercase",color:W3}}>{d}</div>
          ))}
        </div>

        <div className="hq-project-calendar-grid" style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
          {cells.map((day,idx)=>{
          if(!day) return <div key={idx} style={{minHeight:100,background:"transparent"}}/>;
          const dateStr = viewYear+"-"+String(viewMonth+1).padStart(2,"0")+"-"+String(day).padStart(2,"0");
          const dayItems = dateMap[dateStr]||[];
          const dayEst   = dayItems.reduce((s,i)=>s+(parseFloat(i.estcost)||0),0);
          const dayAct   = dayItems.reduce((s,i)=>s+(parseFloat(i.actcost)||0),0);
          const isToday  = dateStr===todayStr;
          const hasCost  = dayEst>0||dayAct>0;
          return(
            <div key={idx} style={{minHeight:100,background:isToday?'rgba(197,164,109,0.10)':GLASS,border:"1.5px solid",borderColor:isToday?'rgba(197,164,109,0.5)':BORDER,borderRadius:8,padding:"6px 7px",display:"flex",flexDirection:"column",gap:3,overflow:"hidden"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:2}}>
                <div style={{width:24,height:24,borderRadius:"50%",background:isToday?G:"transparent",display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <span style={{fontSize:12,fontWeight:700,color:isToday?"#000":W}}>{day}</span>
                </div>
                {hasCost&&(
                  <span style={{fontSize:13,fontWeight:700,color:GREEN,background:'rgba(74,222,128,0.12)',borderRadius:8,padding:"2px 6px",whiteSpace:"nowrap"}}>
                    {displayCost(dayAct||dayEst)}
                  </span>
                )}
              </div>
              {dayItems.map(item=>{
                const itemCost = parseFloat(item.actcost)||parseFloat(item.estcost)||0;
                const isAct = parseFloat(item.actcost)>0;
                return(
                  <div key={item.id} onClick={()=>{if(!readOnly)onEdit(item)}}
                    title={item.title}
                    style={{background:TYPE_BG[item.type]||GLASS2,borderLeft:`2px solid `+(TYPE_COLOR[item.type]||W3),borderRadius:"0 4px 4px 0",padding:"4px 6px",fontSize:13,cursor:readOnly?"default":"pointer",lineHeight:1.4}}>
                    <div style={{fontWeight:700,color:TYPE_COLOR[item.type]||W,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.title}</div>
                    {itemCost>0&&(
                      <div style={{fontWeight:600,color:isAct?GREEN:G,fontSize:13}}>
                        {isAct?"Act":"Est"}: {displayCost(itemCost)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
          })}
        </div>
      </div>
      <div style={{marginTop:12,fontSize:12,color:W3}}>{readOnly?'Items appear on their due date.':'Click any item to edit. Items appear on their due date.'}</div>
    </div>
  );
}

// ── MAIN APP ───────────────────────────────────────────────────────────────
function App({readOnly=false,canDelete=false,currentMember=''}){
  const [items,setItems]         = useState(loadItems);
  const [tab,setTab]             = useState("all");
  const [search,setSearch]       = useState("");
  const [fStatus,setFStatus]     = useState("");
  const [fRoom,setFRoom]         = useState("");
  const [fPriority,setFPriority] = useState("");
  const [fAssignee,setFAssignee] = useState("");
  const [expanded,setExpanded]   = useState(null);
  const [modal,setModal]         = useState(false);
  const [editId,setEditId]       = useState(null);
  const [form,setForm]           = useState(EMPTY_FORM);
  const [lightbox,setLightbox]   = useState(null);
  const [toast,setToast]         = useState("");
  const [stagingAction,setStagingAction] = useState(false);
  const toastTmr  = useRef();

  useEffect(()=>{
    if(!readOnly)return;
    setModal(false);
    setEditId(null);
    setForm(EMPTY_FORM);
  },[readOnly]);
  useEffect(()=>{
    const receiveSharedUpdate=event=>{
      if(!event.detail?.keys?.includes(STORAGE_KEY))return;
      setItems(loadItems());
    };
    window.addEventListener(SHARED_STATE_EVENT,receiveSharedUpdate);
    return()=>window.removeEventListener(SHARED_STATE_EVENT,receiveSharedUpdate);
  },[]);

  function showToast(msg){ setToast(msg); clearTimeout(toastTmr.current); toastTmr.current=setTimeout(()=>setToast(""),3000); }
  function denyWrite(){ showToast("Projects are read-only for this household member"); }
  function openAdd(){ if(readOnly){denyWrite();return;} setEditId(null); setForm(newProjectForm(currentMember)); setModal(true); }
  function openEdit(item){
    if(readOnly){denyWrite();return;}
    const normalized=normalizeProjectItem(item);
    setEditId(item.id);
    setForm({...EMPTY_FORM,...normalized,raci:normalized.raci,photos:item.photos||[],files:item.files||[]});
    setModal(true);
  }

  async function saveItem(){
    if(readOnly){denyWrite();return;}
    if(!form.title.trim()){ showToast("Title is required"); return; }
    const cleaned=normalizeProjectItem({...form,estcost:fmtCost(form.estcost),actcost:fmtCost(form.actcost)});
    const current=editId?items.find(item=>item.id===editId):null;
    setStagingAction(true);
    try{
      const operation=editId?projectUpdateOperation(current,cleaned):projectCreateOperation(cleaned);
      const summary=editId?`Review changes to ${current.title}`:`Review new project ${cleaned.title}`;
      await requestProjectActionReview({summary,operation});
      setModal(false);
      showToast("Action Mode review opened. No project data has changed yet.");
    }catch(error){showToast(error?.message||"Project review could not be prepared. Refresh Projects and try again.");}
    finally{setStagingAction(false);}
  }

  async function deleteItem(item){
    if(readOnly){denyWrite();return;}
    if(!canDelete){showToast("Only a household administrator can delete a project.");return;}
    setStagingAction(true);
    try{
      await requestProjectActionReview({summary:`Review deletion of ${item.title}`,operation:projectDeleteOperation(item)});
      showToast("Action Mode review opened. The project has not been deleted.");
    }catch(error){showToast(error?.message||"Project deletion review could not be prepared. Refresh Projects and try again.");}
    finally{setStagingAction(false);}
  }

  function exportData(){
    const blob=new Blob([JSON.stringify(items,null,2)],{type:"application/json"});
    const a=document.createElement("a"); a.href=URL.createObjectURL(blob);
    a.download="Projects-backup-"+new Date().toISOString().slice(0,10)+".json"; a.click();
    showToast("Exported");
  }

  const assignees=[...new Set(items.flatMap(i=>i.raci?.responsible||[]).filter(Boolean))];
  const noFilter=["budget","contractors","gantt","calendar"];

  const filtered=items.filter(i=>{
    const typeMap={renovation:"Renovation",maintenance:"Maintenance",repair:"Repair"};
    if(!noFilter.includes(tab)&&tab!=="all"&&i.type!==typeMap[tab]) return false;
    if(fStatus&&i.status!==fStatus) return false;
    if(fRoom&&roomLabel(i)!==fRoom) return false;
    if(fPriority&&i.priority!==fPriority) return false;
    if(fAssignee&&!(i.raci?.responsible||[]).includes(fAssignee)) return false;
    if(search&&!JSON.stringify(i).toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const totalBudget=items.reduce((s,i)=>s+(parseFloat(i.actcost)||parseFloat(i.estcost)||0),0);
  const showFilters=!noFilter.includes(tab);
  const TABS=[["all","All"],["renovation","Renovation"],["maintenance","Maintenance"],["repair","Repairs"],["gantt","Timeline"],["calendar","Calendar"],["budget","Project Budget"],["contractors","Contractors"]];

  const selectStyle={...FI,width:"auto",flex:1,minWidth:120};

  return(
    <div className="home-hq" style={{background:"#000",minHeight:"100vh",fontFamily:"'Inter',system-ui,sans-serif",color:W}}>
      <style>{HQ_STYLES}</style>

      {/* HEADER */}
      <div className="hq-topbar" style={{background:"rgba(0,0,0,0.92)",borderBottom:`1px solid ${BORDER}`,padding:"18px 32px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:100,backdropFilter:"blur(20px)"}}>
        <div>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:22,fontWeight:500,color:W,letterSpacing:-.5}}>Projects</div>
          <div style={{fontSize:11,color:W3,letterSpacing:2,textTransform:"uppercase",marginTop:2}}>Property Management</div>
        </div>
        <div className="hq-topbar-actions" style={{display:"flex",gap:8,alignItems:"center"}}>
          <button type="button" disabled title="Project import is unavailable until a reviewed, auditable batch-restore workflow is supported." style={{padding:"8px 14px",borderRadius:8,border:`1px solid ${BORDER}`,cursor:"not-allowed",fontSize:12,fontWeight:600,background:GLASS,color:W3}}>Import unavailable</button>
          <button onClick={exportData} style={{padding:"8px 14px",borderRadius:8,border:`1px solid ${BORDER}`,cursor:"pointer",fontSize:12,fontWeight:600,background:GLASS,color:W2}}>Export</button>
          {!readOnly&&<><button type="button" disabled title="Multi-project calendar publishing is unavailable until Projects and Family Calendar can be reviewed and applied atomically." style={{padding:"8px 14px",borderRadius:8,border:`1px solid rgba(197,164,109,0.2)`,cursor:"not-allowed",fontSize:12,fontWeight:600,background:"rgba(197,164,109,0.05)",color:W3}}>Calendar push unavailable</button>
          <button onClick={openAdd} style={{padding:"9px 20px",borderRadius:8,border:`1px solid rgba(197,164,109,0.4)`,cursor:"pointer",fontSize:13,fontWeight:600,background:"rgba(197,164,109,0.15)",color:G,letterSpacing:.3}}>+ Add Item</button></>}
        </div>
      </div>

      {readOnly&&<div role="note" className="hq-read-only-notice" style={{margin:"16px 32px 0",padding:"12px 16px",border:`1px solid rgba(197,164,109,0.35)`,borderRadius:10,background:"rgba(197,164,109,0.08)",color:W2,fontSize:13,lineHeight:1.5}}><strong style={{color:G}}>Projects are read-only.</strong> You can review, filter, navigate, preview attachments, and export project information. A household administrator can restore project editing access.</div>}
      {!readOnly&&<div role="note" className="hq-action-safety-note" style={{margin:"16px 32px 0",padding:"12px 16px",border:`1px solid rgba(197,164,109,0.25)`,borderRadius:10,background:"rgba(197,164,109,0.06)",color:W2,fontSize:13,lineHeight:1.5}}><strong style={{color:G}}>Review required.</strong> Creating, editing, or deleting a project opens Action Mode before anything changes. Project import, file and image changes, and multi-project calendar publishing remain unavailable until Brevity can audit and safely undo them.</div>}

      {/* TABS */}
      <div className="hq-tabs" style={{display:"flex",background:"rgba(0,0,0,0.6)",borderBottom:`1px solid ${BORDER}`,padding:"0 28px",overflowX:"auto",backdropFilter:"blur(10px)"}}>
        {TABS.map(([k,l])=>(
          <div key={k} onClick={()=>setTab(k)} style={{padding:"14px 20px",cursor:"pointer",fontSize:17,fontWeight:500,whiteSpace:"nowrap",borderBottom:"2px solid",marginBottom:-1,transition:"all .15s",color:tab===k?G:W3,borderBottomColor:tab===k?G:"transparent",letterSpacing:.2}}>{l}</div>
        ))}
      </div>

      <div className="hq-content" style={{padding:"24px 32px",maxWidth:1400,margin:"0 auto"}}>

        {/* STATS */}
        {showFilters&&(
          <div className="hq-stats" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:24}}>
            {[["Total Items",items.length,W],["In Progress",items.filter(i=>i.status==="In Progress").length,G],["Completed",items.filter(i=>i.status==="Done").length,GREEN],["Total Budget",displayCost(totalBudget),G]].map(([l,v,c])=>(
              <div key={l} className="hq-stat-card">
                <div style={{fontSize:11,fontWeight:700,letterSpacing:1,textTransform:"uppercase",color:W3,marginBottom:6}}>{l}</div>
                <div style={{fontFamily:"'Cormorant Garamond',serif",fontWeight:600,color:c,fontSize:typeof v==="string"&&v.length>7?20:28}}>{v}</div>
              </div>
            ))}
          </div>
        )}

        {/* FILTERS */}
        {showFilters&&(
          <div className="hq-filters" style={{display:"flex",gap:10,marginBottom:20,flexWrap:"wrap",alignItems:"center"}}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search..." style={{...FI,flex:1,minWidth:160,width:"auto"}}/>
            {[[fStatus,setFStatus,STATUSES,"Status"],[fRoom,setFRoom,ROOMS,"Room"],[fPriority,setFPriority,PRIORITIES,"Priority"]].map(([val,setter,opts,lbl])=>(
              <select key={lbl} value={val} onChange={e=>setter(e.target.value)} style={selectStyle}>
                <option value="">All {lbl}s</option>
                {opts.map(o=><option key={o}>{o}</option>)}
              </select>
            ))}
          </div>
        )}

        {/* PROJECT CARD GRID */}
        {showFilters&&(
          <>
            {filtered.length===0&&(
              <div style={{textAlign:"center",padding:"80px 20px",color:W3}}>
                <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:22,marginBottom:8,color:W2}}>{items.length?'No projects match these filters':'No projects have been defined yet'}</div>
                <div style={{fontSize:14,maxWidth:520,margin:'0 auto 16px',lineHeight:1.5}}>{items.length?'Clear or change the filters to return to the active project portfolio.':'Create the first item around a concrete outcome, then add its room, decision owner, target date, and budget so Brevity can surface the real constraint.'}</div>
                {!items.length&&!readOnly&&<button type="button" onClick={openAdd} style={{padding:"9px 18px",borderRadius:8,border:`1px solid rgba(197,164,109,0.4)`,cursor:"pointer",fontSize:13,fontWeight:600,background:"rgba(197,164,109,0.15)",color:G}}>Create first project</button>}
              </div>
            )}
            <div className="hq-proj-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))",gap:20}}>
              {filtered.map(item=>{
                const isExp=expanded===item.id;
                const dueDate=item.due?parseProjectDate(item.due):null;
                const todayStart=new Date();todayStart.setHours(0,0,0,0);
                const isOverdue=dueDate&&dueDate<todayStart&&item.status!=="Done";
                const heroImg=getRoomImg(item);
                return(
                  <div key={item.id} className={`hq-card${isExp?' hq-card--expanded':''}`}>

                    {/* Card hero image */}
                    <div style={{position:"relative",height:160,overflow:"hidden",cursor:"pointer"}} onClick={()=>setExpanded(isExp?null:item.id)}>
                      <img
                        src={heroImg}
                        alt={roomLabel(item)}
                        style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}
                        onError={e=>{e.target.style.display="none";}}
                      />
                      {/* Dark gradient overlay */}
                      <div style={{position:"absolute",inset:0,background:"linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.65) 100%)"}}/>
                      {/* Room label */}
                      <div style={{position:"absolute",bottom:12,left:14,fontSize:11,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",color:"rgba(247,243,234,0.75)"}}>
                        {roomLabel(item)}
                      </div>
                      {/* Status badge */}
                      <div style={{position:"absolute",top:12,right:12}}>
                        <Badge text={item.status} fg={STAT_COLOR[item.status]} bg={STAT_BG[item.status]}/>
                      </div>
                      {isOverdue&&(
                        <div style={{position:"absolute",top:12,left:12,fontSize:11,fontWeight:700,color:RED,background:'rgba(248,113,113,0.2)',borderRadius:20,padding:"2px 8px",border:`1px solid ${RED}`}}>Overdue</div>
                      )}
                    </div>

                    {/* Card body */}
                    <div style={{padding:"14px 16px"}}>
                      <div style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:10}}>
                        <div style={{flex:1}}>
                          <div style={{fontSize:14,fontWeight:600,color:W,lineHeight:1.3,marginBottom:6}}>{item.title}</div>
                          <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                            <Badge text={item.type} fg={TYPE_COLOR[item.type]} bg={TYPE_BG[item.type]}/>
                            <Badge text={item.priority} fg={PRIO_COLOR[item.priority]} bg={PRIO_BG[item.priority]}/>
                            {(item.raci?.responsible||[]).map(member=><Badge key={member} text={`R · ${member}`} fg={W2} bg={GLASS2}/>)}
                            {item.pushToFamilyCalendar&&<Badge text="Family Calendar" fg={G} bg="rgba(197,164,109,0.14)"/>}
                          </div>
                        </div>
                        {!readOnly&&<div className="hq-project-card-actions" style={{display:"flex",gap:4,flexShrink:0}}>
                          <button disabled={stagingAction} onClick={e=>{e.stopPropagation();openEdit(item);}} style={{width:28,height:28,border:`1px solid ${BORDER}`,background:GLASS,cursor:stagingAction?"wait":"pointer",borderRadius:6,fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",color:W2}} title="Edit through Action Mode">✎</button>
                          <button disabled={!canDelete||stagingAction} onClick={e=>{e.stopPropagation();deleteItem(item);}} style={{width:28,height:28,border:`1px solid rgba(248,113,113,0.2)`,background:"rgba(248,113,113,0.08)",cursor:!canDelete?"not-allowed":stagingAction?"wait":"pointer",borderRadius:6,fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",color:!canDelete?W3:RED}} title={canDelete?"Delete through Action Mode":"Only a household administrator can delete projects"}>×</button>
                        </div>}
                      </div>

                      {/* Costs */}
                      <div className="hq-project-costs" style={{display:"flex",gap:12,paddingTop:10,borderTop:`1px solid ${BORDER}`}}>
                        {item.estcost&&<div style={{fontSize:12}}><span style={{color:W3}}>Est </span><span style={{fontWeight:600,color:G}}>{displayCost(item.estcost)}</span></div>}
                        {item.actcost&&<div style={{fontSize:12}}><span style={{color:W3}}>Act </span><span style={{fontWeight:600,color:GREEN}}>{displayCost(item.actcost)}</span></div>}
                        {item.due&&<div style={{fontSize:12,marginLeft:"auto"}}><span style={{color:isOverdue?RED:W3}}>Due {item.due}</span></div>}
                      </div>

                      {/* Expanded detail */}
                      {isExp&&(
                        <div style={{marginTop:14,paddingTop:14,borderTop:`1px solid ${BORDER}`}}>
                          {Object.entries({responsible:'Responsible',accountable:'Accountable',consulted:'Consulted',informed:'Informed'}).some(([key])=>(item.raci?.[key]||[]).length>0)&&(
                            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(145px,1fr))",gap:10,marginBottom:12}}>
                              {Object.entries({responsible:'Responsible',accountable:'Accountable',consulted:'Consulted',informed:'Informed'}).map(([key,label])=>(
                                <div key={key}><Lbl>{label}</Lbl><div style={{fontSize:12,color:W2}}>{(item.raci?.[key]||[]).join(', ')||'—'}</div></div>
                              ))}
                            </div>
                          )}
                          {item.notes&&<div style={{background:"rgba(255,255,255,0.04)",borderRadius:8,padding:"10px 12px",fontSize:13,color:W2,lineHeight:1.6,marginBottom:12,whiteSpace:"pre-wrap"}}>{item.notes}</div>}
                          {item.cname&&(
                            <div style={{marginBottom:12}}>
                              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10,marginBottom:8}}>
                                {[["Contractor",item.cname,null],["Phone",item.cphone,item.cphone?"tel:"+item.cphone:null],["Email",item.cemail,item.cemail?"mailto:"+item.cemail:null],["Address",item.caddress,null]].filter(([,v])=>v).map(([l,v,href])=>(
                                  <div key={l}><Lbl>{l}</Lbl>{href?<a href={href} style={{fontSize:13,color:G,textDecoration:"none"}}>{v}</a>:<div style={{fontSize:13,color:W2}}>{v}</div>}</div>
                                ))}
                              </div>
                              {(item.bizLicense||item.coi||item.workersComp)&&(
                                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                                  {item.bizLicense&&<span style={{fontSize:11,fontWeight:700,color:GREEN,background:'rgba(74,222,128,0.12)',borderRadius:20,padding:"3px 10px"}}>License ✓</span>}
                                  {item.coi&&<span style={{fontSize:11,fontWeight:700,color:G,background:'rgba(197,164,109,0.14)',borderRadius:20,padding:"3px 10px"}}>COI ✓</span>}
                                  {item.workersComp&&<span style={{fontSize:11,fontWeight:700,color:G,background:'rgba(197,164,109,0.12)',borderRadius:20,padding:"3px 10px"}}>W/C ✓</span>}
                                </div>
                              )}
                            </div>
                          )}
                          {(item.photos||[]).length>0&&(
                            <div style={{marginBottom:12}}>
                              <Lbl>Photos</Lbl>
                              <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:6}}>
                                {item.photos.map((p,i)=>(
                                  <div key={i} style={{position:"relative"}}>
                                    <img src={p} onClick={()=>setLightbox({type:"image",data:p,name:"Photo",download:false})} style={{width:68,height:68,objectFit:"cover",borderRadius:8,border:`1px solid ${BORDER}`,cursor:"pointer"}}/>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {(item.files||[]).length>0&&(
                            <div>
                              <Lbl>Attachments</Lbl>
                              <div style={{display:"flex",flexDirection:"column",gap:6,marginTop:6}}>
                                {item.files.map((f,i)=>{
                                  const icons={"application/pdf":"PDF","application/vnd.openxmlformats-officedocument.wordprocessingml.document":"DOC","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":"XLS","text/csv":"CSV","text/plain":"TXT"};
                                  return(
                                    <div key={i} className="hq-attachment-row" style={{display:"flex",alignItems:"center",gap:10,background:GLASS2,borderRadius:8,padding:"8px 12px",border:`1px solid ${BORDER}`}}>
                                      <span style={{fontSize:11,fontWeight:700,color:G,background:'rgba(197,164,109,0.14)',borderRadius:4,padding:"2px 6px"}}>{icons[f.type]||"FILE"}</span>
                                      <div style={{flex:1,minWidth:0}}>
                                        <div style={{fontSize:12,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:W}}>{f.name}</div>
                                        <div style={{fontSize:11,color:W3}}>{Math.round(f.size/1024)} KB</div>
                                      </div>
                                      <button onClick={()=>{
                                        if(f.type==="application/pdf") setLightbox({type:"pdf",data:f.data,name:f.name,download:true});
                                        else if(f.type.startsWith("image/")) setLightbox({type:"image",data:f.data,name:f.name,download:true});
                                        else if(f.type==="text/plain"||f.type==="text/csv"){const b64=f.data.split(",")[1];const txt=atob(b64);setLightbox({type:"text",data:f.data,name:f.name,textContent:txt,download:true});}
                                        else setLightbox({type:"unsupported",data:f.data,name:f.name,icon:icons[f.type]||"FILE",download:true});
                                      }} style={{fontSize:12,fontWeight:600,color:G,cursor:"pointer",padding:"4px 8px",borderRadius:6,background:'rgba(197,164,109,0.14)',border:"none",whiteSpace:"nowrap"}}>Preview</button>
                                      <a href={f.data} download={f.name} style={{fontSize:12,fontWeight:600,color:W2,textDecoration:"none",padding:"4px 8px",borderRadius:6,background:GLASS}}>Save</a>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {tab==="gantt"       && <GanttView items={items} onEdit={openEdit} readOnly={readOnly}/>}
        {tab==="calendar"    && <CalendarView items={items} onEdit={openEdit} readOnly={readOnly}/>}
        {tab==="budget"      && <BudgetView items={items}/>}
        {tab==="contractors" && <ContractorsView items={items}/>}
      </div>

      {/* MODAL */}
      {modal&&!readOnly&&(
        <div className="hq-modal-backdrop" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.80)",backdropFilter:"blur(12px)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>{if(e.target===e.currentTarget)setModal(false);}}>
          <div className="hq-modal-card" style={{background:"rgba(12,12,12,0.97)",border:`1px solid ${BORDER}`,borderRadius:20,padding:28,width:"100%",maxWidth:700,maxHeight:"92vh",overflowY:"auto",boxShadow:"0 24px 80px rgba(0,0,0,0.7)",position:"relative"}}>
            <button className="hq-modal-close" aria-label="Close project editor" onClick={()=>setModal(false)} style={{position:"absolute",top:14,right:14,background:"none",border:"none",fontSize:22,cursor:"pointer",color:W3,lineHeight:1}}>✕</button>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:22,fontWeight:500,marginBottom:22,color:W}}>{editId?"Edit Item":"Add New Item"}</div>

            <div className="hq-modal-form" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>

              <FField label="Title *" full>
                <input style={FI} value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))} placeholder="e.g. Replace kitchen faucet"/>
              </FField>

              <FField label="Type">
                <select style={FI} value={form.type} onChange={e=>setForm(p=>({...p,type:e.target.value}))}>
                  {TYPES.map(t=><option key={t}>{t}</option>)}
                </select>
              </FField>

              <FField label="Room / Area" full>
                <div className="hq-room-fields" style={{display:"flex",gap:10}}>
                  <select style={{...FI,flex:1}} value={form.room} onChange={e=>setForm(p=>({...p,room:e.target.value,roomCustom:e.target.value==="Other"?p.roomCustom:""}))}>
                    {ROOMS.map(r=><option key={r}>{r}</option>)}
                    <option value="Other">Other (specify below)</option>
                  </select>
                  {form.room==="Other"&&<input style={{...FI,flex:1}} value={form.roomCustom||""} onChange={e=>setForm(p=>({...p,roomCustom:e.target.value}))} placeholder="Enter room or area name"/>}
                </div>
              </FField>

              <FField label="Status">
                <select style={FI} value={form.status} onChange={e=>setForm(p=>({...p,status:e.target.value}))}>
                  {STATUSES.map(s=><option key={s}>{s}</option>)}
                </select>
              </FField>

              <FField label="Priority">
                <select style={FI} value={form.priority} onChange={e=>setForm(p=>({...p,priority:e.target.value}))}>
                  {PRIORITIES.map(p=><option key={p}>{p}</option>)}
                </select>
              </FField>

              <FField label="Start Date">
                <input style={FI} type="date" value={form.startDate||""} onChange={e=>setForm(p=>({...p,startDate:e.target.value}))}/>
              </FField>

              <FField label="Due Date">
                <input style={FI} type="date" value={form.due||""} onChange={e=>setForm(p=>({...p,due:e.target.value}))}/>
              </FField>

              <CostInput label="Estimated Cost" field="estcost" form={form} setForm={setForm}/>
              <CostInput label="Actual Cost" field="actcost" form={form} setForm={setForm}/>

              <div style={{gridColumn:"1/-1",height:1,background:BORDER,margin:"4px 0"}}/>

              <div style={{gridColumn:"1/-1"}}>
                <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:18,fontWeight:600,color:W,marginBottom:4}}>RACI Assignments</div>
                <div style={{fontSize:12,color:W3,marginBottom:12}}>Select one or more household members for each project role.</div>
              </div>
              {[
                ['Responsible','Does the work','responsible'],
                ['Accountable','Owns the outcome','accountable'],
                ['Consulted','Provides input','consulted'],
                ['Informed','Receives updates','informed'],
              ].map(([label,role,key])=><MemberMultiSelect key={key} label={label} role={role} value={form.raci?.[key]||[]} onChange={value=>setForm(p=>({...p,raci:{...p.raci,[key]:value}}))}/>)}

              <FField label="Family Calendar" full>
                <label title="Project and Family Calendar records cannot yet be changed in one atomic reviewed action." style={{display:"flex",alignItems:"flex-start",gap:10,padding:"12px 14px",background:GLASS,borderRadius:8,border:`1.5px solid ${form.pushToFamilyCalendar?'rgba(197,164,109,0.4)':BORDER}`,cursor:"not-allowed"}}>
                  <input type="checkbox" disabled checked={form.pushToFamilyCalendar||false} style={{width:17,height:17,accentColor:G,marginTop:1}}/>
                  <span><span style={{display:"block",fontSize:13,fontWeight:600,color:W2}}>Family Calendar publication unavailable</span><span style={{display:"block",fontSize:11,color:W3,marginTop:3}}>The current setting is preserved. Use a separate reviewed Family Calendar action until project and calendar changes can be applied atomically.</span></span>
                </label>
              </FField>

              <div style={{gridColumn:"1/-1",height:1,background:BORDER,margin:"4px 0"}}/>

              <FField label="Contractor / Company">
                <input style={FI} value={form.cname} onChange={e=>setForm(p=>({...p,cname:e.target.value}))} placeholder="Company or Contractor"/>
              </FField>

              <FField label="Phone">
                <input style={FI} value={form.cphone}
                  onChange={e=>setForm(p=>({...p,cphone:fmtPhone(e.target.value)}))}
                  placeholder="(xxx) xxx-xxxx" maxLength={14}/>
              </FField>

              <FField label="Email">
                <input style={FI} type="email" value={form.cemail} onChange={e=>setForm(p=>({...p,cemail:e.target.value}))} placeholder="email@example.com"/>
              </FField>

              <FField label="Address">
                <input style={FI} value={form.caddress} onChange={e=>setForm(p=>({...p,caddress:e.target.value}))} placeholder="123 Main St"/>
              </FField>

              <FField label="Contractor Credentials" full>
                <div style={{display:"flex",gap:20,flexWrap:"wrap",padding:"12px 16px",background:GLASS,borderRadius:8,border:`1.5px solid ${BORDER}`}}>
                  {[["bizLicense","Business License"],["coi","Certificate of Insurance (COI)"],["workersComp","Workers' Compensation"]].map(([field,label])=>(
                    <label key={field} style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13,fontWeight:500,color:W2,userSelect:"none"}}>
                      <input type="checkbox" checked={form[field]||false} onChange={e=>setForm(p=>({...p,[field]:e.target.checked}))} style={{width:16,height:16,accentColor:G,cursor:"pointer"}}/>
                      <span>{label}</span>
                      {form[field]&&<span style={{fontSize:11,fontWeight:700,color:GREEN,background:'rgba(74,222,128,0.12)',borderRadius:20,padding:"1px 7px"}}>✓</span>}
                    </label>
                  ))}
                </div>
              </FField>

              <FField label="Notes" full>
                <textarea style={{...FI,minHeight:80,resize:"vertical"}} value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))} placeholder="Notes, links, details..."/>
              </FField>

              <FField label="Photos" full>
                <div aria-disabled="true" title="Photo changes are unavailable until reviewed uploads can be audited and safely undone." style={{border:`2px dashed ${BORDER}`,borderRadius:8,padding:14,textAlign:"center",cursor:"not-allowed",color:W3,fontSize:13,background:GLASS}}>
                  Photo changes are temporarily unavailable. Existing photos remain viewable and are preserved by this edit.
                </div>
                {(form.photos||[]).length>0&&(
                  <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:8}}>
                    {form.photos.map((p,i)=>(
                      <div key={i} style={{position:"relative"}}>
                        <img src={p} onClick={()=>setLightbox({type:"image",data:p,name:"Photo",download:false})} style={{width:64,height:64,objectFit:"cover",borderRadius:8,border:`1px solid ${BORDER}`,cursor:"pointer"}}/>
                      </div>
                    ))}
                  </div>
                )}
              </FField>

              <FField label="File Attachments (PDF, Word, Excel, etc.)" full>
                <div aria-disabled="true" title="Attachment changes are unavailable until reviewed uploads can be audited and safely undone." style={{border:`2px dashed ${BORDER}`,borderRadius:8,padding:14,textAlign:"center",cursor:"not-allowed",color:W3,fontSize:13,background:GLASS}}>
                  Attachment changes are temporarily unavailable. Existing files remain viewable and are preserved by this edit.
                </div>
                {(form.files||[]).length>0&&(
                  <div style={{display:"flex",flexDirection:"column",gap:6,marginTop:8}}>
                    {form.files.map((f,i)=>{
                      const icons={"application/pdf":"PDF","application/vnd.openxmlformats-officedocument.wordprocessingml.document":"DOC","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":"XLS","text/csv":"CSV","text/plain":"TXT"};
                      return(
                        <div key={i} className="hq-attachment-row" style={{display:"flex",alignItems:"center",gap:10,background:GLASS2,borderRadius:8,padding:"8px 12px",border:`1px solid ${BORDER}`}}>
                          <span style={{fontSize:11,fontWeight:700,color:G,background:'rgba(197,164,109,0.14)',borderRadius:4,padding:"2px 6px"}}>{icons[f.type]||"FILE"}</span>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:13,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:W}}>{f.name}</div>
                            <div style={{fontSize:11,color:W3}}>{Math.round(f.size/1024)} KB</div>
                          </div>
                          <button onClick={()=>{
                            if(f.type==="application/pdf") setLightbox({type:"pdf",data:f.data,name:f.name,download:true});
                            else if(f.type.startsWith("image/")) setLightbox({type:"image",data:f.data,name:f.name,download:true});
                            else if(f.type==="text/plain"||f.type==="text/csv"){const b64=f.data.split(",")[1];const txt=atob(b64);setLightbox({type:"text",data:f.data,name:f.name,textContent:txt,download:true});}
                            else setLightbox({type:"unsupported",data:f.data,name:f.name,icon:icons[f.type]||"FILE",download:true});
                          }} style={{fontSize:12,fontWeight:600,color:G,cursor:"pointer",padding:"4px 8px",borderRadius:6,background:'rgba(197,164,109,0.14)',border:"none",whiteSpace:"nowrap"}}>Preview</button>
                          <a href={f.data} download={f.name} style={{fontSize:12,fontWeight:600,color:W2,textDecoration:"none",padding:"4px 8px",borderRadius:6,background:GLASS}}>Save</a>
                        </div>
                      );
                    })}
                  </div>
                )}
              </FField>

            </div>

            <div className="hq-modal-footer" style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:22}}>
              <button disabled={stagingAction} onClick={()=>setModal(false)} style={{padding:"10px 22px",borderRadius:8,cursor:stagingAction?"wait":"pointer",fontSize:13,fontWeight:600,background:GLASS,color:W2,border:`1px solid ${BORDER}`}}>Cancel</button>
              <button disabled={stagingAction} onClick={saveItem} style={{padding:"10px 22px",borderRadius:8,cursor:stagingAction?"wait":"pointer",fontSize:13,fontWeight:600,background:"rgba(197,164,109,0.18)",color:G,border:`1px solid rgba(197,164,109,0.4)`}}>{stagingAction?"Preparing review…":"Review in Action Mode"}</button>
            </div>
          </div>
        </div>
      )}

      {/* LIGHTBOX */}
      {lightbox&&(
        <div className="hq-lightbox" onClick={e=>{if(e.target===e.currentTarget)setLightbox(null);}} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.95)",zIndex:300,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:20}}>
          <div className="hq-lightbox-header" style={{position:"fixed",top:0,left:0,right:0,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 20px",background:"rgba(0,0,0,.8)",zIndex:301,borderBottom:`1px solid ${BORDER}`}}>
            <div style={{color:W,fontSize:14,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"70vw"}}>{lightbox.name||"Preview"}</div>
            <div style={{display:"flex",gap:10,alignItems:"center"}}>
              {lightbox.download&&<a href={lightbox.data} download={lightbox.name} style={{padding:"6px 14px",borderRadius:6,background:'rgba(197,164,109,0.18)',color:G,fontSize:12,fontWeight:600,textDecoration:"none",border:`1px solid rgba(197,164,109,0.3)`}}>Download</a>}
              <button onClick={()=>setLightbox(null)} style={{color:W,fontSize:28,cursor:"pointer",background:"none",border:"none",lineHeight:1,padding:"0 4px"}}>✕</button>
            </div>
          </div>
          {lightbox.type==="image"&&(
            <img src={lightbox.data} style={{maxWidth:"90vw",maxHeight:"80vh",borderRadius:8,boxShadow:"0 8px 40px rgba(0,0,0,.5)",marginTop:52}} onClick={e=>e.stopPropagation()}/>
          )}
          {lightbox.type==="pdf"&&(
            <div style={{width:"min(860px,90vw)",height:"80vh",marginTop:52,borderRadius:8,overflow:"hidden",boxShadow:"0 8px 40px rgba(0,0,0,.5)"}} onClick={e=>e.stopPropagation()}>
              <iframe src={lightbox.data} style={{width:"100%",height:"100%",border:"none"}} title={lightbox.name}/>
            </div>
          )}
          {lightbox.type==="video"&&(
            <video src={lightbox.data} controls style={{maxWidth:"90vw",maxHeight:"80vh",borderRadius:8,marginTop:52}} onClick={e=>e.stopPropagation()}/>
          )}
          {lightbox.type==="text"&&(
            <div style={{whiteSpace:"pre-wrap",color:"rgba(247,243,234,0.90)"}} onClick={e=>e.stopPropagation()}>
              {lightbox.textContent}
            </div>
          )}
          {lightbox.type==="unsupported"&&(
            <div style={{marginTop:52,textAlign:"center",color:"rgba(247,243,234,0.90)"}} onClick={e=>e.stopPropagation()}>
              <div style={{fontSize:18,fontWeight:600,marginBottom:8}}>{lightbox.name}</div>
              <div style={{fontSize:14,color:"rgba(247,243,234,0.45)",marginBottom:24}}>Preview not available for this file type.</div>
              <a href={lightbox.data} download={lightbox.name} style={{padding:"10px 24px",borderRadius:8,background:"rgba(197,164,109,0.18)",color:"#C5A46D",fontSize:14,fontWeight:600,textDecoration:"none",border:"1px solid rgba(197,164,109,0.4)"}}>Download to Open</a>
            </div>
          )}
        </div>
      )}

      {/* TOAST */}
      {toast&&(
        <div className="hq-toast" style={{position:"fixed",bottom:24,right:24,background:"rgba(12,12,12,0.95)",color:"rgba(247,243,234,0.90)",padding:"12px 20px",borderRadius:10,fontSize:14,fontWeight:500,zIndex:400,boxShadow:"0 4px 20px rgba(0,0,0,.5)",border:"1px solid rgba(255,255,255,0.08)",backdropFilter:"blur(20px)"}}>
          {toast}
        </div>
      )}
    </div>
  );
}

export default App;
