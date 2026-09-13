# CoreWeave Hacks delivery checklist

Verified from the public event page on 2026-09-13 using an isolated Chromium
session. Public event: <https://luma.com/coreweavehacks>.

## Explicit event requirements and timing

- Theme: agents that cycle through reasoning and action, observe and evaluate
  their iterations, and improve on later passes.
- Submissions due: 1:00 PM PDT on September 13, 2026.
- Judging begins: 1:30 PM PDT.
- Relevant named prizes: Best Loop Design, Most Production-Ready, and Best Use
  of Weave. Other named prizes include ARIA, marimo, TypeSafe AI, and Best
  Social Media demo.
- Sponsor stack named on the page: W&B Models, Weave, Sandboxes, and ARIA;
  marimo; TypeSafe AI; AGI House as strategic sponsor.
- The public Luma page does not state a mandatory submission file format or a
  required hosting provider. Do not invent one.

## PipeSense submission package

### Required before recording

- [x] One focused certification-practice simulation: Build a P-Trap.
- [x] First-person 3D plumbing workspace with visible gloves, pipe fittings,
  adjustable wrench, valve, water, leak, and sewer-gas outcome.
- [x] MediaPipe Hand Landmarker input with 21 landmarks per hand, per-finger
  articulation, pinch grab/release, and wrist-roll rotation.
- [x] Camera and neutral hand calibration required before the tutorial and
  start-simulation flow unlock; no keyboard/mouse control is offered to
  learners.
- [x] Silent automated-QA channel (`?qa=1`/webdriver) reuses the same
  interaction checks so end-to-end tests remain possible without being
  advertised.
- [x] A staged learner journey: hand calibration, visual procedure cards,
  guided performance, outcome, and retry.
- [x] Deterministic scoring for sequence, alignment, tightness, leaks, retained
  water, and gas seal.
- [x] W&B Inference authenticated and returning coaching language.
- [x] Weave tracing active for `pipesense/attempt-loop`.
- [x] Visible Observe → Coach → Adapt → Retry → Evaluate loop.
- [x] Interventions change the next attempt and score delta is evaluated.
- [x] Maya live conversational voice; silent during development and QA.
- [x] Judge evidence drawer distinguishes live backend evidence from fallback.
- [x] Exact W&B presentation-page content and evidence fields are specified in
  `docs/WANDB_PRESENTATION_PAGE.md`.
- [x] Browser, backend, and deterministic simulation tests passing.

### Final handoff

- [x] Record one concise end-to-end demo showing hand calibration, one failure,
  Maya's intervention, a retry, the sealed result, and the Weave trace.
- [x] Provide the repository URL and working demo URL in the event submission
  form once the organizers expose or confirm that form.
- [ ] Keep a silent backup recording or captioned path in case venue audio or
  network access fails.

## Demo story for judges

1. The learner reviews the five visual procedure cards.
2. MediaPipe maps the learner's real hands to articulated work gloves.
3. Deterministic geometry detects a real procedural or connection failure.
4. W&B observes the telemetry and Weave traces the attempt loop.
5. Maya gives one concise intervention; the simulation visibly changes the
   next attempt with a ghost target, snap assist, or step reset.
6. The learner retries. The evaluator compares score delta and keeps or
   replaces the strategy.
7. A successful trap visibly retains water and blocks sewer gas.
