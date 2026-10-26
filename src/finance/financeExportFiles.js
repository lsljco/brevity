import {csvText} from './financeExportData.js'
const xml=value=>String(value??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]))
const col=index=>{let s='';for(let n=index+1;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s}
export async function xlsxBytes(report){
 const {default:JSZip}=await import('jszip'),zip=new JSZip(),sections=[{title:'Report information',columns:[{label:'Report'}],rows:[[report.title],...(report.notes||[]).map(note=>[note])]},...report.sections]
 const names=new Set();const sheets=sections.map((s,index)=>{let base=String(s.title||`Sheet ${index+1}`).replace(/[\\/?*\[\]:]/g,' ').slice(0,26),name=base,n=1;while(names.has(name.toLowerCase()))name=`${base} ${++n}`;names.add(name.toLowerCase());return {...s,name}})
 zip.file('[Content_Types].xml',`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`)
 zip.file('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
 zip.file('xl/workbook.xml',`<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s,i)=>`<sheet name="${xml(s.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`)
 zip.file('xl/_rels/workbook.xml.rels',`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}</Relationships>`)
 sheets.forEach((s,i)=>{const rows=[s.columns.map(c=>c.label),...s.rows];zip.file(`xl/worksheets/sheet${i+1}.xml`,`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" state="frozen"/></sheetView></sheetViews><cols>${s.columns.map((_,c)=>`<col min="${c+1}" max="${c+1}" width="26" customWidth="1"/>`).join('')}</cols><sheetData>${rows.map((row,r)=>`<row r="${r+1}">${row.map((value,c)=>typeof value==='number'&&Number.isFinite(value)?`<c r="${col(c)}${r+1}"><v>${value}</v></c>`:`<c r="${col(c)}${r+1}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`).join('')}</row>`).join('')}</sheetData><autoFilter ref="A1:${col(Math.max(0,s.columns.length-1))}${rows.length}"/></worksheet>`)});
 return zip.generateAsync({type:'uint8array',compression:'DEFLATE'})
}
export async function pdfBytes(report){
 const {default:PDFDocument}=await import('pdfkit/js/pdfkit.standalone.js')
 const doc=new PDFDocument({size:'A4',layout:'landscape',margin:32,bufferPages:true,info:{Title:report.title,Author:'Brevity'}}),chunks=[]
 const done=new Promise((resolve,reject)=>{doc.on('data',chunk=>chunks.push(chunk));doc.on('error',reject);doc.on('end',()=>{const result=new Uint8Array(chunks.reduce((n,c)=>n+c.length,0));let offset=0;chunks.forEach(c=>{result.set(c,offset);offset+=c.length});resolve(result)})})
 doc.fontSize(18).text(report.title);doc.moveDown(.4);doc.fontSize(9);for(const note of report.notes||[])doc.text(note);doc.moveDown()
 for(const section of report.sections){
  // Split wide reports into readable column bands, repeating their first identifying column.
  const bands=[];for(let i=0;i<section.columns.length;i+=i===0?6:5)bands.push(i===0?Array.from({length:Math.min(6,section.columns.length)},(_,n)=>n):[0,...Array.from({length:Math.min(5,section.columns.length-i)},(_,n)=>i+n)])
  for(const indices of bands){
   if(doc.y>doc.page.height-100)doc.addPage();doc.fontSize(12).text(section.title);doc.moveDown(.3)
   const width=(doc.page.width-64)/Math.max(1,indices.length),bottom=doc.page.height-45
   const draw=(values,header=false)=>{doc.fontSize(header?9:8);const texts=indices.map(i=>String(values[i]??''));let height=Math.max(18,...texts.map(t=>doc.heightOfString(t,{width:width-10})+10));if(doc.y+height>bottom){doc.addPage();doc.fontSize(12).text(`${section.title} (continued)`);doc.moveDown(.3);if(!header)draw(section.columns.map(c=>c.label),true)}
    // A long narrative cell can span pages without clipping.
    doc.fontSize(header?9:8);const y=doc.y;if(height>bottom-y){for(let j=0;j<texts.length;j++){doc.fontSize(9).text(`${section.columns[indices[j]].label}: ${texts[j]}`,32,doc.y,{width:doc.page.width-64});doc.moveDown(.4)}return}
    if(header)doc.rect(32,y,doc.page.width-64,height).fill('#e9e1d2');texts.forEach((t,j)=>doc.fillColor('#222222').text(t,32+j*width+4,y+5,{width:width-10}));doc.y=y+height;doc.moveTo(32,doc.y).lineTo(doc.page.width-32,doc.y).strokeColor('#dddddd').stroke();doc.x=32
   }
   draw(section.columns.map(c=>c.label),true);for(const row of section.rows)draw(row);if(!section.rows.length)doc.fontSize(9).text('No records in the selected scope.');doc.moveDown()
  }
 }
 const range=doc.bufferedPageRange();for(let i=0;i<range.count;i++){doc.switchToPage(i);doc.fontSize(8).fillColor('#666666').text(`Brevity · ${i+1} / ${range.count}`,32,doc.page.height-28,{lineBreak:false})}doc.end();return done
}
export async function downloadFinanceReport(report,format){
 const bytes=format==='xlsx'?await xlsxBytes(report):format==='pdf'?await pdfBytes(report):csvText(report)
 const mime={xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',pdf:'application/pdf',csv:'text/csv;charset=utf-8'}[format]
 const blob=new Blob([bytes],{type:mime}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`Brevity-${report.title.replace(/[^a-z0-9-]/gi,'-').replace(/-+/g,'-').slice(0,100)}.${format}`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)
}
