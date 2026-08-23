import { getStore } from '@netlify/blobs'
import {
  AlignmentType, BorderStyle, Document, HeadingLevel, Packer, Paragraph,
  TextRun,
} from 'docx'
import PDFDocument from 'pdfkit'
import householdAuth from './household-auth.js'
import { getOneDriveConnection, publishSermonDocuments } from '../lib/onedrive.mjs'

const { readSession } = householdAuth
const HOUSEHOLD_ID = process.env.BREVITY_HOUSEHOLD_ID || 'lslj-family'
const STORE_NAME = 'brevity-sermon-repository'
const jsonHeaders = { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' }
const json = (statusCode, body) => ({ statusCode, headers:jsonHeaders, body:JSON.stringify(body) })
const store = () => getStore({ name:STORE_NAME, consistency:'strong', siteID:process.env.NETLIFY_SITE_ID, token:process.env.NETLIFY_TOKEN })
const indexKey = `${HOUSEHOLD_ID}/sermons/index`
const fileKey = (id, format) => `${HOUSEHOLD_ID}/sermons/${id}/sermon.${format}`
const clean = value => String(value || '').trim()
const values = value => Array.isArray(value) ? value.filter(Boolean) : value ? [value] : []
const slugify = value => clean(value).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80) || 'sermon-notes'

export function normalizeSermonSections(notes = {}) {
  const primary = values(notes.primaryScriptures || notes.scriptures).map(item => typeof item === 'string' ? { reference:item, explanation:'' } : item)
  return [
    ['AIM', values(notes.aim)],
    ['THESIS', values(notes.thesis || notes.bigIdea)],
    ['OPENING EXHORTATION', values(notes.openingExhortation || notes.coreRevelation)],
    ['PRIMARY SCRIPTURES', primary.map(item => `${clean(item.reference)}${item.explanation ? ` — ${clean(item.explanation)}` : ''}`)],
    ['SUPPORTING BIBLICAL WITNESSES', values(notes.supportingBiblicalWitnesses).map(item => typeof item === 'string' ? item : `${clean(item.reference)}${item.explanation ? ` — ${clean(item.explanation)}` : ''}`)],
    ['GOVERNING QUESTION', values(notes.governingQuestion)],
    ['HISTORICAL AND BIBLICAL CONTEXT', values(notes.historicalBiblicalContext)],
    ['DETAILED EXPOSITION', values(notes.detailedExposition)],
    ['KINGDOM PRINCIPLES', values(notes.kingdomPrinciples || notes.foundationalTruths)],
    ['ARCHITECTURAL FRAMEWORKS', values(notes.architecturalFrameworks)],
    ['PRACTICAL APPLICATION', values(notes.practicalApplication || notes.whatThisProduces)],
    ['REFLECTION QUESTIONS', values(notes.reflectionQuestions || notes.applicationQuestions)],
    ['WEEKLY CHARGE', values(notes.weeklyCharge || notes.call)],
    ['CONGREGATIONAL RESPONSE', values(notes.congregationalResponse)],
    ['PRAYER', values(notes.prayer)],
    ['SCRIPTURE INDEX', values(notes.scriptureIndex)],
  ].filter(([,items]) => items.length)
}

function objectTitle(item) { return clean(item?.title || item?.reference || item?.label) }
export function sermonItemParagraphs(item) {
  if (typeof item === 'string') return [item]
  const content = [
    ...values(item?.description),
    ...values(item?.paragraphs),
    ...values(item?.details),
    ...values(item?.steps),
    ...values(item?.actions),
    ...values(item?.items),
    ...values(item?.explanation),
    ...values(item?.teachingEmphasis),
    ...values(item?.content),
  ]
  return content
    .map(value => typeof value === 'string' ? value : `${clean(value?.label || value?.stage)}${value?.detail ? ` — ${clean(value.detail)}` : ''}`)
    .filter(Boolean)
}

const bodyParagraph = (text, options = {}) => new Paragraph({
  text:clean(text), bullet:options.bullet ? { level:0 } : undefined,
  spacing:{ after:150, line:310 },
  style:options.quote ? 'Quote' : undefined,
})

