// PipeSense — first-person "Build a P-Trap" demo orchestrator.
//
// Run:  cd web && python3 -m http.server 4173   (or npm start)
//       open http://127.0.0.1:4173
// The FastAPI backend serves this directory at / and answers
// POST /v1/attempts/evaluate, GET /health and POST /v1/voice/signed-url.
// Geometry validity is decided locally by src/sim.js; the backend (or the
// local fallback) explains and adapts the coaching, and the chosen strategy
// visibly changes the next attempt (ghost, snap assist, step checklist).
//
// Learner sessions are camera-only: the tutorial and simulation unlock once
// both hands are detected and the neutral pose is calibrated. Pointer,
// keyboard and scripted macro input exist only as a silent automated-QA
// channel (?qa=1 or navigator.webdriver) and flow through the same
// src/interaction.js checks as the camera, so nothing can skip the sim.

import * as THREE from 'three';
import { createWorld } from './src/world.js';
import { createProps, trapCurvePoints } from './src/props.js';
import { createGlove } from './src/gloves.js';
import { createFx } from './src/fx.js';
import { createInput } from './src/input.js';
import { createInteraction } from './src/interaction.js';
import { createSim, resetSim, advance, evaluate as evaluateSim, GEOM, TUNE } from './src/sim.js';
import { BACKEND_BASE, BACKEND_COOLDOWN_MS, buildPayload, getHealth, offlineCoaching, postEvaluate } from './src/net.js';
import { createVoice } from './src/voice.js';

const $ = (id) => document.getElementById(id);
const URL_PARAMS = new URLSearchParams(location.search);
const IS_AUTOMATED_SESSION = navigator.webdriver || URL_PARAMS.has('qa');
const IS_PRESENTATION = URL_PARAMS.has('present');

const SEAT_ANCHOR = new THREE.Vector3(GEOM.tail.x, GEOM.seat.tailTopY, GEOM.seatPose.z);
const GAS_SEAL_POINT = new THREE.Vector3(0, 0.62, 0.30);
const STRATEGY_LADDER = ['change_modality_visual', 'change_modality_kinesthetic', 'step_by_step_reset'];
const STRATEGY_LABEL = {
  reinforce: 'Reinforce — keep the current aids',
  change_modality_visual: 'Visual scaffold — ghost target shown',
  change_modality_kinesthetic: 'Kinesthetic assist — snap window ×1.6',
  step_by_step_reset: 'Step-by-step reset — follow the checklist',
};
const LESSON_STEPS = [
  {
    id: 'valve',
    title: 'Close the supply valve',
    hint: 'Pinch the red handle and rotate clockwise until it stops.',
    done: (s) => s.valve.closed,
    tutorial: {
      image: 'https://raw.githubusercontent.com/Icybeverage/pipesense-training/main/web/assets/tutorial/step-01.jpg',
      alt: 'A gloved hand closing the red supply valve under the sink.',
      overlay: '<svg viewBox="0 0 720 720" aria-hidden="true"><path class="diagram-motion" d="M218 302a92 92 0 1 1 116 61"/><path d="m319 330 18 36-40 4"/></svg>',
    },
  },
  {
    id: 'seat',
    title: 'Seat both sockets',
    hint: 'Lift the trap level and center both sockets before you release.',
    done: (s) => s.objects.trap.mode === 'seated',
    tutorial: {
      image: 'https://raw.githubusercontent.com/Icybeverage/pipesense-training/main/web/assets/tutorial/step-02.jpg',
      alt: 'Two gloved hands lifting the P-trap to meet the tailpiece and wall drain sockets.',
      overlay: '<svg viewBox="0 0 720 720" aria-hidden="true"><circle cx="296" cy="287" r="42"/><circle cx="542" cy="298" r="42"/><path d="M296 480V344m-18 24 18-24 18 24M542 478V355m-18 24 18-24 18 24"/></svg>',
    },
  },
  {
    id: 'tail_nut',
    title: 'Tighten the tail nut',
    hint: 'Seat the wrench jaw on the tail nut and rotate until it clicks tight.',
    done: (s) => s.joints.tail.tight >= TUNE.tightFull,
    tutorial: {
      image: 'https://raw.githubusercontent.com/Icybeverage/pipesense-training/main/web/assets/tutorial/step-03.jpg',
      alt: 'One gloved hand steadying the trap while an adjustable wrench tightens the tail slip nut.',
      overlay: '<svg viewBox="0 0 720 720" aria-hidden="true"><circle cx="388" cy="254" r="46"/><path class="diagram-motion" d="M438 202a88 88 0 0 1 8 114"/><path d="m431 293 16 27 26-18"/></svg>',
    },
  },
  {
    id: 'wall_nut',
    title: 'Tighten the wall nut',
    hint: 'Hold the trap level and tighten the wall nut with the wrench.',
    done: (s) => s.joints.wall.tight >= TUNE.tightFull,
    tutorial: {
      image: 'https://raw.githubusercontent.com/Icybeverage/pipesense-training/main/web/assets/tutorial/step-04.jpg',
      alt: 'An adjustable wrench tightening the wall-side slip nut on the horizontal drain arm.',
      overlay: '<svg viewBox="0 0 720 720" aria-hidden="true"><circle cx="548" cy="286" r="45"/><path class="diagram-motion" d="M596 231a88 88 0 0 1 8 112"/><path d="m589 320 16 27 26-18"/></svg>',
    },
  },
  {
    id: 'water',
    title: 'Run water and inspect',
    hint: 'Open the faucet and confirm the trap holds water with no leaks at either joint.',
    done: (s) => s.phase === 'complete',
    tutorial: {
      image: 'https://raw.githubusercontent.com/Icybeverage/pipesense-training/main/web/assets/tutorial/step-05.jpg',
      alt: 'Gloved hands checking the water-filled trap after the test; the joints stay dry.',
      overlay: '<svg viewBox="0 0 720 720" aria-hidden="true"><path class="diagram-motion" d="M360 72v238m-16-24 16 24 16-24"/><path class="diagram-check" d="m273 293 16 16 31-38m197 35 16 16 31-38"/></svg>',
    },
  },
];

// -------------------------------------------------------------------- boot

const sim = createSim();
const canvas = $('scene');
const world = createWorld({ canvas });
const props = createProps(world.scene);
const gloves = { left: createGlove('left'), right: createGlove('right') };
world.scene.add(gloves.left.root, gloves.right.root);
const fx = createFx(world.scene);
const input = createInput({ canvas, video: $('cam-video'), onStatus: onInputStatus, automated: IS_AUTOMATED_SESSION });
const interaction = createInteraction({ sim, input, props, onEvent: onSimEvent });
const voice = createVoice({ onCaption: showCaption, onStatus: onVoiceStatus });
const guides = createGuides();

const session = {
  started: false,
  attempts: 0,
  previousScore: -1,
  lastEvalAt: 0,
  lastKey: '',
  inFlight: false,
  waterRunAt: 0,
  autoEvalTimer: null,
  health: null,
  lastRequest: null,
  lastResponse: null,
  evalHistory: [],
  strategy: { current: 'none', verdict: null },
  backend: { cooldownUntil: 0 },
  macro: { name: null, running: false, cancelled: false },
  handsHinted: false,
  calibNotified: false,
  tutorialIndex: 0,
};

