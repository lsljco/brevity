# Brevity Household OS

Brevity is the household source of truth. Apple/iCloud Calendar is both the timed alert layer and a read-only source of live commitments for Today. Messages and future push channels are communication surfaces, not alternate sources of truth.

## Implemented operating loop

1. **Today** opens as the household command center.
2. **Morning Alignment** guides the family through all Seven Pillars.
3. Each phone selects a **device member profile** so My Day and signals are personal while the plan remains shared.
4. Timed commitments may opt into **Apple/iCloud Calendar**.
5. Brevity derives **critical, action and awareness signals** from unresolved household data.
6. **Evening Recap** records wins, carryovers, lessons and tomorrow preparation.
7. **Tomorrow Proposal** can use server-side AI to propose the next day; the family must still approve it during Morning Alignment.

## Primary files

- `dailyPlan.js` — structured Seven Pillars daily-plan domain model.
- `TodayDashboard.jsx` — household command surface.
- `MorningAlignment.jsx` — guided Seven Pillars alignment.
- `TimedCommitmentsEditor.jsx` — structured appointments/meetings with Calendar opt-in.
- `NotificationCenter.jsx` / `notifications.js` — Brevity signal model.
- `EveningRecap.jsx` — daily close workflow.
- `TomorrowProposal.jsx` — human-approved AI proposal workflow.
- `memberProfile.js` / `MemberSwitcher.jsx` — per-device household identity.
- `householdApi.js` / `useDailyPlan.js` — shared plan client boundary.
- `netlify/functions/household-data.js` — strong-consistency Netlify Blob persistence.
- `netlify/functions/icloud-calendar.mjs` — Brevity-owned iCloud CalDAV service migrated from Malbec Estate.
- `src/family/calendarSync.js` — idempotent Brevity → iCloud reconciliation.
- `src/family/calendarOverlay.js` — read-only iCloud → Today projection with date filtering and duplicate prevention.
- `src/family/FamilyCalendar.jsx` — unified Brevity + iCloud calendar view.
- `netlify/functions/daily-proposal.mjs` — optional server-side OpenAI proposal generation.

## Household ownership defaults

- Spiritual Maturity: Larry
- Health & Nutrition: Brevity supplies the rolling meal plan; Terica retains the remaining health coordination defaults
- Physical Fitness: Larry coordinates
- Household Management: Larry coordinates
- Education / Think Tank: Larry coordinates
- Finance: Larry
- Ministry & Fellowship: Larry + Lorenzo

## Environment

Shared household storage uses:

- `NETLIFY_SITE_ID`
- `NETLIFY_TOKEN`

Household settings:

- `BREVITY_HOUSEHOLD_ID` — defaults to `lslj-family`
- `BREVITY_TIME_ZONE` — household date boundary for rolling meal plans; defaults to `America/New_York`
- `BREVITY_AUTOMATION_KEY` — long random secret used only between the scheduled and background planning functions

### Apple/iCloud Calendar

- `ICLOUD_EMAIL` — Apple/iCloud account email that can write the selected calendar
- `ICLOUD_APP_PASSWORD` — Apple app-specific password; never the normal Apple ID password
- `ICLOUD_CALENDAR_NAME` — optional exact calendar name
- `BREVITY_TIME_ZONE` — IANA timezone for timed events; defaults to `America/New_York`

Calendar credentials remain server-side and are never returned to the browser. Calendar access uses the signed-in Brevity household session; the obsolete shared PIN is no longer used.

### Brevity AI

- `OPENAI_API_KEY` — server-side only
- `BREVITY_AI_MODEL` — optional model override; defaults to `gpt-5.6`

The proposal function uses the Responses API with structured output and `store: false`. If no API key is configured, the rest of Brevity continues to operate and only proposal generation is unavailable.

## Calendar policy

Brevity remains authoritative. An item is eligible for Apple/iCloud Calendar only when `calendarSync: true` and it has a meaningful date/time. The reconciliation layer stores a Brevity source ID in Brevity-owned calendar events, making later synchronization idempotent and leaving unrelated iCloud events untouched. Independently created Apple Family Calendar events are projected into Today as read-only commitments and supplied to pillar analysis; they are never silently copied into or allowed to overwrite the saved Brevity daily plan.

Normally sync:
- medical appointments
- interviews
- school events
- contractor appointments
- ministry meetings
- fixed-time commitments where an Apple alert adds value

Normally remain Brevity-only:
- Isaiah reading
- grocery funding review
- Think Tank topics
- meal planning
- finance review
- content preparation

## Connected applications

Malbec Estate and Live Intentional are linked under Household Management. Apostolic Sermon Builder is linked under Ministry & Fellowship. If a connected site blocks iframe embedding, Brevity presents a secure full-screen launch link instead.

## Persistence roadmap

The Household OS client talks through an authenticated API boundary rather than directly to Netlify Blob. Netlify Blob stores household accounts, signed sessions, daily plans and synchronized browser records. When Brevity needs relational history, richer auditability or cross-module queries, migrate the API implementation to Postgres/Supabase without rewriting the Household OS UI.
