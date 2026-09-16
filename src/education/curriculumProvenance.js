export function validateCurriculumProvenance(unit){if(!unit)return false;return Boolean(unit.sourceType==='official-fulton'&&unit.start&&unit.end&&unit.subject&&unit.title)}