let propsOut = null;
const tmpVec = new THREE.Vector3();

function wrenchStateLine(state) {
  if (state.objects.wrench.mode === 'held') {
    const side = state.objects.wrench.heldBy || 'hand';
    return `Wrench held in ${side} hand.`;
  }
  return 'Pick up the adjustable wrench from the bench first.';
}

function describeStep(step, state) {
  if (step.id === 'tail_nut' || step.id === 'wall_nut') {
    return {
      title: step.title,
      hint: `${wrenchStateLine(state)} ${step.hint}`,
      checklist: `${step.title} (${state.objects.wrench.mode === 'held' ? 'wrench held' : 'wrench needed'})`,
    };
  }
  return { title: step.title, hint: step.hint, checklist: step.title };
}

// ------------------------------------------------------------------ guides

function createGuides() {
  const group = new THREE.Group();
  group.name = 'guides';

  // Ghost of the correctly seated trap (visual scaffold).
  const ghostGroup = new THREE.Group();
  const ghostMat = new THREE.MeshBasicMaterial({
    color: 0x67e8f9, transparent: true, opacity: 0.15,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const curve = new THREE.CatmullRomCurve3(
    trapCurvePoints().map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, 'centripetal', 0.4,
  );
  ghostGroup.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 72, 0.0225, 16, false), ghostMat));
  ghostGroup.position.set(GEOM.seatPose.x, GEOM.seatPose.y, GEOM.seatPose.z);
  group.add(ghostGroup);

  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x9be8ff, transparent: true, opacity: 0.4,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const ringGeo = new THREE.TorusGeometry(0.0285, 0.0022, 8, 36);
  const tailRing = new THREE.Mesh(ringGeo, ringMat);
  tailRing.rotation.x = Math.PI / 2;
  tailRing.position.set(GEOM.tail.x, GEOM.tail.endY + 0.004, GEOM.tail.z);
  const wallRing = new THREE.Mesh(ringGeo, ringMat);
  wallRing.position.set(0, GEOM.wall.y, GEOM.wall.endZ - 0.004);
  group.add(tailRing, wallRing);

  // Pulse marker over the next required target (all interventions).
  const pulse = new THREE.Group();
  const pulseMat = new THREE.MeshBasicMaterial({
    color: 0x67e8f9, transparent: true, opacity: 0.65,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const pulseRing = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.0032, 8, 40), pulseMat);
  pulseRing.rotation.x = Math.PI / 2;
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0x67e8f9, transparent: true, opacity: 0.08,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.052, 0.3, 14, 1, true), beamMat);
  beam.position.y = 0.16;
  pulse.add(pulseRing, beam);
  pulse.visible = false;
  group.add(pulse);

  let mode = 'none';
  let stepsSignature = '';

  function renderChip() {
    const chip = $('strategy-chip');
    if (session.strategy.current === 'none') {
      chip.hidden = true;
      return;
    }
    chip.hidden = false;
    const label = STRATEGY_LABEL[session.strategy.current] || session.strategy.current;
    chip.textContent = `Intervention · ${label}${session.strategy.verdict ? ` · ${session.strategy.verdict}` : ''}`;
  }

  function renderSteps(state) {
    const done = LESSON_STEPS.map((step) => step.done(state));
    const signature = `${done.join(',')}|${state.objects.wrench.mode}|${state.objects.wrench.heldBy || ''}`;
    if (signature === stepsSignature) return;
    stepsSignature = signature;
    const active = done.indexOf(false);
    const list = $('steps-list');
    list.textContent = '';
    LESSON_STEPS.forEach((step, i) => {
      const copy = describeStep(step, state);
      const li = document.createElement('li');
      li.textContent = copy.checklist;
      li.className = done[i] ? 'done' : i === active ? 'active' : '';
      list.append(li);
    });
    if (active > 0) {
      showCaption({ text: `Step ${active + 1} of ${LESSON_STEPS.length} — ${describeStep(LESSON_STEPS[active], state).checklist}.`, attrib: 'checklist' });
    }
  }

  function renderAlign(state) {
    const c = evaluateSim(state).checks;
    const snap = TUNE.snapLateral * state.assist.snapScale;
    const eng = TUNE.snapEngage * state.assist.snapScale;
    const rows = [
      ['Tail vertical', c.trap.tail_engage_m, eng],
      ['Tail sideways', Math.abs(c.trap.tail_lateral_m), snap],
      ['Wall depth', c.trap.wall_engage_m, eng],
      ['Wall sideways', Math.abs(c.trap.wall_lateral_m), snap],
    ];
    const wrap = $('align-rows');
    wrap.textContent = '';
    for (const [label, value, window_] of rows) {
      const row = document.createElement('div');
      row.className = 'align-row';
      const name = document.createElement('span');
      name.textContent = label;
      const val = document.createElement('span');
      val.className = value >= window_ ? 'ok' : 'off';
      val.textContent = `${(value * 1000).toFixed(1)} mm`;
      row.append(name, val);
      wrap.append(row);
    }
    $('align-note').textContent = state.assist.snapScale > 1
      ? `Snap assist active (×${state.assist.snapScale.toFixed(1)}): green = within snap window`
      : 'Green = within the snap window';
  }

  function resolveTarget(state) {
    if (state.phase === 'complete') return null;
    if (!state.valve.closed) return propsOut.valveKnob;
    const trap = state.objects.trap;
    if (trap.mode === 'shelf') return propsOut.trapWorld;
    if (trap.mode === 'held') return SEAT_ANCHOR;
    if (state.joints.tail.tight < TUNE.tightFull) {
      if (state.objects.wrench.mode === 'shelf') return propsOut.wrench.getWorldPosition(tmpVec);
      return tmpVec.set(GEOM.tail.x, propsOut.nutTailY, GEOM.tail.z);
    }
    if (state.joints.wall.tight < TUNE.tightFull) {
      if (state.objects.wrench.mode === 'shelf') return propsOut.wrench.getWorldPosition(tmpVec);
      return tmpVec.set(0, GEOM.wall.y, propsOut.nutWallZ);
    }
    return propsOut.faucetKnob;
  }

  function setMode(next) {
    mode = next;
    const visual = next === 'visual';
    ghostGroup.visible = visual;
    tailRing.visible = visual;
    wallRing.visible = visual;
    pulse.visible = next !== 'none';
    $('steps').hidden = next !== 'steps';
    $('align').hidden = next !== 'kinesthetic';
    if (next !== 'steps') stepsSignature = '';
    renderChip();
  }

  function update(state) {
    if (mode === 'kinesthetic') renderAlign(state);
    if (mode === 'steps') renderSteps(state);
    if (!pulse.visible) return;
    const target = resolveTarget(state);
    if (target) pulse.position.copy(target);
    pulse.visible = Boolean(target);
    if (!pulse.visible) return;
    const t = performance.now() * 0.004;
    pulseRing.scale.setScalar(1 + Math.sin(t) * 0.14);
    beamMat.opacity = 0.05 + 0.045 * (1 + Math.sin(t));
  }

  return {
    group,
    setMode,
    update,
    get mode() { return mode; },
    steps: LESSON_STEPS,
    celebrate() { fx.spawnPulse('seat', GAS_SEAL_POINT); },
  };
}

