import './SermonNotesCanonical.css'

const list=value=>Array.isArray(value)?value.filter(Boolean):value?[value]:[]

function TextList({items,ordered=false}){
  const Tag=ordered?'ol':'ul'
  return <Tag>{list(items).map((item,index)=><li key={`${index}-${typeof item==='string'?item:item.title||item.reference||item.label}`}>{typeof item==='string'?item:item.title||item.reference||item.label}</li>)}</Tag>
}

function ScriptureList({items}){
  return <div className="sermon-scripture-list">{list(items).map((item,index)=><article key={`${index}-${item.reference||item}`}><strong>{typeof item==='string'?item:item.reference}</strong>{typeof item==='object'&&(item.explanation||item.teachingEmphasis)&&<p>{item.explanation||item.teachingEmphasis}</p>}</article>)}</div>
}

function DevelopedSections({items,numbered=false}){
  return <div className="sermon-developed-sections">{list(items).map((item,index)=><article key={`${index}-${item.title||item}`}>
    {(typeof item==='string'||item.title)&&<h4>{numbered?`${index+1}. `:''}{typeof item==='string'?item:item.title}</h4>}
    {typeof item==='object'&&list(item.paragraphs).map((paragraph,pIndex)=><p key={pIndex}>{paragraph}</p>)}
    {typeof item==='object'&&list(item.description).map((paragraph,pIndex)=><p key={`description-${pIndex}`}>{paragraph}</p>)}
    {typeof item==='object'&&list(item.items).length>0&&<dl>{item.items.map((entry,eIndex)=><div key={eIndex}><dt>{entry.label||entry.stage}</dt><dd>{entry.detail||entry.description}</dd></div>)}</dl>}
    {typeof item==='object'&&list(item.steps).length>0&&<TextList items={item.steps}/>} 
    {typeof item==='object'&&list(item.quotes).map((quote,qIndex)=><blockquote key={qIndex}>“{quote.replace(/^['“"]|['”"]$/g,'')}”</blockquote>)}
  </article>)}</div>
}

function MessageAtAGlance({notes}){
  const glance=notes.messageAtAGlance||{}
  const rows=[['Focus',glance.focus||notes.aim],['Central diagnosis',glance.centralDiagnosis||notes.thesis],['Central command',glance.centralCommand||notes.anchorDeclaration],['Central hope',glance.centralHope],['Desired response',glance.desiredResponse]]
  return <dl className="sermon-at-a-glance">{rows.filter(([,value])=>value).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
}

export default function SermonNotesView({notes}){
  if(!notes)return null
  const isDetailed=Boolean(notes.documentTitle||notes.detailedExposition)
  if(!isDetailed)return <div className="sermon-notes-grid">{[
    ['title','Title'],['scriptures','Scriptures'],['themes','Theme(s)'],['bigIdea','Big Idea'],['definition','Definition'],['coreRevelation','Core Revelation'],['foundationalTruths','Foundational Truths'],['whatThisProduces','What This Produces'],['applicationQuestions','Application Questions'],['call','Call'],['prayer','Prayer']
  ].map(([key,label])=><article key={key} className="sermon-note-card"><span>{label}</span>{Array.isArray(notes[key])?<TextList items={notes[key]}/>:<p>{notes[key]||'—'}</p>}</article>)}</div>

  const sourceMeta=[notes.preacherTeacher&&`Pastor ${notes.preacherTeacher.replace(/^Pastor\s+/i,'')}`,notes.sermonDate,notes.series].filter(Boolean)
  const foundational=[...list(notes.primaryScriptures),...list(notes.supportingBiblicalWitnesses)]
  const responses=[...list(notes.contributorInsights),...list(notes.congregationalResponse)]
  return <article className="sermon-teaching-document">
    <header><span>Church Triumphant Teaching Document</span><h2>{notes.documentTitle}</h2>{notes.subtitle&&<h3>{notes.subtitle}</h3>}<p>{sourceMeta.join(' · ')}</p>{notes.leadQuote&&<blockquote>“{notes.leadQuote.replace(/^['“"]|['”"]$/g,'')}”</blockquote>}</header>
    <section><h3>Message at a Glance</h3><MessageAtAGlance notes={notes}/></section>
    <section><h3>Foundational Scriptures</h3><ScriptureList items={foundational}/></section>
    <section><h3>Pastoral Orientation</h3>{list(notes.openingExhortation).map((p,i)=><p key={i}>{p}</p>)}</section>
    <section><h3>Historical and Biblical Context</h3><DevelopedSections items={notes.historicalBiblicalContext}/></section>
    {list(notes.workingDefinitions).length>0&&<section><h3>Working Definitions</h3><DevelopedSections items={notes.workingDefinitions}/></section>}
    <section><h3>Detailed Exposition</h3><DevelopedSections items={notes.detailedExposition} numbered/></section>
    {list(notes.architecturalFrameworks).length>0&&<section><h3>Teaching Frameworks</h3><DevelopedSections items={notes.architecturalFrameworks}/></section>}
    <section><h3>Kingdom Principles</h3><TextList items={notes.kingdomPrinciples}/></section>
    <section><h3>A Practical Soul-Cultivation Rhythm</h3><DevelopedSections items={notes.practicalApplication}/></section>
    <section><h3>Reflection and Discussion</h3><TextList items={notes.reflectionQuestions} ordered/></section>
    <section><h3>Congregational Response</h3><DevelopedSections items={responses}/></section>
    <section><h3>Prayer</h3>{list(notes.prayer).map((p,i)=><p key={i}>{p}</p>)}</section>
    <section><h3>Scripture Index</h3><ScriptureList items={list(notes.scriptureIndex)}/></section>
    <section><h3>Closing Charge</h3><h4>{notes.weeklyCharge?.title}</h4>{list(notes.weeklyCharge?.paragraphs).map((p,i)=><p key={i}>{p}</p>)}<TextList items={notes.weeklyCharge?.actions}/>{notes.weeklyCharge?.quote&&<blockquote>“{notes.weeklyCharge.quote.replace(/^['“"]|['”"]$/g,'')}”</blockquote>}{notes.closingCommission&&<p>{notes.closingCommission}</p>}</section>
  </article>
}
