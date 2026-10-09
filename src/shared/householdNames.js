// Canonical household spelling is context, not proof of speaker identity.
export const HOUSEHOLD_NAME_GUIDANCE = "Household names are spelled exactly: Larry, Lorenzo, Terica, Nyla, Javin, Isaiah. Use these spellings for household members in responses, plans, titles and meeting summaries. Terica is not Tarika or Tarik. Javin is spelled Javin. Preserve unrelated people's names; ask when identity is ambiguous. A name mention does not identify the speaker, assign ownership or grant permission."
export const HOUSEHOLD_TRANSCRIPTION_PROMPT = "A Brevity household conversation with Larry, Lorenzo, Terica, Nyla, Javin and Isaiah. Household vocabulary: Terica, Nyla, Javin, Isaiah, Brevity, Chart the Course, Evening Recap."
// Only the specifically confirmed legacy misspellings in household plan copy.
// Never use this for IDs, owners, permissions, calendar sources or raw recordings.
export const correctHouseholdPlanName = value => typeof value === 'string'
 ? value.replace(/\bTarika\b/gi, 'Terica').replace(/\bTarik(?=['’]s\b)/gi, 'Terica')
 : value
