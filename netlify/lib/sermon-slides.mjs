import pptxgen from 'pptxgenjs'
import { buildSermonSlideSpecs, sermonSlidesFileName } from './sermon-slide-model.mjs'

export { buildSermonSlideSpecs, sermonSlidesFileName }

const clean=value=>String(value||'').replace(/\s+/g,' ').trim()

async function generateImage(prompt){
  const response=await fetch('https://api.openai.com/v1/images/generations',{method:'POST',headers:{authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({model:process.env.BREVITY_IMAGE_MODEL||'gpt-image-2',prompt,size:'1536x1024',quality:'medium',output_format:'png'})})
  const payload=await response.json().catch(()=>({}))
  if(!response.ok)throw new Error(payload.error?.message||`Image generation returned ${response.status}.`)
  const base64=payload.data?.[0]?.b64_json
  if(!base64)throw new Error('Image generation returned no image.')
  return `data:image/png;base64,${base64}`
}

async function mapLimited(items,limit,worker){const results=new Array(items.length);let cursor=0;await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(cursor<items.length){const index=cursor++;results[index]=await worker(items[index],index)}}));return results}

export async function buildSermonSlides(notes,source,onProgress=()=>{}){
  const specs=buildSermonSlideSpecs(notes,source)
  let completed=0
  const images=await mapLimited(specs,3,async spec=>{const image=await generateImage(spec.visual);completed+=1;await onProgress({completed,total:specs.length});return image})
  const pptx=new pptxgen();pptx.layout='LAYOUT_WIDE';pptx.author='Church Triumphant';pptx.subject='Sermon Teaching Slides';pptx.title=clean(notes.documentTitle||source.title||'Sermon Teaching Slides');pptx.company='Church Triumphant';pptx.lang='en-US';pptx.theme={headFontFace:'Book Antiqua',bodyFontFace:'Book Antiqua',lang:'en-US'}
  specs.forEach((spec,index)=>{const slide=pptx.addSlide();slide.background={color:'080706'};slide.addImage({data:images[index],x:0,y:0,w:13.333,h:7.5});slide.addShape(pptx.ShapeType.rect,{x:0,y:0,w:13.333,h:7.5,line:{color:'080706',transparency:100},fill:{color:'080706',transparency:spec.kind==='title'?34:28}});slide.addShape(pptx.ShapeType.rect,{x:0,y:0,w:6.9,h:7.5,line:{color:'080706',transparency:100},fill:{color:'080706',transparency:18}});if(spec.eyebrow)slide.addText(spec.eyebrow,{x:.72,y:.68,w:5.8,h:.3,fontFace:'Book Antiqua',fontSize:12,bold:true,color:'D6B775',charSpacing:2.2,margin:0,breakLine:false,fit:'shrink'});slide.addText(spec.title,{x:.72,y:spec.kind==='title'?3.65:2.35,w:6.1,h:spec.kind==='title'?1.55:1.7,fontFace:'Book Antiqua',fontSize:spec.kind==='title'?34:29,bold:true,color:'FFFFFF',margin:0,breakLine:false,fit:'shrink',valign:'mid'});if(spec.body)slide.addText(spec.body,{x:.75,y:spec.kind==='title'?5.35:4.25,w:5.75,h:1.2,fontFace:'Book Antiqua',fontSize:17,color:'F1EDE4',margin:0,breakLine:false,fit:'shrink',valign:'top'});slide.addShape(pptx.ShapeType.line,{x:.73,y:7.05,w:2.0,h:0,line:{color:'C5A46D',width:1.2}});slide.addText('CHURCH TRIUMPHANT',{x:.73,y:7.12,w:3.5,h:.18,fontFace:'Book Antiqua',fontSize:8,bold:true,color:'C5A46D',charSpacing:1.8,margin:0});if(typeof slide.addNotes==='function')slide.addNotes([spec.notes||spec.body||spec.title])})
  return {buffer:await pptx.write({outputType:'nodebuffer'}),slideCount:specs.length}
}