function docxChildren(notes, source) {
  const title = clean(notes.documentTitle || notes.title || source.title || 'Sermon Teaching Notes')
  const children = [
    new Paragraph({ alignment:AlignmentType.CENTER, spacing:{after:80}, children:[new TextRun({ text:'CHURCH TRIUMPHANT', bold:true, color:'9B7538', size:22, characterSpacing:140 })] }),
    new Paragraph({ alignment:AlignmentType.CENTER, spacing:{after:100}, children:[new TextRun({ text:'TEACHING DOCUMENT', bold:true, color:'5F5A52', size:18, characterSpacing:100 })] }),
    new Paragraph({ alignment:AlignmentType.CENTER, spacing:{before:180,after:80}, children:[new TextRun({ text:title.toUpperCase(), bold:true, size:38, font:'Aptos Display' })] }),
  ]
  const subtitle = clean(notes.subtitle)
  if (subtitle) children.push(new Paragraph({ alignment:AlignmentType.CENTER, spacing:{after:140}, children:[new TextRun({ text:subtitle, italics:true, size:25, color:'4D4942' })] }))
  const metadata = [notes.series && `Series: ${notes.series}`, notes.part && `Part: ${notes.part}`, (notes.preacherTeacher || source.preacherTeacher) && `Preacher/Teacher: ${notes.preacherTeacher || source.preacherTeacher}`, (notes.service || source.serviceType) && `Service: ${notes.service || source.serviceType}`, (notes.sermonDate || source.sermonDate) && `Date: ${notes.sermonDate || source.sermonDate}`].filter(Boolean)
  metadata.forEach(line => children.push(new Paragraph({ alignment:AlignmentType.CENTER, spacing:{after:60}, children:[new TextRun({text:line,size:20,color:'5F5A52'})] })))
  if (notes.leadQuote) children.push(new Paragraph({ style:'Quote', spacing:{before:260,after:260}, children:[new TextRun({ text:`“${clean(notes.leadQuote).replace(/^['“"]|['”"]$/g,'')}”`, italics:true, size:25, color:'6F5630' })] }))

  normalizeSermonSections(notes).forEach(([heading, items]) => {
    children.push(new Paragraph({ text:heading, heading:HeadingLevel.HEADING_1, pageBreakBefore:['DETAILED EXPOSITION','PRACTICAL APPLICATION','PRAYER'].includes(heading) }))
    items.forEach((item, index) => {
      const titleText = objectTitle(item)
      if (titleText) children.push(new Paragraph({ text:titleText, heading:HeadingLevel.HEADING_2 }))
      const paragraphs = sermonItemParagraphs(item)
      if (!titleText && typeof item === 'string') children.push(bodyParagraph(item, { bullet:['KINGDOM PRINCIPLES','REFLECTION QUESTIONS'].includes(heading) }))
      else paragraphs.forEach(text => children.push(bodyParagraph(text, { bullet:['PRACTICAL APPLICATION','WEEKLY CHARGE'].includes(heading) })))
      values(item?.quotes).forEach(quote => children.push(bodyParagraph(`“${clean(quote).replace(/^['“"]|['”"]$/g,'')}”`, { quote:true })))
      if (heading === 'SCRIPTURE INDEX' && index === items.length - 1) children.push(new Paragraph({text:''}))
    })
  })
  return children
}

export async function buildSermonDocx(notes, source) {
  const doc = new Document({
    styles:{
      default:{ document:{ run:{ font:'Aptos', size:22, color:'25231F' }, paragraph:{ spacing:{ after:150, line:310 } } } },
      paragraphStyles:[
        { id:'Title',name:'Title',basedOn:'Normal',next:'Normal',run:{font:'Aptos Display',size:40,bold:true,color:'171512'},paragraph:{alignment:AlignmentType.CENTER,spacing:{after:160}} },
        { id:'Heading1',name:'Heading 1',basedOn:'Normal',next:'Normal',quickFormat:true,run:{font:'Aptos',size:25,bold:true,color:'8F6E38',allCaps:true},paragraph:{spacing:{before:320,after:130},border:{bottom:{color:'C9B282',style:BorderStyle.SINGLE,size:5,space:5}}} },
        { id:'Heading2',name:'Heading 2',basedOn:'Normal',next:'Normal',quickFormat:true,run:{font:'Aptos',size:23,bold:true,color:'25231F'},paragraph:{spacing:{before:220,after:100}} },
        { id:'Quote',name:'Sermon Quote',basedOn:'Normal',next:'Normal',run:{font:'Georgia',size:23,italics:true,color:'6F5630'},paragraph:{indent:{left:420,right:420},spacing:{before:180,after:200}} },
      ],
    },
    sections:[{ properties:{ page:{ margin:{top:900,right:900,bottom:900,left:900} } }, children:docxChildren(notes, source) }],
  })
  return Packer.toBuffer(doc)
}

