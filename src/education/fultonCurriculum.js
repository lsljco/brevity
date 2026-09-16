export const FULTON_CURRICULUM_VERSION='2026-27'
export const FULTON_SOURCE_ROOT='Fulton County Schools official curriculum resources'

export const GRADE3_UNITS=[
 {subject:'math',id:'math-u2',title:'Exploring Multiplication',start:'2026-09-10',end:'2026-10-22',standardCodes:['3.PAR.3.2','3.PAR.3.6'],sourceType:'official-fulton'},
 {subject:'ela',id:'ela-u2',title:'Figure It Out',start:'2026-09-14',end:'2026-10-16',standardCodes:[],sourceType:'official-fulton'},
 {subject:'science',id:'science-habitats',title:'Habitats, Adaptations, and Environment',start:'2026-08-31',end:'2026-10-09',standardCodes:['S3L1'],sourceType:'official-fulton'},
]

const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)
export function unitsForDate(date,subject){if(!validDate(date))throw new Error('Curriculum date must use YYYY-MM-DD.');return GRADE3_UNITS.filter(unit=>(!subject||unit.subject===subject)&&date>=unit.start&&date<=unit.end)}
export function currentUnit(date,subject){return unitsForDate(date,subject)[0]||null}
export function curriculumAlignment(date,subject,standardCode){const unit=currentUnit(date,subject);return{schoolYear:FULTON_CURRICULUM_VERSION,unit,onPace:Boolean(unit),standardCode:standardCode||'',provenance:FULTON_SOURCE_ROOT}}
