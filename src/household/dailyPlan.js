export const HOUSEHOLD_MEMBERS = [
  { id: 'larry', name: 'Larry Jenkins' },
  { id: 'terica', name: 'Terica' },
  { id: 'lorenzo', name: 'Lorenzo' },
  { id: 'nyla', name: 'Nyla' },
  { id: 'javin', name: 'Javin' },
  { id: 'isaiah', name: 'Isaiah' },
]

export const PILLARS = [
  { id: 'spiritual', label: 'Spiritual Maturity', icon: 'ti-sun' },
  { id: 'nutrition', label: 'Health & Nutrition', icon: 'ti-heart' },
  { id: 'fitness', label: 'Gym / Fitness', icon: 'ti-run' },
  { id: 'household', label: 'Household Operations', icon: 'ti-home' },
  { id: 'education', label: 'Education / Think Tank', icon: 'ti-book' },
  { id: 'finances', label: 'Finances', icon: 'ti-building-bank' },
  { id: 'ministry', label: 'Ministry & Fellowship', icon: 'ti-users' },
]

export function localDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function createDailyPlan(date = new Date()) {
  const dateKey = typeof date === 'string' ? date : localDateKey(date)

  return {
    id: dateKey,
    date: dateKey,
    theme: '',
    householdFocus: '',
    status: 'draft',
    topPriorities: [],
    decisions: [],
    pillars: {
      spiritual: {
        scripture: '',
        devotionFocus: '',
        prayerFocus: [],
        actOfObedience: '',
        ownerId: 'larry',
      },
      nutrition: {
        breakfast: '',
        lunch: '',
        dinner: '',
        snacks: [],
        hydration: '',
        groceryNeeds: [],
        tomorrowPrep: '',
        ownerId: 'terica',
      },
      fitness: {
        activity: '',
        location: '',
        participantIds: [],
        workout: '',
        departureTime: '',
        returnTime: '',
        stepGoal: 12000,
      },
      household: {
        appointments: [],
        priorities: [],
        errands: [],
        openItems: [],
      },
      education: {
        thinkTankTopic: '',
        thinkTankDeliverable: '',
        isaiahReading: '',
        assignments: [],
      },
      finances: {
        bills: [],
        purchases: [],
        transfers: [],
        accountsToFund: [],
        incomeActions: [],
      },
      ministry: {
        meetings: [],
        content: [],
        followUps: [],
        prayerNeeds: [],
      },
    },
    recap: {
      wins: [],
      carryovers: [],
      tomorrowPrep: [],
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

export function decisionCount(plan) {
  return (plan?.decisions || []).filter((decision) => decision.status !== 'resolved').length
}

export function ownerName(ownerId) {
  return HOUSEHOLD_MEMBERS.find((member) => member.id === ownerId)?.name || 'Unassigned'
}