function pdfText(doc, text, options = {}) {
  if (!clean(text)) return
  doc.font(options.bold ? 'Helvetica-Bold' : options.italic ? 'Times-Italic' : 'Helvetica')
    .fontSize(options.size || 11.5).fillColor(options.color || '#292722')
    .text(clean(text), { align:options.align || 'left', lineGap:options.lineGap ?? 3.5, indent:options.indent || 0 })
  doc.moveDown(options.after ?? .65)
}

export async function buildSermonPdf(notes, source) {
  const doc = new PDFDocument({ size:'LETTER', margins:{top:54,bottom:72,left:58,right:58}, bufferPages:true, info:{Title:clean(notes.documentTitle || notes.title || source.title || 'Sermon Teaching Notes'),Author:clean(notes.preacherTeacher || 'Church Triumphant')} })
  const chunks=[]
  doc.on('data',chunk=>chunks.push(chunk))
  const title=clean(notes.documentTitle || notes.title || source.title || 'Sermon Teaching Notes')
  pdfText(doc,'CHURCH TRIUMPHANT',{bold:true,size:10,color:'#9B7538',align:'center',after:.2})
  pdfText(doc,'TEACHING DOCUMENT',{bold:true,size:8,color:'#66615A',align:'center',after:1.2})
  pdfText(doc,title.toUpperCase(),{bold:true,size:20,align:'center',after:.7})
  if(notes.subtitle) pdfText(doc,notes.subtitle,{italic:true,size:12.5,color:'#514D46',align:'center',after:.7})
  const metadata=[notes.series&&`Series: ${notes.series}`,notes.part&&`Part: ${notes.part}`,(notes.preacherTeacher||source.preacherTeacher)&&`Preacher/Teacher: ${notes.preacherTeacher||source.preacherTeacher}`,(notes.service||source.serviceType)&&`Service: ${notes.service||source.serviceType}`,(notes.sermonDate||source.sermonDate)&&`Date: ${notes.sermonDate||source.sermonDate}`].filter(Boolean)
  metadata.forEach(line=>pdfText(doc,line,{size:9.5,color:'#66615A',align:'center',after:.1}))
  if(notes.leadQuote){doc.moveDown(.8);pdfText(doc,`“${clean(notes.leadQuote).replace(/^['“"]|['”"]$/g,'')}”`,{italic:true,size:12,color:'#6F5630',align:'center',after:1})}
  normalizeSermonSections(notes).forEach(([heading,items])=>{
    if(doc.y>690)doc.addPage()
    pdfText(doc,heading,{bold:true,size:13,color:'#8F6E38',after:.5})
    doc.moveTo(doc.x,doc.y-3).lineTo(554,doc.y-3).strokeColor('#D4C29D').lineWidth(.6).stroke();doc.moveDown(.35)
    items.forEach(item=>{
      if(doc.y>650)doc.addPage()
      const titleText=objectTitle(item)
      if(titleText)pdfText(doc,titleText,{bold:true,size:11.5,after:.3})
      const paragraphs=sermonItemParagraphs(item)
      if(!titleText&&typeof item==='string')pdfText(doc,`${['KINGDOM PRINCIPLES','REFLECTION QUESTIONS'].includes(heading)?'•  ':''}${item}`,{indent:['KINGDOM PRINCIPLES','REFLECTION QUESTIONS'].includes(heading)?10:0})
      else paragraphs.forEach(text=>pdfText(doc,`${['PRACTICAL APPLICATION','WEEKLY CHARGE'].includes(heading)?'•  ':''}${text}`,{indent:['PRACTICAL APPLICATION','WEEKLY CHARGE'].includes(heading)?10:0}))
      values(item?.quotes).forEach(quote=>pdfText(doc,`“${clean(quote).replace(/^['“"]|['”"]$/g,'')}”`,{italic:true,size:11,color:'#6F5630',indent:18}))
    })
  })
  const pages=doc.bufferedPageRange()
  for(let i=0;i<pages.count;i++){
    doc.switchToPage(i)
    const bottomMargin=doc.page.margins.bottom
    doc.page.margins.bottom=0
    doc.font('Helvetica').fontSize(8).fillColor('#77726A').text(`Church Triumphant · ${i+1} of ${pages.count}`,58,758,{width:496,align:'center',lineBreak:false})
    doc.page.margins.bottom=bottomMargin
  }
  doc.end()
  await new Promise((resolve,reject)=>{doc.on('end',resolve);doc.on('error',reject)})
  return Buffer.concat(chunks)
}

