# PipeSense

PipeSense is a CoreWeave Hacks project: a first-person, gesture-driven plumbing trainer whose voice agent improves its coaching after every learner attempt.

The focused demo lesson is a professional P-trap installation. A deterministic simulation measures sequence, alignment, joint tightness, leaks, retained water and the sewer-gas seal. Observer, Coach, and Evaluator agents explain the error, select an intervention, preserve it for the next retry, and compare the new score with the baseline. W&B Weave traces that complete loop.

## Run the primary browser demo

```bash
cd backend
.venv/bin/python run.py
```

Open `http://127.0.0.1:8000`. The learner journey is:

1. Calibrate camera-based hand tracking.
2. Scroll through the five visual procedure cards.
3. Perform the lesson with articulated virtual work gloves.
4. Review the visible W&B loop: Observe → Coach → Adapt → Retry → Evaluate.

Maya connects only after a real user explicitly starts the simulation. Automated QA and `?qa=1` sessions remain silent.

## Browser controls

- Camera: all 21 MediaPipe hand landmarks drive wrist pose and articulated finger joints; thumb/index pinch grabs, wrist roll turns.
- Mouse: drag a glove to move and pinch; `Alt`+drag moves without pinching; wheel rotates a held control or tool.
- Keyboard: `W A S D Q E` controls the left glove, `I J K L U O` the right, `F`/`;` pinches, and `[`/`]` rotates.
- Demo automation: open **More** and enter `run`. It uses the same glove interaction path and cannot bypass simulation checks.

## W&B learning loop

The browser owns deterministic scoring. `POST /v1/attempts/evaluate` sends the score, prior score, issue classification, timing, input mode and interaction count to the backend. W&B Inference produces coaching language while Weave traces `pipesense/attempt-loop`. The app visibly applies one of three interventions to the next run: a visual target, a wider kinesthetic snap window, or a step-by-step reset. Successful and failed retries are compared against the previous score in the learner-facing loop card and the detailed Judge evidence drawer.

## Build the Unity scene

Use Unity 6000.0.82f1:

```bash
/Applications/Unity/Hub/Editor/6000.0.82f1/Unity.app/Contents/MacOS/Unity \
  -batchmode -quit -projectPath "$PWD" \
  -executeMethod PipeSense.Editor.PipeSenseSceneBuilder.Build \
  -logFile Logs/scene-build.log
```

Then open `Assets/Scenes/PipeSenseDemo.unity` and press Play.

Run EditMode tests:

```bash
/Applications/Unity/Hub/Editor/6000.0.82f1/Unity.app/Contents/MacOS/Unity \
  -batchmode -quit -projectPath "$PWD" -runTests -testPlatform EditMode \
  -testResults review/editmode-results.xml -logFile review/editmode.log
```

## Voice-agent backend

The browser includes deterministic offline coaching so the demo survives failed Wi-Fi. The traced backend exercises W&B Weave, W&B Inference and ElevenLabs Live:

```bash
cd backend
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
.venv/bin/python run.py
```

Without `WANDB_API_KEY`, the backend remains deterministic and makes no external calls. With credentials, each request is traced as `pipesense/attempt-loop`; W&B Inference may rewrite coaching language but cannot change the deterministic score.

Backend unit tests require only Python’s standard library:

```bash
cd backend && python3 -m unittest -v test_agents.py
```

## Architecture

```text
MediaPipe 21-landmark input / mouse-keyboard fallback
              ↓
Articulated Three.js work gloves + tools
              ↓
Deterministic plumbing scorer (source of truth)
              ↓
W&B Observer → Maya Voice Coach → intervention → retry → Evaluator
              ↓
Weave trace + visible score comparison
```

The Unity project remains an optional native prototype. The browser version is the primary demo because its MediaPipe hand tracking, live voice, adaptive loop, visual tutorial and deterministic interaction path are already integrated end to end.

See [docs/REFERENCES.md](docs/REFERENCES.md) for the user-supplied video and pre-existing TradesQuest curriculum provenance.
