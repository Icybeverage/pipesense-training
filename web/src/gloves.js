// PipeSense virtual work gloves.
//
// A glove is a procedural rig: palm + cuff + 5 articulated fingers, driven by
// a pose supplied by the input layer (MediaPipe's 21 landmarks per hand, or
// the silent QA channel in automated test sessions). Local frame: fingers
// extend along +Z, the palm normal is +Y, the thumb sits on +X for the right
// hand and -X for the left.
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
      const base = 112 + Math.floor(grain * 44);
      diffuseData[i * 3 + 0] = Math.min(255, base + Math.floor(warmTint.r * 255 * tint));
      diffuseData[i * 3 + 1] = Math.min(255, base + Math.floor(warmTint.g * 255 * tint));
      diffuseData[i * 3 + 2] = Math.min(255, base + Math.floor(warmTint.b * 255 * tint));
      roughData[i] = 178 + Math.floor((1 - grain) * 58 + wear * 10);
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

function leather(color, rough = 0.94, repeat = 3.4) {
  const mat = new THREE.MeshStandardMaterial({
    color,
    // Colour comes from the material itself; the former dark diffuse map
    // multiplied safety colours almost back to black. Normal and roughness
    // maps retain the leather grain without sacrificing silhouette contrast.
    normalMap: LEATHER_SURFACE.normalMap.clone(),
    roughnessMap: LEATHER_SURFACE.roughnessMap.clone(),
    roughness: rough,
    metalness: 0,
    normalScale: new THREE.Vector2(0.14, 0.14),
    envMapIntensity: 0.16,
  });
  mat.normalMap.repeat.set(repeat, repeat);
  mat.roughnessMap.repeat.set(repeat, repeat);
  return mat;
}

function damp(cur, target, lambda, dt) {
  return target + (cur - target) * Math.exp(-lambda * dt);
}

