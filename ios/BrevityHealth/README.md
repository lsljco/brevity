# Brevity Health for iPhone

Native iOS 17+ companion for `https://brevityoflife.netlify.app`. Uses the existing Brevity member login; no new OpenAI, Netlify, or GitHub key is needed on members’ phones. ChatGPT history is not imported.

## Build and install

1. On a Mac with Xcode, open `BrevityHealth.xcodeproj` and select the shared `BrevityHealth` scheme.
2. Under Signing & Capabilities, choose the household’s Apple Developer team. Register the bundle identifier `app.brevityoflife.health`, or change it to an identifier owned by that team. Preserve HealthKit and background delivery capabilities.
3. Run on a provisioned iPhone, or Archive and use Xcode Organizer to distribute a signed build through the team’s supported distribution channel. TestFlight requires an App Store Connect app record, developer membership, privacy declarations and Apple’s applicable processing/review. An unsigned CI archive is **not installable**.
4. Each person signs in as themselves, selects data types, reviews the choices, confirms ownership of the iPhone Health records and approves Apple Health access. Do not connect another person’s device under an administrator login.
5. Choose Sync now. In Brevity, open Health & Nutrition → Health Connections. Allow assistant access only if desired; household sharing is a separate choice.

No Apple team, signing certificate, provisioning profile or distribution credentials are committed. Signing/distribution and the real-device acceptance checklist remain required before calling this installed or fully validated.

## Verification

CI runs `swift test --package-path ios/BrevityHealth/Core`, builds the simulator app and produces an unsigned device archive. Server privacy/validation tests run in `npm test`; browser regression covers the health dashboard and consent review.

Real-device acceptance: compare step totals with Apple Health using the same New York day; include both iPhone and Watch sources; verify missing/denied data stays Unknown; exercise foreground and background refresh; change consent while offline, reconnect and ensure old uploads are rejected; disconnect from the website and verify the phone stops uploading; sign out and verify no private summary remains visible. Test different members on their own devices, password/session expiry, disabled data types, midnight and a timezone change. Apple controls background timing, so no hourly-delivery guarantee is made.

## Data and privacy

- Read-only steps and workouts. HealthKit cumulative statistics aggregate step sources; raw phone/watch samples are not manually added together.
- Thirty household-calendar days per snapshot. Missing records remain null. Each sync replaces the complete snapshot; retries never add totals. The last snapshot remains stored until replaced or disconnected.
- Workouts are unioned by their start/end windows to avoid overlapping recordings inflating totals; pauses can be included, so these are **window minutes**, not active-exercise minutes.
- Separate opt-ins for AI use and household daily summaries. No shared raw history, routes, heart rate, medications, clinical records or ChatGPT conversations.
- Own-member API binding, strict schema, current consent revision, device identifier and conditional storage writes. The device identifier is a connection identifier, not device attestation or proof of medical accuracy.
- Session in device-only Keychain, ephemeral network session, HTTPS-only fixed origin and rejected redirects. No health payload logging or browser local storage.
- Disconnect clears stored summaries and permission grants while retaining consent history. Past conversations or previously viewed information cannot be recalled. Household server operators retain infrastructure access; there is no end-to-end encryption claim.

Privacy notice: `/health-privacy.html`. Consent and sensor synchronization do not complete tasks or alter existing household Action Mode/Undo records.
