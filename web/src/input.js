// PipeSense input layer.
//
// Two sources feed the same interface: every hand exposes a smoothed pose
// (world target, orientation, finger curls, thumb, pinch) that gloves.js
// renders and interaction.js consumes. Camera input uses MediaPipe's Hand
// Landmarker (21 landmarks per hand). Pointer, keyboard and scripted input
// reproduce the same pose only in silent automated-QA sessions (?qa=1 or
// navigator.webdriver); learner sessions accept camera input exclusively and
// the fallback is never surfaced in the interface.
//
// Handedness: the camera frame is NOT mirrored, so MediaPipe's "mirrored
// input" assumption is inverted here - the label is swapped before use. World
// X is mirrored from image X, which matches what the learner sees.
//
// Fidelity: detection slots are assigned by previous-position continuity (the
// label is only a tie-breaker), a short steady two-hand pose calibrates the
// per-user neutral X/Y/depth, depth uses the calibrated palm scale with a
// deadband and a per-frame clamp, pinch uses hysteresis with dwell, a short
// tracking loss freezes the glove pose, and re-acquisition is rate-limited so
// neither identity nor depth can snap.

import { GEOM } from './sim.js';
import {
  DEPTH, HAND_CONF, assignHands, clampStep, clampVecStep, createNeutralCalibration, createPinchLatch, depthTarget,
} from './handtrack.js';

// The stability helpers (identity assignment, calibrated depth, pinch
// hysteresis) are pure and live in handtrack.js so node tests can exercise
// them without a DOM; re-exported here as the input layer's public surface.
export {
  DEPTH, HAND_CONF, PINCH, assignHands, clampStep, clampVecStep, createNeutralCalibration, createPinchLatch, depthTarget,
} from './handtrack.js';

export const TASKS_VISION_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const HAND_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const CONF = {
  handMin: 0.55,
  presenceMin: 0.4,
  staleMs: 320,
  lostHintMs: 1600,
  jumpLimit: 0.22,
};

const IMG = { xScale: 1.4, yTop: 1.42, yScale: 1.35 };

// Canonical world pose a calibrated neutral maps to: hands front and centre
// with reach in every direction.
const NEUTRAL_ANCHOR = {
  left: { x: -0.30, y: 0.60, z: 0.45 },
  right: { x: 0.30, y: 0.60, z: 0.45 },
};

const WORK = GEOM.workspace;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const clamp01 = (v) => clamp(v, 0, 1);

// One Euro filter: low lag while still, stronger smoothing when moving fast.
class OneEuro {
  constructor(value, { minCut = 1.6, beta = 0.05, dCut = 1.0 } = {}) {
    this.minCut = minCut;
    this.beta = beta;
    this.dCut = dCut;
    this.x = value;
    this.dx = 0;
    this.t = null;
  }

  static alpha(cut, dt) {
    const tau = 1 / (2 * Math.PI * cut);
    return 1 / (1 + tau / dt);
  }

  filter(value, dt) {
    if (this.t === null || dt <= 0) {
      this.t = 0;
      this.x = value;
      return value;
    }
    const dRaw = (value - this.x) / dt;
    const aD = OneEuro.alpha(this.dCut, dt);
    this.dx = aD * dRaw + (1 - aD) * this.dx;
    const cut = this.minCut + this.beta * Math.abs(this.dx);
    const a = OneEuro.alpha(cut, dt);
    this.x = a * value + (1 - a) * this.x;
    return this.x;
  }
}

function angleAt(a, b, c) {
  const abx = a.x - b.x; const aby = a.y - b.y; const abz = (a.z || 0) - (b.z || 0);
  const cbx = c.x - b.x; const cby = c.y - b.y; const cbz = (c.z || 0) - (b.z || 0);
  const dot = abx * cbx + aby * cby + abz * cbz;
  const magA = Math.hypot(abx, aby, abz) || 1e-6;
  const magC = Math.hypot(cbx, cby, cbz) || 1e-6;
  return Math.acos(clamp(dot / (magA * magC), -1, 1));
}