export function createGlove(side) {
  const s = side === 'right' ? 1 : -1;
  const mats = {
    // Safety-blue backs separate clearly from the cabinet while the graphite
    // grip surfaces preserve a believable professional work-glove finish.
    leather: leather(side === 'right' ? 0x328da7 : 0x27778f, 0.92, 3.5),
    leatherPalm: leather(0x343b43, 0.97, 3.9),
    pad: leather(0x171b20, 1.0, 4.8),
    cuff: leather(0x255f72, 0.94, 3.2),
    seam: new THREE.MeshStandardMaterial({ color: 0xf08a24, roughness: 0.78, metalness: 0.02 }),
    reflective: new THREE.MeshStandardMaterial({
      color: 0xffb343,
      emissive: 0x7a2d00,
      emissiveIntensity: 0.18,
      roughness: 0.62,
      metalness: 0.04,
    }),
  };

  const root = new THREE.Group();
  root.name = `glove-${side}`;

  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.040, 0.054, 24, 2, true), mats.cuff);
  cuff.rotation.x = Math.PI / 2;
  cuff.position.set(0, -0.003, -0.032);
  root.add(cuff);
  const cuffRing = new THREE.Mesh(new THREE.TorusGeometry(0.043, 0.0036, 12, 28), mats.seam);
  cuffRing.position.set(0, -0.003, -0.005);
  root.add(cuffRing);

  const palm = new THREE.Mesh(new RoundedBoxGeometry(PALM.w, PALM.t, PALM.l, 3, 0.009), mats.leatherPalm);
  palm.position.set(0, 0, PALM.l / 2 - 0.006);
  palm.castShadow = true;
  root.add(palm);
  // A shallow anatomical shell softens the rectangular rig into the convex
  // silhouette of a gloved metacarpus without changing any landmark pivots.
  const palmDome = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), mats.leather);
  palmDome.scale.set(PALM.w * 0.48, PALM.t * 0.62, PALM.l * 0.48);
  palmDome.position.set(0, PALM.t * 0.18, PALM.l * 0.50);
  palmDome.castShadow = true;
  root.add(palmDome);
  const thenar = new THREE.Mesh(new THREE.SphereGeometry(0.018, 16, 16), mats.leatherPalm);
  thenar.scale.set(1.1, 0.68, 1.26);
  thenar.position.set(0.026 * s, -0.0015, 0.047);
  thenar.castShadow = true;
  root.add(thenar);
  const hypothenar = new THREE.Mesh(new THREE.SphereGeometry(0.0145, 14, 14), mats.leatherPalm);
  hypothenar.scale.set(1.08, 0.66, 1.2);
  hypothenar.position.set(-0.027 * s, -0.001, 0.056);
  hypothenar.castShadow = true;
  root.add(hypothenar);
  const palmPad = new THREE.Mesh(new RoundedBoxGeometry(PALM.w * 0.82, 0.012, PALM.l * 0.7, 2, 0.006), mats.pad);
  palmPad.position.set(0, -PALM.t / 2 - 0.004, PALM.l * 0.48);
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
  const knuckle = new THREE.Mesh(new RoundedBoxGeometry(PALM.w * 0.7, 0.012, 0.032, 2, 0.007), mats.pad);
  knuckle.position.set(0, PALM.t / 2 - 0.004, PALM.front - 0.008);
  root.add(knuckle);
  for (const spec of FINGERS) {
    const knuckleCap = new THREE.Mesh(new THREE.SphereGeometry(spec.w * 0.44, 14, 12), mats.leatherPalm);
    knuckleCap.scale.set(1.22, 0.72, 1.0);
    knuckleCap.position.set(spec.x * s, PALM.t / 2 - 0.001, PALM.front + spec.dz - 0.002);
    knuckleCap.castShadow = true;
    root.add(knuckleCap);
  }

  const fingerRigs = [];
  const tips = { index: null, thumb: null };
  for (const spec of FINGERS) {
    const mcp = new THREE.Group();
    mcp.position.set(spec.x * s, 0.002, PALM.front + spec.dz);
    root.add(mcp);
    const joints = [mcp];
    let parent = mcp;
    spec.lens.forEach((len, i) => {
      const taper = 1 - i * 0.115;
      const radius = spec.w * taper * (0.47 - i * 0.015);
      const seg = new THREE.Mesh(
        // Extend each capsule through its pivot so adjacent phalanges overlap
        // like one padded glove instead of reading as disconnected robot links.
        new THREE.CapsuleGeometry(radius, Math.max(0.003, len - radius * 2 + 0.010), 5, 14),
        mats.leather,
      );
      seg.rotation.x = Math.PI / 2;
      seg.position.set(0, 0, len / 2);
      seg.castShadow = true;
      parent.add(seg);
      if (i < spec.lens.length - 1) {
        const next = new THREE.Group();
        next.position.set(0, 0, len);
        parent.add(next);
        joints.push(next);
        parent = next;
      } else {
        const tip = new THREE.Mesh(new THREE.SphereGeometry(spec.w * 0.39, 14, 12), mats.pad);
        tip.scale.set(1, 0.78, 1.28);
        tip.position.set(0, 0, len + 0.004);
        parent.add(tip);
        if (spec.key === 'index') {
          // Endpoint marker at the fingertip; the pinch anchor tracks the
          // midpoint of this and the thumb endpoint every frame.
          tips.index = new THREE.Object3D();
          tips.index.position.set(0, 0, len);
          parent.add(tips.index);
        }
      }
    });
    fingerRigs.push({ joints, curlMax: spec.curlMax });
  }

  const thumbBase = new THREE.Group();
  thumbBase.position.set(0.040 * s, -0.010, 0.038);
  root.add(thumbBase);
  const thumbJoints = [thumbBase];
  {
    let parent = thumbBase;
    THUMB.lens.forEach((len, i) => {
      const taper = 1 - i * 0.12;
      const radius = THUMB.w * taper * (0.49 - i * 0.015);
      const seg = new THREE.Mesh(
        new THREE.CapsuleGeometry(radius, Math.max(0.003, len - radius * 2 + 0.010), 5, 14),
        mats.leather,
      );
      seg.rotation.x = Math.PI / 2;
      seg.position.set(0, 0, len / 2);
      seg.castShadow = true;
      parent.add(seg);
      if (i < THUMB.lens.length - 1) {
        const next = new THREE.Group();
        next.position.set(0, 0, len);
        parent.add(next);
        thumbJoints.push(next);
        parent = next;
      } else {
        tips.thumb = new THREE.Object3D();
        tips.thumb.position.set(0, 0, len);
        parent.add(tips.thumb);
      }
    });
  }

  const pinchAnchor = new THREE.Object3D();
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

    // The pinch anchor is the grasp point: midpoint of the thumb and index
    // endpoints in the glove's own frame, so it follows the curled fingers
    // instead of hovering at a fixed palm offset.
    if (tips.index && tips.thumb) {
      tips.index.getWorldPosition(tipA);
      tips.thumb.getWorldPosition(tipB);
      root.worldToLocal(tipA);
      root.worldToLocal(tipB);
      pinchAnchor.position.set(
        (tipA.x + tipB.x) / 2,
        (tipA.y + tipB.y) / 2,
        (tipA.z + tipB.z) / 2,
      );
      halo.position.copy(pinchAnchor.position);
    }

    const contact = curled.contact;
    halo.material.opacity = Math.min(0.95, curled.highlight * 0.5 + pinch * 0.35 + contact * 0.6);
    halo.material.color.copy(haloBase).lerp(haloHot, contact);
    const pulse = 1 + Math.sin(performance.now() * 0.006) * 0.08 * curled.highlight + contact * 0.2;
    halo.scale.setScalar(pulse * (1 + contact * 0.3));
  }

  return {
    root,
    side,
    gripAnchor,
    pinchAnchor,
    halo,
    update,
    mats,
    get contact() { return curled.contact; },
  };
}
