# PipeSense demo narration and shot list

One continuous screen recording, roughly 60 seconds, narrated by Maya. Every
number, transcript, and trace shown on screen comes from the live run being
recorded. The only intentional setup is that attempt one demonstrates the
failure case so the retry loop can be observed honestly.

## Beats and claims map

| Beat | Spoken claim | Verified in repo |
| --- | --- | --- |
| 1 (0:00–0:09) | Cost and risk of practicing on live systems | Project premise; `docs/REFERENCES.md`, `docs/SIMULATION_DESIGN.md` |
| 2 (0:09–0:20) | First-person workshop, MediaPipe two-hand and pinch-to-glove mapping | `web/index.html`, `web/src/handtrack.js`, `web/src/gloves.js` |
| 3 (0:20–0:30) | Deterministic geometry check is the source of truth; first attempt exposes a connection gap | `web/src/sim.js` (score, `primary_issue`), `backend/agents.py` (`observer`) |
| 4 (0:30–0:40) | Weave traces observe→coach→adapt→retry→evaluate; Maya speaks the coaching; inference cannot alter score | `docs/WANDB_PRESENTATION_PAGE.md`, `web/src/voice.js`, `backend/app.py` |
| 5 (0:40–0:52) | Intervention visible in retry; score improves; trap holds water and blocks sewer gas | `web/app.js` (`applyIntervention`), `web/src/sim.js` (`holdsWater`, gas) |
| 6 (0:52–1:00) | Live trace as proof, then the next practice run | Weave/Judge evidence panels |

## Spoken script (60 seconds, Maya)

Deliver calmly and evenly. Do not rush. Let the workshop audio and the water
test carry the pauses.

> PipeSense uses MediaPipe-controlled virtual hands, deterministic simulation,
> W&B Weave, and adaptive Maya voice coaching to let tradespeople practise real
> procedures safely before entering the workforce. On a real job, one bad trap
> install means callbacks, leaks, and sewer-gas risk. Here, both hands and every
> finger drive articulated virtual gloves; pinch to grab a fitting and roll the
> wrist to seat it. Correctness comes from deterministic geometry, not the
> model. Attempt one scores zero with a connection gap. Weave traces the attempt,
> and W&B Inference rewrites the coaching I speak. The selected visual
> intervention changes the retry with an alignment cue and ghost target. The
> learner reseats both joints and reruns water. The result is score one hundred,
> water retained, and sewer gas blocked. Because performance improved, the
> strategy is kept. That is the loop: observe, coach, adapt, retry, evaluate—with
> the complete shipped stack and evidence on screen.

Word count is 160, which reads at 55–65 seconds at a measured pace.

## Timecoded shot list

### 0:00–0:09 — The problem

- **Shot:** Live camera. Start on the workshop view under the sink: sink
  tailpiece above, wall drain arm behind, bench with fittings below, gloves in
  the lower foreground.
- **On screen:** PipeSense title, "Build a P-Trap".
- **Say:** "On a jobsite, a mistake means a callback, a leak, or worse.
  PipeSense lets learners build the P-trap in a workshop first."

### 0:09–0:20 — Hands and glove control

- **Shot:** Cut to the setup stage: calibration completes, then scroll the five
  procedure cards briefly. Cut into the simulation. Show a real pinch-to-grab
  of the trap and a wrist roll. Briefly bring up the camera tile so the
  MediaPipe landmark layer on the hands is visible — two seconds is enough.
- **On screen:** Tracking readout, then the gloves articulating finger by
  finger.
- **Say:** "MediaPipe tracks both hands and maps each finger onto the virtual
  work gloves — pinch to grab a fitting, roll the wrist to seat it."

### 0:20–0:30 — First attempt fails, deterministically

- **Shot:** The learner seats the trap short of the wall arm and runs the water
  test. The leak runs and the alignment readout flags the gap. Hold on the
  practice card and loop card.
