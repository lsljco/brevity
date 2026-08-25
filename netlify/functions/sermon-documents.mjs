import { getStore } from '@netlify/blobs'
import {
  AlignmentType, BorderStyle, Document, HeadingLevel, Packer, Paragraph,
  ShadingType, Table, TableCell, TableRow, TextRun, VerticalAlign, WidthType,
} from 'docx'
import PDFDocument from 'pdfkit'
import householdAuth from './household-auth.js'
import { getOneDriveConnection, publishSermonDocuments, publishSevenDayDevotions } from '../lib/onedrive.mjs'
import { buildSevenDayDevotionsPdf } from '../lib/devotion-document.mjs'
import { normalizeSermonSections, sermonGuideBaseName, sermonItemParagraphs } from '../lib/sermon-document-model.mjs'

export { normalizeSermonSections, sermonGuideBaseName, sermonItemParagraphs }

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
function objectTitle(item) { return clean(item?.title || item?.reference || item?.label) }

const bodyParagraph = (text, options = {}) => new Paragraph({
  text:clean(text), bullet:options.bullet ? { level:0 } : undefined,
  spacing:{ after:120, line:278 },
  style:options.quote ? 'Quote' : undefined,
})
const cell=(text,{header=false,width}={})=>new TableCell({width:width?{size:width,type:WidthType.DXA}:undefined,verticalAlign:VerticalAlign.CENTER,shading:header?{type:ShadingType.CLEAR,fill:'16324F',color:'auto'}:undefined,margins:{top:100,bottom:100,left:120,right:120},children:[new Paragraph({spacing:{after:0,line:240},children:[new TextRun({text:clean(text),bold:header,color:header?'FFFFFF':'1B1F23',font:'Book Antiqua',size:header?20:19})]})]})
const gridTable=(headers,rows,widths)=>new Table({width:{size:9760,type:WidthType.DXA},columnWidths:widths,rows:[new TableRow({tableHeader:true,children:headers.map((text,index)=>cell(text,{header:true,width:widths[index]}))}),...rows.map(row=>new TableRow({children:row.map((text,index)=>cell(text,{width:widths[index]}))}))]})
const callout=(label,text)=>new Table({width:{size:9760,type:WidthType.DXA},columnWidths:[9760],rows:[new TableRow({children:[new TableCell({shading:{type:ShadingType.CLEAR,fill:'EAF1F5',color:'auto'},margins:{top:170,bottom:170,left:190,right:190},children:[new Paragraph({spacing:{after:0,line:260},children:[new TextRun({text:`${label.toUpperCase()}  `,bold:true,color:'B28A3B',font:'Book Antiqua',size:20}),new TextRun({text:clean(text),bold:true,color:'16324F',font:'Book Antiqua',size:21})]})]})]})]})

