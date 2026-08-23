import pptxgen from 'pptxgenjs'

const clean=value=>String(value||'').replace(/\s+/g,' ').trim()
const values=value=>Array.isArray(value)?value.filter(Boolean):value?[value]:[]
const itemText=item=>typeof item==='string'?clean(item):clean([item?.title,item?.description,...values(item?.paragraphs),...values(item?.steps)].filter(Boolean).join(' — '))
const short=(value,max=175)=>{const text=clean(value);return text.length<=max?text:`${text.slice(0,max-1).replace(/\s+\S*$/,'')}…`}
export const sermonSlidesFileName=(notes={},source={})=>{const title=clean(notes.documentTitle||notes.title||source.title||'Sermon').replace(/\s+(?:Sermon\s+)?Teaching\s+Guide$/i,'');const match=clean(source.sermonDate||notes.sermonDate).match(/^(\d{4})-(\d{2})-(\d{2})$/);const date=match?`${match[2]}.${match[3]}.${match[1]}`:clean(source.sermonDate||notes.sermonDate);return `${date?`${date} - `:''}${title} Sermon Slides.pptx`}

export function buildSermonSlideSpecs(notes={},source={}){
  const title=clean(notes.documentTitle||notes.title||source.title||'Sermon Teaching')
  const subtitle=clean(notes.subtitle)
  const scripture=values(notes.primaryScriptures).slice(0,3).map(item=>typeof item==='string'?item:clean(item.reference)).filter(Boolean).join(' · ')
  const movements=values(notes.detailedExposition).slice(0,3)
  const framework=values(notes.architecturalFrameworks)[0]
  const application=values(notes.practicalApplication)[0]
  const slides=[
    {kind:'title',title,body:subtitle||clean(notes.thesis),notes:clean(notes.aim),visual:`A cinematic photorealistic scene expressing the sermon theme “${title}”, reverent Christian teaching atmosphere, warm natural light, rich detail, realistic people or symbolic environment as appropriate, no words, no lettering, no logos, wide 16:9 composition with clean negative space for title text`},
    {kind:'statement',eyebrow:'GOVERNING TRUTH',title:short(notes.anchorDeclaration||notes.thesis,120),body:short(notes.governingQuestion,150),notes:clean(notes.thesis),visual:`Photorealistic visual metaphor for this governing truth: ${clean(notes.anchorDeclaration||notes.thesis)}. Sacred, grounded, emotionally resonant, cinematic light, realistic textures, no words or lettering, wide 16:9`},
  ]
  if(scripture)slides.push({kind:'scripture',eyebrow:'SCRIPTURE FOUNDATION',title:scripture,body:short(values(notes.primaryScriptures)[0]?.explanation||'',180),notes:values(notes.primaryScriptures).map(item=>typeof item==='string'?item:`${item.reference}: ${item.explanation}`).join('\n'),visual:`Photorealistic open Bible in an authentic lived setting corresponding to the sermon “${title}”, dawn light, contemplative reverence, cinematic realism, no readable text on pages, no lettering, wide 16:9`})
  movements.forEach((movement,index)=>slides.push({kind:'movement',eyebrow:`TEACHING MOVEMENT ${index+1}`,title:clean(movement.title)||`Movement ${index+1}`,body:short(values(movement.paragraphs)[0],185),notes:[...values(movement.paragraphs),...values(movement.quotes)].join('\n\n'),visual:`Photorealistic cinematic scene illustrating this sermon teaching: ${itemText(movement)}. Theologically respectful, contemporary human realism or symbolic natural imagery, emotionally authentic, dramatic but natural lighting, no words, no lettering, wide 16:9`}))
  if(framework)slides.push({kind:'framework',eyebrow:'FORMATION FRAMEWORK',title:clean(framework.title),body:values(framework.items).slice(0,5).map(item=>clean(item.label)).filter(Boolean).join('  →  '),notes:itemText(framework),visual:`Photorealistic visual journey showing progressive spiritual formation based on: ${itemText(framework)}. One coherent cinematic scene, believable people and environment, depth and forward movement, no infographic, no words, no lettering, wide 16:9`})
  if(application)slides.push({kind:'application',eyebrow:'PUT THE WORD INTO PRACTICE',title:clean(application.title)||'Faith Becomes Practice',body:short(values(application.steps)[0]||values(application.paragraphs)[0],190),notes:itemText(application),visual:`Photorealistic scene of a person or family practicing this concrete sermon application: ${itemText(application)}. Hopeful, practical, authentic daily life, cinematic natural light, no words, no lettering, wide 16:9`})
  slides.push({kind:'closing',eyebrow:'CHURCH TRIUMPHANT',title:short(notes.closingCommission||notes.weeklyCharge?.quote||'Receive the Word. Practice the Word. Bear fruit.',125),body:short(notes.weeklyCharge?.title||'',120),notes:itemText(notes.weeklyCharge),visual:`Photorealistic hopeful closing scene for the sermon “${title}”, diverse church community moving forward in faith and obedience, luminous sunrise or golden-hour light, cinematic realism, no words, no lettering, wide 16:9`})
  return slides.slice(0,10)
}

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
