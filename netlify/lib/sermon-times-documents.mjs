import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx'
import PDFDocument from 'pdfkit'
import { normalizeSermonSections, sermonGuideBaseName, sermonItemParagraphs } from './sermon-document-model.mjs'

const clean=value=>String(value||'').replace(/\s+/g,' ').trim()
const values=value=>Array.isArray(value)?value.filter(Boolean):value?[value]:[]
const objectTitle=item=>clean(item?.title||item?.reference||item?.label)

export { sermonGuideBaseName }

function docParagraph(text,{bold=false,italic=false,size=22,align=AlignmentType.LEFT,heading}={}){
  if(heading)return new Paragraph({text:clean(text),heading,spacing:{before:260,after:150}})
  return new Paragraph({alignment:align,spacing:{after:120,line:280},children:[new TextRun({text:clean(text),font:'Times New Roman',size,bold,italics:italic,color:'1F1F1F'})]})
}

function buildDocChildren(notes,source){
  const title=clean(notes.documentTitle||notes.title||source.title||'Sermon Teaching Guide')
  const children=[
    new Paragraph({alignment:AlignmentType.CENTER,spacing:{before:1100,after:260},children:[new TextRun({text:'CHURCH TRIUMPHANT',font:'Times New Roman',bold:true,size:22,color:'9B783E'})]}),
    new Paragraph({alignment:AlignmentType.CENTER,spacing:{after:180},children:[new TextRun({text:title.toUpperCase(),font:'Times New Roman',bold:true,size:54,color:'1F1F1F'})]}),
  ]
  if(notes.subtitle)children.push(docParagraph(notes.subtitle,{italic:true,size:28,align:AlignmentType.CENTER}))
  children.push(docParagraph('Sermon Teaching Guide',{bold:true,size:25,align:AlignmentType.CENTER}))
  const metadata=[notes.series&&`Series: ${notes.series}`,notes.part&&`Part: ${notes.part}`,(notes.preacherTeacher||source.preacherTeacher)&&`Preacher/Teacher: ${notes.preacherTeacher||source.preacherTeacher}`,(notes.service||source.serviceType)&&`Service: ${notes.service||source.serviceType}`,(notes.sermonDate||source.sermonDate)&&`Date: ${notes.sermonDate||source.sermonDate}`].filter(Boolean)
  metadata.forEach(line=>children.push(docParagraph(line,{size:19,align:AlignmentType.CENTER})))
  if(notes.leadQuote)children.push(docParagraph(`“${clean(notes.leadQuote).replace(/^['“"]|['”"]$/g,'')}”`,{italic:true,size:22,align:AlignmentType.CENTER}))
  children.push(new Paragraph({text:'Teaching Guide at a Glance',heading:HeadingLevel.TITLE,pageBreakBefore:true}))
  normalizeSermonSections(notes).forEach(([heading,items])=>{
    children.push(new Paragraph({text:heading.replace(/\b\w/g,char=>char.toUpperCase()),heading:HeadingLevel.HEADING_1,pageBreakBefore:['DETAILED EXPOSITION','PRACTICAL APPLICATION','PRAYER'].includes(heading)}))
    items.forEach((item,index)=>{
      const titleText=objectTitle(item)
      if(titleText)children.push(new Paragraph({text:heading==='DETAILED EXPOSITION'?`${index+1}. ${titleText}`:titleText,heading:HeadingLevel.HEADING_2}))
      if(typeof item==='string'&&!titleText)children.push(docParagraph(item))
      else sermonItemParagraphs(item,false).forEach(text=>children.push(docParagraph(text)))
      values(item?.quotes).forEach(quote=>children.push(docParagraph(`“${clean(quote).replace(/^['“"]|['”"]$/g,'')}”`,{italic:true})))
      values(item?.items).forEach(value=>{
        if(typeof value==='object')children.push(docParagraph(`${clean(value.label||value.stage)} — ${clean(value.detail||value.description)}`))
      })
    })
  })
  return children
}

