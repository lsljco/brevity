// Synthetic helper for verifying activation checks in isolation.
// Export a single named function: summarizeProbeChecks(checks)
// Behavior:
// - Accept only an Array of booleans.
// - Throw TypeError for non-array inputs or if any entry is not a boolean.
// - Return an object {passed,total,allPassed}.
// - allPassed is false for empty arrays per requirement.

export function summarizeProbeChecks(checks){
  if(!Array.isArray(checks)){
    throw new TypeError('checks must be an array of booleans')
  }
  for(const item of checks){
    if(typeof item !== 'boolean'){
      throw new TypeError('all entries in checks must be boolean')
    }
  }
  const total = checks.length
  const passed = checks.filter(Boolean).length
  const allPassed = total > 0 && passed === total
  return {passed,total,allPassed}
}