// -------------------------------------------------------------- sim events

function onSimEvent(event) {
  switch (event.type) {
    case 'reject': {
      const reasons = {
        trap_not_free: 'The trap is already in hand.',
        wrench_not_free: 'The wrench is already in hand.',
        no_wrench: 'A slip nut needs the wrench held in that hand.',
        joint_unseated: 'Seat the trap before tightening the nuts.',
      };
      showCaption({ text: reasons[event.reason] || 'That action is not available.', attrib: 'workflow' });
      break;
    }
    case 'valve_closed':
      showCaption({ text: 'Supply valve closed. No water moves while you work.', attrib: 'workflow' });
      break;
    case 'valve_opened':
      showCaption({ text: 'Supply valve open — close it before tightening.', attrib: 'workflow' });
      break;
    case 'valve_wrong_direction':
      showCaption({ text: 'Wrong direction — rotate clockwise to close the supply valve.', attrib: 'workflow' });
      break;
    case 'seated':
      fx.spawnPulse('seat', SEAT_ANCHOR);
      showCaption({ text: 'Both sockets seated. Now tighten the slip nuts.', attrib: 'workflow' });
      break;
    case 'dropped':
      showCaption({
        text: event.axis === 'height'
          ? 'The sockets missed vertically — lift or lower the trap before releasing.'
          : 'The sockets missed sideways — center both ends over the pipes before releasing.',
        attrib: 'workflow',
      });
      evaluateAttempt('seating');
      break;
    case 'tightened':
      showCaption({ text: `${event.joint === 'tail' ? 'Tail' : 'Wall'} slip nut tight.`, attrib: 'workflow' });
      break;
    case 'water_on':
      session.waterRunAt = performance.now();
      showCaption({ text: 'Water running — watch both joints and the trap.', attrib: 'workflow' });
      break;
    case 'water_off':
      showCaption({ text: 'Water off.', attrib: 'workflow' });
      if (session.waterRunAt && performance.now() - session.waterRunAt > 1200) evaluateAttempt('water_off');
      break;
    case 'spill_start':
      showCaption({ text: 'Water is pouring past the open drain — shut it off and check the assembly.', attrib: 'workflow' });
      scheduleAutoEval(2400);
      break;
    case 'leak_start':
      showCaption({ text: 'A joint is leaking. This test found the failure.', attrib: 'workflow' });
      scheduleAutoEval(2600);
      break;
    case 'complete':
      guides.celebrate();
      showCaption({ text: 'Trap holds water and blocks sewer gas. Lesson complete.', attrib: 'workflow' });
      evaluateAttempt('complete', true);
      break;
    default:
      break;
  }
}

function onInputStatus(status) {
  const cam = status.camera;
  const gloveFlowReady = cam.active && cam.calibrated && cam.handsSeen >= 2;
  $('cam-wrap').hidden = !cam.active;
  const holdTag = cam.holding > 0 && cam.handsSeen === 0 ? ' · holding pose' : '';
  $('cam-tag').textContent = cam.active
    ? `CAM · ${cam.handsSeen} hand${cam.handsSeen === 1 ? '' : 's'}${holdTag}`
    : cam.status === 'error' ? `CAM error: ${cam.error}` : 'CAM off';
  $('btn-camera').setAttribute('aria-pressed', cam.active ? 'true' : 'false');
  $('btn-camera').textContent = cam.active ? 'Camera: on' : 'Camera: off';
  const setupButton = $('btn-setup-camera');
  const tracking = $('tracking-readout');
  if (setupButton) {
    setupButton.textContent = cam.active
      ? (cam.calibrated ? 'Hands calibrated — camera on' : 'Calibrating — hold both hands')
      : 'Enable hand tracking';
  }
  if (!IS_AUTOMATED_SESSION) {
    // The learner flow stays locked until the camera sees both hands and the
    // neutral pose is calibrated; automated QA sessions are never gated.
    $('btn-tour').disabled = !session.started && !gloveFlowReady;
    $('btn-go').disabled = !session.started && !gloveFlowReady;
  }
  if (tracking) {
    const readyHands = cam.active && cam.handsSeen >= 2;
    const calibrating = cam.active && !cam.calibrated && cam.handsSeen > 0;
    const state = cam.status === 'error' ? 'error' : readyHands ? (calibrating ? 'searching' : 'ready') : cam.active ? 'searching' : 'idle';
    tracking.dataset.state = state;
    $('tracking-title').textContent = cam.status === 'error' ? 'Camera unavailable'
      : calibrating ? 'Calibrating your neutral pose'
        : readyHands ? '2 hands mapped'
          : cam.active ? 'Looking for your hands' : 'Camera required — not connected';
    $('tracking-detail').textContent = cam.status === 'error' ? cam.error
      : calibrating ? `Hold both hands steady — ${Math.round(cam.calibProgress * 100)}% · calibration unlocks the tutorial`
        : readyHands ? 'Neutral pose set — pinch thumb to index to grab tools.'
          : cam.active ? 'Raise both hands, palms facing the camera — both hands must be tracked to unlock the tutorial.'
            : 'Enable the camera to map your hands to the virtual work gloves.';
  }
  if (cam.calibrated && !session.calibNotified) {
    session.calibNotified = true;
    toast('Neutral pose calibrated — pinch thumb to index to grab a tool.');
  }
  if (!cam.active) session.calibNotified = false;
  if (cam.status === 'error' && cam.error) toast(`Camera unavailable — ${cam.error}`);
  if (cam.active && cam.handsSeen === 0 && !session.handsHinted) {
    session.handsHinted = true;
    toast('Camera on — hold both hands in frame.');
  }
}

function onVoiceStatus(status) {
  $('btn-voice').setAttribute('aria-pressed', status.enabled ? 'true' : 'false');
  $('btn-voice').textContent = status.enabled ? 'Maya: on' : 'Maya: off';
  const agent = status.agent;
  $('btn-live').textContent = agent.connected ? 'ElevenLabs: live'
    : agent.status === 'error' || agent.status === 'unavailable' ? 'ElevenLabs: unavailable'
      : 'Connect live agent';
  renderJudge();
  renderStory();
}

function showCaption({ text, attrib }) {
  const cap = $('caption');
  cap.textContent = text;
  cap.classList.remove('flash');
  void cap.offsetWidth;
  cap.classList.add('flash');
  $('attrib').textContent = attrib || '';
}

let toastTimer = null;
function toast(text) {
  if (IS_PRESENTATION && /^Autopilot\b/.test(text)) return;
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}

// ---------------------------------------------------------- guided UX flow