- **On screen:** Issue reads connection gap; deterministic baseline score shown
  as `0`. Leave the score up for at least two seconds.
- **Say:** "Every run ends in a check the geometry performs, not the model:
  alignment, tightness, water left in the trap. The first attempt stops short
  of the wall arm, and the deterministic check names the connection gap."

### 0:30–0:40 — W&B observes, Maya coaches

- **Shot:** Open the W&B story panel: the loop strip Observe → Coach → Adapt →
  Retry → Evaluate with the traced run. Then adjust the workspace so the live
  coaching caption and Maya's voice read as the same moment. Flash the judge
  drawer long enough to see inference "used", the model name and the Weave
  project — do not dwell on raw JSON.
- **On screen:** Coach line from the backend response; judge evidence showing
  provider and trace.
- **Say:** "W&B Weave has already recorded the attempt, and I speak the
  coaching it returns."

### 0:40–0:52 — Retry, visibly different

- **Shot:** Retry. The ghost target and visual alignment cue show the seating
  pose for `change_modality_visual`. Show the intervention chip, the learner
  seating both joints with the wrench, then the water test: clean run, water
  sitting in the U-bend, sewer-gas trace blocked. Show the score comparison and
  the verdict.
- **On screen:** Intervention chip labels `change_modality_visual`; score shows
  `0 → 100 (+100)`; verdict reads kept.
- **Say:** "The selected intervention changes the retry itself — this time the
  visual cue lines up the seam before seating. The joints seal, the trap keeps
  water, and sewer gas is blocked."

### 0:52–1:00 — Why it holds together

- **Shot:** Pull back to the loop card and the judge evidence: attempt history
  with deterministic scores, strategies and verdicts, and the live geometry
  checks. End on the finished trap.
- **On screen:** Keep or replace, traced in Weave. Attempt history visible.
- **Say:** "Score moves from zero to one hundred, the strategy stays kept, and
  Weave keeps the trace for the next practice run."

## Production notes

- **What is live vs. scripted.** All numbers, transcripts, and traces shown are
  from the take being recorded. The only scripted element is that the first
  attempt intentionally stops short of the wall arm to expose the connection
  gap; everything after that is the product reacting to real telemetry.
- **Maya.** ElevenLabs Live conversational agent. The browser receives a
  signed URL minted by the local backend; the API key never reaches the
  browser. When the learner finishes an attempt, the backend's coaching text
  is handed to the live session as a contextual update, and Maya speaks it.
  Voice is silent during development and automated QA; recording sessions are
  real user sessions.
- **Fallback ladder, on the record.** If the venue network drops the agent
  session, coaching degrades to captions and browser speech, and the judge
  drawer labels the local fallback honestly. Do not present a configured
  endpoint as a live integration; read the drawer.
- **Deterministic boundary.** W&B Inference rewrites coaching language only.
  It cannot alter the score or declare a fitting correct. If asked on stage,
  point at the score value before and after inference in the judge drawer.
- **Recorded QA evidence locked for this cut.** Baseline score `0`, retry score
  `100`, strategy `change_modality_visual` with verdict kept, inference used,
  Weave trace active, and trap complete with gas blocked.
- **Before recording.** Backend running with `WANDB_API_KEY` and
  `PIPESENSE_ENABLE_WEAVE_TRACING=1`; confirm `/health` reports tracing active
  and voice configured. Record a second silent pass with captions as backup.
- **Prize targeting, for the submission text (not the narration).** Best Loop
  Design: the adapt→retry arrow is the product. Best Use of Weave: one trace
  per attempt cycle with nested operations. Most Production-Ready:
  camera-gated learner flow with mandatory hand calibration, deterministic
  core, honest evidence drawer, graceful degradation.
- **Team note (not for narration).** Qoder implemented the web simulation and
  the backend loop; Cursor reviewed and fixed the backend, then the frontend
  after Qoder's pass.
