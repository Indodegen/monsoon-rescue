// The rescue boat: a small wooden boat with a lantern, steered with acceleration and drag
// so it feels like water, not a cursor. It carries a wake trail and a lantern glow radius,
// and it bounces off the dock's solid deck while the lit water beside the pier is where
// rescued sailors are handed over.

import { BOAT, DELIVER, DOCK, FIELD, POOL } from './config.js';

export function createBoat() {
  const boat = {
    x: FIELD.width * 0.3,
    y: FIELD.height * 0.55,
    vx: 0,
    vy: 0,
    heading: 0,
    invulnerable: 0,
    knock: 0,
    knockX: 0,
    knockY: 0,
    wake: [],
  };
  for (let i = 0; i < POOL.wake; i += 1) boat.wake.push({ x: 0, y: 0, life: 0 });

  function reset() {
    boat.x = FIELD.width * 0.3;
    boat.y = FIELD.height * 0.55;
    boat.vx = 0;
    boat.vy = 0;
    boat.heading = 0;
    boat.invulnerable = 0;
    boat.knock = 0;
    for (const drop of boat.wake) drop.life = 0;
  }

  /** Where the boat's lantern light reaches, from the lantern upgrade level. */
  function lightRadius(lanternLevel) {
    return 95 + 40 * lanternLevel;
  }

  /**
   * One fixed step. `steer` is a unit-ish {x, y} (keyboard or mouse); `speed` is this front's
   * top speed. Returns the boat's speed as a fraction of its top speed (for the engine hum).
   */
  function step(dt, steer, speed) {
    const len = Math.hypot(steer.x, steer.y);
    if (boat.knock > 0) {
      boat.knock = Math.max(0, boat.knock - dt);
      boat.vx = boat.knockX * (boat.knock / BOAT.knockback);
      boat.vy = boat.knockY * (boat.knock / BOAT.knockback);
    } else if (len > 0.01) {
      const nx = steer.x / len;
      const ny = steer.y / len;
      boat.vx += nx * BOAT.accel * dt;
      boat.vy += ny * BOAT.accel * dt;
    }
    // Water drag: the boat glides, then settles.
    const drag = Math.max(0, 1 - BOAT.drag * dt);
    boat.vx *= drag;
    boat.vy *= drag;
    const v = Math.hypot(boat.vx, boat.vy);
    if (v > speed) {
      boat.vx = (boat.vx / v) * speed;
      boat.vy = (boat.vy / v) * speed;
    }
    boat.x += boat.vx * dt;
    boat.y += boat.vy * dt;
    // The dock's deck is solid: slide along it, never through it.
    if (boat.x + BOAT.radius > DOCK.x0 && boat.x - BOAT.radius < DOCK.x1 && boat.y + BOAT.radius > DOCK.y0 && boat.y - BOAT.radius < DOCK.y1) {
      if (boat.y < DOCK.y1) boat.y = DOCK.y1 + BOAT.radius;
      if (boat.vy < 0) boat.vy = 0;
    }
    boat.x = Math.min(FIELD.width - BOAT.radius, Math.max(BOAT.radius, boat.x));
    boat.y = Math.min(FIELD.height - BOAT.radius, Math.max(BOAT.radius, boat.y));
    if (v > 30) boat.heading = Math.atan2(boat.vy, boat.vx);
    if (boat.invulnerable > 0) boat.invulnerable = Math.max(0, boat.invulnerable - dt);
    // Wake: a fading trail of foam where the stern has been.
    if (v > 60) {
      let oldest = boat.wake[0];
      for (const drop of boat.wake) if (drop.life < oldest.life) oldest = drop;
      oldest.x = boat.x - Math.cos(boat.heading) * BOAT.radius;
      oldest.y = boat.y - Math.sin(boat.heading) * BOAT.radius;
      oldest.life = 1;
    }
    for (const drop of boat.wake) drop.life = Math.max(0, drop.life - dt * 1.4);
    return Math.min(1, Math.hypot(boat.vx, boat.vy) / speed);
  }

  /** True when the boat is in the lit delivery water beside the pier. */
  function inDeliverZone() {
    return boat.x + BOAT.radius > DELIVER.x0 && boat.x - BOAT.radius < DELIVER.x1 && boat.y + BOAT.radius > DELIVER.y0 && boat.y - BOAT.radius < DELIVER.y1;
  }

  /** A debris hit: a shove away from the impact point and a short invulnerability. */
  function knockback(fromX, fromY) {
    const dx = boat.x - fromX;
    const dy = boat.y - fromY;
    const len = Math.hypot(dx, dy) || 1;
    boat.knockX = (dx / len) * BOAT.knockSpeed;
    boat.knockY = (dy / len) * BOAT.knockSpeed;
    boat.knock = BOAT.knockback;
    boat.invulnerable = BOAT.invulnerable;
  }

  return { boat, reset, step, inDeliverZone, knockback, lightRadius };
}