export async function buildTimesSermonDocx(notes={},source={}){
  const doc=new Document({
    styles:{default:{document:{run:{font:'Times New Roman',size:22,color:'1F1F1F'},paragraph:{spacing:{after:120,line:280}}}},paragraphStyles:[
      {id:'Title',name:'Title',basedOn:'Normal',next:'Normal',run:{font:'Times New Roman',size:48,bold:true,color:'1F1F1F'},paragraph:{spacing:{before:260,after:240}}},
      {id:'Heading1',name:'Heading 1',basedOn:'Normal',next:'Normal',quickFormat:true,run:{font:'Times New Roman',size:34,bold:true,color:'1F1F1F'},paragraph:{spacing:{before:300,after:150},keepNext:true}},
      {id:'Heading2',name:'Heading 2',basedOn:'Normal',next:'Normal',quickFormat:true,run:{font:'Times New Roman',size:28,bold:true,color:'333333'},paragraph:{spacing:{before:220,after:110},keepNext:true}},
    ]},
    sections:[{properties:{page:{margin:{top:1080,right:1080,bottom:1080,left:1080}}},children:buildDocChildren(notes,source)}],
  })
  return Packer.toBuffer(doc)
}

function pdfLine(doc,text,{bold=false,italic=false,size=11.5,align='left',after=.55,color='#202020'}={}){
  if(!clean(text))return
  doc.font(bold?'Times-Bold':italic?'Times-Italic':'Times-Roman').fontSize(size).fillColor(color).text(clean(text),{align,lineGap:3.5})
  doc.moveDown(after)
}

export async function buildTimesSermonPdf(notes={},source={}){
  const title=clean(notes.documentTitle||notes.title||source.title||'Sermon Teaching Guide')
  const doc=new PDFDocument({size:'LETTER',margins:{top:56,bottom:56,left:62,right:62},bufferPages:true,info:{Title:title,Author:clean(notes.preacherTeacher||'Church Triumphant'),Subject:'Sermon Teaching Guide — Times New Roman standard'}})
  const chunks=[]
  doc.on('data',chunk=>chunks.push(chunk))
  doc.moveDown(4)
  pdfLine(doc,'CHURCH TRIUMPHANT',{bold:true,size:11,align:'center',color:'#9B783E',after:1})
  pdfLine(doc,title.toUpperCase(),{bold:true,size:29,align:'center',after:.6})
  if(notes.subtitle)pdfLine(doc,notes.subtitle,{italic:true,size:15,align:'center',after:1})
  pdfLine(doc,'Sermon Teaching Guide',{bold:true,size:13,align:'center',after:.25})
  const metadata=[notes.series&&`Series: ${notes.series}`,notes.part&&`Part: ${notes.part}`,(notes.preacherTeacher||source.preacherTeacher)&&`Preacher/Teacher: ${notes.preacherTeacher||source.preacherTeacher}`,(notes.service||source.serviceType)&&`Service: ${notes.service||source.serviceType}`,(notes.sermonDate||source.sermonDate)&&`Date: ${notes.sermonDate||source.sermonDate}`].filter(Boolean)
  metadata.forEach(line=>pdfLine(doc,line,{size:9.5,align:'center',color:'#66615A',after:.08}))
  if(notes.leadQuote){doc.moveDown(.7);pdfLine(doc,`“${clean(notes.leadQuote).replace(/^['“"]|['”"]$/g,'')}”`,{italic:true,size:12,align:'center',after:.8})}
  doc.addPage()
  normalizeSermonSections(notes).forEach(([heading,items])=>{
    if(doc.y>650)doc.addPage()
    pdfLine(doc,heading.replace(/\b\w/g,char=>char.toUpperCase()),{bold:true,size:18,after:.4})
    items.forEach((item,index)=>{
      if(doc.y>680)doc.addPage()
      const titleText=objectTitle(item)
      if(titleText)pdfLine(doc,heading==='DETAILED EXPOSITION'?`${index+1}. ${titleText}`:titleText,{bold:true,size:14,after:.25,color:'#333333'})
      if(typeof item==='string'&&!titleText)pdfLine(doc,item)
      else sermonItemParagraphs(item,false).forEach(text=>pdfLine(doc,text))
      values(item?.quotes).forEach(quote=>pdfLine(doc,`“${clean(quote).replace(/^['“"]|['”"]$/g,'')}”`,{italic:true}))
      values(item?.items).forEach(value=>{if(typeof value==='object')pdfLine(doc,`${clean(value.label||value.stage)} — ${clean(value.detail||value.description)}`)})
    })
  })
  const pages=doc.bufferedPageRange()
  for(let i=0;i<pages.count;i++){doc.switchToPage(i);const bottom=doc.page.margins.bottom;doc.page.margins.bottom=0;doc.font('Times-Roman').fontSize(8).fillColor('#66615A').text(`Church Triumphant · ${i+1} of ${pages.count}`,62,758,{width:488,align:'center',lineBreak:false});doc.page.margins.bottom=bottom}
  doc.end()
  await new Promise((resolve,reject)=>{doc.on('end',resolve);doc.on('error',reject)})
  return Buffer.concat(chunks)
}
