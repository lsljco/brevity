# Apple Health and household pilot acceptance — September 30, 2026

## Apple Health: blocked on signed distribution and physical devices

The repository contains the iOS 17+ native companion at `ios/BrevityHealth`. CI verifies core Swift logic, simulator compilation and an unsigned device archive. There is no verified signed installation link, App Store release or TestFlight build. The household has asked where to find an installation; no device installation or HealthKit consent is evidenced. The web Health Connections screen is not an installer.

Required distribution work: establish the owner's Apple Developer membership/team, configure the app identifier and HealthKit/background delivery capabilities, sign/archive the existing Xcode project, create the App Store Connect record and complete the appropriate TestFlight processing/review. The owner must complete Apple's enrollment/agreement/payment steps. Signing secrets and Apple credentials do not belong in chat or the repository. Each member installs the resulting build and signs in as themselves.

Then execute the real-device checklist in `ios/BrevityHealth/README.md`: compare New York-day steps with Apple Health, test Watch/iPhone aggregation, missing/denied data, foreground/background sync, offline consent revision, website disconnect, sign-out privacy, member separation, expired sessions, midnight and timezone changes. Record device/OS/build and observed pass/fail for each. No physical-device result is claimed by web or simulator testing.

## Pilot: observed instrumentation, insufficient adoption evidence

Read-only production request from the existing Larry session retrieved the seven-day usage summary for September 24–30. This audit request itself is instrumented QA; counts are a point-in-time observation, not a clean household experiment.

Reported measurements for Larry: recorded September 29 and 30; September 24–28 missing; no unavailable dates reported. 43 requests, 2 failed requests, 0 classified blocked requests, 1 clarification, 33 legacy-outcome requests, 11 proposals, 8 completed actions, 0 corrections, 1 Undo. Feedback: 0 helpful and 1 Voice-category friction. Mean observed response latency: 14,327 ms. The other five members had no recorded dates during the period. Missing days do not prove inactivity, and the older classification can undercount blocked/clarification outcomes.

The current summary cannot distinguish QA activity from ordinary household tasks. It does not establish time saved, usefulness, independent multi-member adoption, actual-device voice playback or causal completion rates. Existing conversation receipts demonstrate that a temporary task was saved/read back/undone; they do not identify the physical device or certify the full physical-device sequence.

The consented baseline/comparable-task observation protocol remains in `docs/competitive-learning-and-pilot.md`. Actual participant feedback and elapsed usage observations are still required. No feedback was inferred or recorded on members' behalf and no week of observations was fabricated.
