// PipeSense workshop scene: a dimensional dark under-sink training rig against
// a workshop wall. Camera is first person, just in front of the rig, looking
// down at the trap zone with the sink above it.
//
// Static geometry only. Interactive parts live in props.js; water, gas and
// leaks live in fx.js.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GEOM } from './sim.js';
import { FIXTURES } from './props.js';

export const CAMERA_HOME = {
  pos: new THREE.Vector3(0, 1.04, 1.30),
  target: new THREE.Vector3(0, 0.72, 0.12),
};

function noiseTexture(size, base, spread, seed = 7) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  let a = seed >>> 0;
  const rnd = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const img = ctx.getImageData(0, 0, size, size);
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = (rnd() - 0.5) * spread;
    data[i] = Math.max(0, Math.min(255, data[i] + n));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + n));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createWorld({ canvas }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070c);
  scene.fog = new THREE.FogExp2(0x05070c, 0.5);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.05).texture;
  scene.environmentIntensity = 0.32;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.02, 40);
  camera.position.copy(CAMERA_HOME.pos);
  camera.lookAt(CAMERA_HOME.target);

  // ---------------------------------------------------------------- lights
  const hemi = new THREE.HemisphereLight(0x33465f, 0x0a0c11, 0.55);
  scene.add(hemi);

  const key = new THREE.SpotLight(0xffd7a3, 26, 6.5, 0.62, 0.65, 1.7);
  key.position.set(0.55, 2.05, 1.05);
  key.target.position.set(0, 0.62, 0.26);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0016;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 5;
  scene.add(key, key.target);

  const fill = new THREE.DirectionalLight(0x86b7ff, 0.5);
  fill.position.set(-1.1, 1.35, 2.3);
  scene.add(fill);

  const rim = new THREE.PointLight(0x9fd4ff, 2.6, 3.2, 1.8);
  rim.position.set(-0.95, 0.5, -0.35);
  scene.add(rim);

  const lampWarm = new THREE.PointLight(0xffbe7a, 1.4, 2.4, 1.8);
  lampWarm.position.set(0.42, 1.62, 0.34);
  scene.add(lampWarm);

  // ---------------------------------------------------------------- floor
  const floorTex = noiseTexture(256, '#14161c', 26, 11);
  floorTex.repeat.set(4, 4);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 14),
    new THREE.MeshStandardMaterial({ map: floorTex, color: 0xffffff, roughness: 0.94, metalness: 0.05 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // ---------------------------------------------------------------- walls
  const wallTex = noiseTexture(256, '#171a21', 18, 23);
  wallTex.repeat.set(6, 3);
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9, metalness: 0.05 });
  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(12, 3.4), wallMat);
  backWall.position.set(0, 1.7, -0.02);
  backWall.receiveShadow = true;
  scene.add(backWall);

  const seamMat = new THREE.MeshStandardMaterial({ color: 0x0d0f14, roughness: 0.95 });
  for (let i = -5; i <= 5; i++) {
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.012, 3.4, 0.01), seamMat);
    seam.position.set(i * 0.62, 1.7, -0.008);
    scene.add(seam);
  }
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(12, 0.16, 0.03), seamMat);
  skirt.position.set(0, 0.08, -0.005);
  scene.add(skirt);

  const sideWall = new THREE.Mesh(new THREE.PlaneGeometry(6, 3.4), wallMat);
  sideWall.rotation.y = Math.PI / 2;
  sideWall.position.set(-2.6, 1.7, 1.4);
  scene.add(sideWall);

  // Workshop depth props (silhouettes, out of interaction range).
  const blockMat = new THREE.MeshStandardMaterial({ color: 0x101319, roughness: 0.9 });
  const cabinet = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.15, 0.55), blockMat);
  cabinet.position.set(-1.45, 0.575, 0.75);
  cabinet.castShadow = true;
  cabinet.receiveShadow = true;
  scene.add(cabinet);
  const coil = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.05, 12, 40), new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.7, metalness: 0.4 }));
  coil.rotation.x = Math.PI / 2;
  coil.position.set(1.5, 0.05, 0.95);
  coil.castShadow = true;
  scene.add(coil);
  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.105, 0.24, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0x232830, roughness: 0.85, side: THREE.DoubleSide }));
  bucket.position.set(0.95, 0.12, 0.35);
  bucket.castShadow = true;
  scene.add(bucket);

  // ---------------------------------------------------------------- work lamp
  const lampGroup = new THREE.Group();
  lampGroup.position.set(0.55, 2.0, 1.0);
  const shade = new THREE.Mesh(
    new THREE.ConeGeometry(0.17, 0.2, 24, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x1c2027, roughness: 0.55, metalness: 0.5, side: THREE.DoubleSide }),
  );
  shade.rotation.x = Math.PI;
  lampGroup.add(shade);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffe0b0 }));
  bulb.position.y = -0.02;
  lampGroup.add(bulb);
  const glowCone = new THREE.Mesh(
    new THREE.ConeGeometry(0.62, 1.35, 26, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.045, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  glowCone.position.y = -0.72;
  glowCone.rotation.x = Math.PI;
  lampGroup.add(glowCone);
  scene.add(lampGroup);

  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.85, 6), seamMat);
  cord.position.set(0.55, 2.4, 1.0);
  scene.add(cord);

  // ------------------------------------------------------------- sink rig
  const rigMat = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.62, metalness: 0.18 });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x2f343c, roughness: 0.5, metalness: 0.55 });
  const rig = new THREE.Group();
  scene.add(rig);

  const counter = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.045, 0.60), rigMat);
  counter.position.set(0, FIXTURES.deckY - 0.0225, 0.31);
  counter.castShadow = true;
  counter.receiveShadow = true;
  rig.add(counter);

  const splash = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.10, 0.02), rigMat);
  splash.position.set(0, FIXTURES.deckY + 0.05, 0.02);
  rig.add(splash);

  for (const sx of [-0.60, 0.60]) {
    for (const sz of [0.08, 0.54]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, FIXTURES.deckY - 0.045, 0.05), frameMat);
      leg.position.set(sx, (FIXTURES.deckY - 0.045) / 2, sz);
      leg.castShadow = true;
      leg.receiveShadow = true;
      rig.add(leg);
    }
  }
  const railTop = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.045), frameMat);
  railTop.position.set(0, 0.44, 0.54);
  rig.add(railTop);
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.035, 0.46), rigMat);
  shelf.position.set(0, FIXTURES.shelfY - 0.0175, 0.32);
  shelf.receiveShadow = true;
  shelf.castShadow = true;
  rig.add(shelf);

  const sidePanel = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.70, 0.50), rigMat);
  sidePanel.position.set(-0.61, 0.75, 0.31);
  sidePanel.castShadow = true;
  rig.add(sidePanel);

  // Sink bowl under the counter, rim on the deck.
  const bowlMat = new THREE.MeshStandardMaterial({ color: 0x8f979f, roughness: 0.32, metalness: 0.9, side: THREE.DoubleSide });
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.20, 0.16, 40, 1, true), bowlMat);
  bowl.scale.set(1.2, 1, 0.86);
  bowl.position.set(0, FIXTURES.deckY - 0.105, GEOM.tail.z);
  rig.add(bowl);
  const sinkRim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.011, 10, 44), bowlMat);
  sinkRim.rotation.x = Math.PI / 2;
  sinkRim.scale.set(0.335, 0.288, 1);
  sinkRim.position.set(0, FIXTURES.deckY - 0.002, GEOM.tail.z);
  rig.add(sinkRim);
  const strainer = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.005, 22), new THREE.MeshStandardMaterial({ color: 0x4b5158, roughness: 0.4, metalness: 0.85 }));
  strainer.position.set(0, FIXTURES.deckY - 0.185, GEOM.tail.z);
  rig.add(strainer);
  const drainShoe = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.034, 0.03, 20), new THREE.MeshStandardMaterial({ color: 0x606770, roughness: 0.35, metalness: 0.9 }));
  drainShoe.position.set(0, FIXTURES.deckY - 0.20, GEOM.tail.z);
  rig.add(drainShoe);

  // ------------------------------------------------------- static plumbing
  const chrome = new THREE.MeshStandardMaterial({ color: 0xd8dde3, roughness: 0.22, metalness: 1 });
  const agedSteel = new THREE.MeshStandardMaterial({ color: 0x878e97, roughness: 0.42, metalness: 0.9 });
  const brass = new THREE.MeshStandardMaterial({ color: 0x8c7a4e, roughness: 0.45, metalness: 0.85 });

  const tailTop = FIXTURES.deckY - 0.20;
  const tailLen = tailTop - GEOM.tail.endY;
  const tailpiece = new THREE.Mesh(new THREE.CylinderGeometry(0.0215, 0.0215, tailLen, 26), chrome);
  tailpiece.position.set(GEOM.tail.x, GEOM.tail.endY + tailLen / 2, GEOM.tail.z);
  tailpiece.castShadow = true;
  rig.add(tailpiece);
  const tailBead = new THREE.Mesh(new THREE.TorusGeometry(0.0215, 0.0035, 8, 24), chrome);
  tailBead.rotation.x = Math.PI / 2;
  tailBead.position.set(GEOM.tail.x, GEOM.tail.endY + 0.035, GEOM.tail.z);
  rig.add(tailBead);
  const tailCut = new THREE.Mesh(new THREE.CylinderGeometry(0.0185, 0.0185, 0.006, 26), new THREE.MeshStandardMaterial({ color: 0x181c22, roughness: 0.6, metalness: 0.4 }));
  tailCut.position.set(GEOM.tail.x, GEOM.tail.endY + 0.002, GEOM.tail.z);
  rig.add(tailCut);

  const armLen = GEOM.wall.endZ;
  const wallArm = new THREE.Mesh(new THREE.CylinderGeometry(0.0215, 0.0215, armLen, 26), agedSteel);
  wallArm.rotation.x = Math.PI / 2;
  wallArm.position.set(0, GEOM.wall.y, armLen / 2);
  wallArm.castShadow = true;
  rig.add(wallArm);
  const armCut = new THREE.Mesh(new THREE.CylinderGeometry(0.0185, 0.0185, 0.006, 26), new THREE.MeshStandardMaterial({ color: 0x14181d, roughness: 0.6, metalness: 0.4 }));
  armCut.rotation.x = Math.PI / 2;
  armCut.position.set(0, GEOM.wall.y, GEOM.wall.endZ - 0.002);
  rig.add(armCut);
  const escutcheon = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.043, 0.012, 24), brass);
  escutcheon.rotation.x = Math.PI / 2;
  escutcheon.position.set(0, GEOM.wall.y, 0.006);
  rig.add(escutcheon);

  // Angle stop valve on the wall, supply tube up to the faucet.
  const vp = FIXTURES.valvePivot;
  const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.055, 16), brass);
  stub.rotation.x = Math.PI / 2;
  stub.position.set(vp.x, vp.y, 0.03);
  rig.add(stub);
  const valveBody = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.026, 0.05, 6), brass);
  valveBody.rotation.x = Math.PI / 2;
  valveBody.position.set(vp.x, vp.y, 0.082);
  valveBody.castShadow = true;
  rig.add(valveBody);
  const bonnet = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.015, 0.03, 14), agedSteel);
  bonnet.rotation.x = Math.PI / 2;
  bonnet.position.set(vp.x, vp.y, 0.115);
  rig.add(bonnet);

  const tubeCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(vp.x, vp.y + 0.01, 0.135),
    new THREE.Vector3(vp.x + 0.12, vp.y + 0.12, 0.185),
    new THREE.Vector3(-0.05, FIXTURES.deckY + 0.02, 0.155),
    new THREE.Vector3(0.2, FIXTURES.deckY + 0.03, 0.145),
    new THREE.Vector3(0.30, FIXTURES.deckY + 0.035, 0.138),
  ]);
  const supplyTube = new THREE.Mesh(
    new THREE.TubeGeometry(tubeCurve, 60, 0.0085, 12, false),
    new THREE.MeshStandardMaterial({ color: 0x565c64, roughness: 0.55, metalness: 0.7 }),
  );
  supplyTube.castShadow = true;
  rig.add(supplyTube);

  // Faucet body (the handle is an interactive prop anchored at FIXTURES.faucetPivot).
  const faucetBase = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.024, 0.06, 18), chrome);
  faucetBase.position.set(0.30, FIXTURES.deckY + 0.03, 0.14);
  faucetBase.castShadow = true;
  rig.add(faucetBase);
  const faucetBall = new THREE.Mesh(new THREE.SphereGeometry(0.026, 18, 14), chrome);
  faucetBall.position.set(0.30, FIXTURES.deckY + 0.075, 0.14);
  rig.add(faucetBall);
  const spoutCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.30, FIXTURES.deckY + 0.075, 0.14),
    new THREE.Vector3(0.28, FIXTURES.deckY + 0.135, 0.18),
    new THREE.Vector3(0.20, FIXTURES.deckY + 0.125, 0.245),
    new THREE.Vector3(0.13, FIXTURES.deckY + 0.075, 0.285),
    new THREE.Vector3(0.11, FIXTURES.deckY + 0.02, 0.295),
  ]);
  const spout = new THREE.Mesh(new THREE.TubeGeometry(spoutCurve, 60, 0.0135, 14, false), chrome);
  spout.castShadow = true;
  rig.add(spout);
  const aerator = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.014, 14), agedSteel);
  aerator.position.set(0.11, FIXTURES.deckY + 0.012, 0.295);
  rig.add(aerator);

  // -------------------------------------------------------------- dust motes
  const moteCount = 220;
  const motePos = new Float32Array(moteCount * 3);
  const moteSeed = new Float32Array(moteCount);
  let a = 99;
  const rnd = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < moteCount; i++) {
    motePos[i * 3] = (rnd() - 0.5) * 3.2;
    motePos[i * 3 + 1] = 0.15 + rnd() * 1.9;
    motePos[i * 3 + 2] = -0.1 + rnd() * 1.7;
    moteSeed[i] = rnd() * Math.PI * 2;
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({
    color: 0xcfe0f5, size: 0.0045, transparent: true, opacity: 0.32,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  }));
  scene.add(motes);

  const baseMote = motePos.slice();

  function resize(width, height) {
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
  }

  function update(time) {
    // Dust drift and a subtle work-lamp flicker keep the room alive.
    const positions = moteGeo.getAttribute('position');
    for (let i = 0; i < moteCount; i++) {
      const seed = moteSeed[i];
      positions.array[i * 3] = baseMote[i * 3] + Math.sin(time * 0.13 + seed) * 0.05;
      positions.array[i * 3 + 1] = baseMote[i * 3 + 1] + Math.sin(time * 0.09 + seed * 1.7) * 0.06;
      positions.array[i * 3 + 2] = baseMote[i * 3 + 2] + Math.cos(time * 0.11 + seed) * 0.04;
    }
    positions.needsUpdate = true;
    lampWarm.intensity = 1.4 + Math.sin(time * 7.3) * 0.05 + Math.sin(time * 23.7) * 0.03;
    bulb.material.color.setHSL(0.09, 0.55, 0.78 + Math.sin(time * 9.1) * 0.02);
  }

  return { renderer, scene, camera, resize, update, key };
}