function requireGloveFlow() {
  if (IS_AUTOMATED_SESSION) return true;
  if (input.cameraState.active && input.calibrationState().ready && input.cameraState.handsSeen >= 2) return true;
  toast('Hand tracking required — enable the camera, keep both hands in frame, and hold for calibration.');
  return false;
}

function showFlowStage(name) {
  const setup = $('stage-setup');
  const tutorial = $('stage-tutorial');
  const isTutorial = name === 'tutorial';
  const progressStep = session.started ? 3 : isTutorial ? 2 : 1;
  setup.hidden = isTutorial;
  setup.classList.toggle('active', !isTutorial);
  tutorial.hidden = !isTutorial;
  tutorial.classList.toggle('active', isTutorial);
  document.querySelectorAll('.flow-progress i').forEach((dot, i) => {
    dot.classList.toggle('active', i < progressStep);
  });
  document.querySelector('.flow-progress')?.setAttribute('aria-valuenow', String(progressStep));
  if (isTutorial) requestAnimationFrame(() => setTutorialIndex(session.tutorialIndex, false));
}

function setTutorialIndex(index, smooth = true) {
  const cards = [...document.querySelectorAll('.tutorial-card')];
  if (!cards.length) return;
  session.tutorialIndex = Math.max(0, Math.min(cards.length - 1, index));
  const card = cards[session.tutorialIndex];
  const deck = $('tutorial-deck');
  session.deckProgrammatic = true;
  deck.scrollTo({ left: card.offsetLeft - (deck.clientWidth - card.offsetWidth) / 2, behavior: smooth ? 'smooth' : 'auto' });
  clearTimeout(session.deckProgrammaticTimer);
  session.deckProgrammaticTimer = setTimeout(() => { session.deckProgrammatic = false; }, smooth ? 520 : 80);
  cards.forEach((item, i) => item.classList.toggle('current', i === session.tutorialIndex));
  $('deck-position').textContent = `${session.tutorialIndex + 1} / ${cards.length}`;
  $('btn-tour-prev').disabled = session.tutorialIndex === 0;
  const atEnd = session.tutorialIndex === cards.length - 1;
  $('btn-tour-next').hidden = atEnd;
  $('btn-go').hidden = !atEnd;
}

function renderPracticeCard() {
  const done = LESSON_STEPS.map((step) => step.done(sim));
  let active = done.indexOf(false);
  if (active < 0) active = LESSON_STEPS.length - 1;
  const step = LESSON_STEPS[active];
  const copy = describeStep(step, sim);
  $('practice-count').textContent = `STEP ${String(active + 1).padStart(2, '0')} / ${String(LESSON_STEPS.length).padStart(2, '0')}`;
  $('practice-title').textContent = sim.phase === 'complete' ? 'P-trap verified' : copy.title;
  $('practice-hint').textContent = sim.phase === 'complete' ? 'The trap holds water and blocks sewer gas.' : copy.hint;
  $('practice-status').textContent = sim.phase === 'complete' ? 'COMPLETE' : 'IN PROGRESS';
  $('practice-status').classList.toggle('complete', sim.phase === 'complete');
  $('practice-progress').style.width = `${((done.filter(Boolean).length + (sim.phase === 'complete' ? 0 : 0.16)) / LESSON_STEPS.length) * 100}%`;
}

function setLoopPhase(phase, message, source) {
  const card = $('loop-card');
  if (!card) return;
  card.hidden = !session.started;
  card.dataset.phase = phase || '';
  card.querySelectorAll('[data-loop]').forEach((node) => node.classList.toggle('active', node.dataset.loop === phase));
  if (message) $('loop-message').textContent = message;
  if (source) $('loop-source').textContent = source;
}

// -------------------------------------------------------- retry-loop coach

function scheduleAutoEval(delayMs) {
  clearTimeout(session.autoEvalTimer);
  session.autoEvalTimer = setTimeout(() => evaluateAttempt('failure'), delayMs);
}

function chooseStrategy(suggested, improved) {
  const baseline = session.previousScore < 0;
  if (baseline && session.strategy.current === 'none') {
    if (session.lastRequest?.payload?.score >= 100) return { strategy: 'reinforce', verdict: 'initial' };
    return { strategy: 'change_modality_visual', verdict: 'initial' };
  }
  const current = session.strategy.current;
  if (current !== 'none' && improved) return { strategy: current, verdict: 'kept' };
  if (improved) return { strategy: 'reinforce', verdict: 'kept' };
  if (current === 'none') return { strategy: suggested, verdict: 'initial' };
  if (suggested === current) {
    const index = STRATEGY_LADDER.indexOf(current);
    const next = STRATEGY_LADDER[Math.min(index + 1, STRATEGY_LADDER.length - 1)];
    return { strategy: next, verdict: 'replaced' };
  }
  return { strategy: suggested, verdict: 'replaced' };
}

function renderTutorialDeck() {
  const deck = $('tutorial-deck');
  if (!deck) return;
  deck.textContent = '';
  LESSON_STEPS.forEach((step, index) => {
    const card = document.createElement('figure');
    card.className = 'tutorial-card';
    card.dataset.step = String(index + 1);
    card.innerHTML = `
      <div class="tutorial-media">
        <img src="${step.tutorial.image}" alt="${step.tutorial.alt}" decoding="async" loading="lazy" draggable="false" />
        ${step.tutorial.overlay}
      </div>
      <figcaption>
        <span>Step ${index + 1}</span>
        <h4>${step.title}</h4>
        <p>${step.hint}</p>
      </figcaption>
    `;
    deck.append(card);
  });
}

function applyIntervention(strategy) {
  if (strategy === 'change_modality_visual') {
    sim.assist = { snapScale: 1, mode: 'visual' };
    guides.setMode('visual');
  } else if (strategy === 'change_modality_kinesthetic') {
    sim.assist = { snapScale: 1.6, mode: 'kinesthetic' };
    guides.setMode('kinesthetic');
  } else if (strategy === 'step_by_step_reset') {
    dialogReset({ snapScale: 1, mode: 'steps' });
    guides.setMode('steps');
  } else {
    // reinforce: keep whatever scaffold is already in place.
    guides.setMode(guides.mode);
  }
}

