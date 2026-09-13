// PipeSense interactive props: P-trap, slip nuts, wrench, valve lever, faucet
// handle. Mesh geometry mirrors the deterministic contract in sim.js
// (GEOM.trapLocal etc.) so what the learner sees is what the model scores.
//
// FIXTURES: shared anchor constants. world.js imports these to place the
// static bodies (tailpiece, wall arm, valve body, faucet body) around them.

import * as THREE from 'three';
import { GEOM } from './sim.js';

export const FIXTURES = {
  tailAxisX: GEOM.tail.x,
  tailAxisZ: GEOM.tail.z,
  tailEndY: GEOM.tail.endY,
  wallAxisY: GEOM.wall.y,
  wallEndZ: GEOM.wall.endZ,
  valvePivot: { x: -0.42, y: 0.84, z: 0.125 },
  faucetPivot: { x: 0.33, y: 1.176, z: 0.135 },
  faucetKnob: { ...GEOM.faucet.pos },
  wrenchRest: { x: -0.14, y: 0.412, z: 0.50 },
  deckY: 1.155,
  shelfY: GEOM.shelf.y,
};

const DEG = Math.PI / 180;

const mats = {
  pvc: new THREE.MeshStandardMaterial({ color: 0xe7e9ec, roughness: 0.34, metalness: 0.02 }),
  pvcShade: new THREE.MeshStandardMaterial({ color: 0xcfd3d8, roughness: 0.4, metalness: 0.02 }),
  nut: new THREE.MeshStandardMaterial({ color: 0x2b333d, roughness: 0.52, metalness: 0.12 }),
  washer: new THREE.MeshStandardMaterial({ color: 0x1c2126, roughness: 0.85, metalness: 0.05 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x767e88, roughness: 0.33, metalness: 0.92 }),
  steelDark: new THREE.MeshStandardMaterial({ color: 0x3f444c, roughness: 0.45, metalness: 0.85 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xd6dbe1, roughness: 0.2, metalness: 1 }),
  redCap: new THREE.MeshStandardMaterial({ color: 0xd6455a, roughness: 0.4, metalness: 0.1, emissive: 0x651222, emissiveIntensity: 0.5 }),
};

function shadowed(mesh, cast = true, receive = true) {
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}

function knurledNut(radius, height, ridges = 14) {
  const group = new THREE.Group();
  const body = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 24), mats.nut));
  group.add(body);
  const ridgeGeo = new THREE.BoxGeometry(0.005, height * 0.9, 0.008);
  for (let i = 0; i < ridges; i++) {
    const a = (i / ridges) * Math.PI * 2;
    const ridge = new THREE.Mesh(ridgeGeo, mats.nut);
    ridge.position.set(Math.cos(a) * radius, 0, Math.sin(a) * radius);
    ridge.rotation.y = -a;
    group.add(ridge);
  }
  const lip = shadowed(new THREE.Mesh(new THREE.TorusGeometry(radius * 0.92, 0.0035, 8, 24), mats.nut));
  lip.rotation.x = Math.PI / 2;
  lip.position.y = height / 2;
  group.add(lip);
  const washer = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.9, radius * 0.74, 0.007, 20), mats.washer);
  washer.position.y = -height / 2 - 0.002;
  group.add(washer);
  return group;
}

// Trap body curve in trap-local space: tail socket top -> inlet leg -> U bend
// -> outlet leg -> elbow -> wall socket opening.
export function trapCurvePoints() {
  return [
    [0, 0.505, 0], [0, 0.47, 0], [0, 0.30, 0], [0, 0.19, 0],
    [0, 0.125, 0], [0, 0.062, -0.028], [0, 0.049, -0.06], [0, 0.062, -0.092],
    [0, 0.125, -0.12], [0, 0.19, -0.12], [0, 0.225, -0.135], [0, 0.235, -0.16], [0, 0.235, -0.175],
  ];
}

