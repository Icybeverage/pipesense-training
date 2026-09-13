// PipeSense virtual work gloves.
//
// A glove is a procedural rig: palm + cuff + 5 articulated fingers, driven by
// a pose supplied by the input layer (MediaPipe landmarks or the mouse and
// keyboard fallback). Local frame: fingers extend along +Z, the palm normal
// is +Y, the thumb sits on +X for the right hand and -X for the left.
// root rotation defaults to yaw PI, so an idle glove points into the scene.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const PALM = { w: 0.086, t: 0.030, l: 0.095, front: 0.0925 };
const FINGERS = [
  { key: 'index', x: 0.028, dz: 0.000, lens: [0.033, 0.026, 0.020], w: 0.017, curlMax: [1.35, 1.5, 0.8] },
  { key: 'middle', x: 0.009, dz: 0.004, lens: [0.036, 0.028, 0.021], w: 0.018, curlMax: [1.3, 1.5, 0.8] },
  { key: 'ring', x: -0.010, dz: 0.001, lens: [0.033, 0.026, 0.020], w: 0.0165, curlMax: [1.3, 1.5, 0.85] },
  { key: 'pinky', x: -0.028, dz: -0.007, lens: [0.028, 0.021, 0.017], w: 0.0145, curlMax: [1.25, 1.45, 0.9] },
];
const THUMB = { lens: [0.031, 0.025, 0.019], w: 0.021 };

function leather(color, rough = 0.88) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.03 });
}

function accentMat(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.05, emissive: color, emissiveIntensity: 0.14 });
}

function damp(cur, target, lambda, dt) {
  return target + (cur - target) * Math.exp(-lambda * dt);
}

export function createGlove(side) {
  const s = side === 'right' ? 1 : -1;
  const mats = {
    // High-visibility split-leather work gloves. The original charcoal hand
    // disappeared against the cabinet; this keeps every articulated segment
    // readable while the dark reinforcement pads still show the grip side.
    leather: leather(side === 'right' ? 0xe08a3e : 0xd87c34, 0.82),
    leatherPalm: leather(0xb95c28, 0.9),
    pad: leather(0x202a38, 0.68),
    cuff: leather(0x253247, 0.86),
    accent: accentMat(side === 'right' ? 0xffb45d : 0x59e0ee),
  };

  const root = new THREE.Group();
  root.name = `glove-${side}`;

  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.054, 0.047, 0.15, 20, 1, true), mats.cuff);
  cuff.rotation.x = Math.PI / 2;
  cuff.position.set(0, -0.004, -0.10);
  root.add(cuff);
  const cuffRing = new THREE.Mesh(new THREE.TorusGeometry(0.049, 0.006, 10, 22), mats.cuff);
  cuffRing.position.set(0, -0.004, -0.033);
  root.add(cuffRing);

  const palm = new THREE.Mesh(new RoundedBoxGeometry(PALM.w, PALM.t, PALM.l, 3, 0.009), mats.leatherPalm);
  palm.position.set(0, 0, PALM.l / 2 - 0.006);
  palm.castShadow = true;
  root.add(palm);
  const palmPad = new THREE.Mesh(new RoundedBoxGeometry(PALM.w * 0.82, 0.012, PALM.l * 0.7, 2, 0.006), mats.pad);
  palmPad.position.set(0, -PALM.t / 2 - 0.004, PALM.l * 0.48);
  palmPad.castShadow = true;
  root.add(palmPad);
  const strap = new THREE.Mesh(new RoundedBoxGeometry(PALM.w * 0.9, 0.012, 0.018, 2, 0.004), mats.accent);
  strap.position.set(0, PALM.t / 2 + 0.002, 0.012);
  root.add(strap);
  const knuckle = new THREE.Mesh(new RoundedBoxGeometry(PALM.w * 0.72, 0.014, 0.03, 2, 0.007), mats.pad);
  knuckle.position.set(0, PALM.t / 2 - 0.004, PALM.front - 0.008);
  root.add(knuckle);

  const fingerRigs = [];
  const tips = { index: null, thumb: null };
  for (const spec of FINGERS) {
    const mcp = new THREE.Group();
    mcp.position.set(spec.x * s, 0.002, PALM.front + spec.dz);
    root.add(mcp);
    const joints = [mcp];
    let parent = mcp;
    spec.lens.forEach((len, i) => {
      const seg = new THREE.Mesh(new RoundedBoxGeometry(spec.w, spec.w * 0.92, len, 2, spec.w * 0.32), mats.leather);
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
        const tip = new THREE.Mesh(new RoundedBoxGeometry(spec.w * 0.94, spec.w * 0.8, 0.012, 2, spec.w * 0.3), mats.pad);
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
  thumbBase.position.set(0.035 * s, -0.008, 0.032);
  root.add(thumbBase);
  const thumbJoints = [thumbBase];
  {
    let parent = thumbBase;
    THUMB.lens.forEach((len, i) => {
      const seg = new THREE.Mesh(new RoundedBoxGeometry(THUMB.w, THUMB.w * 0.95, len, 2, THUMB.w * 0.34), mats.leather);
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

  const haloBase = new THREE.Color(side === 'right' ? 0xffc26b : 0x6fe3f5);
  const haloHot = new THREE.Color(0xfff3da);
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
        // Fallback input omits them and uses the aggregate curl instead.
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
