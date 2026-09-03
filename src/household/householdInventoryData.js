export const HOUSEHOLD_INVENTORY_STORAGE_KEY = 'brevity_household_inventory_v1'

export const INVENTORY_CATEGORIES = ['Food & Pantry', 'Refrigerator', 'Freezer', 'Cleaning', 'Laundry', 'Paper Goods', 'Pet Care', 'Personal Care', 'Other']
export const INVENTORY_LOCATIONS = ['Pantry', 'Refrigerator', 'Freezer', 'Kitchen', 'Laundry', 'Supply Closet', 'Garage', 'Bathrooms', 'Other']

const nowIso = () => new Date().toISOString()
const id = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`

export function normalizeInventoryState(value = {}) {
  return {
    version: 1,
    items: Array.isArray(value.items) ? value.items.map(normalizeInventoryItem) : [],
    waste: Array.isArray(value.waste) ? value.waste.map(entry => ({ ...entry, estimatedValue: Number(entry.estimatedValue || 0) })) : [],
  }
}

export function normalizeInventoryItem(item = {}) {
  return {
    id: item.id || id('inventory'),
    name: String(item.name || '').trim(),
    category: item.category || 'Other',
    location: item.location || 'Other',
    quantity: Math.max(0, Number(item.quantity || 0)),
    unit: item.unit || 'units',
    parLevel: Math.max(0, Number(item.parLevel || 0)),
    unitCost: Math.max(0, Number(item.unitCost || 0)),
    expiresOn: /^\d{4}-\d{2}-\d{2}$/.test(String(item.expiresOn || '')) ? item.expiresOn : '',
    notes: String(item.notes || '').trim(),
    updatedAt: item.updatedAt || nowIso(),
    updatedBy: item.updatedBy || '',
  }
}

export function addInventoryItem(state, item, member = '') {
  return normalizeInventoryState({ ...state, items: [...state.items, normalizeInventoryItem({ ...item, updatedAt: nowIso(), updatedBy: member })] })
}

export function adjustInventoryQuantity(state, itemId, delta, member = '') {
  return normalizeInventoryState({
    ...state,
    items: state.items.map(item => item.id === itemId ? { ...item, quantity: Math.max(0, Number(item.quantity) + Number(delta || 0)), updatedAt: nowIso(), updatedBy: member } : item),
  })
}

export function recordInventoryWaste(state, { itemId, quantity, reason = 'Discarded', member = '' } = {}) {
  const item = state.items.find(candidate => candidate.id === itemId)
  if (!item) return normalizeInventoryState(state)
  const discarded = Math.max(0, Math.min(Number(quantity || 0), Number(item.quantity || 0)))
  const entry = {
    id: id('waste'), itemId: item.id, name: item.name, category: item.category, quantity: discarded,
    unit: item.unit, estimatedValue: discarded * Number(item.unitCost || 0), reason, recordedAt: nowIso(), recordedBy: member,
  }
  return normalizeInventoryState({
    ...state,
    items: state.items.map(candidate => candidate.id === itemId ? { ...candidate, quantity: Math.max(0, candidate.quantity - discarded), updatedAt: nowIso(), updatedBy: member } : candidate),
    waste: [entry, ...state.waste],
  })
}

export function inventoryIntelligence(state, { today = new Date() } = {}) {
  const value = normalizeInventoryState(state)
  const todayKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`
  const horizon = new Date(today); horizon.setDate(horizon.getDate() + 3)
  const horizonKey = `${horizon.getFullYear()}-${String(horizon.getMonth()+1).padStart(2,'0')}-${String(horizon.getDate()).padStart(2,'0')}`
  const lowStock = value.items.filter(item => item.parLevel > 0 && item.quantity <= item.parLevel)
  const expiring = value.items.filter(item => item.expiresOn && item.expiresOn >= todayKey && item.expiresOn <= horizonKey)
  const expired = value.items.filter(item => item.expiresOn && item.expiresOn < todayKey && item.quantity > 0)
  const month = todayKey.slice(0,7)
  const monthlyWaste = value.waste.filter(entry => String(entry.recordedAt || '').slice(0,7) === month).reduce((sum, entry) => sum + Number(entry.estimatedValue || 0), 0)
  const inventoryValue = value.items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitCost || 0), 0)
  return { lowStock, expiring, expired, monthlyWaste, inventoryValue, purchaseList: lowStock.map(item => ({ ...item, suggestedQuantity: Math.max(1, (item.parLevel * 2) - item.quantity) })) }
}
