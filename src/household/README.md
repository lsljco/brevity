# Brevity Household OS

Brevity is the household source of truth. Apple/iCloud Calendar is the timed alert layer.

## Current foundation

- `dailyPlan.js` defines the structured Seven Pillars daily plan.
- `TodayDashboard.jsx` is the household command surface.
- `MorningAlignment.jsx` guides the family through all seven pillars and persists the aligned plan.
- `useDailyPlan.js` loads and saves the current plan through the household API.
- `householdApi.js` keeps the UI independent of the backing datastore.
- `netlify/functions/household-data.js` persists daily plans in a strong-consistency Netlify Blob store.
- `netlify/functions/icloud-calendar.mjs` is the Brevity-owned iCloud CalDAV service migrated from Malbec Estate.
- `src/family/icloudCalendarApi.js` is the frontend boundary for iCloud calendar access and calendar-sync eligibility.

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

Optional household settings:

- `BREVITY_HOUSEHOLD_ID` defaults to `lslj-family`
- `BREVITY_FAMILY_KEY` enables the `x-brevity-family-key` request check

The iCloud calendar service requires:

- `BREVITY_FAMILY_CALENDAR_PIN` — family PIN used to unlock calendar operations in Brevity
- `ICLOUD_EMAIL` — Apple/iCloud account email that owns or can write the selected calendar
- `ICLOUD_APP_PASSWORD` — Apple app-specific password, never the normal Apple ID password
- `ICLOUD_CALENDAR_NAME` — optional exact calendar name; if omitted Brevity uses the first writable VEVENT calendar discovered

Calendar credentials remain server-side in Netlify environment variables. They are never returned to the browser.

## Calendar policy

Brevity remains authoritative. An item is eligible for Apple/iCloud Calendar only when `calendarSync: true` and it has a meaningful scheduled date/time. Routine household work remains in Brevity so Calendar alerts do not become noisy.

Examples that normally sync:
- medical appointments
- interviews
- school events
- contractor appointments
- ministry meetings
- other fixed-time commitments where an Apple alert adds value

Examples that normally remain Brevity-only:
- Isaiah reading
- grocery funding review
- Think Tank topics
- meal planning
- finance review
- content preparation

## Migration path

The client talks only to `householdApi.js`. The initial shared backing store is Netlify Blob so the household can use one plan across devices without adding another infrastructure provider. When the Household OS needs relational queries, authentication, history, or row-level access, replace the API implementation with Postgres/Supabase while preserving the client contract.

## Next increments

1. Household member identity / My Day.
2. Connect qualified Brevity plan items to the migrated iCloud Calendar service.
3. Replace the older browser-only Family Calendar view with the Brevity + iCloud event view.
4. Action and critical Brevity notifications.
5. AI-generated morning proposal and evening recap loop.
6. Retire the Malbec Estate external link after calendar behavior and remaining useful functionality are validated in Brevity.
