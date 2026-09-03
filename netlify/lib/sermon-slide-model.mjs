const clean = value => String(value || '').replace(/\s+/g, ' ').trim()
const values = value => Array.isArray(value) ? value.filter(Boolean) : value ? [value] : []
const itemText = item => typeof item === 'string'
  ? clean(item)
  : clean([item?.title, item?.description, ...values(item?.paragraphs), ...values(item?.steps)].filter(Boolean).join(' — '))
const short = (value, max = 175) => {
  const text = clean(value)
  return text.length <= max ? text : `${text.slice(0, max - 1).replace(/\s+\S*$/, '')}…`
}
const PREMIUM_VISUAL='Ultra-photorealistic editorial magazine photography, premium high-end documentary aesthetic, cinematic lighting, luxury commercial color grading, natural skin tones and authentic textures, sophisticated composition, subtle depth of field, 8K-quality realism, theologically respectful Christian visual storytelling, no generic stock-photo feeling, no words, no lettering, no logos, wide 16:9 composition.'

export const sermonSlidesFileName = (notes = {}, source = {}) => {
  const title = clean(notes.documentTitle || notes.title || source.title || 'Sermon')
    .replace(/\s+(?:Sermon\s+)?Teaching\s+Guide$/i, '')
  const match = clean(source.sermonDate || notes.sermonDate).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const date = match ? `${match[2]}.${match[3]}.${match[1]}` : clean(source.sermonDate || notes.sermonDate)
  return `${date ? `${date} - ` : ''}${title} Sermon Slides.pptx`
}

export function buildSermonSlideSpecs(notes = {}, source = {}) {
  const title = clean(notes.documentTitle || notes.title || source.title || 'Sermon Teaching')
  const subtitle = clean(notes.subtitle)
  const scripture = values(notes.primaryScriptures).slice(0, 3)
    .map(item => typeof item === 'string' ? item : clean(item.reference)).filter(Boolean).join(' · ')
  const movements = values(notes.detailedExposition).slice(0, 3)
  const framework = values(notes.architecturalFrameworks)[0]
  const application = values(notes.practicalApplication)[0]
  const slides = [
    {kind:'title',title,body:subtitle||clean(notes.thesis),notes:clean(notes.aim),visual:`Create the premium cover image for the sermon teaching “${title}”. Translate the central theology into one specific, believable visual metaphor with dramatic morning or golden-hour light and intentional negative space for editorial layout. ${PREMIUM_VISUAL}`},
    {kind:'statement',eyebrow:'GOVERNING TRUTH',title:short(notes.anchorDeclaration||notes.thesis,120),body:short(notes.governingQuestion,150),notes:clean(notes.thesis),visual:`Create a concrete visual metaphor for this governing truth: ${clean(notes.anchorDeclaration||notes.thesis)}. Make the image communicate spiritual ownership, responsibility, formation, or faithful response as the teaching requires. ${PREMIUM_VISUAL}`},
  ]
  if(scripture)slides.push({kind:'scripture',eyebrow:'SCRIPTURE FOUNDATION',title:scripture,body:short(values(notes.primaryScriptures)[0]?.explanation||'',180),notes:values(notes.primaryScriptures).map(item=>typeof item==='string'?item:`${item.reference}: ${item.explanation}`).join('\n'),visual:`An open Bible in an authentic lived-in setting that visually reinforces the sermon “${title}”; warm golden-hour light streaming across an oak or natural-wood surface, reverent and contemplative atmosphere, no readable page text. ${PREMIUM_VISUAL}`})
  movements.forEach((movement,index)=>slides.push({kind:'movement',eyebrow:`TEACHING MOVEMENT ${index+1}`,title:clean(movement.title)||`Movement ${index+1}`,body:short(values(movement.paragraphs)[0],185),notes:[...values(movement.paragraphs),...values(movement.quotes)].join('\n\n'),visual:`Create an editorial-quality photographic scene that specifically illustrates this sermon movement: ${itemText(movement)}. Use a concrete human action, craft, stewardship setting, household scene, cultivated landscape, or other direct theological metaphor rather than abstract symbolism. ${PREMIUM_VISUAL}`}))
  if(framework)slides.push({kind:'framework',eyebrow:'FORMATION FRAMEWORK',title:clean(framework.title),body:values(framework.items).slice(0,5).map(item=>clean(item.label)).filter(Boolean).join('  →  '),notes:itemText(framework),visual:`Show spiritual formation as a believable real-world process based on this framework: ${itemText(framework)}. Use one coherent photographic scene with visible preparation, cultivation, craftsmanship, roots, building, or progressive faithful work as appropriate to the teaching. Do not create an infographic. ${PREMIUM_VISUAL}`})
  if(application)slides.push({kind:'application',eyebrow:'PUT THE WORD INTO PRACTICE',title:clean(application.title)||'Faith Becomes Practice',body:short(values(application.steps)[0]||values(application.paragraphs)[0],190),notes:itemText(application),visual:`A Christ-centered person, couple, or family faithfully practicing this concrete sermon application in an elegant but believable home, work, ministry, or stewardship setting: ${itemText(application)}. Make obedience visible through action. ${PREMIUM_VISUAL}`})
  slides.push({kind:'closing',eyebrow:'CHURCH TRIUMPHANT',title:short(notes.closingCommission||notes.weeklyCharge?.quote||'Receive the Word. Practice the Word. Bear fruit.',125),body:short(notes.weeklyCharge?.title||'',120),notes:itemText(notes.weeklyCharge),visual:`Create a majestic closing image for “${title}” that communicates enduring fruit produced by hidden formation—deep roots, a flourishing vineyard, a mature tree, faithful stewardship, or a church community walking in obedience, whichever best matches the sermon. ${PREMIUM_VISUAL}`})
  return slides.slice(0,10)
}