async function evaluateAttempt(reason, force = false) {
  if (!session.started || session.inFlight) return;
  const result = evaluateSim(sim);
  const key = `${result.score}|${result.primary_issue}|${result.detail}`;
  const now = performance.now();
  if (!force && key === session.lastKey) return;
  if (!force && now - session.lastEvalAt < 2200) return;
  clearTimeout(session.autoEvalTimer);
  session.lastEvalAt = now;
  session.lastKey = key;
  session.inFlight = true;
  session.attempts += 1;
  setLoopPhase('observe', `Attempt ${session.attempts}: reading hand, sequence and seal telemetry…`, 'W&B · tracing');

  const payload = buildPayload({
    attemptNumber: session.attempts,
    score: result.score,
    previousScore: session.previousScore,
    primaryIssue: result.primary_issue,
    elapsedSeconds: sim.time,
    telemetry: {
      events_count: sim.traction.events,
      camera_frames_seen: input.cameraFrames(),
      input_mode: input.inputMode(),
    },
  });
  session.lastRequest = { reason, payload, sent_at: new Date().toISOString() };

  const cooling = now < session.backend.cooldownUntil;
  const http = cooling
    ? { ok: false, skipped: true, error: 'backend cooling down after a failure', url: BACKEND_BASE + '/v1/attempts/evaluate', status: null, ms: 0 }
    : await postEvaluate(payload);
  if (!cooling && !http.ok) session.backend.cooldownUntil = performance.now() + BACKEND_COOLDOWN_MS;

  const offline = offlineCoaching({
    score: result.score,
    previousScore: session.previousScore,
    primaryIssue: result.primary_issue,
    detail: result.detail,
  });
  const outcome = http.ok ? http.data.outcome : offline;
  const source = http.ok ? 'backend' : 'local-offline';
  setLoopPhase('coach', outcome.coach, http.ok ? 'W&B · Weave live' : 'Local fallback');

  session.lastResponse = {
    source,
    reason,
    http: { ok: Boolean(http.ok), status: http.status, ms: http.ms, url: http.url, error: http.error || null, skipped: Boolean(http.skipped) },
    outcome,
    evidence: http.ok ? http.data.evidence : null,
  };

  const improved = Boolean(outcome.improved);
  const decided = chooseStrategy(outcome.strategy, improved);
  session.strategy = { current: decided.strategy, verdict: decided.verdict };
  applyIntervention(decided.strategy);
  setLoopPhase('adapt', `${STRATEGY_LABEL[decided.strategy] || decided.strategy}. Retry to measure the change.`, http.ok ? 'W&B · Weave live' : 'Local fallback');
  session.previousScore = result.score;

  session.evalHistory.push({
    attempt: session.attempts,
    reason,
    score: result.score,
    previous: payload.previous_score,
    detail: result.detail,
    primary_issue: result.primary_issue,
    strategy: decided.strategy,
    verdict: decided.verdict,
    source,
    coach: outcome.coach,
    outcome,
    payload,
    response: session.lastResponse,
  });
  if (session.evalHistory.length > 24) session.evalHistory.shift();

  if (!IS_AUTOMATED_SESSION) {
    voice.speak({
      text: outcome.coach,
      attrib: source === 'backend' ? 'coach · backend' : 'coach · local fallback',
    });
  }
  emit('pipesense:coach', {
    text: outcome.coach,
    observer: outcome.observer,
    evaluator: outcome.evaluator,
    strategy: decided.strategy,
    verdict: decided.verdict,
    improved,
    source,
    attempt: session.attempts,
    score: result.score,
    primary_issue: result.primary_issue,
    detail: result.detail,
  });
  emit('pipesense:attempt', session.evalHistory[session.evalHistory.length - 1]);
  renderAttempts();
  renderStory();
  renderJudge();
  setLoopPhase('evaluate', outcome.evaluator, http.ok ? 'W&B · Weave traced' : 'Local fallback');
  session.inFlight = false;
}

function dialogReset(assist = { snapScale: 1, mode: 'none' }) {
  interaction.dropAll();
  input.forcePinch('left', 0);
  input.forcePinch('right', 0);
  resetSim(sim, assist);
  session.waterRunAt = 0;
}

function retryLesson() {
  // Keep the selected intervention: the next run must test whether the
  // coaching change improved performance, rather than erasing the loop.
  session.lastKey = '';
  const assist = { ...sim.assist };
  dialogReset(assist);
  setLoopPhase('retry', `Attempt ${session.attempts + 1}: intervention active. Your next score will be compared with ${Math.max(0, session.previousScore)}.`, 'W&B · comparison armed');
  if (!IS_AUTOMATED_SESSION) {
    voice.speak({
      text: 'Workspace reset. Start again from the supply valve — I will compare the score with the last run.',
      attrib: 'workflow',
    });
  }
  toast('Workspace reset');
}

// --------------------------------------------------------------- autopilot

function waitFrame() { return new Promise((resolve) => { requestAnimationFrame(() => resolve()); }); }
function waitMs(ms) { return new Promise((resolve) => { setTimeout(resolve, ms); }); }
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

async function approach(side, targetFn, { tol = 0.03, timeout = 3.5 } = {}) {
  const workspace = GEOM.workspace;
  const hand = input.hands[side];
  const start = performance.now();
  while (!session.macro.cancelled && performance.now() - start < timeout * 1000) {
    const anchor = gloves[side].pinchAnchor.getWorldPosition(tmpVec).clone();
    const target = targetFn(anchor);
    if (!target) break;
    const ex = target.x - anchor.x;
    const ey = target.y - anchor.y;
    const ez = target.z - anchor.z;
    if (Math.hypot(ex, ey, ez) < tol) return true;
    hand.target.pos.x = clamp(hand.target.pos.x + ex, workspace.minX, workspace.maxX);
    hand.target.pos.y = clamp(hand.target.pos.y + ey, workspace.minY, workspace.maxY);
    hand.target.pos.z = clamp(hand.target.pos.z + ez, workspace.minZ, workspace.maxZ);
    hand.source = 'macro';
    await waitFrame();
  }
  return false;
}

async function closePinch(side, dwellMs = 220) {
  input.forcePinch(side, 1);
  await waitMs(dwellMs);
}

async function openPinch(side, dwellMs = 160) {
  input.forcePinch(side, 0);
  await waitMs(dwellMs);
}

async function ensureHeld({
  side,
  heldByFn,
  approachTarget,
  approachOpts = {},
  attempts = 6,
  pinchDwellMs = 220,
}) {
  for (let i = 0; i < attempts && !session.macro.cancelled; i++) {
    const reached = await approach(side, approachTarget, approachOpts);
    if (!reached) continue;
    await closePinch(side, pinchDwellMs);
    if (heldByFn() === side) return true;
    // Re-arm pinch edge for interaction.update() when a frame boundary is missed.
    await openPinch(side, 90);
  }
  return heldByFn() === side;
}

async function macroCloseValve() {
  const held = await ensureHeld({
    side: 'left',
    heldByFn: () => sim.valve.heldBy,
    approachTarget: () => (propsOut ? propsOut.valveKnob : null),
    approachOpts: { tol: 0.075, timeout: 4.2 },
  });
  if (!held) throw new Error('valve grab failed');
  for (let i = 0; i < 80 && !sim.valve.closed && !session.macro.cancelled; i++) {
    input.forceRotate('left', -0.06);
    await waitMs(45);
  }
  await openPinch('left', 180);
  if (!sim.valve.closed) throw new Error('valve did not close');
}