function docxChildren(notes, source) {
  const title = clean(notes.documentTitle || notes.title || source.title || 'Sermon Teaching Notes')
  const children = [
    new Paragraph({ alignment:AlignmentType.CENTER, spacing:{before:1600,after:0}, children:[new TextRun({ text:'CHURCH TRIUMPHANT', bold:true, color:'B28A3B', size:22, characterSpacing:140,font:'Book Antiqua' })] }),
    new Paragraph({ alignment:AlignmentType.CENTER, spacing:{before:440,after:160}, children:[new TextRun({ text:title.toUpperCase(), bold:true, size:60, font:'Book Antiqua',color:'16324F' })] }),
  ]
  const subtitle = clean(notes.subtitle)
  if (subtitle) children.push(new Paragraph({ alignment:AlignmentType.CENTER, spacing:{after:440}, children:[new TextRun({ text:subtitle, italics:true, size:32, font:'Book Antiqua',color:'2E5E7E' })] }))
  children.push(new Paragraph({alignment:AlignmentType.CENTER,spacing:{after:60},children:[new TextRun({text:'Sermon Teaching Guide',bold:true,size:26,font:'Book Antiqua',color:'16324F'})]}))
  const metadata = [notes.series && `Series: ${notes.series}`, notes.part && `Part: ${notes.part}`, (notes.preacherTeacher || source.preacherTeacher) && `Preacher/Teacher: ${notes.preacherTeacher || source.preacherTeacher}`, (notes.service || source.serviceType) && `Service: ${notes.service || source.serviceType}`, (notes.sermonDate || source.sermonDate) && `Date: ${notes.sermonDate || source.sermonDate}`].filter(Boolean)
  metadata.forEach(line => children.push(new Paragraph({ alignment:AlignmentType.CENTER, spacing:{after:60}, children:[new TextRun({text:line,size:20,font:'Book Antiqua',color:'5D6770'})] })))
  if (notes.leadQuote) children.push(new Paragraph({ style:'Quote', spacing:{before:260,after:260}, children:[new TextRun({ text:`“${clean(notes.leadQuote).replace(/^['“"]|['”"]$/g,'')}”`, italics:true, size:23, color:'2E5E7E',font:'Book Antiqua' })] }))
  children.push(new Paragraph({pageBreakBefore:true,text:'Teaching Guide at a Glance',style:'Title'}))
  if(values(notes.teachingObjectives).length){children.push(new Paragraph({text:'Teaching Objectives',heading:HeadingLevel.HEADING_1}));values(notes.teachingObjectives).forEach(item=>children.push(bodyParagraph(item,{bullet:true})))}
  if(notes.anchorDeclaration)children.push(callout('Anchor Declaration',notes.anchorDeclaration))
  const primary=values(notes.primaryScriptures).map(item=>typeof item==='string'?[item,'']:[item.reference,item.explanation])
  if(primary.length){children.push(new Paragraph({text:'Core Scripture Map',heading:HeadingLevel.HEADING_1}));children.push(gridTable(['Text','Contribution to the Teaching'],primary,[2050,7710]))}

  normalizeSermonSections(notes).forEach(([heading, items]) => {
    if(['TEACHING OBJECTIVES','ANCHOR DECLARATION','PRIMARY SCRIPTURES'].includes(heading))return
    children.push(new Paragraph({ text:heading.replace(/\b\w/g,char=>char.toUpperCase()).replace(/\bAnd\b/g,'and'), heading:HeadingLevel.HEADING_1, pageBreakBefore:['DETAILED EXPOSITION','PRACTICAL APPLICATION','PRAYER'].includes(heading) }))
    items.forEach((item, index) => {
      const titleText = objectTitle(item)
      if (titleText) children.push(new Paragraph({ text:heading==='DETAILED EXPOSITION'?`${index+1}. ${titleText}`:titleText, style:heading==='DETAILED EXPOSITION'?'Title':'Heading2' }))
      const paragraphs = sermonItemParagraphs(item,false)
      if (!titleText && typeof item === 'string') children.push(bodyParagraph(item, { bullet:['TEACHING OBJECTIVES','KINGDOM PRINCIPLES','MEMORABLE LINES','PASTORAL GUARDRAILS','REFLECTION QUESTIONS','PERSONAL CLOSING RESPONSE'].includes(heading) }))
      else paragraphs.forEach(text => children.push(bodyParagraph(text, { bullet:['PRACTICAL APPLICATION','DIAGNOSTIC WORKSHEETS','SEVEN-DAY MEDITATION AND FORMATION PLAN','SMALL-GROUP TEACHING PLAN','WEEKLY CHARGE'].includes(heading) })))
      values(item?.quotes).forEach(quote => children.push(bodyParagraph(`“${clean(quote).replace(/^['“"]|['”"]$/g,'')}”`, { quote:true })))
      if(values(item?.items).length&&typeof item?.items?.[0]==='object')children.push(gridTable(['Element','Teaching Focus'],item.items.map(value=>[value.label||value.stage,value.detail||'']),[2050,7710]))
      if (heading === 'SCRIPTURE INDEX' && index === items.length - 1) children.push(new Paragraph({text:''}))
    })
  })
  return children
}

