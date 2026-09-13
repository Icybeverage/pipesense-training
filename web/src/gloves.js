// PipeSense virtual work gloves.
//
// A glove is a procedural rig: palm + cuff + 5 articulated fingers, driven by
// a pose supplied by the input layer (MediaPipe's 21 landmarks per hand, or
// the silent QA channel in automated test sessions). Local frame: fingers
// extend along +Z, the palm normal is -Y, the thumb sits on +X for the right
// hand and -X for the left. Each finger is a chain of tapered phalanges that
// share the radius at every joint and are covered by a rounded joint volume,
// so the silhouette reads as one padded work glove rather than separate
// capsules. The palm masses (thenar, hypothenar, back dome, knuckle row and
// finger-base webbing) overlap into the same continuous shell.
//
// Anchors are ordinary Object3D nodes, so every consumer can read them in
// world space with getWorldPosition(): pinchAnchor is the thumb/index grasp
// midpoint, gripAnchor carries the wrench, and `anchors` exposes the palm plus
// all five fingertips for full-hand contact.
//
// root rotation defaults to yaw PI, so an idle glove points into the scene.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const PALM = { w: 0.095, t: 0.036, l: 0.112, front: 0.108 };
const FINGERS = [
  { key: 'index', x: 0.031, dz: 0.000, lens: [0.043, 0.029, 0.021], w: 0.0220, curlMax: [1.35, 1.5, 0.8] },
  { key: 'middle', x: 0.010, dz: 0.005, lens: [0.047, 0.032, 0.022], w: 0.0230, curlMax: [1.3, 1.5, 0.8] },
  { key: 'ring', x: -0.011, dz: 0.001, lens: [0.043, 0.029, 0.021], w: 0.0215, curlMax: [1.3, 1.5, 0.85] },
  { key: 'pinky', x: -0.033, dz: -0.008, lens: [0.035, 0.024, 0.018], w: 0.0190, curlMax: [1.25, 1.45, 0.9] },
];
const THUMB = { lens: [0.036, 0.027, 0.020], w: 0.025 };

export const FINGER_ORDER = ['thumb', 'index', 'middle', 'ring', 'pinky'];
const ANCHOR_KEYS = ['palm', ...FINGER_ORDER];

const LEATHER_SURFACE = makeLeatherSurface();

function fract(v) {
  return v - Math.floor(v);
}

function hash2(x, y, seed) {
  return fract(Math.sin((x + seed * 13.13) * 127.1 + (y + seed * 0.73) * 311.7) * 43758.5453123);
}

function smoothNoise(x, y, seed) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = x - x0;
  const ty = y - y0;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);
  const ab = a + (b - a) * sx;
  const cd = c + (d - c) * sx;
  return ab + (cd - ab) * sy;
}

function octaveNoise(x, y, seed) {
  let freq = 1;
  let amp = 0.55;
  let total = 0;
  let norm = 0;
  for (let i = 0; i < 4; i++) {
    total += smoothNoise(x * freq, y * freq, seed + i * 7.17) * amp;
    norm += amp;
    freq *= 2.1;
    amp *= 0.5;
  }
  return total / norm;
}

