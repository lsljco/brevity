const DEFAULT_STARTERS = ['What needs my attention today?', 'What is the key insight on this page?', 'What decision would unlock the most progress?', 'What has changed since the last update?']

export function assistantStarters({ activeView = '', activePillar = '' } = {}) {
  if (activeView === 'family-calendar') return ['Where are the calendar conflicts or tight transitions?', 'What commitments are still unverified?', 'Summarize the next seven days', 'Prepare a calendar change for my review']
  if (activeView === 'household-maintenance') return ['Which operating exception matters most?', 'Show overdue work that needs coverage', 'What household pattern should we address?', 'Prepare an operations change for my review']
  if (activeView === 'meal-plan') return ['What should we prepare for tomorrow’s meals?', 'Where is the meal plan hardest to execute?', 'Summarize this week’s planned nutrition', 'Prepare a meal-plan change for my review']
  if (activeView === 'property' || activeView === 'malbec-estate') return ['Which project constraint matters most?', 'What decision is blocking progress?', 'Which deadline or budget needs attention?', 'Prepare a project change for my review']
  if (activePillar === 'finance') return ['What financial variance needs review?', 'Which forecast assumption is least reliable?', 'Show unreconciled planned and actual activity', 'Prepare a finance change for my review']
  if (activePillar) return ['What is today’s key message in this pillar?', 'What evidence shows progress or friction?', 'What insight would help us grow?', 'What decision would unlock progress?']
  return DEFAULT_STARTERS
}
