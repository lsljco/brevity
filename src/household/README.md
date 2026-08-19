# Brevity Household OS

Brevity is the household source of truth. Apple/iCloud Calendar is the timed alert layer.

## Current foundation

- `dailyPlan.js` defines the structured Seven Pillars daily plan.
- `TodayDashboard.jsx` is the household command surface.
- `useDailyPlan.js` loads and saves the current plan through the household API.
- `householdApi.js` keeps the UI independent of the backing datastore.
- `netlify/functions/household-data.js` persists daily plans in a strong-consistency Netlify Blob store.

## Household ownership defaults

- Spiritual Maturity: Larry
- Health & Nutrition: Terica
- Physical Fitness: Larry coordinates
- Household Management: Larry coordinates
- Education / Think Tank: Larry coordinates
- Finance: Larry
- Ministry & Fellowship: Larry + Lorenzo

## Environment

`household-data` uses the same Netlify Blob credentials as the existing server-side storage layer:

- `NETLIFY_SITE_ID`
- `NETLIFY_TOKEN`

Optional:

- `BREVITY_HOUSEHOLD_ID` defaults to `lslj-family`
- `BREVITY_FAMILY_KEY` enables the `x-brevity-family-key` request check

## Migration path

The client talks only to `householdApi.js`. The initial shared backing store is Netlify Blob so the household can use one plan across devices without adding another infrastructure provider. When the Household OS needs relational queries, authentication, history, or row-level access, replace the API implementation with Postgres/Supabase while preserving the client contract.

## Next increments

1. Morning Alignment guided workflow and editors for all seven pillars.
2. Household member identity / My Day.
3. Port Malbec Estate iCloud CalDAV integration into Brevity.
4. Calendar sync policy: only time-specific commitments with meaningful alerts.
5. Action and critical Brevity notifications.
6. AI-generated morning proposal and evening recap loop.
7. Retire the Malbec Estate external link after reusable functionality is migrated.
