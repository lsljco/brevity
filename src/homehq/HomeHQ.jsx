import { useState, useEffect, useRef } from 'react'

const ROOMS      = ["Kitchen","Bathroom","Living Room","Bedroom","Basement","Garage","Exterior","Attic","Yard"];
const TYPES      = ["Renovation","Maintenance","Repair"];
const STATUSES   = ["To Do","In Progress","Done"];
const PRIORITIES = ["High","Medium","Low"];
const MEMBERS    = ["Larry","Terica","Javin","Nyla","Lorenzo"];
const STORAGE_KEY = "homehq_items_v1";

const EMPTY_FORM = {
  title:"", type:"Renovation", room:"Kitchen", roomCustom:"", status:"To Do", priority:"Medium",
  assignee:"", startDate:"", due:"", estcost:"", actcost:"",
  cname:"", cphone:"", cemail:"", caddress:"",
  bizLicense:false, coi:false, workersComp:false,
  notes:"", photos:[], files:[]
};

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

function loadItems(){ try{ const v=localStorage.getItem(STORAGE_KEY); return v?JSON.parse(v):[]; }catch(e){ return []; } }
function saveItems(items){ try{ localStorage.setItem(STORAGE_KEY,JSON.stringify(items)); }catch(e){} }
function uid(){ return "item-"+Date.now()+"-"+Math.random().toString(36).slice(2); }
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
function GanttView({items,onEdit}){
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
  const allDates=ganttItems.flatMap(i=>[i.startDate&&new Date(i.startDate),i.due&&new Date(i.due)].filter(Boolean));
  let minDate=new Date(Math.min(...allDates)); minDate.setDate(minDate.getDate()-7);
  let maxDate=new Date(Math.max(...allDates)); maxDate.setDate(maxDate.getDate()+14);
  if(today<minDate){minDate=new Date(today);minDate.setDate(minDate.getDate()-7);}
  if(today>maxDate){maxDate=new Date(today);maxDate.setDate(maxDate.getDate()+14);}
  const totalDays=Math.ceil((maxDate-minDate)/86400000);
  const DAY_W=28,LABEL_W=200;
  function dayOffset(date){const d=new Date(date);d.setHours(0,0,0,0);return Math.max(0,Math.round((d-minDate)/86400000));}
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
    const k=groupBy==="room"?roomLabel(i):groupBy==="type"?i.type:(i.assignee||"Unassigned");
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
                const start=item.startDate?new Date(item.startDate):new Date(item.due);
                const end=new Date(item.due);
                const s=dayOffset(start),e=dayOffset(end);
                const barLeft=s*DAY_W, barW=Math.max((e-s)*DAY_W,20);
                const isOverdue=end<today&&item.status!=="Done";
                const bc=barColor(item);
                return(
                  <div key={item.id} style={{display:"flex",borderBottom:`1px solid rgba(255,255,255,0.04)`,minHeight:44,alignItems:"center"}}>
                    <div onClick={()=>onEdit(item)} style={{width:LABEL_W,minWidth:LABEL_W,borderRight:`1px solid ${BORDER}`,padding:"8px 14px",fontSize:13,fontWeight:500,color:W,display:"flex",alignItems:"center",gap:6,cursor:"pointer",overflow:"hidden"}}>
                      <span style={{width:9,height:9,borderRadius:"50%",background:bc,flexShrink:0}}/>
                      <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{item.title}</span>
                      {isOverdue&&<span title="Overdue" style={{color:RED,fontSize:11}}>!</span>}
                    </div>
                    <div style={{flex:1,position:"relative",height:44}}>
                      <div style={{position:"absolute",left:todayLeft,top:0,bottom:0,width:2,background:G,opacity:.25,pointerEvents:"none",zIndex:1}}/>
                      <div onClick={()=>onEdit(item)} title={item.title+"\n"+item.due+"\n"+item.status} style={{position:"absolute",left:barLeft+4,top:"50%",transform:"translateY(-50%)",width:barW,height:24,background:bc,borderRadius:6,cursor:"pointer",display:"flex",alignItems:"center",paddingLeft:8,fontSize:11,fontWeight:700,color:"rgba(0,0,0,0.85)",overflow:"hidden",whiteSpace:"nowrap",boxShadow:"0 2px 8px rgba(0,0,0,.4)",opacity:item.status==="Done"?.55:1,textDecoration:item.status==="Done"?"line-through":"none",border:isOverdue?`2px solid ${RED}`:"none",zIndex:2}}>
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
      <div style={{marginTop:10,fontSize:12,color:W3}}>Click any task name or bar to edit. Items need a due date to appear here.</div>
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
                <td style={TD}>{i.assignee||"—"}</td>
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
function CalendarView({items, onEdit}){
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

  const todayStr = today.toISOString().slice(0,10);
  const monthPrefix = viewYear+"-"+(String(viewMonth+1).padStart(2,"0"));
  const monthItems  = items.filter(i=>i.due&&i.due.startsWith(monthPrefix));
  const monthEst    = monthItems.reduce((s,i)=>s+(parseFloat(i.estcost)||0),0);
  const monthAct    = monthItems.reduce((s,i)=>s+(parseFloat(i.actcost)||0),0);

  const navBtn = {width:34,height:34,borderRadius:8,border:`1.5px solid ${BORDER}`,background:GLASS,cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",color:W};

  return(
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20,flexWrap:"wrap",gap:12}}>
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

      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:2}}>
        {dayNames.map(d=>(
          <div key={d} style={{textAlign:"center",padding:"8px 0",fontSize:11,fontWeight:800,letterSpacing:1,textTransform:"uppercase",color:W3}}>{d}</div>
        ))}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
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
                  <span style={{fontSize:10,fontWeight:700,color:GREEN,background:'rgba(74,222,128,0.12)',borderRadius:8,padding:"1px 5px",whiteSpace:"nowrap"}}>
                    {displayCost(dayAct||dayEst)}
                  </span>
                )}
              </div>
              {dayItems.map(item=>{
                const itemCost = parseFloat(item.actcost)||parseFloat(item.estcost)||0;
                const isAct = parseFloat(item.actcost)>0;
                return(
                  <div key={item.id} onClick={()=>onEdit(item)}
                    title={item.title}
                    style={{background:TYPE_BG[item.type]||GLASS2,borderLeft:`2px solid `+(TYPE_COLOR[item.type]||W3),borderRadius:"0 4px 4px 0",padding:"3px 5px",fontSize:10,cursor:"pointer",lineHeight:1.4}}>
                    <div style={{fontWeight:700,color:TYPE_COLOR[item.type]||W,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.title}</div>
                    {itemCost>0&&(
                      <div style={{fontWeight:600,color:isAct?GREEN:G,fontSize:10}}>
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
      <div style={{marginTop:12,fontSize:12,color:W3}}>Click any item to edit. Items appear on their due date.</div>
    </div>
  );
}

// ── MAIN APP ───────────────────────────────────────────────────────────────
function App(){
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
  const fileRef   = useRef();
  const fileRef2  = useRef();
  const importRef = useRef();
  const toastTmr  = useRef();

  useEffect(()=>{ saveItems(items); },[items]);

  function showToast(msg){ setToast(msg); clearTimeout(toastTmr.current); toastTmr.current=setTimeout(()=>setToast(""),3000); }
  function openAdd(){ setEditId(null); setForm(EMPTY_FORM); setModal(true); }
  function openEdit(item){ setEditId(item.id); setForm({...EMPTY_FORM,...item,photos:item.photos||[],files:item.files||[]}); setModal(true); }

  function saveItem(){
    if(!form.title.trim()){ showToast("Title is required"); return; }
    const now=new Date().toISOString();
    const cleaned={...form,estcost:fmtCost(form.estcost),actcost:fmtCost(form.actcost)};
    if(editId){
      setItems(prev=>prev.map(i=>i.id===editId?{...cleaned,id:editId,updatedAt:now}:i));
      showToast("Item updated");
    } else {
      setItems(prev=>[{...cleaned,id:uid(),createdAt:now,updatedAt:now},...prev]);
      showToast("Item added");
    }
    setModal(false);
  }

  function deleteItem(id){ if(!window.confirm("Delete this item?")) return; setItems(prev=>prev.filter(i=>i.id!==id)); showToast("Deleted"); }

  function handlePhoto(e){
    Array.from(e.target.files).forEach(f=>{
      const r=new FileReader();
      r.onload=ev=>setForm(p=>({...p,photos:[...(p.photos||[]),ev.target.result]}));
      r.readAsDataURL(f);
    });
    e.target.value="";
  }

  function handleFile(e){
    Array.from(e.target.files).forEach(f=>{
      const r=new FileReader();
      r.onload=ev=>setForm(p=>({...p,files:[...(p.files||[]),{name:f.name,size:f.size,type:f.type,data:ev.target.result}]}));
      r.readAsDataURL(f);
    });
    e.target.value="";
  }

  function exportData(){
    const blob=new Blob([JSON.stringify(items,null,2)],{type:"application/json"});
    const a=document.createElement("a"); a.href=URL.createObjectURL(blob);
    a.download="Projects-backup-"+new Date().toISOString().slice(0,10)+".json"; a.click();
    showToast("Exported");
  }

  function importData(e){
    const f=e.target.files[0]; if(!f) return;
    const r=new FileReader();
    r.onload=ev=>{
      try{
        const data=JSON.parse(ev.target.result);
        if(!Array.isArray(data)) throw new Error();
        if(window.confirm("Import "+data.length+" items? This will replace your current data.")){
          setItems(data); showToast("Imported "+data.length+" items");
        }
      }catch(err){ showToast("Invalid file"); }
    };
    r.readAsText(f); e.target.value="";
  }

  const assignees=[...new Set(items.map(i=>i.assignee).filter(Boolean))];
  const noFilter=["budget","contractors","gantt","calendar"];

  const filtered=items.filter(i=>{
    const typeMap={renovation:"Renovation",maintenance:"Maintenance",repair:"Repair"};
    if(!noFilter.includes(tab)&&tab!=="all"&&i.type!==typeMap[tab]) return false;
    if(fStatus&&i.status!==fStatus) return false;
    if(fRoom&&roomLabel(i)!==fRoom) return false;
    if(fPriority&&i.priority!==fPriority) return false;
    if(fAssignee&&i.assignee!==fAssignee) return false;
    if(search&&!JSON.stringify(i).toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const totalBudget=items.reduce((s,i)=>s+(parseFloat(i.actcost)||parseFloat(i.estcost)||0),0);
  const showFilters=!noFilter.includes(tab);
  const TABS=[["all","All"],["renovation","Renovation"],["maintenance","Maintenance"],["repair","Repairs"],["gantt","Timeline"],["calendar","Calendar"],["budget","Budget"],["contractors","Contractors"]];

  const selectStyle={...FI,width:"auto",flex:1,minWidth:120};

  return(
    <div style={{background:"#000",minHeight:"100vh",fontFamily:"'Inter',system-ui,sans-serif",color:W}}>
      <style>{HQ_STYLES}</style>

      {/* HEADER */}
      <div style={{background:"rgba(0,0,0,0.92)",borderBottom:`1px solid ${BORDER}`,padding:"18px 32px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:100,backdropFilter:"blur(20px)"}}>
        <div>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:22,fontWeight:500,color:W,letterSpacing:-.5}}>Projects</div>
          <div style={{fontSize:11,color:W3,letterSpacing:2,textTransform:"uppercase",marginTop:2}}>Property Management</div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <button onClick={()=>importRef.current.click()} style={{padding:"8px 14px",borderRadius:8,border:`1px solid ${BORDER}`,cursor:"pointer",fontSize:12,fontWeight:600,background:GLASS,color:W2}}>Import</button>
          <input ref={importRef} type="file" accept=".json" style={{display:"none"}} onChange={importData}/>
          <button onClick={exportData} style={{padding:"8px 14px",borderRadius:8,border:`1px solid ${BORDER}`,cursor:"pointer",fontSize:12,fontWeight:600,background:GLASS,color:W2}}>Export</button>
          <button onClick={openAdd} style={{padding:"9px 20px",borderRadius:8,border:`1px solid rgba(197,164,109,0.4)`,cursor:"pointer",fontSize:13,fontWeight:600,background:"rgba(197,164,109,0.15)",color:G,letterSpacing:.3}}>+ Add Item</button>
        </div>
      </div>

      {/* TABS */}
      <div style={{display:"flex",background:"rgba(0,0,0,0.6)",borderBottom:`1px solid ${BORDER}`,padding:"0 28px",overflowX:"auto",backdropFilter:"blur(10px)"}}>
        {TABS.map(([k,l])=>(
          <div key={k} onClick={()=>setTab(k)} style={{padding:"14px 20px",cursor:"pointer",fontSize:17,fontWeight:500,whiteSpace:"nowrap",borderBottom:"2px solid",marginBottom:-1,transition:"all .15s",color:tab===k?G:W3,borderBottomColor:tab===k?G:"transparent",letterSpacing:.2}}>{l}</div>
        ))}
      </div>

      <div style={{padding:"24px 32px",maxWidth:1400,margin:"0 auto"}}>

        {/* STATS */}
        {showFilters&&(
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:24}}>
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
          <div style={{display:"flex",gap:10,marginBottom:20,flexWrap:"wrap",alignItems:"center"}}>
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
                <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:22,marginBottom:8,color:W2}}>No items yet</div>
                <div style={{fontSize:14}}>Click "+ Add Item" to get started.</div>
              </div>
            )}
            <div className="hq-proj-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))",gap:20}}>
              {filtered.map(item=>{
                const isExp=expanded===item.id;
                const isOverdue=item.due&&new Date(item.due)<new Date()&&item.status!=="Done";
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
                            {item.assignee&&<Badge text={item.assignee} fg={W2} bg={GLASS2}/>}
                          </div>
                        </div>
                        <div style={{display:"flex",gap:4,flexShrink:0}}>
                          <button onClick={e=>{e.stopPropagation();openEdit(item);}} style={{width:28,height:28,border:`1px solid ${BORDER}`,background:GLASS,cursor:"pointer",borderRadius:6,fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",color:W2}} title="Edit">✎</button>
                          <button onClick={e=>{e.stopPropagation();deleteItem(item.id);}} style={{width:28,height:28,border:`1px solid rgba(248,113,113,0.2)`,background:"rgba(248,113,113,0.08)",cursor:"pointer",borderRadius:6,fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",color:RED}} title="Delete">×</button>
                        </div>
                      </div>

                      {/* Costs */}
                      <div style={{display:"flex",gap:12,paddingTop:10,borderTop:`1px solid ${BORDER}`}}>
                        {item.estcost&&<div style={{fontSize:12}}><span style={{color:W3}}>Est </span><span style={{fontWeight:600,color:G}}>{displayCost(item.estcost)}</span></div>}
                        {item.actcost&&<div style={{fontSize:12}}><span style={{color:W3}}>Act </span><span style={{fontWeight:600,color:GREEN}}>{displayCost(item.actcost)}</span></div>}
                        {item.due&&<div style={{fontSize:12,marginLeft:"auto"}}><span style={{color:isOverdue?RED:W3}}>Due {item.due}</span></div>}
                      </div>

                      {/* Expanded detail */}
                      {isExp&&(
                        <div style={{marginTop:14,paddingTop:14,borderTop:`1px solid ${BORDER}`}}>
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
                                  <img key={i} src={p} onClick={()=>setLightbox({type:"image",data:p,name:"Photo",download:false})} style={{width:68,height:68,objectFit:"cover",borderRadius:8,border:`1px solid ${BORDER}`,cursor:"pointer"}}/>
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
                                    <div key={i} style={{display:"flex",alignItems:"center",gap:10,background:GLASS2,borderRadius:8,padding:"8px 12px",border:`1px solid ${BORDER}`}}>
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
                                      <button onClick={()=>setForm(prev=>({...prev,files:prev.files.filter((_,j)=>j!==i)}))} style={{width:20,height:20,borderRadius:"50%",background:'rgba(248,113,113,0.15)',color:RED,border:"none",cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",padding:0,flexShrink:0}}>×</button>
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

        {tab==="gantt"       && <GanttView items={items} onEdit={openEdit}/>}
        {tab==="calendar"    && <CalendarView items={items} onEdit={openEdit}/>}
        {tab==="budget"      && <BudgetView items={items}/>}
        {tab==="contractors" && <ContractorsView items={items}/>}
      </div>

      {/* MODAL */}
      {modal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.80)",backdropFilter:"blur(12px)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>{if(e.target===e.currentTarget)setModal(false);}}>
          <div style={{background:"rgba(12,12,12,0.97)",border:`1px solid ${BORDER}`,borderRadius:20,padding:28,width:"100%",maxWidth:700,maxHeight:"92vh",overflowY:"auto",boxShadow:"0 24px 80px rgba(0,0,0,0.7)",position:"relative"}}>
            <button onClick={()=>setModal(false)} style={{position:"absolute",top:14,right:14,background:"none",border:"none",fontSize:22,cursor:"pointer",color:W3,lineHeight:1}}>✕</button>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:22,fontWeight:500,marginBottom:22,color:W}}>{editId?"Edit Item":"Add New Item"}</div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>

              <FField label="Title *" full>
                <input style={FI} value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))} placeholder="e.g. Replace kitchen faucet"/>
              </FField>

              <FField label="Type">
                <select style={FI} value={form.type} onChange={e=>setForm(p=>({...p,type:e.target.value}))}>
                  {TYPES.map(t=><option key={t}>{t}</option>)}
                </select>
              </FField>

              <FField label="Room / Area" full>
                <div style={{display:"flex",gap:10}}>
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

              <FField label="Assigned To">
                <select style={FI} value={form.assignee} onChange={e=>setForm(p=>({...p,assignee:e.target.value}))}>
                  <option value="">— Select —</option>
                  {MEMBERS.map(m=><option key={m}>{m}</option>)}
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
                <div onClick={()=>fileRef.current.click()} style={{border:`2px dashed ${BORDER}`,borderRadius:8,padding:14,textAlign:"center",cursor:"pointer",color:W3,fontSize:13,background:GLASS}}>
                  Click to add photos (JPG, PNG, GIF)
                  <input ref={fileRef} type="file" accept="image/*" multiple style={{display:"none"}} onChange={handlePhoto}/>
                </div>
                {(form.photos||[]).length>0&&(
                  <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:8}}>
                    {form.photos.map((p,i)=>(
                      <div key={i} style={{position:"relative"}}>
                        <img src={p} onClick={()=>setLightbox({type:"image",data:p,name:"Photo",download:false})} style={{width:64,height:64,objectFit:"cover",borderRadius:8,border:`1px solid ${BORDER}`,cursor:"pointer"}}/>
                        <button onClick={()=>setForm(prev=>({...prev,photos:prev.photos.filter((_,j)=>j!==i)}))} style={{position:"absolute",top:-6,right:-6,width:18,height:18,borderRadius:"50%",background:RED,color:"#000",border:"none",cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",padding:0,fontWeight:700}}>×</button>
                      </div>
                    ))}
                  </div>
                )}
              </FField>

              <FField label="File Attachments (PDF, Word, Excel, etc.)" full>
                <div onClick={()=>fileRef2.current.click()} style={{border:`2px dashed ${BORDER}`,borderRadius:8,padding:14,textAlign:"center",cursor:"pointer",color:W3,fontSize:13,background:GLASS}}>
                  Click to attach files (PDF, DOCX, XLSX, etc.)
                  <input ref={fileRef2} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip" multiple style={{display:"none"}} onChange={handleFile}/>
                </div>
                {(form.files||[]).length>0&&(
                  <div style={{display:"flex",flexDirection:"column",gap:6,marginTop:8}}>
                    {form.files.map((f,i)=>{
                      const icons={"application/pdf":"PDF","application/vnd.openxmlformats-officedocument.wordprocessingml.document":"DOC","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":"XLS","text/csv":"CSV","text/plain":"TXT"};
                      return(
                        <div key={i} style={{display:"flex",alignItems:"center",gap:10,background:GLASS2,borderRadius:8,padding:"8px 12px",border:`1px solid ${BORDER}`}}>
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
                          <button onClick={()=>setForm(prev=>({...prev,files:prev.files.filter((_,j)=>j!==i)}))} style={{width:20,height:20,borderRadius:"50%",background:'rgba(248,113,113,0.15)',color:RED,border:"none",cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",padding:0,flexShrink:0}}>×</button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </FField>

            </div>

            <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:22}}>
              <button onClick={()=>setModal(false)} style={{padding:"10px 22px",borderRadius:8,cursor:"pointer",fontSize:13,fontWeight:600,background:GLASS,color:W2,border:`1px solid ${BORDER}`}}>Cancel</button>
              <button onClick={saveItem} style={{padding:"10px 22px",borderRadius:8,cursor:"pointer",fontSize:13,fontWeight:600,background:"rgba(197,164,109,0.18)",color:G,border:`1px solid rgba(197,164,109,0.4)`}}>Save Item</button>
            </div>
          </div>
        </div>
      )}

      {/* LIGHTBOX */}
      {lightbox&&(
        <div onClick={e=>{if(e.target===e.currentTarget)setLightbox(null);}} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.95)",zIndex:300,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{position:"fixed",top:0,left:0,right:0,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 20px",background:"rgba(0,0,0,.8)",zIndex:301,borderBottom:`1px solid ${BORDER}`}}>
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
        <div style={{position:"fixed",bottom:24,right:24,background:"rgba(12,12,12,0.95)",color:"rgba(247,243,234,0.90)",padding:"12px 20px",borderRadius:10,fontSize:14,fontWeight:500,zIndex:400,boxShadow:"0 4px 20px rgba(0,0,0,.5)",border:"1px solid rgba(255,255,255,0.08)",backdropFilter:"blur(20px)"}}>
          {toast}
        </div>
      )}
    </div>
  );
}

export default App;
