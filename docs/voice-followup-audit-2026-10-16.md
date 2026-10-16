# Voice follow-up audit — October 16, 2026

Scope: Ask Brevity, shared-room Chart the Course / Evening Recap, and page Read Aloud. No financial, planning, authorization, or Undo records are modified by these repairs.

## Findings and repairs

- Ask Brevity treated 20 seconds without a transcription as a broken microphone, even after capture connected. Two quiet intervals could stop the conversation. Startup and audio shutdown remain bounded; healthy silence no longer consumes retries. Native no-speech sessions reconnect, and synchronous start failures use the bounded recovery path.
- Ask Brevity paused its media element but retained the source when switching back to capture. It now releases the native source while retaining the reusable element. This addresses a possible mobile audio-session handoff problem; physical-device behavior still needs verification.
- Ask Brevity had no deadline for voice lookup/speech generation or for playback that stops making progress without an ended/error event. Preparation now has a 45-second deadline; playback without progress recovers after 15 seconds. The microphone resumes, and the text reply remains available. Browser-blocked playback retains its explicit Play response control.
- Final transcript events delivered during native stop were discarded. They now update the submitted utterance without scheduling another submission.
- Changing voices during playback could leave voice mode enabled with no active microphone. Capture now resumes.
- Shared-room follow-ups depended on a question mark at the end of the last reply. Every reply now invites a follow-up for 90 seconds, refreshed on completed playback; outside that window, the existing explicit address is required. Pause/end clears the invitation. Meeting speech preparation now has a bounded failure and Retry speaker path.
- Page Read Aloud detects non-progressing playback, respects deliberate pause, and ignores stale resume completion.

## Microphone permission

Permission persistence belongs to Safari, not app storage. Do not store a fake “granted” flag or make an extra getUserMedia request to test permission. Ask Brevity now includes the per-site Safari setting path, and permission denial stops automatic retries. Before a native start event, allow 30 seconds for permission; a timeout stops without repeatedly reopening the prompt. Healthy idle capture no longer causes unnecessary reacquisition. Reference: https://support.apple.com/guide/iphone/browse-the-web-privately-iphb01fc3c85/ios

## Approval invariants

Only natural playback completion authorizes a heard review. Timeout, interruption, audio failure, retired callbacks, and cancelled speech never mark a review heard. Existing explicit approval and server authorization remain required.

## Verification

Local: 1,650 unit tests passed; production build and source/bundle budgets passed. Added tests cover healthy idle capture, long progressing audio, stalled audio, cancellation, native source release, repeated meeting follow-ups, expired windows, and late speech after a preparation timeout.

Deployed preview workflow exercises synthetic speech on desktop, phone, and tablet Chromium profiles, including six consecutive turns with one-minute pauses, delayed native shutdown, repeated no-speech recovery, final words during stop, stalled TTS, and stalled playback. These tests simulate browser/media events; they do not prove physical iPhone Safari microphone/audio-session behavior or external provider latency.

Preview qualification: the initial deployed test run exposed Netlify's injected feedback drawer overlapping application controls. The preview harness blocks only `/.netlify/scripts/cdp`, which is absent in production. App controls and permission checks remain exercised. Native-release timing assertions pause the test clock so runner scheduling cannot consume their 100 ms timing margin.