async function macroSeatTrap() {
  // A real learner may miss the two sockets on the first release. The demo
  // repeats the same glove-driven acquire/move/release path instead of
  // teleporting or mutating the simulation state.
  for (let placement = 0; placement < 3 && !session.macro.cancelled; placement++) {
    const held = await ensureHeld({
      side: 'left',
      heldByFn: () => sim.objects.trap.heldBy,
      approachTarget: () => (propsOut ? propsOut.trapWorld : null),
      approachOpts: { tol: 0.10, timeout: 4.4 },
      attempts: 7,
      pinchDwellMs: 260,
    });
    if (!held) continue;

    // Drive the glove until the deterministic trap root itself has settled at
    // the seat pose. Checking sim-space here avoids releasing while the
    // rendered mesh is still catching up with the hand smoothing.
    const settled = await approach('left', (anchor) => {
      const trap = sim.objects.trap;
      if (trap.mode !== 'held') return null;
      const seat = GEOM.seatPose;
      return {
        x: seat.x + (anchor.x - trap.pos.x),
        y: seat.y + (anchor.y - trap.pos.y),
        z: seat.z + (anchor.z - trap.pos.z),
      };
    }, { tol: 0.003, timeout: 9 });
    if (settled) {
      await waitMs(360);
      await openPinch('left', 320);
      if (sim.objects.trap.mode === 'seated') return;
    } else {
      await openPinch('left', 220);
    }
  }
  throw new Error('seating failed — sockets missed');
}

async function macroTighten(joint) {
  const held = await ensureHeld({
    side: 'right',
    heldByFn: () => sim.objects.wrench.heldBy,
    // `wrench.position` is local to its current parent. Interaction hit tests
    // use the world-space origin, so the macro must aim at that same point.
    approachTarget: () => (propsOut ? propsOut.wrench.getWorldPosition(tmpVec).clone() : null),
    approachOpts: { tol: 0.092, timeout: 4.8 },
    attempts: 7,
    pinchDwellMs: 260,
  });
  if (!held) throw new Error('wrench grab failed');
  const nutPos = joint === 'tail'
    ? () => tmpVec.set(GEOM.tail.x, propsOut.nutTailY, GEOM.tail.z)
    : () => tmpVec.set(0, GEOM.wall.y, propsOut.nutWallZ);
  await approach('right', nutPos, { tol: 0.05, timeout: 5 });
  for (let i = 0; i < 40 && sim.joints[joint].tight < TUNE.tightFull && !session.macro.cancelled; i++) {
    // Slip nuts advance along their threads as they tighten. Keep the hand
    // and wrench jaw following that moving target between turns.
    await approach('right', nutPos, { tol: 0.035, timeout: 0.55 });
    input.forceRotate('right', -0.5);
    await waitMs(70);
  }
  await openPinch('right', 220);
  if (sim.joints[joint].tight < TUNE.tightFull) throw new Error(`${joint} nut did not tighten`);
}

async function macroRunWater() {
  const held = await ensureHeld({
    side: 'left',
    heldByFn: () => sim.faucet.heldBy,
    approachTarget: () => (propsOut ? propsOut.faucetKnob : null),
    approachOpts: { tol: 0.075, timeout: 4.2 },
  });
  if (!held) throw new Error('faucet grab failed');
  for (let i = 0; i < 30 && !sim.faucet.on && !session.macro.cancelled; i++) {
    input.forceRotate('left', 0.5);
    await waitMs(70);
  }
  await openPinch('left', 120);
  const start = performance.now();
  while (!session.macro.cancelled && sim.phase !== 'complete' && performance.now() - start < 15000) {
    await waitMs(220);
  }
  await waitMs(1200);
  const back = await approach('left', () => propsOut.faucetKnob, { tol: 0.06 });
  if (!back) return;
  await closePinch('left', 240);
  for (let i = 0; i < 30 && sim.faucet.on && !session.macro.cancelled; i++) {
    input.forceRotate('left', -0.5);
    await waitMs(70);
  }
  await openPinch('left', 120);
}

const MACROS = {
  valve: macroCloseValve,
  seat: macroSeatTrap,
  'tail-nut': () => macroTighten('tail'),
  'wall-nut': () => macroTighten('wall'),
  water: macroRunWater,
  async full() {
    await macroCloseValve();
    await macroSeatTrap();
    await macroTighten('tail');
    await macroTighten('wall');
    await macroRunWater();
    toast('Autopilot: lesson complete');
  },
};

function startMacro(name) {
  if (!IS_AUTOMATED_SESSION) {
    // Scripted glove input exists only for silent automated QA; learner
    // sessions must drive the gloves with real hands.
    toast('Autopilot is available only in silent automated QA sessions.');
    return;
  }
  if (session.macro.running) { toast('Autopilot already running'); return; }
  const fn = MACROS[name];
  if (!fn) { toast(`Unknown macro: ${name}`); return; }
  // The neutral demo pose faces the open glove toward the viewer. Scripted QA
  // rotates into the established tool-working orientation before approaching
  // fixtures so its pinch anchor retains the validated interaction envelope.
  for (const side of ['left', 'right']) {
    input.hands[side].target.yaw = Math.PI;
    input.hands[side].target.pitch = -0.18;
  }
  session.started = true;
  $('intro').hidden = true;
  $('practice-card').hidden = false;
  $('loop-card').hidden = false;
  session.macro = { name, running: true, cancelled: false };
  toast(`Autopilot: ${name}`);
  fn()
    .then(() => { toast(`Autopilot finished: ${name}`); })
    .catch((err) => { toast(session.macro.cancelled ? 'Autopilot cancelled' : `Autopilot stopped: ${err.message}`); })
    .finally(() => {
      session.macro.running = false;
      input.forcePinch('left', 0);
      input.forcePinch('right', 0);
    });
}

function cancelMacro() {
  if (session.macro.running) {
    session.macro.cancelled = true;
    toast('Autopilot cancelled');
  }
}

// ------------------------------------------------------------------- judge

function renderAttempts() {
  const wrap = $('judge-attempts');
  wrap.textContent = '';
  if (!session.evalHistory.length) {
    wrap.textContent = 'No evaluations yet.';
    return;
  }
  const recent = session.evalHistory.slice(-10).reverse();
  for (const item of recent) {
    const row = document.createElement('div');
    row.className = 'attempt-row';
    const n = document.createElement('span');
    n.className = 'n';
    n.textContent = `#${item.attempt}`;
    const score = document.createElement('span');
    const delta = item.previous < 0 ? 'baseline' : `${item.score - item.previous >= 0 ? '+' : ''}${item.score - item.previous}`;
    score.textContent = `score ${item.score} (${delta})`;
    const badge = document.createElement('span');
    badge.className = `badge ${item.source === 'backend' ? 'backend' : 'local'}`;
    badge.textContent = item.source === 'backend' ? 'backend' : 'local';
    const line = document.createElement('span');
    line.className = 'coach-line';
    line.textContent = `${item.reason} · ${item.primary_issue}/${item.detail} · ${item.strategy} (${item.verdict}) — ${item.coach}`;
    row.append(n, score, badge, line);
    wrap.append(row);
  }
}