function makeLeatherSurface() {
  const size = 192;
  const diffuseData = new Uint8Array(size * size * 3);
  const roughData = new Uint8Array(size * size);
  const normalData = new Uint8Array(size * size * 3);
  const height = new Float32Array(size * size);
  const warmTint = new THREE.Color(0x493d35);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const n0 = octaveNoise(x / 38, y / 38, 2.17);
      const n1 = octaveNoise(x / 15.5, y / 15.5, 7.83);
      const n2 = octaveNoise((x + 31) / 6.5, (y + 11) / 6.5, 18.11);
      const micro = n0 * 0.56 + n1 * 0.30 + n2 * 0.14;
      const grain = Math.pow(Math.max(0.0, micro), 1.35);
      const wear = Math.max(0, octaveNoise((x + 70) / 57, (y + 26) / 57, 24.2) - 0.46) * 1.8;
      const tint = wear * 0.16;
      height[i] = grain * 0.85 + wear * 0.45;
      // Keep the grain light enough to carry an industrial glove colour in a
      // dark under-sink bay. The previous near-black albedo multiplied every
      // material colour down until the hands disappeared in captured video.
      const base = 118 + Math.floor(grain * 44);
      diffuseData[i * 3 + 0] = Math.min(255, base + Math.floor(warmTint.r * 255 * tint));
      diffuseData[i * 3 + 1] = Math.min(255, base + Math.floor(warmTint.g * 255 * tint));
      diffuseData[i * 3 + 2] = Math.min(255, base + Math.floor(warmTint.b * 255 * tint));
      // A flat, high roughness map keeps nitrile/leather matte: the former
      // wide range produced bright specular blooms that made the finger
      // phalanges read as hard, shiny robot segments.
      roughData[i] = 208 + Math.floor((1 - grain) * 34 + wear * 8);
    }
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const xl = (x + size - 1) % size;
      const xr = (x + 1) % size;
      const yu = (y + size - 1) % size;
      const yd = (y + 1) % size;
      const dx = height[y * size + xr] - height[y * size + xl];
      const dy = height[yd * size + x] - height[yu * size + x];
      const n = new THREE.Vector3(-dx * 2.2, -dy * 2.2, 1).normalize();
      normalData[i * 3 + 0] = Math.floor((n.x * 0.5 + 0.5) * 255);
      normalData[i * 3 + 1] = Math.floor((n.y * 0.5 + 0.5) * 255);
      normalData[i * 3 + 2] = Math.floor((n.z * 0.5 + 0.5) * 255);
    }
  }

  const wrap = THREE.RepeatWrapping;
  const diffuseMap = new THREE.DataTexture(diffuseData, size, size, THREE.RGBFormat);
  const roughnessMap = new THREE.DataTexture(roughData, size, size, THREE.RedFormat);
  const normalMap = new THREE.DataTexture(normalData, size, size, THREE.RGBFormat);
  [diffuseMap, roughnessMap, normalMap].forEach((tex) => {
    tex.wrapS = wrap;
    tex.wrapT = wrap;
    tex.needsUpdate = true;
    tex.colorSpace = THREE.NoColorSpace;
  });
  diffuseMap.colorSpace = THREE.SRGBColorSpace;
  return { diffuseMap, roughnessMap, normalMap };
}

function leather(color, rough = 0.95, repeat = 3.4) {
  const base = new THREE.Color(color);
  const mat = new THREE.MeshStandardMaterial({
    color: base,
    normalMap: LEATHER_SURFACE.normalMap.clone(),
    // Full roughness and almost no environment response give the glove a
    // fabric/rubber response instead of the metallic highlights seen in the
    // previous capture. The brighter diffuse grain preserves visibility.
    roughness: Math.max(0.98, rough),
    metalness: 0,
    emissive: base.clone().multiplyScalar(0.12),
    emissiveIntensity: 0.22,
    normalScale: new THREE.Vector2(0.09, 0.09),
    envMapIntensity: 0,
  });
  mat.normalMap.repeat.set(repeat, repeat);
  return mat;
}

// Radii along one finger chain: knuckle (MCP) -> PIP -> DIP -> tip. Every
// phalanx is built from r[i] to r[i + 1], so the chain has no radius step at
// any joint and the glove can never read as disconnected links.
function radiusChain(w) {
  return [w * 0.490, w * 0.455, w * 0.415, w * 0.372];
}

