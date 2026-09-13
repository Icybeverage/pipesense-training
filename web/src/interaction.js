// PipeSense interaction layer: turns smoothed hand poses into simulated
// actions. Every input source (camera for learners; the scripted QA channel
// in automated sessions) reaches the deterministic core through this one
// path, so a state change always requires a gloved hand holding the right
// thing at the right target.

import * as THREE from 'three';
import { GEOM, grab, release, moveCarried, rotate } from './sim.js';

const REACH = {
  trap: 0.19,
  wrench: 0.16,
  valve_lever: 0.105,
  faucet_handle: 0.115,
  nut: 0.095,
};

const CARRY_CLAMP = { minZ: 0.16, maxZ: 0.62 };

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export function createInteraction({ sim, input, props, onEvent }) {
  const held = { left: null, right: null };
  const wasPinched = { left: false, right: false };
  const offset = { left: new THREE.Vector3(), right: new THREE.Vector3() };
  const pinchWorld = { left: new THREE.Vector3(), right: new THREE.Vector3() };
  const tmp = new THREE.Vector3();

  const lastKnown = {
    'valve_lever': new THREE.Vector3(),
    'faucet_handle': new THREE.Vector3(),
    'nut_tail': new THREE.Vector3(),
    'nut_wall': new THREE.Vector3(),
    'wrench': new THREE.Vector3(),
  };

  function updateLastKnown(propsOut) {
    lastKnown.valve_lever.copy(propsOut.valveKnob);
    lastKnown.faucet_handle.copy(propsOut.faucetKnob);
    lastKnown.nut_tail.set(GEOM.tail.x, propsOut.nutTailY, GEOM.tail.z);
    lastKnown.nut_wall.set(0, GEOM.wall.y, propsOut.nutWallZ);
    propsOut.wrench.getWorldPosition(lastKnown.wrench);
  }

  function candidates() {
    const list = [];
    if (sim.objects.trap.mode === 'shelf') {
      list.push({ id: 'trap', kind: 'carry', radius: REACH.trap });
    }
    if (sim.objects.wrench.mode === 'shelf') {
      list.push({ id: 'wrench', kind: 'carry', radius: REACH.wrench });
    }
    if (!sim.valve.heldBy) list.push({ id: 'valve_lever', kind: 'operate', radius: REACH.valve_lever });
    if (!sim.faucet.heldBy) list.push({ id: 'faucet_handle', kind: 'operate', radius: REACH.faucet_handle });
    return list;
  }

  function candidatePos(id, propsOut) {
    if (id === 'trap') return propsOut.trapWorld;
    return lastKnown[id];
  }

  function nearest(side, ids, propsOut) {
    const p = pinchWorld[side];
    let best = null;
    let bestDist = Infinity;
    for (const id of ids) {
      const pos = candidatePos(id, propsOut);
      const d = p.distanceTo(pos);
      if (d < bestDist) { bestDist = d; best = id; }
    }
    return { id: best, dist: bestDist };
  }

  function wrenchHeldBy(side) {
    return sim.objects.wrench.mode === 'held' && sim.objects.wrench.heldBy === side;
  }

  function emit(events, side) {
    for (const event of events) {
      if (onEvent) onEvent({ ...event, side });
    }
  }

  function update(dt, gloves, propsOut) {
    updateLastKnown(propsOut);

    for (const side of ['left', 'right']) {
      const hand = input.hands[side];
      const glove = gloves[side];
      glove.pinchAnchor.getWorldPosition(pinchWorld[side]);
      const pinch = hand.pinchClosed;
      const rot = input.consumeRot(side);
      const heldEntry = held[side];
      let highlight = 0;
      let contact = 0;

      if (heldEntry && heldEntry.id === 'wrench') {
        // A carried wrench stays in hand while pinched; the nuts are the
        // targets it acts on. Releasing the pinch returns it to the shelf.
        if (!pinch || sim.objects.wrench.heldBy !== side) {
          emit(release(sim, 'wrench', side), side);
          held[side] = null;
        } else {
          contact = 1;
          if (rot !== 0) {
            for (const nut of ['nut_tail', 'nut_wall']) {
              const d = pinchWorld[side].distanceTo(lastKnown[nut]);
              if (d <= REACH.nut) {
                highlight = Math.max(highlight, 1 - d / (REACH.nut * 1.6));
                contact = Math.max(contact, 1 - d / REACH.nut);
                emit(rotate(sim, nut, rot, side), side);
                break;
              }
            }
          }
        }
      } else if (!heldEntry) {
        const list = candidates();
        let nearest = null;
        const p = pinchWorld[side];
        for (const cand of list) {
          const d = p.distanceTo(candidatePos(cand.id, propsOut));
          if (!nearest || d < nearest.dist) nearest = { id: cand.id, dist: d, radius: cand.radius };
        }
        const inReach = nearest && nearest.dist <= nearest.radius;

        if (inReach) {
          highlight = Math.max(0, 1 - nearest.dist / (nearest.radius * 1.6));
          // Fingertip contact fades with distance; grabbing confirms it.
          contact = clamp(1 - nearest.dist / nearest.radius, 0, 1);
        }

        if (pinch && !wasPinched[side] && inReach) {
          const id = nearest.id;
          contact = 1;
          emit(grab(sim, id, side), side);
          if (sim.objects.trap.heldBy === side || sim.objects.wrench.heldBy === side
            || sim.valve.heldBy === side || sim.faucet.heldBy === side) {
            held[side] = { id, kind: id === 'trap' || id === 'wrench' ? 'carry' : 'operate' };
            if (id === 'trap') {
              offset[side].set(
                sim.objects.trap.pos.x - pinchWorld[side].x,
                sim.objects.trap.pos.y - pinchWorld[side].y,
                sim.objects.trap.pos.z - pinchWorld[side].z,
              );
            }
          }
        }
      } else if (heldEntry.kind === 'carry') {
        if (!pinch || sim.objects[heldEntry.id].heldBy !== side) {
          emit(release(sim, heldEntry.id, side), side);
          held[side] = null;
        } else if (heldEntry.id === 'trap') {
          contact = 1;
          const target = {
            x: clamp(pinchWorld[side].x + offset[side].x, GEOM.workspace.minX, GEOM.workspace.maxX),
            y: clamp(pinchWorld[side].y + offset[side].y, GEOM.workspace.minY, GEOM.workspace.maxY),
            z: clamp(pinchWorld[side].z + offset[side].z, CARRY_CLAMP.minZ, CARRY_CLAMP.maxZ),
          };
          moveCarried(sim, 'trap', target);
        }
      } else if (heldEntry.kind === 'operate') {
        if (!pinch || sim[heldEntry.id === 'valve_lever' ? 'valve' : 'faucet'].heldBy !== side) {
          emit(release(sim, heldEntry.id, side), side);
          held[side] = null;
        } else {
          contact = 1;
          if (rot !== 0) {
            emit(rotate(sim, heldEntry.id, rot, side), side);
          }
        }
      }

      // Wrench in hand: keep a soft highlight so the jaw reads as "ready".
      if (wrenchHeldBy(side)) highlight = Math.max(highlight, 0.25);

      input.setHighlight(side, highlight);
      input.setContact(side, contact);
      wasPinched[side] = pinch;
    }
  }

  function dropAll() {
    for (const side of ['left', 'right']) {
      const entry = held[side];
      if (!entry) continue;
      emit(release(sim, entry.id, side), side);
      held[side] = null;
    }
  }

  return { update, dropAll, held, pinchWorld };
}