function renderStory() {
  if ($('story').hidden) return;
  const latest = session.evalHistory.length ? session.evalHistory[session.evalHistory.length - 1] : null;
  if (!latest || !latest.response || !latest.response.outcome) {
    $('story-attempt').textContent = 'No run yet.';
    $('story-issue').textContent = 'No run yet.';
    $('story-score').textContent = 'No run yet.';
    $('story-strategy').textContent = 'No run yet.';
    $('story-inference').textContent = 'No run yet.';
    $('story-weave').textContent = 'No run yet.';
    $('story-result').textContent = 'No run yet.';
    $('story-note').textContent = 'Run at least one evaluation to populate real evidence. This panel never fabricates values.';
    return;
  }
  const evidence = latest.response.evidence || {};
  const provider = evidence.provider || {};
  const tracing = evidence.tracing || {};
  const score = evidence.deterministic_score || {};
  const prev = Number.isFinite(score.previous) ? score.previous : latest.previous;
  const curr = Number.isFinite(score.current) ? score.current : latest.score;
  const hasPrev = Number.isFinite(prev) && prev >= 0;
  const delta = hasPrev ? curr - prev : null;
  $('story-attempt').textContent = String(latest.attempt);
  $('story-issue').textContent = latest.primary_issue || 'none';
  $('story-score').textContent = hasPrev ? `${prev} → ${curr} (${delta >= 0 ? '+' : ''}${delta})` : `${curr} (baseline)`;
  $('story-strategy').textContent = `${latest.strategy || 'none'}${latest.verdict ? ` (${latest.verdict})` : ''}`;
  const providerName = provider.name || latest.outcome?.provider || 'deterministic-offline';
  const usage = provider.used ? 'used' : 'fallback';
  $('story-inference').textContent = `${providerName}; ${usage}`;
  $('story-weave').textContent = tracing.active
    ? `${tracing.project || 'project unknown'} · trace active`
    : `${tracing.project || 'no active project'} · trace inactive`;
  $('story-result').textContent = latest.outcome.improved ? 'improved' : 'did not improve';
  $('story-note').textContent = 'Live run evidence from the most recent evaluated attempt.';
}

function renderJudge() {
  if ($('judge').hidden) return;
  const health = session.health;
  $('judge-conn').textContent = JSON.stringify({
    backend_base: BACKEND_BASE || '(same origin)',
    health: health ? {
      ok: health.ok,
      status: health.status,
      ms: health.ms,
      tracing: health.ok ? health.data.tracing : null,
      inference: health.ok ? health.data.inference : null,
    } : null,
    last_eval: session.lastResponse ? { source: session.lastResponse.source, http: session.lastResponse.http } : null,
    voice: voice.status(),
    input: {
      mode: input.inputMode(),
      camera_frames: input.cameraFrames(),
      camera: {
        active: input.cameraState.active,
        status: input.cameraState.status,
        hands_seen: input.cameraState.handsSeen,
        error: input.cameraState.error || null,
      },
    },
    note: 'configured != used; provider evidence comes from the response.',
  }, null, 2);
  $('judge-req').textContent = session.lastRequest
    ? JSON.stringify(session.lastRequest, null, 2)
    : 'No evaluation request yet.';
  $('judge-res').textContent = session.lastResponse
    ? JSON.stringify({
      source: session.lastResponse.source,
      http: session.lastResponse.http,
      outcome: session.lastResponse.outcome,
      provider_evidence: session.lastResponse.evidence ? session.lastResponse.evidence.provider : null,
      tracing: session.lastResponse.evidence ? session.lastResponse.evidence.tracing : null,
      deterministic_score: session.lastResponse.evidence ? session.lastResponse.evidence.deterministic_score : null,
    }, null, 2)
    : 'No evaluation response yet.';
  $('judge-geom').textContent = JSON.stringify(evaluateSim(sim).checks, null, 2);
  renderAttempts();
}

async function probeHealth({ notify = true } = {}) {
  const health = await getHealth();
  session.health = health;
  if (health.ok && health.data?.tracing?.active) $('loop-source').textContent = 'W&B · Weave ready';
  renderJudge();
  renderStory();
  if (notify) toast(health.ok ? 'Services connected' : 'Services unavailable');
}

function toggleJudge(force) {
  const panel = $('judge');
  const open = force !== undefined ? force : panel.hidden;
  panel.hidden = !open;
  $('btn-judge').setAttribute('aria-pressed', open ? 'true' : 'false');
  if (open) renderJudge();
}

function toggleStory(force) {
  const panel = $('story');
  const open = force !== undefined ? force : panel.hidden;
  panel.hidden = !open;
  $('btn-story').setAttribute('aria-pressed', open ? 'true' : 'false');
  if (open) renderStory();
}

// ---------------------------------------------------------------- commands

function emit(name, detail) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function runCommand(raw) {
  const parts = String(raw || '').trim().split(/\s+/);
  const cmd = (parts.shift() || '').toLowerCase();
  const arg = (parts[0] || '').toLowerCase();
  const rest = parts.join(' ');
  switch (cmd) {
    case 'help': {
      const base = 'Commands: help, status, reset, camera on|off, voice on|off, judge, story, eval, health, agent connect|disconnect, say <text>, ghost on|off, align on|off, steps on|off';
      toast(IS_AUTOMATED_SESSION ? `${base}, run, valve, seat, tighten tail|wall, water` : base);
      break;
    }
    case 'status': {
      const r = evaluateSim(sim);
      toast(`score ${r.score} · ${r.primary_issue}/${r.detail} · attempt ${session.attempts} · strategy ${session.strategy.current}`);
      break;
    }
    case 'reset':
      retryLesson();
      break;
    case 'camera':
      if (arg === 'on') input.startCamera();
      else if (arg === 'off') input.stopCamera();
      else input.toggleCamera();
      break;
    case 'voice':
      voice.setEnabled(arg !== 'off');
      break;
    case 'judge':
      toggleJudge();
      break;
    case 'story':
      toggleStory();
      break;
    case 'run':
    case 'auto':
    case 'autopilot':
      startMacro('full');
      break;
    case 'valve':
      startMacro('valve');
      break;
    case 'seat':
      startMacro('seat');
      break;
    case 'tighten':
      startMacro(arg === 'wall' ? 'wall-nut' : 'tail-nut');
      break;
    case 'water':
      startMacro('water');
      break;
    case 'eval':
      evaluateAttempt('manual', true);
      break;
    case 'health':
      probeHealth();
      break;
    case 'agent':
      if (arg === 'disconnect') voice.disconnect();
      else voice.connect();
      break;
    case 'say':
      voice.speak({ text: rest || 'PipeSense online.', attrib: 'agent · scripted' });
      break;
    case 'ghost':
      guides.setMode(arg === 'off' ? 'none' : 'visual');
      break;
    case 'align':
      guides.setMode(arg === 'off' ? 'none' : 'kinesthetic');
      break;
    case 'steps':
      guides.setMode(arg === 'off' ? 'none' : 'steps');
      break;
    default:
      toast(cmd ? `Unknown command: ${cmd} (try "help")` : 'Type a command (try "help")');
  }
}

// ------------------------------------------------------------------- frame

let lastFrame = performance.now();
let judgeClock = 0;
let stateClock = 0;