function trapBody() {
  const group = new THREE.Group();
  const points = trapCurvePoints().map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.4);
  const tube = shadowed(new THREE.Mesh(new THREE.TubeGeometry(curve, 96, 0.0215, 22, false), mats.pvc));
  group.add(tube);

  const tailSocket = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.0275, 0.0275, 0.068, 26), mats.pvcShade));
  tailSocket.position.set(0, 0.505 - 0.034, 0);
  group.add(tailSocket);
  const tailShoulder = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.0275, 0.0042, 8, 26), mats.pvcShade));
  tailShoulder.rotation.x = Math.PI / 2;
  tailShoulder.position.set(0, 0.44, 0);
  group.add(tailShoulder);

  const wallSocket = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.0275, 0.0275, 0.075, 26), mats.pvcShade));
  wallSocket.rotation.x = Math.PI / 2;
  wallSocket.position.set(0, 0.235, -0.135);
  group.add(wallSocket);
  const wallShoulder = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.0275, 0.0042, 8, 26), mats.pvcShade));
  wallShoulder.position.set(0, 0.235, -0.1);
  group.add(wallShoulder);

  const collarA = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.0225, 0.003, 8, 22), mats.pvcShade));
  collarA.rotation.x = Math.PI / 2;
  collarA.position.set(0, 0.30, 0);
  group.add(collarA);
  const collarB = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.0225, 0.003, 8, 22), mats.pvcShade));
  collarB.rotation.x = Math.PI / 2;
  collarB.position.set(0, 0.30, -0.12);
  group.add(collarB);
  return group;
}

function wrenchBody() {
  const group = new THREE.Group();
  const handle = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.017, 0.012, 0.20), mats.steelDark));
  handle.position.set(0, 0, 0.10);
  group.add(handle);
  const neck = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.013, 0.05), mats.steelDark));
  neck.position.set(0, 0.001, 0.20);
  group.add(neck);
  const head = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.024, 0.042), mats.steel));
  head.position.set(0, 0.004, 0.224);
  group.add(head);
  const jawFixed = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.024, 0.034), mats.steel));
  jawFixed.position.set(-0.0135, 0.004, 0.258);
  group.add(jawFixed);
  const jawSlide = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.02, 0.03), mats.steel));
  jawSlide.position.set(0.0135, 0.004, 0.252);
  group.add(jawSlide);
  const worm = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.0085, 0.026, 14), mats.steelDark));
  worm.rotation.z = Math.PI / 2;
  worm.position.set(0, -0.009, 0.235);
  group.add(worm);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0115, 0.0022, 8, 18), mats.washer);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0, 0.0, 0.006);
  group.add(ring);
  for (let i = 0; i < 3; i++) {
    const groove = new THREE.Mesh(new THREE.BoxGeometry(0.0182, 0.0125, 0.0022), mats.washer);
    groove.position.set(0, 0, 0.036 + i * 0.008);
    group.add(groove);
  }
  return group;
}

function leverBody() {
  const group = new THREE.Group();
  const arm = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.015, 0.012), mats.chrome));
  arm.position.set(0.0375, 0, 0);
  group.add(arm);
  const knob = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.0105, 16, 12), mats.redCap), true, false);
  knob.position.set(0.076, 0, 0);
  group.add(knob);
  const collar = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.016, 14), mats.steelDark));
  collar.rotation.z = Math.PI / 2;
  group.add(collar);
  return group;
}

function faucetHandleBody() {
  const group = new THREE.Group();
  const stem = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.02, 14), mats.steelDark));
  stem.position.set(0, 0.01, 0);
  group.add(stem);
  const arm = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.017, 0.012, 0.062), mats.chrome));
  arm.position.set(0, 0.016, 0.036);
  group.add(arm);
  const knob = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.0125, 16, 12), mats.chrome), true, false);
  knob.position.set(0, 0.016, 0.069);
  group.add(knob);
  const grip = new THREE.Mesh(new THREE.TorusGeometry(0.0105, 0.0024, 8, 18), mats.washer);
  grip.rotation.y = Math.PI / 2;
  grip.position.set(0, 0.016, 0.069);
  group.add(grip);
  return group;
}

