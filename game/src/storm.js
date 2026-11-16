// The monsoon itself: slanted rain, debris the current drags across the sea, and lightning
// that warns with a pulsing ring before the bolt lands. Everything here is driven by the
// world's seeded random, so the same seed plays the same storm.

import { DEBRIS, FIELD, LIGHTNING, POOL } from './config.js';

export const LIGHTNING_IDLE = 0;
export const LIGHTNING_WARN = 1;
export const LIGHTNING_STRIKE = 2;

export function createStorm(random) {
  const rain = [];
  for (let i = 0; i < POOL.rain; i += 1) {
    rain.push({ x: 0, y: 0, len: 0, speed: 0, active: false });
  }
  const debris = [];
  for (let i = 0; i < POOL.debris; i += 1) {
    debris.push({ active: false, kind: 0, x: 0, y: 0, vx: 0, vy: 0, size: 0, rot: 0, vr: 0 });
  }
  const lightning = {
    state: LIGHTNING_IDLE,
    x: 0,
    y: 0,
    timer: 0,
    bolt: [],
    flash: 0,
  };
  const state = {
    rain,
    debris,
    lightning,
    debrisTimer: 1,
    lightningTimer: 4,
    elapsed: 0,
  };

  function reset() {
    for (const drop of rain) drop.active = false;
    for (const item of debris) item.active = false;
    lightning.state = LIGHTNING_IDLE;
    lightning.timer = 0;
    lightning.bolt = [];
    lightning.flash = 0;
    state.debrisTimer = 1;
    state.lightningTimer = 4;
    state.elapsed = 0;
  }

  function spawnRainDrop(drop) {
    drop.active = true;
    drop.x = random() * (FIELD.width + 120) - 60;
    drop.y = -20 - random() * 60;
    drop.len = 10 + random() * 14;
    drop.speed = 420 + random() * 260;
  }

  function spawnDebris(front) {
    let item = null;
    for (const d of debris) {
      if (!d.active) {
        item = d;
        break;
      }
    }
    if (item === null) return;
    item.active = true;
    item.kind = random() < 0.55 ? 0 : 1;
    item.size = DEBRIS.minSize + random() * (DEBRIS.maxSize - DEBRIS.minSize);
    item.x = FIELD.width + item.size + random() * 120;
    // Debris stays in the open sea, clear of the dock's corner.
    item.y = 130 + random() * (FIELD.height - 160);
    item.vx = -(front.debrisSpeed + random() * 30);
    item.vy = (random() - 0.5) * 24;
    item.rot = random() * Math.PI;
    item.vr = (random() - 0.5) * 1.2;
  }

  /** How many debris the front wants afloat at once. */
  function debrisCount() {
    let count = 0;
    for (const d of debris) if (d.active) count += 1;
    return count;
  }

  /** Pick where the next bolt lands: often near the boat, so the storm feels personal. */
  function pickStrike(boatX, boatY) {
    if (random() < 0.45) {
      return {
        x: Math.min(FIELD.width - 40, Math.max(40, boatX + (random() - 0.5) * 420)),
        y: Math.min(FIELD.height - 40, Math.max(70, boatY + (random() - 0.5) * 300)),
      };
    }
    return { x: 60 + random() * (FIELD.width - 120), y: 70 + random() * (FIELD.height - 110) };
  }

  /** Build the bolt's jagged polyline from the cloud to the strike point (fixed at strike time). */
  function buildBolt(x, y) {
    const points = [{ x, y: -10 }];
    const steps = 7;
    let px = x;
    for (let i = 1; i < steps; i += 1) {
      px += (random() - 0.5) * 46;
      points.push({ x: px, y: (y / steps) * i });
    }
    points.push({ x, y });
    return points;
  }

  /**
   * One fixed step of the weather. `front` is this front's tuning; the boat's position steers
   * where lightning aims. Returns a bit flag when a bolt lands (the world checks the damage).
   */
  function step(dt, front, boatX, boatY) {
    state.elapsed += dt;
    let struck = false;

    // Rain: keep the front's share of the pool falling, slanted by the wind.
    let wanted = front.rain;
    let active = 0;
    for (const drop of rain) if (drop.active) active += 1;
    for (const drop of rain) {
      if (!drop.active && active < wanted) {
        spawnRainDrop(drop);
        active += 1;
      }
      if (!drop.active) continue;
      drop.y += drop.speed * dt;
      drop.x -= drop.speed * 0.32 * dt;
      if (drop.y > FIELD.height + 20 || drop.x < -80) {
        if (active > wanted) {
          drop.active = false;
          active -= 1;
        } else {
          spawnRainDrop(drop);
        }
      }
    }

    // Debris: the current drags it in from the right; it leaves on the left.
    state.debrisTimer -= dt;
    if (state.debrisTimer <= 0 && debrisCount() < front.debris) {
      spawnDebris(front);
      state.debrisTimer += 0.5 + random() * 0.5;
    }
    for (const item of debris) {
      if (!item.active) continue;
      item.x += item.vx * dt;
      item.y += item.vy * dt;
      item.rot += item.vr * dt;
      if (item.y < 60) item.y = 60;
      if (item.y > FIELD.height - 20) item.y = FIELD.height - 20;
      if (item.x < -item.size - 20) item.active = false;
    }

    // Lightning: a warning ring, then the bolt, then the sky goes dark again.
    if (lightning.flash > 0) lightning.flash = Math.max(0, lightning.flash - dt * 3);
    if (lightning.state === LIGHTNING_IDLE) {
      state.lightningTimer -= dt;
      if (state.lightningTimer <= 0) {
        const point = pickStrike(boatX, boatY);
        lightning.x = point.x;
        lightning.y = point.y;
        lightning.state = LIGHTNING_WARN;
        lightning.timer = LIGHTNING.telegraph;
      }
    } else if (lightning.state === LIGHTNING_WARN) {
      lightning.timer -= dt;
      if (lightning.timer <= 0) {
        lightning.state = LIGHTNING_STRIKE;
        lightning.timer = LIGHTNING.strike;
        lightning.bolt = buildBolt(lightning.x, lightning.y);
        lightning.flash = 1;
        struck = true;
      }
    } else {
      lightning.timer -= dt;
      if (lightning.timer <= 0) {
        lightning.state = LIGHTNING_IDLE;
        lightning.bolt = [];
        state.lightningTimer = front.lightningEvery * (0.75 + random() * 0.5);
      }
    }
    return struck;
  }

  /** Stage a bolt at a chosen point right now (used by the screenshot staging only). */
  function forceStrike(x, y) {
    lightning.x = x;
    lightning.y = y;
    lightning.state = LIGHTNING_STRIKE;
    lightning.timer = LIGHTNING.strike;
    lightning.bolt = buildBolt(x, y);
    lightning.flash = 1;
  }

  return { state, reset, step, forceStrike, debrisCount };
}
