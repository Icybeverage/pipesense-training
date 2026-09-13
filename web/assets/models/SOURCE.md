# Anatomical glove model — source and attribution

## Model

- **Title:** Rigged Hand
- **Author:** Elena FF
- **Licence:** CC BY-SA 4.0
- **Files used:** `hand_left.glb`, `hand_right.glb`

The two GLB files are loaded by `web/src/gloves.js` (via `three/addons/loaders/GLTFLoader.js`)
as the primary rendered glove shell. The procedural rig in the same module stays in the
scene graph as the interaction fallback and remains the visible shell whenever a model
cannot be loaded or mapped. See `docs/REFERENCES.md` for the project-wide provenance note.

## Vendoring status

This directory ships `hand_left.glb`, `hand_right.glb`, and the verbatim
`license.txt`. The anatomical shell is therefore available to the browser; the
procedural shell remains the visible fallback if loading or rig mapping fails.

## Required licence file

`license.txt` sits beside the two GLBs in this directory and is copied verbatim from
the model source.

## Attribution requirement

CC BY-SA 4.0 requires attribution and share-alike. Any redistributed derivative of the
model must credit Elena FF, link to the licence, and indicate if changes were made. In this
project the models are modified at runtime only (materials replaced with the PipeSense glove
materials, scale normalised to a 0.20 m hand length, cameras/lights/helpers stripped); the
shipped GLB files themselves are unmodified.

## Runtime behaviour

`createGlove(side)` stays synchronous and never awaits the network. While a model loads,
and permanently if it fails, the procedural glove renders. The active shell is published
non-sensitively for automated QA:

- `document.body.dataset.gloveModels` — `loading` | `loaded` | `fallback`
- `window.PipeSense.gloveStatus()` — same value per side