export function createProps(scene) {
  const root = new THREE.Group();
  root.name = 'props';
  scene.add(root);

  const trap = trapBody();
  trap.position.set(GEOM.trapRest.x, GEOM.trapRest.y, GEOM.trapRest.z);
  root.add(trap);

  const nutTail = knurledNut(0.031, 0.026);
  nutTail.position.set(GEOM.tail.x, 0.968, GEOM.tail.z);
  root.add(nutTail);

  const nutWall = knurledNut(0.031, 0.026);
  nutWall.rotation.x = Math.PI / 2;
  nutWall.position.set(0, GEOM.wall.y, 0.04);
  root.add(nutWall);

  const wrench = wrenchBody();
  wrench.position.set(FIXTURES.wrenchRest.x, FIXTURES.wrenchRest.y, FIXTURES.wrenchRest.z);
  wrench.rotation.y = Math.PI / 2;
  root.add(wrench);

  const valveLever = leverBody();
  valveLever.position.set(FIXTURES.valvePivot.x, FIXTURES.valvePivot.y, FIXTURES.valvePivot.z);
  root.add(valveLever);

  const faucetHandle = faucetHandleBody();
  faucetHandle.position.set(FIXTURES.faucetPivot.x, FIXTURES.faucetPivot.y, FIXTURES.faucetPivot.z);
  faucetHandle.rotation.x = -0.18;
  faucetHandle.rotation.y = 0.12;
  root.add(faucetHandle);

  const state = {
    wrenchHome: { pos: new THREE.Vector3(FIXTURES.wrenchRest.x, FIXTURES.wrenchRest.y, FIXTURES.wrenchRest.z), rot: new THREE.Euler(0, Math.PI / 2, 0) },
  };

  const vTmp = new THREE.Vector3();

  function lerp(a, b, t) { return a + (b - a) * t; }

  function update(sim, dt, gloves) {
    root.updateMatrixWorld(true);
    const t = sim.objects.trap;
    if (t.mode === 'seated') {
      trap.position.set(GEOM.seatPose.x, GEOM.seatPose.y, GEOM.seatPose.z);
    } else {
      const k = 1 - Math.exp(-14 * dt);
      trap.position.x += (t.pos.x - trap.position.x) * k;
      trap.position.y += (t.pos.y - trap.position.y) * k;
      trap.position.z += (t.pos.z - trap.position.z) * k;
    }

    const nt = sim.joints.tail.tight;
    const nw = sim.joints.wall.tight;
    nutTail.position.y = lerp(0.968, 0.940, nt);
    nutWall.position.z = lerp(0.04, 0.155, nw);

    if (sim.objects.wrench.mode === 'held' && gloves) {
      const holder = gloves[sim.objects.wrench.heldBy];
      if (holder && wrench.parent !== holder.gripAnchor) {
        holder.gripAnchor.add(wrench);
        // Jaw forward of the fist, handle crossing the palm below the pad.
        wrench.position.set(0, -0.013, -0.10);
        wrench.rotation.set(0, 0, 0);
      }
    } else if (wrench.parent !== root) {
      root.add(wrench);
      wrench.position.set(state.wrenchHome.pos.x, state.wrenchHome.pos.y, state.wrenchHome.pos.z);
      wrench.rotation.copy(state.wrenchHome.rot);
    }

    const valveRad = sim.valve.angle * DEG;
    valveLever.rotation.z = valveRad;
    mats.redCap.emissiveIntensity = sim.valve.closed ? 0.25 : 0.75;

    faucetHandle.rotation.x = -0.18 - Math.max(0, sim.faucet.angle) * DEG * 0.9;

    return {
      trapWorld: trap.position,
      nutTailY: nutTail.position.y,
      nutWallZ: nutWall.position.z,
      valveKnob: valveLever.localToWorld(vTmp.set(0.076, 0, 0)).clone(),
      faucetKnob: faucetHandle.localToWorld(vTmp.set(0, 0.016, 0.069)).clone(),
      wrenchJaw: wrench.localToWorld(vTmp.set(0, 0.004, 0.262)).clone(),
      wrench,
      trap,
    };
  }

  return { root, trap, wrench, valveLever, faucetHandle, update };
}