export async function buildSermonDocx(notes, source) {
  const doc = new Document({
    styles:{
      default:{ document:{ run:{ font:'Book Antiqua', size:21, color:'1B1F23' }, paragraph:{ spacing:{ after:120, line:278 } } } },
      paragraphStyles:[
        { id:'Title',name:'Title',basedOn:'Normal',next:'Normal',run:{font:'Book Antiqua',size:52,bold:true,color:'17365D'},paragraph:{spacing:{before:280,after:300,line:240},keepNext:true} },
        { id:'Heading1',name:'Heading 1',basedOn:'Normal',next:'Normal',quickFormat:true,run:{font:'Book Antiqua',size:36,bold:true,color:'16324F'},paragraph:{spacing:{before:320,after:160},keepNext:true,border:{bottom:{color:'B28A3B',style:BorderStyle.SINGLE,size:5,space:5}}} },
        { id:'Heading2',name:'Heading 2',basedOn:'Normal',next:'Normal',quickFormat:true,run:{font:'Book Antiqua',size:28,bold:true,color:'2E5E7E'},paragraph:{spacing:{before:240,after:120},keepNext:true} },
        { id:'Quote',name:'Sermon Quote',basedOn:'Normal',next:'Normal',run:{font:'Book Antiqua',size:22,italics:true,color:'2E5E7E'},paragraph:{indent:{left:420,right:420},spacing:{before:180,after:200}} },
      ],
    },
    sections:[{ properties:{ page:{ margin:{top:1120,right:1240,bottom:1120,left:1240} } }, children:docxChildren(notes, source) }],
  })
  return Packer.toBuffer(doc)
}

function pdfText(doc, text, options = {}) {
  if (!clean(text)) return
  doc.font(options.bold ? 'Times-Bold' : options.italic ? 'Times-Italic' : 'Times-Roman')
    .fontSize(options.size || 11.5).fillColor(options.color || '#292722')
    .text(clean(text), { align:options.align || 'left', lineGap:options.lineGap ?? 3.5, indent:options.indent || 0 })
  doc.moveDown(options.after ?? .65)
}
function pdfCallout(doc,label,text){const left=doc.page.margins.left,width=doc.page.width-left-doc.page.margins.right;const content=`${label.toUpperCase()}  ${clean(text)}`;const height=doc.heightOfString(content,{width:width-26,lineGap:3})+24;if(doc.y+height>doc.page.height-doc.page.margins.bottom)doc.addPage();const y=doc.y;doc.roundedRect(left,y,width,height,3).fill('#EAF1F5');doc.font('Times-Bold').fontSize(11).fillColor('#16324F').text(content,left+13,y+12,{width:width-26,lineGap:3});doc.x=left;doc.y=y+height+12}
function pdfTable(doc,headers,rows,widths){const left=doc.page.margins.left,total=widths.reduce((sum,value)=>sum+value,0),available=doc.page.width-left-doc.page.margins.right,scaled=widths.map(value=>value/total*available);const drawRow=(row,header=false)=>{const heights=row.map((value,index)=>doc.font(header?'Times-Bold':'Times-Roman').fontSize(header?10:9.5).heightOfString(clean(value),{width:scaled[index]-14,lineGap:2}));const height=Math.max(28,...heights.map(value=>value+14));if(doc.y+height>doc.page.height-doc.page.margins.bottom){doc.addPage();if(!header)drawRow(headers,true)}let x=left,y=doc.y;row.forEach((value,index)=>{doc.rect(x,y,scaled[index],height).fillAndStroke(header?'#16324F':'#FFFFFF','#B8C3CB');doc.font(header?'Times-Bold':'Times-Roman').fontSize(header?10:9.5).fillColor(header?'#FFFFFF':'#1B1F23').text(clean(value),x+7,y+7,{width:scaled[index]-14,lineGap:2});x+=scaled[index]});doc.x=left;doc.y=y+height};drawRow(headers,true);rows.forEach(row=>drawRow(row));doc.x=left;doc.moveDown(.7)}