// A continuous skinned tube removes the visible seams between phalanges. Four
// bones still preserve MCP/PIP/DIP articulation, but the rendered surface is a
// single deforming finger like the gloved hands in the 00:22 reference.
function fingerSkinGeometry(lens, radii, radialSegments = 18, ringsPerBone = 5) {
  const positions = [];
  const skinIndices = [];
  const skinWeights = [];
  const indices = [];
  const rings = [];
  let z0 = 0;

  for (let bone = 0; bone < lens.length; bone++) {
    for (let step = 0; step <= ringsPerBone; step++) {
      if (bone > 0 && step === 0) continue;
      const t = step / ringsPerBone;
      const eased = t * t * (3 - 2 * t);
      const z = z0 + lens[bone] * t;
      const radius = THREE.MathUtils.lerp(radii[bone], radii[bone + 1], eased);
      const ring = [];
      for (let j = 0; j < radialSegments; j++) {
        const a = (j / radialSegments) * Math.PI * 2;
        ring.push(positions.length / 3);
        positions.push(Math.cos(a) * radius, Math.sin(a) * radius, z);
        skinIndices.push(bone, bone + 1, 0, 0);
        skinWeights.push(1 - t, t, 0, 0);
      }
      rings.push(ring);
    }
    z0 += lens[bone];
  }

  for (let r = 0; r < rings.length - 1; r++) {
    for (let j = 0; j < radialSegments; j++) {
      const n = (j + 1) % radialSegments;
      indices.push(rings[r][j], rings[r + 1][j], rings[r + 1][n]);
      indices.push(rings[r][j], rings[r + 1][n], rings[r][n]);
    }
  }

  const start = positions.length / 3;
  positions.push(0, 0, 0);
  skinIndices.push(0, 0, 0, 0);
  skinWeights.push(1, 0, 0, 0);
  const end = positions.length / 3;
  positions.push(0, 0, z0);
  skinIndices.push(lens.length, 0, 0, 0);
  skinWeights.push(1, 0, 0, 0);
  for (let j = 0; j < radialSegments; j++) {
    const n = (j + 1) % radialSegments;
    indices.push(start, rings[0][n], rings[0][j]);
    indices.push(end, rings.at(-1)[j], rings.at(-1)[n]);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function ellipsoid(radius, sx, sy, sz) {
  return new THREE.SphereGeometry(radius, 16, 12).scale(sx, sy, sz);
}

function damp(cur, target, lambda, dt) {
  return target + (cur - target) * Math.exp(-lambda * dt);
}

export function createGlove(side) {
  const s = side === 'right' ? 1 : -1;
  const mats = {
    // Safety-blue backs separate clearly from the cabinet while the graphite
    // grip surfaces preserve a believable professional work-glove finish.
    leather: leather(0x4b8190, 1.0, 3.5),
    leatherPalm: leather(0x56656b, 1.0, 3.9),
    pad: leather(0x292f33, 1.0, 4.8),
    cuff: leather(0x3e6975, 1.0, 3.2),
    seam: new THREE.MeshStandardMaterial({ color: 0xd97a1f, roughness: 0.88, metalness: 0 }),
    reflective: new THREE.MeshStandardMaterial({
      color: 0xffb343,
      emissive: 0x6b2800,
      emissiveIntensity: 0.16,
      roughness: 0.72,
      metalness: 0,
    }),
  };

  const root = new THREE.Group();
  root.name = `glove-${side}`;

  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.040, 0.082, 24, 3, false), mats.cuff);
  cuff.rotation.x = Math.PI / 2;
  cuff.position.set(0, -0.003, -0.047);
  cuff.castShadow = true;
  root.add(cuff);

  // ------------------------------------------------------------- palm shell
  // Overlapping masses rather than one box: core block, back-of-hand dome,
  // broad knuckle row, thenar (thumb side) and hypothenar (pinky side) pads.
  const palm = new THREE.Mesh(new RoundedBoxGeometry(PALM.w, PALM.t, PALM.l, 4, 0.0135), mats.leatherPalm);
  palm.position.set(0, 0, PALM.l / 2 - 0.006);
  palm.castShadow = true;
  root.add(palm);

  const palmDome = new THREE.Mesh(ellipsoid(1, PALM.w * 0.50, PALM.t * 0.66, PALM.l * 0.52), mats.leather);
  palmDome.position.set(0, PALM.t * 0.15, PALM.l * 0.46);
  palmDome.castShadow = true;
  root.add(palmDome);

  const knuckleRow = new THREE.Mesh(ellipsoid(1, PALM.w * 0.53, PALM.t * 0.60, 0.020), mats.leather);
  knuckleRow.position.set(0, PALM.t * 0.07, PALM.front - 0.010);
  knuckleRow.castShadow = true;
  root.add(knuckleRow);

  const wristMass = new THREE.Mesh(ellipsoid(1, PALM.w * 0.45, PALM.t * 0.54, 0.020), mats.leatherPalm);
  wristMass.position.set(0, -0.002, -0.008);
  root.add(wristMass);

  // Fuller thenar and hypothenar: these two masses carry the gloved hand's
  // real bulge and blend the thumb base and pinky edge into the palm.
  const thenar = new THREE.Mesh(ellipsoid(1, 0.0235, 0.0150, 0.0325), mats.leatherPalm);
  thenar.position.set(0.0235 * s, -0.0035, 0.047);
  thenar.castShadow = true;
  root.add(thenar);
  const hypothenar = new THREE.Mesh(ellipsoid(1, 0.0175, 0.0125, 0.0290), mats.leatherPalm);
  hypothenar.position.set(-0.0285 * s, -0.0035, 0.052);
  hypothenar.castShadow = true;
  root.add(hypothenar);

  const palmPad = new THREE.Mesh(new RoundedBoxGeometry(PALM.w * 0.84, 0.011, PALM.l * 0.68, 3, 0.005), mats.pad);
  palmPad.position.set(0, -PALM.t / 2 - 0.0035, PALM.l * 0.46);
  palmPad.castShadow = true;
  root.add(palmPad);
  const strap = new THREE.Mesh(new RoundedBoxGeometry(PALM.w * 0.86, 0.0105, 0.016, 2, 0.0038), mats.seam);
  strap.position.set(0, PALM.t / 2 + 0.0005, 0.014);
  root.add(strap);
  // A restrained hi-vis chevron gives judges an immediate hand silhouette
  // without turning the glove into a neon controller prop.
  for (const x of [-0.019, 0.019]) {
    const marker = new THREE.Mesh(new RoundedBoxGeometry(0.012, 0.006, 0.046, 2, 0.003), mats.reflective);
    marker.position.set(x, PALM.t / 2 + 0.005, 0.059);
    marker.rotation.y = x * s > 0 ? -0.22 : 0.22;
    marker.castShadow = true;
    root.add(marker);
  }

  // Finger-base webbing: a soft wedge between each adjacent pair of knuckles.
  // It fills the notch the old rig left open, which was the strongest cue that
  // the fingers were separate parts.
  for (let i = 0; i < FINGERS.length - 1; i++) {
    const a = FINGERS[i];
    const b = FINGERS[i + 1];
    const web = new THREE.Mesh(ellipsoid(1, Math.abs(a.x - b.x) * 0.66, PALM.t * 0.74, 0.017), mats.leather);
    web.position.set(((a.x + b.x) / 2) * s, 0.001, PALM.front - 0.006);
    web.castShadow = true;
    root.add(web);
  }

  // ------------------------------------------------------- articulated chains
  const tipAnchors = {};
  const fingerRigs = [];

  function buildChain({ key, lens, w, curlMax, base, register = true }) {
    const radii = radiusChain(w);
    const bones = lens.map(() => new THREE.Bone());
    bones.push(new THREE.Bone());
    bones[0].name = `${key}-mcp`;
    for (let i = 1; i < bones.length; i++) {
      bones[i].name = `${key}-${i === 1 ? 'pip' : i === 2 ? 'dip' : 'tip'}`;
      bones[i].position.z = lens[i - 1];
      bones[i - 1].add(bones[i]);
    }
    const mesh = new THREE.SkinnedMesh(fingerSkinGeometry(lens, radii), mats.leather);
    mesh.name = `skin-${key}`;
    mesh.position.copy(base);
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    mesh.add(bones[0]);
    mesh.bind(new THREE.Skeleton(bones));
    root.add(mesh);

    const anchor = new THREE.Object3D();
    anchor.name = `anchor-${key}`;
    bones.at(-1).add(anchor);
    tipAnchors[key] = anchor;
    const tipCap = new THREE.Mesh(ellipsoid(radii.at(-1), 1.0, 0.94, 1.18), mats.leather);
    tipCap.position.z = radii.at(-1) * 0.22;
    tipCap.castShadow = true;
    bones.at(-1).add(tipCap);
    const joints = bones.slice(0, 3);
    if (register) fingerRigs.push({ joints, curlMax });
    return { joints, bones, mesh, anchor };
  }

  for (const spec of FINGERS) {
    buildChain({
      key: spec.key,
      lens: spec.lens,
      w: spec.w,
      curlMax: spec.curlMax,
      base: new THREE.Vector3(spec.x * s, 0.002, PALM.front + spec.dz),
    });
  }

  const thumbRig = buildChain({
    key: 'thumb',
    lens: THUMB.lens,
    w: THUMB.w,
    curlMax: [1.1, 1.0, 0.85],
    base: new THREE.Vector3(0.040 * s, -0.010, 0.038),
    register: false,
  });
  // The thumb has its own opposition transform in addition to bone bends.
  const thumbBase = thumbRig.joints[0];
  const thumbJoints = thumbRig.joints;

  const anchors = {};
  for (const key of ANCHOR_KEYS) {
    anchors[key] = key === 'palm'
      // Heel/hollow of the palm: the surface a gloved hand braces with.
      ? (() => {
        const node = new THREE.Object3D();
        node.name = 'anchor-palm';
        node.position.set(0, -PALM.t * 0.54, PALM.l * 0.55);
        root.add(node);
        return node;
      })()
      : tipAnchors[key];
  }

  const pinchAnchor = new THREE.Object3D();
  pinchAnchor.name = 'anchor-pinch';
  pinchAnchor.position.set(0.006 * s, 0.004, 0.108);
  root.add(pinchAnchor);
  const gripAnchor = new THREE.Object3D();
  root.add(gripAnchor);

  const haloBase = new THREE.Color(0x5e748f);
  const haloHot = new THREE.Color(0x9fc7de);
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(0.02, 0.0032, 8, 24),
    new THREE.MeshBasicMaterial({ color: haloBase.clone(), transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  halo.position.copy(pinchAnchor.position);
  halo.rotation.x = Math.PI / 2;
  root.add(halo);

  const pose = { yaw: Math.PI, pitch: -0.18, roll: 0 };
  const curled = { fingers: [0, 0, 0, 0], thumb: 0, pinch: 0, highlight: 0, contact: 0 };
  const tipA = new THREE.Vector3();
  const tipB = new THREE.Vector3();
  const haloPoint = new THREE.Vector3();
  const gripPoint = new THREE.Vector3();

  root.rotation.set(pose.pitch, pose.yaw, pose.roll, 'YXZ');

  function update(dt, target) {
    if (target) {
      const k = 1 - Math.exp(-16 * dt);
      root.position.x += (target.pos.x - root.position.x) * k;
      root.position.y += (target.pos.y - root.position.y) * k;
      root.position.z += (target.pos.z - root.position.z) * k;
      pose.yaw = target.yaw;
      pose.pitch = target.pitch;
      pose.roll = target.roll;
      for (let i = 0; i < 4; i++) curled.fingers[i] = damp(curled.fingers[i], target.curls[i], 16, dt);
      curled.thumb = damp(curled.thumb, target.thumb, 16, dt);
      curled.pinch = damp(curled.pinch, target.pinch, 18, dt);
      curled.highlight = damp(curled.highlight, target.highlight || 0, 10, dt);
      curled.contact = damp(curled.contact, target.contact || 0, 14, dt);
    }
    root.rotation.set(pose.pitch, pose.yaw, pose.roll, 'YXZ');

    fingerRigs.forEach((rig, fi) => {
      const c = curled.fingers[fi];
      rig.joints.forEach((joint, ji) => {
        // Camera poses include the three MediaPipe bends for this finger.
        // Scripted QA poses omit them and use the aggregate curl instead.
        const trackedJoint = target && target.joints && target.joints[fi]
          ? target.joints[fi][ji]
          : null;
        joint.rotation.x = (Number.isFinite(trackedJoint) ? trackedJoint : c) * rig.curlMax[ji];
      });
    });

    const pinch = curled.pinch;
    thumbBase.rotation.set(0.55, -0.85 * s * (1 - pinch * 0.35), -0.95 * s * (1 - pinch * 0.5), 'YXZ');
    thumbJoints.forEach((joint, ji) => {
      if (ji === 0) return;
      joint.rotation.x = curled.thumb * (1.15 - ji * 0.15);
      joint.rotation.z = -0.12 * s * pinch;
    });

    // Centre the carried tool inside the supported hand volume. All five
    // fingertip landmarks plus the palm contribute, so a wrench or fitting
    // follows a whole-hand grasp rather than appearing pinned to the wrist.
    gripAnchor.position.set(0, 0, 0);
    let gripCount = 0;
    for (const anchor of Object.values(anchors)) {
      if (!anchor) continue;
      anchor.getWorldPosition(gripPoint);
      root.worldToLocal(gripPoint);
      gripAnchor.position.add(gripPoint);
      gripCount += 1;
    }
    if (gripCount) gripAnchor.position.multiplyScalar(1 / gripCount);

    // The pinch anchor is the grasp point: midpoint of the thumb and index
    // endpoints in the glove's own frame, so it follows the curled fingers
    // instead of hovering at a fixed palm offset.
    if (tipAnchors.index && tipAnchors.thumb) {
      tipAnchors.index.getWorldPosition(tipA);
      tipAnchors.thumb.getWorldPosition(tipB);
      root.worldToLocal(tipA);
      root.worldToLocal(tipB);
      pinchAnchor.position.set(
        (tipA.x + tipB.x) / 2,
        (tipA.y + tipB.y) / 2,
        (tipA.z + tipB.z) / 2,
      );
      // The contact ring follows whichever anchor the interaction layer used,
      // so a palm brace or a full-finger power grip highlights the right spot.
      const ring = contactAnchor && contactAnchor.parent ? contactAnchor : pinchAnchor;
      ring.getWorldPosition(haloPoint);
      root.worldToLocal(haloPoint);
      halo.position.copy(haloPoint);
    }

    const contact = curled.contact;
    halo.material.opacity = Math.min(0.95, curled.highlight * 0.5 + pinch * 0.35 + contact * 0.6);
    halo.material.color.copy(haloBase).lerp(haloHot, contact);
    const pulse = 1 + Math.sin(performance.now() * 0.006) * 0.08 * curled.highlight + contact * 0.2;
    halo.scale.setScalar(pulse * (1 + contact * 0.3));
  }

  // Interaction sets this to the anchor currently touching a target; the halo
  // reads it on the next update. Null falls back to the pinch midpoint.
  let contactAnchor = null;

  return {
    root,
    side,
    gripAnchor,
    pinchAnchor,
    anchors,
    fingerOrder: FINGER_ORDER,
    halo,
    update,
    mats,
    // Damped curl per finger chain, 0 (open) .. 1 (fully closed). The thumb is
    // addressed by key, the four fingers by their name in fingerOrder.
    getCurl(key) {
      if (key === 'thumb') return curled.thumb;
      const i = FINGER_ORDER.indexOf(key) - 1;
      return i >= 0 ? curled.fingers[i] : 0;
    },
    setContactAnchor(node) { contactAnchor = node || null; },
    get contact() { return curled.contact; },
  };
}
