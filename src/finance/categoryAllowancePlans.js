// Generic spending allowances are consumed by a category, not a vendor/date match.
export function isCategoryAllowancePlan(plan={}) {
 if(plan.type!=='expense'||plan.vendorId)return false
 const name=String(plan.name||'').toLowerCase().trim().replace(/\s+/g,' ')
 return /^(groceries|food|dining out|restaurants|gas\s*\/\s*fuel|fuel|household spending|discretionary spending)( budget| allowance)?$/.test(name)||name===`${String(plan.cat||'').toLowerCase()} allowance`
}
