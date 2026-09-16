# Isaiah Tutor authoritative education record

## Purpose
The Daily Tutor must not infer longitudinal mastery from rendered lesson prose or browser state. Completed sessions become structured evidence. The authoritative record separates prerequisite skill mastery from Fulton Grade 3 standard progress.

## Record contract
`StudentEducationRecord` contains `schemaVersion`, `studentId`, `sessions`, `skillMastery`, `standardProgress`, `retrievalSchedule`, and `progressChecks`. A completed `TutorSession` retains assessor, instructional date, response-level evidence, fluency probe identity, and curriculum/standards references.

## Mastery invariants
RED means explicit repair is required. YELLOW is developing or first-encounter success. GREEN requires independent evidence across at least two distinct sessions and at least three independent observations in the current evidence window. BLUE additionally requires successful stretch/transfer evidence after repeated encounters. GREEN/BLUE schedule spaced retrieval instead of daily drilling.

## Persistence / mutation safety
This module is deliberately pure. It does not write localStorage or Netlify Blobs directly. Production persistence must be connected through Brevity's reviewed, versioned Action Mode mutation path so completion receives optimistic-version checking, immutable audit evidence, member/administrator authorization, conflict handling, and Undo. A browser-only write is not an acceptable production fallback.

## Day 1
Program start is 2026-09-16. August 2026 reading measures remain pre-program baseline evidence and are not represented as a completed tutor session. Fluency trend comparisons must retain probe identity so ordinary instructional passages are not misrepresented as comparable four-week progress checks.
