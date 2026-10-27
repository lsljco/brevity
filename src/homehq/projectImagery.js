// Finished-result concepts; project photos always take precedence in HomeHQ.
// Match the work itself before its room, so a custom room never becomes a generic kitchen.
const CONCEPTS = [
  [/\b(gfci|backyard lights?|outdoor lighting)\b/i, 'outdoor-lighting'],
  [/\b(chandelier)\b/i, 'chandelier'],
  [/\b(light bulbs?|bulbs?)\b/i, 'light-bulbs'],
  [/\b(seals?|weatherstripp?ing|door gaps?)\b/i, 'door-seals'],
  [/\b(paint).*\bdoors?\b/i, 'painted-doors'],
  [/\b(closet|coat rack)\b/i, 'entry-closet'],
  [/\b(drywall|bedroom wall)\b/i, 'bedroom-wall'],
  [/\b(grills?|barbecue)\b/i, 'grills'],
  [/\b(cabinets?)\b/i, 'kitchen-cabinets'],
  [/\bpantry\b/i, 'pantry'],
  [/\bmirrors?\b/i, 'bathroom-mirrors'],
  [/\bshowers?\b/i, 'shower'],
  [/\btrees?\b/i, 'trees'],
  [/\bgarage\b/i, 'garage-exterior'],
  [/\b(windows?|spider webs?)\b/i, 'windows'],
  [/\b(banisters?|railings?|handrails?)\b/i, 'banisters'],
  [/\b(ditch|drainage|swale)\b/i, 'drainage'],
  [/\bbrick\b/i, 'brick-exterior'],
]

export function projectConceptImage(item = {}) {
  const match = CONCEPTS.find(([pattern]) => pattern.test(String(item.title || '')))
  return match ? `/project-images/${match[1]}.webp` : ''
}
