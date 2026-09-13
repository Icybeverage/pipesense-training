# PipeSense hackathon project instructions

- This is a new, standalone CoreWeave Hacks project. Do not copy source code or assets from TradesQuest.
- The pre-existing TradesQuest plumbing course is curriculum reference only. Preserve provenance in `docs/REFERENCES.md`.
- Primary deliverable is a first-person browser simulation in `web/`: a dimensional dark workshop, realistic plumbing assemblies, and virtual work gloves driven by MediaPipe's 21 landmarks per hand. Pinch/grab and finger motion control tools and fittings. Mouse/keyboard is fallback only. Unity is an optional prototype. Follow the supplied 00:22–00:25 interaction reference.
- For this hackathon demo, implement one lesson only: **Build a P-Trap**. Use the TradesQuest curriculum as source material, but do not copy its application code or media. Depth, polish, glove control, tool use, adaptive coaching, and a convincing water/sewer-gas result matter more than a mission menu.
- Keep the learner interface minimal. Sponsor traces, run IDs, evaluation evidence and integration status belong in an optional judge view. Never claim a live integration based only on a configured endpoint.
- Qoder implements web/; Cursor reviews and fixes backend/ and later the frontend after Qoder completes. Avoid overlapping writes.
- Keep the first demo playable without a camera by providing keyboard/mouse simulation. MediaPipe input must be behind an interface so it can be added without destabilizing the demo.
- Voice agents must have a text fallback. Never embed API keys in Unity; all W&B and speech/model calls belong in the local backend.
- Use W&B Weave meaningfully: trace attempt observation, coaching, evaluation, and prompt revision; log deterministic scores alongside agent outputs.
- The retry loop is the product's central mechanic and demo story. After each water test: observe structured failure evidence, coach, select an intervention, alter the next attempt, evaluate score delta, then keep or replace the strategy. Never reduce this to a chat message that does not change the simulation.
- Position PipeSense as a first-person virtual simulation for professional/workforce training. The adaptive loop is its intelligence layer, not the whole product. Use mature workshop language and realistic procedures, tools, failure modes, performance feedback, and visual design. Do not present it as a children's classroom game or claim certification.
- Prefer deterministic scoring for correctness. The LLM explains and adapts coaching but does not decide whether pipe geometry is valid.
- Do not deploy, publish, submit, create cloud resources, or spend credits without the user's explicit request.
- Run Unity compile/tests and backend tests before claiming completion.
