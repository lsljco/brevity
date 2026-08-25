const clean = value => String(value || '').replace(/\s+/g, ' ').trim()
const values = value => Array.isArray(value) ? value.filter(Boolean) : value ? [value] : []
const itemText = item => typeof item === 'string'
  ? clean(item)
  : clean([item?.title, item?.description, ...values(item?.paragraphs), ...values(item?.steps)].filter(Boolean).join(' — '))
const short = (value, max = 175) => {
  const text = clean(value)
  return text.length <= max ? text : `${text.slice(0, max - 1).replace(/\s+\S*$/, '')}…`
}

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
