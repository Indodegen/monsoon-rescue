// The stranded sailors: people in the water, clinging to a life ring and waving for help.
// They drift slowly left with the current and wrap around on the right, so the sea always
// holds someone to rescue while the front still needs them.

import { FIELD, POOL, SAILOR } from './config.js';

export function createSailors(random) {
  const sailors = [];
  for (let i = 0; i < POOL.sailors; i += 1) {
    sailors.push({ active: false, x: 0, y: 0, phase: 0, rescued: false });
  }

  function reset() {
    for (const s of sailors) {
      s.active = false;
      s.rescued = false;
    }
  }

  function spawn(boatX, boatY) {
    let s = null;
    for (const item of sailors) {
      if (!item.active) {
        s = item;
        break;
      }
    }
    if (s === null) return;
    s.active = true;
    s.rescued = false;
    s.phase = random() * Math.PI * 2;
    // Clear of the dock's corner and not on top of the boat.
    for (let tries = 0; tries < 12; tries += 1) {
      s.x = 80 + random() * (FIELD.width - 260);
      s.y = 130 + random() * (FIELD.height - 170);
      const dx = s.x - boatX;
      const dy = s.y - boatY;
      if (dx * dx + dy * dy > 120 * 120) break;
    }
  }

  /** Keep the sea stocked: `wanted` sailors afloat while the front still needs rescues. */
  function maintain(wanted, boatX, boatY) {
    let active = 0;
    for (const s of sailors) if (s.active) active += 1;
    while (active < wanted) {
      spawn(boatX, boatY);
      active += 1;
    }
  }

  function step(dt) {
    for (const s of sailors) {
      if (!s.active) continue;
      s.x -= SAILOR.drift * dt;
      s.phase += dt * 2.2;
      if (s.x < -30) s.x = FIELD.width + 20;
    }
  }

  return { sailors, reset, spawn, maintain, step };
}
