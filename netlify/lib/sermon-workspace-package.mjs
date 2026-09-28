import { createHash } from 'node:crypto'
const loadPptx=async()=> (await import('../../node_modules/pptxgenjs/dist/pptxgen.cjs.js')).default

export const householdId=process.env.BREVITY_HOUSEHOLD_ID||'lslj-family'
export const workspaceKey=`${householdId}/ministry/sermon-workspace/v1`
export const packageKey=id=>`${householdId}/ministry/sermon-workspace/packages/${id}`
export const pointerKey=id=>`${householdId}/ministry/sermon-workspace/package-pointers/${id}`
export const deckKey=id=>`${householdId}/ministry/sermon-workspace/decks/${id}.pptx`
export const safeId=value=>/^[a-zA-Z0-9_-]{1,100}$/.test(String(value||''))
export function sermonSourceHash(sermon){return createHash('sha256').update(JSON.stringify([sermon.title,sermon.bigIdea,sermon.scripture,sermon.outline,sermon.sourceNotes,sermon.version])).digest('hex')}
// Bump the production package identity when its asset contract changes so saved sermons
// receive the new drafts without editing the manuscript or overwriting an old job.
export const sermonJobId=(sermonId,hash)=>`job_${createHash('sha256').update(`social-v2:${sermonId}:${hash}`).digest('hex').slice(0,48)}`
const clean=(value,max)=>String(value||'').trim().slice(0,max)
export function normalizePackage(data){
 const notes=clean(data?.notes,25000)
 const quotes=(Array.isArray(data?.quotes)?data.quotes:[]).slice(0,12).map(item=>({text:clean(item?.text,600),sourceExcerpt:clean(item?.sourceExcerpt,800)})).filter(item=>item.text&&item.sourceExcerpt)
 const slides=(Array.isArray(data?.slides)?data.slides:[]).slice(0,16).map(item=>({title:clean(item?.title,140),body:clean(item?.body,700),scripture:clean(item?.scripture,160)})).filter(item=>item.title&&item.body)
 const posts=(Array.isArray(data?.posts)?data.posts:[]).slice(0,12).map(item=>({idea:clean(item?.idea,140),caption:clean(item?.caption,2200),sourceExcerpt:clean(item?.sourceExcerpt,800)})).filter(item=>item.idea&&item.caption.length>=80&&item.sourceExcerpt)
 if(notes.length<300||quotes.length<1||slides.length<2||posts.length<1)throw Error('The generated package was incomplete. Please retry.')
 return {notes,quotes,slides,posts}
}
export function applyPackage(workspace,sermonId,status,member,now=new Date()){
 const index=workspace.sermons.findIndex(item=>item.id===sermonId)
 if(index<0)throw Error('This sermon is no longer in the Workspace.')
 const sermon=workspace.sermons[index]
 if(sermonSourceHash(sermon)!==status.sourceHash)throw Error('The sermon changed after generation. Generate a new package for the current manuscript.')
 if(sermon.generationJobId===status.id)return workspace
 const stamp=now.toISOString(),assets=[...sermon.assets]
 const hasPriorPackageAssets=assets.some(item=>item.generatedBy==='workspace-package'&&item.sourceVersion===(sermon.version||1))
 if(!hasPriorPackageAssets){
  status.package.quotes.forEach((item,index)=>assets.push({id:`q_${status.id}_${index}`,type:'quotes',title:`Mic Drop ${index+1}`,content:`${item.text}\n\nSource excerpt: ${item.sourceExcerpt}`,status:'Draft',source:'Original material',sourceVersion:sermon.version||1,generatedBy:'workspace-package',updatedAt:stamp}))
  status.package.slides.forEach((item,index)=>assets.push({id:`s_${status.id}_${index}`,type:'slides',title:`Slide ${index+1}: ${item.title}`,content:`${item.body}${item.scripture?`\n\nScripture: ${item.scripture}`:''}`,status:'Draft',source:'Original material',sourceVersion:sermon.version||1,generatedBy:'workspace-package',updatedAt:stamp}))
 }
 status.package.posts.forEach((item,index)=>assets.push({id:`f_${status.id}_${index}`,type:'facebook',title:`Post ${index+1}: ${item.idea}`,content:item.caption,status:'Draft',source:'Original material',sourceExcerpt:item.sourceExcerpt,sourceVersion:sermon.version||1,generatedBy:'workspace-package',updatedAt:stamp}))
 const updated={...sermon,generatedNotes:status.package.notes,generationJobId:status.id,slideDeckUrl:`/.netlify/functions/sermon-workspace-package?download=${encodeURIComponent(status.id)}`,assets,updatedAt:stamp}
 return {...workspace,revision:workspace.revision+1,sermons:workspace.sermons.map((item,i)=>i===index?updated:item),updatedAt:stamp,updatedBy:member}
}
export async function buildWorkspaceDeck(sermon,slides){
 const pptxgen=await loadPptx();const pptx=new pptxgen();pptx.layout='LAYOUT_WIDE';pptx.author='Church Triumphant';pptx.title=sermon.title;pptx.subject='Draft sermon teaching slides';pptx.theme={headFontFace:'Book Antiqua',bodyFontFace:'Book Antiqua',lang:'en-US'}
 const specs=[{title:sermon.title,body:sermon.bigIdea||sermon.scripture||'Church Triumphant',scripture:sermon.scripture},...slides]
 specs.forEach((spec,index)=>{const slide=pptx.addSlide();slide.background={color:'080808'};slide.addShape(pptx.ShapeType.line,{x:.65,y:.82,w:11.9,h:0,line:{color:'C5A46D',width:1.4}});slide.addText(index?'CHURCH TRIUMPHANT · SERMON NOTES':'CHURCH TRIUMPHANT',{x:.72,y:.42,w:9,h:.25,fontFace:'Book Antiqua',fontSize:11,color:'C5A46D',charSpacing:2,margin:0});slide.addText(spec.title,{x:.72,y:1.45,w:11.8,h:1.5,fontFace:'Book Antiqua',fontSize:index?34:39,color:'F6F3EC',bold:true,breakLine:false,margin:0,fit:'shrink'});slide.addText(spec.body,{x:.78,y:3.42,w:11.6,h:2.4,fontFace:'Book Antiqua',fontSize:index?23:21,color:'E4DDCF',margin:0,fit:'shrink',valign:'top'});if(spec.scripture)slide.addText(spec.scripture,{x:.78,y:6.46,w:10,h:.36,fontFace:'Book Antiqua',fontSize:15,color:'C5A46D',margin:0});slide.addText(String(index+1).padStart(2,'0'),{x:11.8,y:6.76,w:.5,h:.25,fontFace:'Book Antiqua',fontSize:10,color:'C5A46D',margin:0})})
 return Buffer.from(await pptx.write({outputType:'nodebuffer'}))
}
