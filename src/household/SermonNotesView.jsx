const list=value=>Array.isArray(value)?value.filter(Boolean):value?[value]:[]

function TextList({items,ordered=false}){
  const Tag=ordered?'ol':'ul'
  return <Tag>{list(items).map((item,index)=><li key={`${index}-${typeof item==='string'?item:item.title||item.reference}`}>{typeof item==='string'?item:item.title||item.reference}</li>)}</Tag>
}

function ScriptureList({items}){
  return <div className="sermon-scripture-list">{list(items).map((item,index)=><article key={`${index}-${item.reference||item}`}><strong>{typeof item==='string'?item:item.reference}</strong>{typeof item==='object'&&item.explanation&&<p>{item.explanation}</p>}</article>)}</div>
}

function DevelopedSections({items,numbered=false}){
  return <div className="sermon-developed-sections">{list(items).map((item,index)=><article key={`${index}-${item.title||item}`}>
    <h4>{numbered?`${index+1}. `:''}{typeof item==='string'?item:item.title}</h4>
    {typeof item==='object'&&list(item.paragraphs).map((paragraph,pIndex)=><p key={pIndex}>{paragraph}</p>)}
    {typeof item==='object'&&list(item.description).map((paragraph,pIndex)=><p key={`description-${pIndex}`}>{paragraph}</p>)}
    {typeof item==='object'&&list(item.items).length>0&&<dl>{item.items.map((entry,eIndex)=><div key={eIndex}><dt>{entry.label}</dt><dd>{entry.detail}</dd></div>)}</dl>}
    {typeof item==='object'&&list(item.steps).length>0&&<TextList items={item.steps}/>} 
    {typeof item==='object'&&list(item.quotes).map((quote,qIndex)=><blockquote key={qIndex}>“{quote.replace(/^['“"]|['”"]$/g,'')}”</blockquote>)}
  </article>)}</div>
}

export default function SermonNotesView({notes}){
  if(!notes)return null
  const isDetailed=Boolean(notes.documentTitle||notes.detailedExposition)
  if(!isDetailed)return <div className="sermon-notes-grid">{[
    ['title','Title'],['scriptures','Scriptures'],['themes','Theme(s)'],['bigIdea','Big Idea'],['definition','Definition'],['coreRevelation','Core Revelation'],['foundationalTruths','Foundational Truths'],['whatThisProduces','What This Produces'],['applicationQuestions','Application Questions'],['call','Call'],['prayer','Prayer']
  ].map(([key,label])=><article key={key} className="sermon-note-card"><span>{label}</span>{Array.isArray(notes[key])?<TextList items={notes[key]}/>:<p>{notes[key]||'—'}</p>}</article>)}</div>

  const sourceMeta=[notes.series&&`Series: ${notes.series}`,notes.part&&`Part: ${notes.part}`,notes.preacherTeacher&&`Preacher/Teacher: ${notes.preacherTeacher}`,notes.service,notes.sermonDate].filter(Boolean)
  return <article className="sermon-teaching-document">
    <header><span>Church Triumphant · Teaching Document</span><h2>{notes.documentTitle}</h2>{notes.subtitle&&<h3>{notes.subtitle}</h3>}<p>{sourceMeta.join(' · ')}</p>{notes.leadQuote&&<blockquote>“{notes.leadQuote.replace(/^['“"]|['”"]$/g,'')}”</blockquote>}</header>
    <section><h3>Aim</h3><p>{notes.aim}</p></section>
    <section><h3>Thesis</h3><p>{notes.thesis}</p></section>
    <section><h3>Opening Exhortation</h3>{list(notes.openingExhortation).map((p,i)=><p key={i}>{p}</p>)}</section>
    <section><h3>Primary Scriptures</h3><ScriptureList items={notes.primaryScriptures}/><h4>Supporting Biblical Witnesses</h4><ScriptureList items={notes.supportingBiblicalWitnesses}/>{notes.governingQuestion&&<blockquote>{notes.governingQuestion}</blockquote>}</section>
    <section><h3>Historical and Biblical Context</h3><DevelopedSections items={notes.historicalBiblicalContext}/></section>
    <section><h3>Detailed Exposition</h3><DevelopedSections items={notes.detailedExposition} numbered/></section>
    <section><h3>Kingdom Principles</h3><TextList items={notes.kingdomPrinciples}/></section>
    <section><h3>Architectural Frameworks</h3><DevelopedSections items={notes.architecturalFrameworks}/></section>
    <section><h3>Practical Application</h3><DevelopedSections items={notes.practicalApplication}/></section>
    <section><h3>Reflection Questions</h3><TextList items={notes.reflectionQuestions} ordered/></section>
    <section><h3>Weekly Charge</h3><h4>{notes.weeklyCharge?.title}</h4>{list(notes.weeklyCharge?.paragraphs).map((p,i)=><p key={i}>{p}</p>)}<TextList items={notes.weeklyCharge?.actions}/>{notes.weeklyCharge?.quote&&<blockquote>“{notes.weeklyCharge.quote.replace(/^['“"]|['”"]$/g,'')}”</blockquote>}</section>
    <section><h3>Congregational Response</h3>{list(notes.congregationalResponse).map((p,i)=><p key={i}>{p}</p>)}</section>
    <section><h3>Prayer</h3>{list(notes.prayer).map((p,i)=><p key={i}>{p}</p>)}</section>
    <section><h3>Scripture Index</h3><ScriptureList items={list(notes.scriptureIndex).map(item=>({reference:item.reference,explanation:item.teachingEmphasis}))}/></section>
  </article>
}
