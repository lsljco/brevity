import { HOUSEHOLD_MEMBERS } from './dailyPlan.js'

const STORAGE_KEY = 'brevity_current_member_v1'

export function getCurrentMember() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return HOUSEHOLD_MEMBERS.includes(saved) ? saved : 'Larry'
  } catch {
    return 'Larry'
  }
}

export function setCurrentMember(member) {
  if (!HOUSEHOLD_MEMBERS.includes(member)) throw new Error('Unknown household member.')
  try { localStorage.setItem(STORAGE_KEY, member) } catch {}
  return member
}

export function initialsForMember(member) {
  return String(member || 'Family').split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase()
}