function bendOf(pts, i0, i1, i2) {
  return Math.PI - angleAt(pts[i0], pts[i1], pts[i2]);
}

const FINGER_TRIPLETS = [
  [[0, 5, 6], [5, 6, 7], [6, 7, 8]],
  [[0, 9, 10], [9, 10, 11], [10, 11, 12]],
  [[0, 13, 14], [13, 14, 15], [14, 15, 16]],
  [[0, 17, 18], [17, 18, 19], [18, 19, 20]],
];
const CURL_WEIGHTS = [0.3, 0.45, 0.25];
const CURL_FULL = 1.55;

function createHandState(side) {
  return {
    side,
    source: 'idle',
    target: {
      // Rest in an open, visible neutral pose. Camera input replaces this
      // immediately after calibration; scripted QA keeps the same human hand
      // silhouette until a task moves the wrist.
      pos: { x: side === 'left' ? -0.24 : 0.24, y: 0.62, z: 0.46 },
      yaw: 0, pitch: -0.10, roll: 0,
      curls: [0.10, 0.08, 0.10, 0.14], thumb: 0.12, pinch: 0, highlight: 0, contact: 0,
      joints: null,
    },
    pinchClosed: false,
    pinchRaw: 0,
    rotDelta: 0,
    raf: { x: null, y: null, z: null },
    filters: null,
    lastSeen: 0,
    tracked: false,
    holding: false,
    lastPalm: null,
    calib: null,
    easeUntil: 0,
    contact: 0,
    latch: createPinchLatch(),
  };
}

function hydrateFilters(hand) {
  if (hand.filters) return;
  hand.filters = {
    x: new OneEuro(hand.target.pos.x),
    y: new OneEuro(hand.target.pos.y),
    z: new OneEuro(hand.target.pos.z, { minCut: 1.1, beta: 0.03 }),
    yaw: new OneEuro(hand.target.yaw, { minCut: 1.2, beta: 0.02 }),
    pitch: new OneEuro(hand.target.pitch, { minCut: 1.2, beta: 0.02 }),
    roll: new OneEuro(hand.target.roll, { minCut: 1.0, beta: 0.02 }),
    scale: new OneEuro(0.13, { minCut: 0.9, beta: 0.02 }),
    curls: [0, 1, 2, 3].map(() => new OneEuro(0.25, { minCut: 2.2, beta: 0.04 })),
    thumb: new OneEuro(0.2, { minCut: 2.2, beta: 0.04 }),
    pinch: new OneEuro(1.0, { minCut: 2.6, beta: 0.02 }),
  };
}

