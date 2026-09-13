# PipeSense — CoreWeave Hacks submission copy

Paste-ready form fields. Every claim below is backed by the recorded run and the
repository; evidence sources are listed at the end of this file.

## Title

PipeSense

## Tagline

First-person plumbing practice whose coach adapts after every attempt.
PipeSense uses MediaPipe-controlled virtual hands, deterministic simulation, W&B Weave and adaptive Maya voice coaching to let tradespeople practise real procedures safely before entering the workforce.

## Short description (100 words)

PipeSense is a first-person plumbing training simulation. The demo lesson builds
a P-trap under a sink with two-hand MediaPipe tracking that maps each finger
onto articulated virtual work gloves, and the tutorial unlocks only after
neutral hand calibration. A deterministic scorer checks sequence, alignment,
tightness, leaks, retained water, and the sewer-gas seal; the model never
decides correctness. After each water test, Weave traces observe, coach, adapt,
retry, evaluate: W&B Inference rewrites the coaching, one selected intervention
visibly changes the next attempt, and the evaluator compares the new score with
the baseline. Verified run: score 0 to 100 with gas blocked.

## Problem

On a real job, one badly seated trap means a callback, a leak, or sewer gas.
Plumbing skills are practiced on live systems, where mistakes are costly and
retries are slow to arrange. Video courses play back the procedure but cannot
measure whether a learner's joint actually seals.

## Solution

PipeSense is a first-person browser simulation for professional plumbing
practice. In the demo lesson (Build a P-Trap), the learner calibrates their
hands, reviews five visual procedure cards, then installs the trap using
articulated virtual work gloves driven by MediaPipe's 21 landmarks per hand.
Learner sessions require the camera: the tutorial and simulation stay locked
until both hands are tracked and the neutral pose is calibrated, so every
manipulation comes from the learner's real hands through the gloves.
Correctness is owned by a deterministic scorer: sequence, alignment, joint
tightness, leaks, retained water, and the sewer-gas seal. The model never
decides whether pipe geometry is valid. Each attempt ends in a water test, and
a successful trap visibly holds water and blocks sewer gas.

## Loop design (Observe → Coach → Adapt → Retry → Evaluate)

- Observe: structured telemetry plus the deterministic score and primary issue
  (for example, a connection gap).
- Coach: one concise hint built from the failure evidence. W&B Inference
  rewrites its language; it cannot change the score.
- Adapt: the retry policy selects one bounded intervention — visual target with
  ghost, wider kinesthetic snap window, or step-by-step reset — and the
  simulation visibly changes before the next attempt. This arrow is the product:
  the agent alters the practice run, not a chat message.
- Retry: the learner reseats the joints; the same deterministic checks rerun.
- Evaluate: Weave compares the new score with the prior attempt, and the
  strategy is kept or replaced.

Verified run: baseline 0 (trap stops short of the wall arm) → intervention
`change_modality_visual` → retry 100, water retained, sewer gas blocked,
strategy kept. The loop card and the judge evidence drawer show the same numbers
the trace recorded.

## How W&B is used

- Weave traces each attempt as `pipesense/attempt-loop`, with nested observer,
  coach, inference, and evaluator operations in project
  `productmaster-nimbus/pipesense-hackathon`. The app shows trace status and the
  attempt history in a judge evidence drawer.
- W&B Inference turns structured failure evidence into brief coaching language
  (verified run: `openai/gpt-oss-20b`, reported as used). Deterministic scoring
  stays in the browser and inference cannot alter it or declare a fitting
  correct.
- Verified local run: inference used, Weave trace active, score delta 0 → 100.

## Technical stack

- Browser: Three.js 0.170, MediaPipe Hand Landmarker (21 landmarks per hand,
  pinch grab and wrist-roll rotation), plain ES modules; deterministic
  simulation and scoring in `web/src/sim.js`.
- Backend: Python FastAPI (`backend/app.py`) with W&B Weave tracing, W&B
  Inference, and ElevenLabs Live conversational voice (Maya). API keys stay
  server-side; voice is opt-in and silent during automated QA; captions and
  browser speech are the fallback.
- Deployment: <https://pipesense-training.vercel.app> serves the web demo and
  backend as one Vercel deployment. Smoke-tested in Chromium: one automated
  lesson completed at score 100 with live W&B Inference and an active Weave
  trace.

## Demo steps for judges

1. Open <https://pipesense-training.vercel.app>. A webcam is required: the
   lesson is driven by the learner's real hands, so the setup stage starts by
   asking for the camera.
2. Enable the camera and hold both hands steady; the tutorial unlocks once the
   neutral pose is calibrated.
3. Review the five visual procedure cards.
4. Install the P-trap with the gloves; seat both joints with the wrench.
5. Run the water test and read the loop card: issue, score, intervention,
   verdict.
6. Open the judge evidence drawer for the inference provider, trace status, and
   attempt history.
7. Automated QA sessions (`?qa=1`/webdriver) replay the full lesson through the
   same glove interaction path, silently and without altering simulation
   checks; they are not part of the learner or judge-facing flow.

## Target tracks

- **Best Loop Design** — The selected intervention changes the next attempt:
  ghost target, snap window, or step reset. The recorded run shows the full
  observe → coach → adapt → retry → evaluate cycle with a real score delta
  (0 → 100) and a kept strategy.
- **Best Use of Weave** — One trace per attempt cycle
  (`pipesense/attempt-loop`) with nested observer, coach, inference, and
  evaluator operations; trace status and attempt history are visible in the app
  during the demo.
- **Most Production-Ready** — Camera-gated learner flow with mandatory neutral
  hand calibration; deterministic scoring separated from the LLM; offline
  coaching keeps the demo alive without network; the judge drawer labels live
  backend evidence versus local fallback honestly; deployed and smoke-tested
  end to end.
- **Best Social Media Demo** — The public 62-second H.264/AAC cut has Maya's
  conversational narration, a visible failure-to-success arc, and a final W&B
  evidence frame that makes the sponsor integration legible without extra
  explanation.

## URLs

- Live demo: <https://pipesense-training.vercel.app>
- Repository: <https://github.com/Icybeverage/pipesense-training>
- Narrated demo (Maya, 62 s):
  <https://pipesense-training.vercel.app/submission/pipesense-demo-maya.mp4>
- Dropbox demo:
  <https://www.dropbox.com/scl/fi/um50jd83usutpjpi5lnp8/PipeSense-Maya-Demo.mp4?rlkey=t1zondfw6u4p44hjxwxfts2lm&dl=0>
- Silent backup:
  <https://pipesense-training.vercel.app/submission/pipesense-demo-silent.mp4>
- W&B presentation page:
  <https://pipesense-training.vercel.app/submission/wandb-story-slide.png>

## Evidence sources

Claims above are traceable to `README.md`, `docs/DEMO_NARRATION.md`,
`docs/WANDB_PRESENTATION_PAGE.md`, and the checked items in
`docs/FINAL_HOUR_CHECKLIST.md`.