function snapshot() {
  const r = evaluateSim(sim);
  return {
    phase: sim.phase,
    score: r.score,
    primary_issue: r.primary_issue,
    detail: r.detail,
    seated: sim.objects.trap.mode === 'seated',
    valve_closed: sim.valve.closed,
    water_running: sim.water.running,
    gas_blocked: sim.gas.blocked,
    attempt: session.attempts,
    strategy: { ...session.strategy },
    assist: { ...sim.assist },
    voice_used: voice.status().used,
    input_mode: input.inputMode(),
  };
}

function frame(now) {
  const dt = Math.min(0.05, Math.max(0.001, (now - lastFrame) / 1000));
  lastFrame = now;

  input.update(dt);
  for (const side of ['left', 'right']) gloves[side].update(dt, input.hands[side].target);
  propsOut = props.update(sim, dt, gloves);
  interaction.update(dt, gloves, propsOut);
  if (session.started) {
    const events = advance(sim, dt);
    for (const event of events) onSimEvent(event);
  }
  fx.update(sim, dt, propsOut.trapWorld);
  guides.update(sim);

  judgeClock += dt;
  if (judgeClock > 0.5) {
    judgeClock = 0;
    if (!$('judge').hidden) renderJudge();
  }
  stateClock += dt;
  if (stateClock > 0.5) {
    stateClock = 0;
    if (session.started) renderPracticeCard();
    emit('pipesense:state', snapshot());
  }

  world.update(now / 1000);
  world.renderer.render(world.scene, world.camera);
  requestAnimationFrame(frame);
}

// -------------------------------------------------------------------- boot

function resize() {
  world.resize(window.innerWidth, window.innerHeight);
}

function wireUi() {
  document.body.classList.toggle('presentation-mode', IS_PRESENTATION);
  renderTutorialDeck();
  const refClip = $('ref-clip');
  if (refClip) {
    refClip.muted = true;
    refClip.defaultMuted = true;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      refClip.autoplay = false;
      refClip.pause();
    }
  }
  const cmdWrap = $('cmd')?.closest('label');
  if (!IS_AUTOMATED_SESSION && cmdWrap) {
    cmdWrap.hidden = true;
  }
  if (!IS_AUTOMATED_SESSION) {
    // Learner flows start locked: the camera must see both hands and the
    // neutral pose must calibrate before the tutorial or simulation opens.
    $('btn-tour').disabled = true;
    $('btn-go').disabled = true;
  }
  $('btn-go').addEventListener('click', async () => {
    if (!session.started && !requireGloveFlow()) return;
    const wasStarted = session.started;
    session.started = true;
    $('intro').hidden = true;
    $('practice-card').hidden = false;
    $('loop-card').hidden = false;
    document.querySelectorAll('.flow-progress i').forEach((dot) => dot.classList.add('active'));
    document.querySelector('.flow-progress')?.setAttribute('aria-valuenow', '3');
    canvas.focus();
    renderPracticeCard();
    setLoopPhase('observe', session.attempts ? 'Continue the coached retry.' : 'Your first attempt becomes the baseline.', session.health?.ok ? 'W&B · Weave ready' : 'Connecting…');
    if (wasStarted) return;
    const opening = 'Workspace ready. Close the supply valve, seat the trap on both pipe ends, then tighten the slip nuts.';
    if (IS_AUTOMATED_SESSION) {
      showCaption({ text: opening, attrib: IS_PRESENTATION ? 'guided demo' : 'coach · silent QA' });
      return;
    }
    showCaption({ text: opening, attrib: 'coach · text' });
  });
  $('btn-setup-camera').addEventListener('click', () => { input.toggleCamera(); });
  $('btn-tour').addEventListener('click', () => {
    if (!session.started && !requireGloveFlow()) return;
    showFlowStage('tutorial');
  });
  $('btn-tour-back').addEventListener('click', () => showFlowStage('setup'));
  $('btn-tour-prev').addEventListener('click', () => setTutorialIndex(session.tutorialIndex - 1));
  $('btn-tour-next').addEventListener('click', () => setTutorialIndex(session.tutorialIndex + 1));
  $('tutorial-deck').addEventListener('scroll', () => {
    if (session.deckProgrammatic) return;
    clearTimeout(session.deckTimer);
    session.deckTimer = setTimeout(() => {
      const deck = $('tutorial-deck');
      const cards = [...deck.querySelectorAll('.tutorial-card')];
      const center = deck.scrollLeft + deck.clientWidth / 2;
      let best = 0; let dist = Infinity;
      cards.forEach((card, i) => {
        const d = Math.abs(card.offsetLeft + card.offsetWidth / 2 - center);
        if (d < dist) { dist = d; best = i; }
      });
      setTutorialIndex(best, false);
    }, 90);
  }, { passive: true });
  $('btn-camera').addEventListener('click', () => { input.toggleCamera(); });
  $('btn-voice').addEventListener('click', () => { voice.setEnabled(!voice.enabled); });
  $('btn-retry').addEventListener('click', retryLesson);
  $('btn-drop').addEventListener('click', () => {
    interaction.dropAll();
    input.forcePinch('left', 0);
    input.forcePinch('right', 0);
  });
  $('btn-guide').addEventListener('click', () => {
    $('intro').hidden = false;
    showFlowStage('tutorial');
    $('btn-go').textContent = 'Return to simulation';
  });
  $('btn-story').addEventListener('click', () => toggleStory());
  $('btn-story-close').addEventListener('click', () => toggleStory(false));
  $('btn-judge').addEventListener('click', () => toggleJudge());
  $('btn-judge-close').addEventListener('click', () => toggleJudge(false));
  $('btn-health').addEventListener('click', probeHealth);
  $('btn-live').addEventListener('click', () => {
    if (voice.connected) voice.disconnect();
    else voice.connect();
  });
  $('cmd').addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    runCommand($('cmd').value);
    $('cmd').value = '';
    event.stopPropagation();
  });
  window.addEventListener('keydown', (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('input, textarea')) return;
    cancelMacro();
  }, true);
  canvas.addEventListener('pointerdown', cancelMacro, true);
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancelMacro(); });
}

window.PipeSense = {
  version: '0.2.0',
  sim,
  snapshot,
  speak: (text) => voice.speak({ text, attrib: 'agent · external' }),
  connectVoice: () => voice.connect(),
  disconnectVoice: () => voice.disconnect(),
  run: (name = 'full') => startMacro(name),
  command: runCommand,
  evaluate: () => evaluateAttempt('manual', true),
  health: probeHealth,
  status: {
    sim: () => evaluateSim(sim),
    voice: () => voice.status(),
    input: () => ({ mode: input.inputMode(), frames: input.cameraFrames() }),
  },
};

// External agents can ask the page to say something (caption + fallback speech).
window.addEventListener('pipesense:agent-say', (event) => {
  const detail = event.detail || {};
  if (detail.external && detail.text) showCaption({ text: detail.text, attrib: detail.attrib || 'agent · external' });
});

wireUi();
resize();
renderAttempts();
renderStory();
renderJudge();
requestAnimationFrame(frame);
probeHealth({ notify: false });
