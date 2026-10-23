# Brevity workspace implementation

This change applies the approved warm architectural imagery, charcoal surfaces, champagne accents and serif headings to the existing application. It adds Home, Household Overview / Manage / Maintain, contextual pillar navigation, a compact bills-due summary, and editable date navigation in Today. Existing operational screens remain the source of truth.

## Behaviors

- Home links to My Day, Household, the seven pillars, history and preferences. Today remains the initial screen to preserve the existing daily workflow.
- Household destinations respect hidden modules and open the existing schedule, inventory, groceries, policies, chores, property and intelligence workflows. Overview shows the saved household focus, with explicit loading and unavailable states.
- Today supports previous/next day, date input and return to today. Changing dates remounts the dated workspace so pending local editors and asynchronous responses cannot populate a different day's plan. Historical/future changes use the existing version-checked review workflow. Live morning/evening conversations are not started for a browsed historical day.
- Calendar date numbers and agenda headers open the corresponding Today plan.
- The selected date is supplied to Hey Brevity on both the browser request and server-side page instruction. It is navigation context, not a claim that a historical record exists.
- Bills show saved scheduled obligations, totals when amounts are known, and pending/posted/expected status. A scheduled obligation is not represented as a confirmed payment. Finance permission remains unchanged.
- Existing weather, meal macros, exercise illustrations, calendar preparation, decision reviews, voice controls and data integrations remain connected.

## Imagery

Generated using the built-in image-generation tool with the approved Home rendering as a visual reference. These are decorative scenes, not photographs of the family's actual property. No mockup text, invented financial amounts or fictional people were imported into application data.

| Asset | Use | Prompt summary |
| --- | --- | --- |
| `public/imagery/home-lounge.webp` | Home, Today, Household and property headers; Household card | Contemporary lounge, cream sofas, walnut and limestone, open glass doors, trees and hills, golden sunlight; quiet darker left side; no people, text or UI. |
| `public/imagery/planning-desk.webp` | My Day and schedule destination cards | Walnut desk, blank cream notebook, brass pen, ceramic mug, olive branch, garden outside, golden morning light; no legible text or UI. |
| `public/imagery/garden-path.webp` | Seven Pillars and maintenance cards; Spiritual and Ministry headers | Limestone garden path under mature olive trees, distant wooded hills, restrained landscaping and amber sunlight; no people, text or UI. |

Shared prompt: photorealistic editorial architectural imagery, landscape 16:9, charcoal shadows, warm champagne highlights, walnut, cream and olive greens. Recreate the reference's photographic aesthetic as a single full-bleed source photograph, without interfaces, logos, borders or collage panels. Assets are encoded as WebP (approximately 683 KiB combined), served locally, and use responsive crops. Decorative card images have empty alt text; button labels remain real accessible text. Existing meal and exercise images remain tied to their source records.

## Release scope and dependencies

This is the design/navigation implementation, not a replacement AI platform. It does not embed ChatGPT Work or import ChatGPT conversation memory. The existing Brevity assistant and scheduled planning generator remain responsible for reasoning and actions.

PR #310 separately owns persistent, expandable outcome editing and carry-forward. This branch does not merge or replace that pending work. Broader automatic top-three ranking across all goal systems, a complete overdue-bill reconciliation workflow, and new Estate write capabilities are not implemented here. Estate's existing migration/write restrictions remain in force. Each existing workspace has shared visual treatment; its underlying domain workflows were not rewritten to match every concept-board detail.

Live authenticated integrations and deployment must be verified separately from mocked browser tests. No production records were edited during local verification.