function landmarkPose(points) {
  const aspect = 16 / 9;
  const palmIdx = [0, 5, 9, 13, 17];
  let px = 0; let py = 0;
  for (const i of palmIdx) { px += points[i].x; py += points[i].y; }
  px /= palmIdx.length;
  py /= palmIdx.length;

  const wrist = points[0];
  const midMcp = points[9];
  // Palm scale averages the wrist->middle-MCP span with the across-palm width,
  // so hand pitch and roll cancel out of the depth estimate.
  const span = Math.hypot((midMcp.x - wrist.x) * aspect, midMcp.y - wrist.y);
  const width = Math.hypot((points[17].x - points[5].x) * aspect, points[17].y - points[5].y);
  const scale = Math.max((span + width) / 2, 1e-4);

  const fx = (midMcp.x - wrist.x) * aspect;
  const fy = midMcp.y - wrist.y;
  const fLen = Math.hypot(fx, fy) || 1e-4;
  const dirX = -fx / fLen;
  const dirY = -fy / fLen;
  const world = { x: dirX, y: dirY, z: -0.8 };
  const wLen = Math.hypot(world.x, world.y, world.z) || 1;
  const yaw = Math.atan2(world.x / wLen, world.z / wLen);
  const pitch = -Math.asin(clamp(world.y / wLen, -1, 1));

  const rx = (points[17].x - points[5].x) * aspect;
  const ry = points[17].y - points[5].y;
  const roll = clamp(-Math.atan2(-ry, rx) * 0.5, -0.6, 0.6);

  const curls = FINGER_TRIPLETS.map((joints) => {
    let bend = 0;
    joints.forEach(([a, b, c], i) => { bend += bendOf(points, a, b, c) * CURL_WEIGHTS[i]; });
    return clamp01(bend / CURL_FULL);
  });
  const joints = FINGER_TRIPLETS.map((triplets) => triplets.map(([a, b, c]) => clamp01(bendOf(points, a, b, c) / CURL_FULL)));
  const thumb = clamp01((bendOf(points, 0, 1, 2) * 0.35 + bendOf(points, 1, 2, 3) * 0.4 + bendOf(points, 2, 3, 4) * 0.25) / CURL_FULL);

  const pinchRatio = Math.hypot((points[4].x - points[8].x) * aspect, points[4].y - points[8].y) / scale;

  return {
    palm: { x: px, y: py },
    inRange: px > 0.04 && px < 0.96 && py > 0.02 && py < 0.96,
    scale,
    yaw,
    pitch,
    roll,
    curls,
    joints,
    thumb,
    pinchRatio,
    smooth: (dt, hand) => {
      const f = hand.filters;
      const calib = hand.calib;
      let wx = (0.5 - px) * IMG.xScale;
      let wy = IMG.yTop - py * IMG.yScale;
      if (calib) {
        // Neutral-relative mapping: the calibrated pose maps to the canonical
        // anchor so an off-centre stance still reaches the full workspace.
        const anchor = NEUTRAL_ANCHOR[hand.side];
        const nx = anchor.x + (calib.x - px) * IMG.xScale;
        const ny = anchor.y + (calib.y - py) * IMG.yScale;
        const k = calib.blend;
        wx += (nx - wx) * k;
        wy += (ny - wy) * k;
        if (k < 1) calib.blend = Math.min(1, k + dt / 0.45);
      }
      const zs = f.scale.filter(scale, dt);
      const zAbs = depthTarget(zs, null, DEPTH);
      let zTarget = zAbs;
      if (calib) {
        const zNeutral = { scale: calib.scale, anchorZ: NEUTRAL_ANCHOR[hand.side].z };
        zTarget = zAbs + (depthTarget(zs, zNeutral, DEPTH) - zAbs) * calib.blend;
      }
      return {
        x: f.x.filter(clamp(wx, WORK.minX, WORK.maxX), dt),
        y: f.y.filter(clamp(wy, WORK.minY, WORK.maxY), dt),
        z: clamp(clampStep(hand.target.pos.z, zTarget, HAND_CONF.depthRate, dt), WORK.minZ, WORK.maxZ),
        yaw: f.yaw.filter(yaw, dt),
        pitch: f.pitch.filter(pitch, dt),
        roll: f.roll.filter(roll, dt),
        curls: curls.map((c, i) => f.curls[i].filter(c, dt)),
        joints,
        thumb: f.thumb.filter(thumb, dt),
        pinchRatio: f.pinch.filter(pinchRatio, dt),
      };
    },
  };
}

