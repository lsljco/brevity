# Workout image accuracy correction — September 20, 2026

## Status
Release candidate complete on `fix/workout-image-accuracy-natural-gaze`; production deployment remains pending PR #209 merge.

- 108/108 canonical exercises have accepted, exercise-specific images.
- 0 legacy images retained; 108 replaced.
- Manifest audit: 108 unique paths, 108 unique SHA-256 contents, 0 missing, 0 duplicates.
- Final asset cache version: `2026-09-21-r6`.
- Final SkiErg asset: `exercise-ski-erg-r6.webp`, visually accepted with exactly two cords connected one-to-one to two handles and no floating third cord.
- Brisk walk: `exercise-brisk-walk-r4.webp`, aligned with the marked track lane.
- Stair climber: `exercise-stair-climber-r3.webp`, stairs and movement travel right-to-left toward the monitor.
- All accepted assets show no visible socks.

## Confirmed defect
The exercise expansion in PR #208 assigns existing photographs to different
exercises and equipment types in `src/fitness/fitnessWorkoutPlan.js`.
Examples: pec deck / single-arm cable chest press / cable press-around reuse
the cable-fly photograph; assisted chest dip / decline push-up / close-grip
push-up reuse the flat push-up photograph; half-kneeling landmine press reuses
the seated dumbbell shoulder press photograph.

The generation prompt also requested magazine-style editorial photography
without excluding direct camera gaze. The screenshot review rejects posed,
camera-facing exercise imagery.

## Safeguards in this draft
- Resolve bundled assets by the exact exercise ID, never by a shared muscle group.
- Withdraw the four camera-facing asset files visible in the screenshot review.
- Bind generated image URLs to the exact exercise ID in the server-generated ID.
- Render a non-photographic pending state rather than another exercise image.
- Apply the same resolver to the full viewer and goal-builder thumbnails.
- Handle failed image loads without substituting another exercise.
- Remove the unverified alt-text claim that a photo shows "correct form".
- Require documentary action, exercise-appropriate natural gaze, no camera eye
  contact, preserved portrait identity, complete framing, and exact equipment
  and variation in future generation prompts.
- Include detailed movement constraints for the screenshot-reported exercises.

Final local validation on September 21, 2026:

- Unit suite: 1,030 passed, 0 failed.
- Production build: passed; only the existing large-chunk advisory remains.
- Playwright suite: 174 passed, 22 intentional device-specific skips, 0 failed.
- Browser projects: desktop Chromium, iPhone 14 emulation, iPad Pro 11, and iPad Pro 11 landscape.
- Workout-specific checks cover Today Pillar 3, the full Workout Library, full workout cards, and tap-to-enlarge behavior.

## Remaining release work
1. Push this release candidate to the existing PR #209 branch.
2. Confirm required GitHub checks pass, then mark the draft ready and merge through the protected workflow.
3. Allow the existing Netlify pipeline to deploy the merged commit.
4. Verify the deployed commit and actual production cards/enlarged views, including cache-busted r6 SkiErg and r4 brisk-walk requests.

Preserve exercise instructions, sets, repetitions, rest periods, filters,
family identity selection, full-frame image behavior, and enlargement.
