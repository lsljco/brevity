# Workout image accuracy correction — September 20, 2026

## Status
Draft safeguard, NOT a completed image replacement or production deployment.
Do not describe this work as a fully corrected Workout Library.

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

Seven isolated Node policy/prompt tests passed locally. No image-generation API
request was made. Full application build, browser regression tests, and live
visual verification have not been completed in this working environment.

## Remaining release work
1. Replace every mismatched or withdrawn image with an individually generated,
   exercise-specific asset. Do not rename or crop one existing photograph to
   make it appear to be several different movements.
2. Use the established approved family PORTRAITS as identity authority, not app
   screenshots or later exercise renders. Verify the bundled identity reference
   source against those approved portraits before batch generation.
3. Visually review the remaining legacy originals. An exact filename binding is
   NOT proof of correct form, natural gaze, or identity fidelity.
4. Review every replacement for the exact exercise, actual equipment, grip,
   stance, unilateral/bilateral action, bench angle/support points, natural gaze,
   head/neck alignment, full-body framing, anatomy, and recognizable identity.
5. Register new approved, versioned assets against their exact exercise IDs.
   Check both duplicate paths and duplicate image content; different filenames
   must not disguise the same photograph. The same exact exercise may use its
   image in multiple views, but different exercises/variants must not share it.
6. Run the full application build and browser tests for Exercise Library,
   Today's Workout, the goal builder, Today Pillar 3, and tap-to-enlarge on phone
   and desktop. Update existing image-click tests to use a retained valid image
   and add coverage for the non-clickable pending state.
7. Keep this PR in draft until the partial-photo/pending-state impact and
   replacement assets have been reviewed. Do not merge/deploy this safeguard
   while representing the replacements as already done.

Preserve exercise instructions, sets, repetitions, rest periods, filters,
family identity selection, full-frame image behavior, and enlargement.