export function createInput({ canvas, video, onStatus, automated = false }) {
  const hands = { left: createHandState('left'), right: createHandState('right') };
  const calibrator = createNeutralCalibration();
  const keys = new Set();
  const drags = new Map();
  const dragOffsets = new Map();
  let wheelDelta = 0;
  let cameraFrames = 0;
  let fallbackFrames = 0;
  let lastReportedHands = -1;
  let lastCalibReport = -1;

  const camera = {
    active: false,
    status: 'off',
    stream: null,
    landmarker: null,
    lastVideoTime: -1,
    errors: 0,
    handsSeen: 0,
    lostSince: 0,
    tmp: { x: 0, y: 0, z: 0 },
  };

  function status() {
    if (onStatus) {
      let holding = 0;
      for (const side of ['left', 'right']) if (hands[side].holding) holding += 1;
      onStatus({
        camera: {
          active: camera.active,
          status: camera.status,
          handsSeen: camera.handsSeen,
          holding,
          calibrated: calibrator.ready,
          calibProgress: calibrator.progress,
          error: camera.error || null,
        },
        inputMode: inputMode(),
      });
    }
  }

  function resetTrackingFidelity() {
    calibrator.reset();
    lastCalibReport = -1;
    for (const side of ['left', 'right']) {
      const hand = hands[side];
      hand.calib = null;
      hand.filters = null;
      hand.lastSeen = 0;
      hand.lastPalm = null;
      hand.easeUntil = 0;
      hand.holding = false;
      hand.latch.reset(false);
    }
  }

  function inputMode() {
    // Learner sessions are camera-only, so an active session always reports
    // 'camera'; the QA channel keeps the mixed-source classification.
    if (!automated) return camera.active ? 'camera' : 'keyboard_mouse';
    if (!camera.active || cameraFrames === 0) return 'keyboard_mouse';
    if (fallbackFrames === 0) return 'camera';
    const ratio = cameraFrames / (cameraFrames + fallbackFrames);
    if (ratio > 0.7) return 'camera';
    if (ratio < 0.25) return 'keyboard_mouse';
    return 'mixed';
  }

  // ------------------------------------------- pointer/keyboard QA channel
  function toWorldFromPointer(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const nx = (clientX - rect.left) / rect.width;
    const ny = (clientY - rect.top) / rect.height;
    return {
      x: clamp((0.5 - nx) * IMG.xScale * 1.15, WORK.minX, WORK.maxX),
      y: clamp(IMG.yTop - ny * IMG.yScale * 1.05, WORK.minY, WORK.maxY),
      z: null,
    };
  }

  function pickHand(point) {
    let best = null; let bestDist = 0.42;
    for (const side of ['left', 'right']) {
      const t = hands[side].target.pos;
      const d = Math.hypot(t.x - point.x, t.y - point.y);
      if (d < bestDist) { bestDist = d; best = hands[side]; }
    }
    return best || (point.x < 0 ? hands.left : hands.right);
  }

  function onPointerDown(event) {
    if (!automated) return;
    if (event.button !== 0 && event.button !== 1) return;
    const p = toWorldFromPointer(event.clientX, event.clientY);
    const hand = pickHand(p);
    canvas.setPointerCapture(event.pointerId);
    drags.set(event.pointerId, hand.side);
    dragOffsets.set(event.pointerId, { dx: hand.target.pos.x - p.x, dy: hand.target.pos.y - p.y });
    hand.grabIntent = !event.altKey;
  }

  function onPointerMove(event) {
    if (!automated) return;
    const side = drags.get(event.pointerId);
    if (!side) return;
    const hand = hands[side];
    const p = toWorldFromPointer(event.clientX, event.clientY);
    const off = dragOffsets.get(event.pointerId) || { dx: 0, dy: 0 };
    hand.target.pos.x = clamp(p.x + off.dx, WORK.minX, WORK.maxX);
    hand.target.pos.y = clamp(p.y + off.dy, WORK.minY, WORK.maxY);
  }

  function onPointerUp(event) {
    if (!automated) return;
    if (!drags.has(event.pointerId)) return;
    const side = drags.get(event.pointerId);
    drags.delete(event.pointerId);
    dragOffsets.delete(event.pointerId);
    if (side) hands[side].grabIntent = false;
  }

  function onWheel(event) {
    if (!automated) return;
    wheelDelta += event.deltaY;
    event.preventDefault();
  }

  function onKeyDown(event) {
    if (!automated) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('input, textarea, select')) return;
    if (target instanceof HTMLElement && target.closest('button') && (event.code === 'Space' || event.key === 'Enter')) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
    keys.add(event.code);
    if (event.code === 'BracketLeft' || event.code === 'BracketRight') {
      const amt = event.code === 'BracketRight' ? 1 : -1;
      if (keys.has('KeyF')) hands.left.rotDelta += amt * 0.09;
      if (keys.has('Semicolon')) hands.right.rotDelta += amt * 0.09;
      event.preventDefault();
    }
  }

  function onKeyUp(event) {
    keys.delete(event.code);
  }

  function applyFallback(dt) {
    const fine = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const speed = fine ? 0.16 : 0.42;
    const L = hands.left;
    const R = hands.right;
    const moveX = (k1, k2) => ((keys.has(k2) ? 1 : 0) - (keys.has(k1) ? 1 : 0));
    const steps = [
      [L, moveX('KeyA', 'KeyD'), moveX('KeyW', 'KeyS'), moveX('KeyQ', 'KeyE')],
      [R, moveX('KeyJ', 'KeyL'), moveX('KeyI', 'KeyK'), moveX('KeyU', 'KeyO')],
    ];
    for (const [hand, mx, my, mz] of steps) {
      let touched = false;
      if (mx || my || mz) {
        const norm = Math.hypot(mx, my, mz) || 1;
        hand.target.pos.x = clamp(hand.target.pos.x + (mx / norm) * speed * dt, WORK.minX, WORK.maxX);
        hand.target.pos.y = clamp(hand.target.pos.y + (my / norm) * speed * dt, WORK.minY, WORK.maxY);
        hand.target.pos.z = clamp(hand.target.pos.z + (mz / norm) * speed * dt, WORK.minZ, WORK.maxZ);
        touched = true;
      }
      if (drags.size > 0 || touched || keys.size > 0) hand.source = 'fallback';
      if (drags.size > 0 || touched || keys.size > 0) hand.target.joints = null;
    }
    if (wheelDelta !== 0) {
      const amt = clamp(wheelDelta * 0.0016, -0.35, 0.35);
      let anyGrabbed = false;
      for (const side of drags.values()) {
        if (hands[side].grabIntent) {
          hands[side].rotDelta += amt;
          anyGrabbed = true;
        }
      }
      if (!anyGrabbed) {
        const side = keys.has('KeyF') ? 'left' : keys.has('Semicolon') ? 'right' : null;
        if (side) hands[side].rotDelta += amt;
      }
      wheelDelta = 0;
    }
    for (const side of ['left', 'right']) {
      const hand = hands[side];
      // A holding hand keeps its last camera pose (and grip) through a short
      // tracking loss instead of decaying toward the fallback idle state.
      if (hand.forced || hand.holding) continue;
      const dragging = [...drags.values()].includes(side);
      const keyDown = side === 'left' ? keys.has('KeyF') : keys.has('Semicolon');
      const want = (dragging && hand.grabIntent) || keyDown;
      setPinch(hand, want ? 1 : 0);
      hand.target.curls = hand.target.curls.map((c) => c + ((want ? 0.85 : 0.3) - c) * Math.min(1, dt * 8));
      hand.target.thumb += ((want ? 0.75 : 0.25) - hand.target.thumb) * Math.min(1, dt * 8);
    }
  }

  function setPinch(hand, want) {
    if (want >= 1) hand.pinchRaw = Math.min(1, hand.pinchRaw + 0.2);
    else hand.pinchRaw = Math.max(0, hand.pinchRaw - 0.12);
    hand.target.pinch = hand.pinchRaw;
    hand.pinchClosed = hand.pinchRaw > 0.55;
    hand.latch.reset(hand.pinchClosed);
  }

  // -------------------------------------------------------- camera input
  async function ensureLandmarker() {
    if (camera.landmarker) return camera.landmarker;
    const vision = await import(/* @vite-ignore */ TASKS_VISION_URL);
    const fileset = await vision.FilesetResolver.forVisionTasks(`${TASKS_VISION_URL}/wasm`);
    const options = {
      baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    };
    try {
      camera.landmarker = await vision.HandLandmarker.createFromOptions(fileset, options);
    } catch (gpuError) {
      options.baseOptions.delegate = 'CPU';
      camera.landmarker = await vision.HandLandmarker.createFromOptions(fileset, options);
    }
    return camera.landmarker;
  }

  async function startCamera() {
    if (camera.active || camera.status === 'starting') return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      camera.status = 'unavailable';
      camera.error = 'getUserMedia unavailable';
      status();
      return;
    }
    camera.status = 'starting';
    camera.error = null;
    status();
    resetTrackingFidelity();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      camera.stream = stream;
      video.srcObject = stream;
      await video.play();
      await ensureLandmarker();
      camera.active = true;
      camera.status = 'running';
      camera.errors = 0;
      camera.lastVideoTime = -1;
      camera.lostSince = 0;
    } catch (err) {
      const reason = err && err.name === 'NotAllowedError' ? 'permission denied'
        : err && err.name === 'NotFoundError' ? 'no camera found'
          : String((err && err.message) || err);
      camera.status = 'error';
      camera.error = reason;
      stopTracks();
    }
    status();
  }

  function stopTracks() {
    if (camera.stream) {
      for (const track of camera.stream.getTracks()) track.stop();
      camera.stream = null;
    }
    if (video) video.srcObject = null;
  }

  function stopCamera() {
    stopTracks();
    camera.active = false;
    camera.status = 'off';
    camera.handsSeen = 0;
    // The neutral pose belongs to one camera session; the next session starts
    // from the safe absolute mapping and calibrates again.
    resetTrackingFidelity();
    for (const side of ['left', 'right']) {
      hands[side].tracked = false;
      hands[side].target.joints = null;
    }
    status();
  }

  async function toggleCamera() {
    if (camera.active) stopCamera();
    else await startCamera();
  }

  // Camera frame is raw (not mirrored), so MediaPipe's handedness label is
  // inverted relative to the learner; return the corrected label.
  function correctedLabel(categoryName) {
    const label = String(categoryName || '').toLowerCase();
    if (label === 'left') return 'right';
    if (label === 'right') return 'left';
    return '';
  }

  function selectDetections(result) {
    const out = [];
    const landmarks = result.landmarks || [];
    const handedness = result.handednesses || result.handedness || [];
    for (let i = 0; i < landmarks.length; i++) {
      const points = landmarks[i];
      if (!points || points.length !== 21) continue;
      const category = handedness[i] && handedness[i][0];
      const score = category ? category.score : 0;
      if (score < CONF.handMin) continue;
      const presence = points.reduce((sum, p) => sum + (p.presence ?? p.visibility ?? 1), 0) / points.length;
      if (presence < CONF.presenceMin) continue;
      out.push({
        label: correctedLabel(category && category.categoryName),
        score,
        points,
        x: points[9].x,
        y: points[9].y,
      });
    }
    return out;
  }

  function applyCameraFrame(dt) {
    if (!camera.landmarker || !camera.active) return false;
    if (video.readyState < 2) return false;
    if (video.currentTime === camera.lastVideoTime) return false;
    camera.lastVideoTime = video.currentTime;
    let result;
    try {
      result = camera.landmarker.detectForVideo(video, performance.now());
      camera.errors = 0;
    } catch (err) {
      camera.errors += 1;
      if (camera.errors > 6) {
        camera.status = 'error';
        camera.error = 'tracking failed repeatedly';
        stopCamera();
      }
      return false;
    }
    const detections = selectDetections(result);
    camera.handsSeen = detections.length;
    if (camera.handsSeen !== lastReportedHands) {
      lastReportedHands = camera.handsSeen;
      status();
    }

    const now = performance.now();
    // Slots are matched to detections by previous-position continuity, so a
    // reordered array, a dropped label or a crossed pair never swaps hands.
    const prev = { left: null, right: null };
    for (const side of ['left', 'right']) {
      const hand = hands[side];
      if (hand.lastPalm && now - hand.lastSeen <= HAND_CONF.continuityMs) prev[side] = hand.lastPalm;
    }
    const assigned = assignHands(detections, prev);
    const calibFrames = { left: null, right: null };

    for (const side of ['left', 'right']) {
      const hand = hands[side];
      const index = assigned[side];
      const det = index === null || index === undefined ? null : detections[index];
      if (!det) {
        if (hand.tracked && now - hand.lastSeen > CONF.staleMs) hand.tracked = false;
        continue;
      }
      const pose = landmarkPose(det.points);
      if (!pose.inRange) continue;
      if (hand.lastPalm && hand.tracked) {
        const jump = Math.hypot(pose.palm.x - hand.lastPalm.x, pose.palm.y - hand.lastPalm.y);
        if (jump > CONF.jumpLimit) continue;
      }
      const gapMs = hand.lastSeen ? now - hand.lastSeen : Infinity;
      if (gapMs > HAND_CONF.continuityMs) {
        // Long gap: drop stale filter state so re-acquisition starts from the
        // glove's current pose instead of dragging the old one across the bench.
        hand.filters = null;
      }
      hydrateFilters(hand);
      const smooth = pose.smooth(dt, hand);
      if (gapMs > HAND_CONF.reacquireMs) hand.easeUntil = now + HAND_CONF.easeMs;
      if (hand.easeUntil && now < hand.easeUntil) {
        const eased = clampVecStep(hand.target.pos, { x: smooth.x, y: smooth.y, z: smooth.z }, HAND_CONF.easeRate, dt);
        hand.target.pos.x = eased.x;
        hand.target.pos.y = eased.y;
        hand.target.pos.z = eased.z;
      } else {
        hand.easeUntil = 0;
        hand.target.pos.x = smooth.x;
        hand.target.pos.y = smooth.y;
        hand.target.pos.z = smooth.z;
      }
      hand.target.yaw = smooth.yaw;
      hand.target.pitch = clamp(smooth.pitch, -0.7, 0.9);
      hand.target.roll = smooth.roll;
      hand.target.curls = smooth.curls.map((c) => clamp(c, 0, 1));
      hand.target.joints = smooth.joints;
      hand.target.thumb = clamp(smooth.thumb, 0, 1);

      const ratio = smooth.pinchRatio;
      if (!hand.forced) {
        hand.latch.update(ratio, dt * 1000);
        hand.pinchClosed = hand.latch.closed;
        hand.pinchRaw = hand.pinchClosed ? 1 : hand.latch.openness(ratio);
        hand.target.pinch = hand.pinchRaw;
      }
      if (hand.pinchClosed && hand.roll !== undefined) {
        // Wrist roll while pinched drives rotation (valve, faucet, wrench).
        const delta = smooth.roll - (hand.prevRoll ?? smooth.roll);
        if (Math.abs(delta) < 0.35) hand.rotDelta += delta * 1.6;
      }
      hand.prevRoll = smooth.roll;
      hand.tracked = true;
      hand.source = 'camera';
      hand.lastSeen = now;
      hand.lastPalm = pose.palm;
      calibFrames[side] = { x: pose.palm.x, y: pose.palm.y, scale: pose.scale };
    }

    const outcome = calibrator.sample(dt * 1000, calibFrames);
    if (outcome.justCompleted) {
      applyNeutralCalibration();
      lastCalibReport = -1;
      status();
    } else {
      reportCalibrationProgress();
    }
    return detections.length > 0;
  }

  // A completed calibration blends each hand from the absolute mapping to its
  // neutral-relative mapping; hands that match an existing neutral are kept so
  // re-invalidating one hand does not disturb the other.
  function applyNeutralCalibration() {
    for (const side of ['left', 'right']) {
      const n = calibrator.neutral[side];
      const hand = hands[side];
      if (!n || !hand) continue;
      const cur = hand.calib;
      const same = cur
        && Math.abs(cur.x - n.x) < 0.025 && Math.abs(cur.y - n.y) < 0.025
        && Math.abs(n.scale - cur.scale) < cur.scale * 0.12;
      if (!same) hand.calib = { x: n.x, y: n.y, scale: n.scale, blend: 0 };
    }
  }

  function reportCalibrationProgress() {
    const bucket = Math.floor(calibrator.progress * 5);
    if (bucket !== lastCalibReport) {
      lastCalibReport = bucket;
      status();
    }
  }

  function update(dt) {
    const now = performance.now();
    for (const side of ['left', 'right']) {
      const hand = hands[side];
      // A hand that was tracked and vanished holds its last pose for a short
      // window: the glove stays visible and keeps its grip instead of snapping.
      hand.holding = hand.tracked
        || (hand.source === 'camera' && hand.lastSeen > 0 && now - hand.lastSeen <= HAND_CONF.holdMs);
      if (hand.calib && hand.lastSeen && now - hand.lastSeen > HAND_CONF.calibResetMs) {
        hand.calib = null;
        calibrator.invalidate(side);
      }
    }
    if (automated) applyFallback(dt);
    const anyCamera = applyCameraFrame(dt);
    if (anyCamera) cameraFrames += 1;
    else fallbackFrames += 1;

    for (const side of ['left', 'right']) {
      const hand = hands[side];
      if (!hand.tracked && !hand.holding) {
        hand.source = hand.source === 'camera' ? 'fallback' : hand.source;
      }
    }

    if (camera.active && camera.handsSeen === 0) {
      if (!camera.lostSince) camera.lostSince = now;
    } else {
      camera.lostSince = 0;
    }
  }

  function consumeRot(side) {
    const hand = hands[side];
    const v = hand.rotDelta;
    hand.rotDelta = 0;
    return v;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => keys.clear());
  window.addEventListener('pagehide', () => {
    stopTracks();
    if (camera.landmarker) {
      try { camera.landmarker.close(); } catch (err) { /* already closed */ }
      camera.landmarker = null;
    }
  });
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  return {
    hands,
    update,
    consumeRot,
    toggleCamera,
    startCamera,
    stopCamera,
    cameraState: camera,
    inputMode,
    keys,
    // Macros drive the same pinch/curl state the pointer QA channel uses, so
    // scripted commands cannot bypass the hand-target interaction checks.
    forcePinch(side, value) {
      const hand = hands[side];
      if (!hand) return;
      const want = value >= 1;
      hand.forced = want ? value : null;
      hand.pinchRaw = clamp01(value);
      hand.target.pinch = hand.pinchRaw;
      hand.pinchClosed = want;
      hand.latch.reset(want);
      hand.target.joints = null;
      hand.target.curls = hand.target.curls.map((c) => clamp01(c + ((want ? 0.85 : 0.3) - c) * 0.6));
      hand.target.thumb = clamp01(hand.target.thumb + ((want ? 0.75 : 0.25) - hand.target.thumb) * 0.6);
      hand.source = 'macro';
    },
    forceRotate(side, amount) {
      const hand = hands[side];
      if (hand && Number.isFinite(amount)) hand.rotDelta += amount;
    },
    cameraFrames() { return cameraFrames; },
    setHighlight(side, value) {
      hands[side].target.highlight = value;
    },
    // Fingertip contact strength (0..1) against the nearest interactive
    // surface; drives the glove contact ring and is exposed per hand.
    setContact(side, value) {
      const hand = hands[side];
      if (!hand) return;
      hand.contact = clamp01(value);
      hand.target.contact = hand.contact;
    },
    calibrationState() {
      const handsOut = {};
      for (const side of ['left', 'right']) {
        const hand = hands[side];
        handsOut[side] = {
          tracked: hand.tracked,
          holding: hand.holding,
          calibrated: Boolean(hand.calib),
          contact: hand.contact,
        };
      }
      return { ready: calibrator.ready, progress: calibrator.progress, hands: handsOut };
    },
  };
}