export async function buildSermonPdf(notes, source) {
  const doc = new PDFDocument({ size:'LETTER', margins:{top:56,bottom:56,left:62,right:62}, bufferPages:true, info:{Title:clean(notes.documentTitle || notes.title || source.title || 'Sermon Teaching Notes'),Author:clean(notes.preacherTeacher || 'Church Triumphant')} })
  const chunks=[]
  doc.on('data',chunk=>chunks.push(chunk))
  const title=clean(notes.documentTitle || notes.title || source.title || 'Sermon Teaching Notes')
  doc.moveDown(5)
  pdfText(doc,'CHURCH TRIUMPHANT',{bold:true,size:11,color:'#B28A3B',align:'center',after:1.5})
  pdfText(doc,title.toUpperCase(),{bold:true,size:30,color:'#16324F',align:'center',after:.7})
  if(notes.subtitle) pdfText(doc,notes.subtitle,{italic:true,size:16,color:'#2E5E7E',align:'center',after:1.5})
  pdfText(doc,'Sermon Teaching Guide',{bold:true,size:13,color:'#16324F',align:'center',after:.3})
  const metadata=[notes.series&&`Series: ${notes.series}`,notes.part&&`Part: ${notes.part}`,(notes.preacherTeacher||source.preacherTeacher)&&`Preacher/Teacher: ${notes.preacherTeacher||source.preacherTeacher}`,(notes.service||source.serviceType)&&`Service: ${notes.service||source.serviceType}`,(notes.sermonDate||source.sermonDate)&&`Date: ${notes.sermonDate||source.sermonDate}`].filter(Boolean)
  metadata.forEach(line=>pdfText(doc,line,{size:9.5,color:'#66615A',align:'center',after:.1}))
  if(notes.leadQuote){doc.moveDown(.8);pdfText(doc,`“${clean(notes.leadQuote).replace(/^['“"]|['”"]$/g,'')}”`,{italic:true,size:12,color:'#2E5E7E',align:'center',after:1})}
  doc.addPage();pdfText(doc,'Teaching Guide at a Glance',{bold:true,size:26,color:'#17365D',after:1})
  normalizeSermonSections(notes).forEach(([heading,items])=>{
    if(doc.y>620)doc.addPage()
    pdfText(doc,heading.replace(/\b\w/g,char=>char.toUpperCase()).replace(/\bAnd\b/g,'and'),{bold:true,size:18,color:'#16324F',after:.5})
    doc.moveTo(doc.x,doc.y-3).lineTo(550,doc.y-3).strokeColor('#B28A3B').lineWidth(.8).stroke();doc.moveDown(.35)
    if(heading==='PRIMARY SCRIPTURES'){pdfTable(doc,['Text','Contribution to the Teaching'],items.map(value=>{const parts=clean(value).split(/\s+[—-]\s+/,2);return[parts[0],parts[1]||'']}),[1.35,5.05]);return}
    items.forEach(item=>{
      if(doc.y>650)doc.addPage()
      const titleText=objectTitle(item)
      if(titleText)pdfText(doc,heading==='DETAILED EXPOSITION'?`${items.indexOf(item)+1}. ${titleText}`:titleText,{bold:true,size:heading==='DETAILED EXPOSITION'?16:14,color:heading==='DETAILED EXPOSITION'?'#17365D':'#2E5E7E',after:.3})
      const paragraphs=sermonItemParagraphs(item,false)
      const bulletHeading=['TEACHING OBJECTIVES','KINGDOM PRINCIPLES','MEMORABLE LINES','PASTORAL GUARDRAILS','REFLECTION QUESTIONS','PERSONAL CLOSING RESPONSE'].includes(heading)
      const stepHeading=['PRACTICAL APPLICATION','DIAGNOSTIC WORKSHEETS','SEVEN-DAY MEDITATION AND FORMATION PLAN','SMALL-GROUP TEACHING PLAN','WEEKLY CHARGE'].includes(heading)
      if(heading==='ANCHOR DECLARATION'&&typeof item==='string')pdfCallout(doc,'Anchor Declaration',item)
      else if(!titleText&&typeof item==='string')pdfText(doc,`${bulletHeading?'•  ':''}${item}`,{indent:bulletHeading?10:0})
      else paragraphs.forEach(text=>pdfText(doc,`${stepHeading?'•  ':''}${text}`,{indent:stepHeading?10:0}))
      values(item?.quotes).forEach(quote=>pdfText(doc,`“${clean(quote).replace(/^['“"]|['”"]$/g,'')}”`,{italic:true,size:11,color:'#6F5630',indent:18}))
      if(values(item?.items).length&&typeof item.items[0]==='object')pdfTable(doc,['Element','Teaching Focus'],item.items.map(value=>[value.label||value.stage,value.detail||'']),[1.35,5.05])
    })
  })
  const pages=doc.bufferedPageRange()
  for(let i=0;i<pages.count;i++){
    doc.switchToPage(i)
    const bottomMargin=doc.page.margins.bottom
    doc.page.margins.bottom=0
    doc.font('Times-Roman').fontSize(8).fillColor('#5D6770').text(`Church Triumphant · ${i+1} of ${pages.count}`,62,758,{width:488,align:'center',lineBreak:false})
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
        const entries=await dataStore.get(indexKey,{type:'json'}).catch(()=>[])
        const entry=(Array.isArray(entries)?entries:[]).find(item=>item.id===params.id)
        const filename=clean(entry?.fileNames?.[ext]||`${params.id}.${ext}`).replace(/["\r\n]/g,'')
        return {statusCode:200,isBase64Encoded:true,headers:{'content-type':ext==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','content-disposition':`attachment; filename="${filename}"`,'cache-control':'private, no-store'},body:Buffer.from(bytes).toString('base64')}
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
    const baseName=sermonGuideBaseName(title,source.sermonDate||notes.sermonDate)
    const [docx,pdf]=await Promise.all([buildSermonDocx(notes,source),buildSermonPdf(notes,source)])
    await Promise.all([dataStore.set(fileKey(id,'docx'),docx),dataStore.set(fileKey(id,'pdf'),pdf)])
    const prior=await dataStore.get(indexKey,{type:'json'}).catch(()=>[])
    let oneDrive={state:'not-connected'}
    if(await getOneDriveConnection()){
      try{
        oneDrive=await publishSermonDocuments({docx,pdf,baseName})
        if(values(notes.sevenDayFormationPlan).length){
          try{
            const devotionPdf=await buildSevenDayDevotionsPdf(notes,source)
            oneDrive.devotions=await publishSevenDayDevotions({pdf:devotionPdf,baseName})
          }catch(error){
            console.error('[sermon-documents devotions onedrive]',error)
            oneDrive.devotions={state:'error',error:error.message||'OneDrive devotion publishing failed.'}
          }
        }
      }
      catch(error){console.error('[sermon-documents onedrive]',error);oneDrive={state:'error',error:error.message||'OneDrive publishing failed.'}}
    }
    const entry={id,title,baseName,fileNames:{docx:`${baseName}.docx`,pdf:`${baseName}.pdf`},sermonDate:clean(source.sermonDate),serviceType:clean(source.serviceType),preacherTeacher:clean(notes.preacherTeacher),updatedAt:new Date().toISOString(),updatedBy:session.member,files:{docx:`/.netlify/functions/sermon-documents?id=${encodeURIComponent(id)}&format=docx`,pdf:`/.netlify/functions/sermon-documents?id=${encodeURIComponent(id)}&format=pdf`},oneDrive}
    const entries=[entry,...(Array.isArray(prior)?prior:[]).filter(item=>item.id!==id)].slice(0,200)
    await dataStore.setJSON(indexKey,entries)
    return json(200,{document:entry})
  } catch(error) {
    console.error('[sermon-documents]',error)
    return json(500,{error:'Brevity could not create or archive the sermon documents.'})
  }
}
