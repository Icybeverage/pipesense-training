# References and provenance

## Interaction reference

User-supplied Dropbox video `final.mp4`, reviewed only from 00:22–00:26. The reference shows a standing learner using two tracked hands in front of a large display. Two separated pipe sections move toward one another and visibly snap into a connected state. PipeSense uses this interaction concept—two-hand alignment, snap feedback, and a visible hand-landmark layer.

A trimmed excerpt of that reference window ships with the hackathon demo as `web/assets/real-world-hand-tracking.mp4`, with the poster frame `web/assets/real-world-hand-tracking-poster.jpg`. It appears in the setup stage as a muted, looping, playsinline visual labelled "Real-world hand tracking". The excerpt stays inside its 00:22–00:26 review window; no other portion of the source footage is redistributed.

## Hackathon tutorial stills

`web/assets/tutorial/step-01.jpg` through `step-05.jpg` are AI-rendered photographic instruction stills produced for this hackathon project with an image-generation model; no third-party stock photography is used. They depict the Build a P-Trap sequence under a sink — closing the supply valve, seating the trap on both sockets, tightening the tail and wall slip nuts with an adjustable wrench, and inspecting after the water test — in a consistent gloved-hands trade style. They are rendered without intentional brand marks, and no TradesQuest or reference-clip artwork is reused.

## Anatomical glove model

The rendered work gloves use the **Rigged Hand** model by **Elena FF**, licensed
**CC BY-SA 4.0**. The two GLB files (`hand_left.glb`, `hand_right.glb`) are loaded by
`web/src/gloves.js` through Three's `GLTFLoader` as the primary shell, with the
procedural rig kept as the interaction fallback. The model is modified at runtime only —
materials are replaced with PipeSense glove materials, scale is normalised to a 0.20 m
hand length, and the file's bundled cameras, lights and helpers are stripped; the shipped
GLB files are unmodified. Attribution, the required verbatim `license.txt` location and
the share-alike obligation are documented in `web/assets/models/SOURCE.md`; both GLBs
and the verbatim licence file are vendored beside that note.

## Curriculum reference

Pre-existing TradesQuest lesson family: **Build a P-Trap**. Concepts used as reference:

- A P-trap is the U-shaped pipe under a sink.
- Water held in the trap blocks sewer gases.
- Learners should complete an observable task, record the result, and connect the result to evidence.
- Safety boundary: use a simulated or teacher-approved model rather than real tools, chemicals, or a worksite.

No TradesQuest source code or media is copied into this repository. The Unity experience, agent loop, prompts, telemetry schema, and backend are new hackathon work.

The learner-facing demo intentionally omits grade bands. PipeSense presents the
material as a hypothetical professional skills-check practice simulation and
does not claim to issue or represent an accredited certification.