export const handler = async event => {
  try {
    const session=await readSession(event).catch(()=>null)
    if(!session)return json(401,{error:'Sign in to access the sermon repository.'})
    const dataStore=store()
    if(event.httpMethod==='GET'){
      const params=event.queryStringParameters||{}
      if(params.id&&['docx','pdf'].includes(params.format)){
        const bytes=await dataStore.get(fileKey(params.id,params.format),{type:'arrayBuffer'}).catch(()=>null)
        if(!bytes)return json(404,{error:'That sermon document was not found.'})
        const ext=params.format
        return {statusCode:200,isBase64Encoded:true,headers:{'content-type':ext==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','content-disposition':`attachment; filename="${params.id}.${ext}"`,'cache-control':'private, no-store'},body:Buffer.from(bytes).toString('base64')}
      }
      const entries=await dataStore.get(indexKey,{type:'json'}).catch(()=>[])
      return json(200,{documents:Array.isArray(entries)?entries:[]})
    }
    if(event.httpMethod!=='POST')return json(405,{error:'Method not allowed.'})
    let body={}
    try{body=JSON.parse(event.body||'{}')}catch{return json(400,{error:'Invalid request body.'})}
    const notes=body.notes||{}
    const source=body.source||{}
    const title=clean(notes.documentTitle||notes.title||source.title)
    if(!title)return json(400,{error:'Generated sermon notes need a title before they can be archived.'})
    const id=`${clean(source.sermonDate)||new Date().toISOString().slice(0,10)}-${slugify(title)}`
    const [docx,pdf]=await Promise.all([buildSermonDocx(notes,source),buildSermonPdf(notes,source)])
    await Promise.all([dataStore.set(fileKey(id,'docx'),docx),dataStore.set(fileKey(id,'pdf'),pdf)])
    const prior=await dataStore.get(indexKey,{type:'json'}).catch(()=>[])
    let oneDrive={state:'not-connected'}
    if(await getOneDriveConnection()){
      try{oneDrive=await publishSermonDocuments({docx,pdf,baseName:id})}
      catch(error){console.error('[sermon-documents onedrive]',error);oneDrive={state:'error',error:error.message||'OneDrive publishing failed.'}}
    }
    const entry={id,title,sermonDate:clean(source.sermonDate),serviceType:clean(source.serviceType),preacherTeacher:clean(notes.preacherTeacher),updatedAt:new Date().toISOString(),updatedBy:session.member,files:{docx:`/.netlify/functions/sermon-documents?id=${encodeURIComponent(id)}&format=docx`,pdf:`/.netlify/functions/sermon-documents?id=${encodeURIComponent(id)}&format=pdf`},oneDrive}
    const entries=[entry,...(Array.isArray(prior)?prior:[]).filter(item=>item.id!==id)].slice(0,200)
    await dataStore.setJSON(indexKey,entries)
    return json(200,{document:entry})
  } catch(error) {
    console.error('[sermon-documents]',error)
    return json(500,{error:'Brevity could not create or archive the sermon documents.'})
  }
}
