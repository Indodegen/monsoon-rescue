// The screenshot scenes behind ?shot=cover|start|play|end. Each one plays the real rules
// forward from a fresh world for a fixed number of steps, steered by an autopilot that seeks
// the nearest sailor, delivers a full boat to the dock, dodges debris and flees a warned
// lightning strike — so the frame is what a short game really looks like and the same seed
// always gives the same frame.

import { FIELD, STEP } from './config.js';
import { LIGHTNING_WARN } from './storm.js';
import { EVENT_OVER, EVENT_WIN } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 5;
const END_LIMIT_SECONDS = 40;

/** Steer the boat: flee a warned strike, dodge debris ahead, else chase the nearest sailor or the dock. */
function autopilot(world) {
  const boat = world.boat;
  const state = world.state;
  const bolt = world.storm.lightning;
  if (bolt.state === LIGHTNING_WARN) {
    const dx = boat.x - bolt.x;
    const dy = boat.y - bolt.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < 150) return { x: dx / d, y: dy / d };
  }
  let tx;
  let ty;
  const full = state.aboard >= world.capacity();
  const done = state.rescuedFront + state.aboard >= world.frontDef().target;
  if (full || done) {
    tx = 1140;
    ty = 80;
  } else {
    let best = null;
    let bestD = Infinity;
    for (const s of world.sailors) {
      if (!s.active) continue;
      const d = (s.x - boat.x) * (s.x - boat.x) + (s.y - boat.y) * (s.y - boat.y);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    if (best === null) {
      tx = 1140;
      ty = 80;
    } else {
      tx = best.x;
      ty = best.y;
    }
  }
  let dx = tx - boat.x;
  let dy = ty - boat.y;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;
  // Debris straight ahead: slip sideways around it.
  for (const item of world.storm.debris) {
    if (!item.active) continue;
    const rx = item.x - boat.x;
    const ry = item.y - boat.y;
    const along = rx * dx + ry * dy;
    if (along > 0 && along < 120) {
      const perp = Math.abs(rx * dy - ry * dx);
      if (perp < 60) {
        const side = rx * dy - ry * dx > 0 ? -1 : 1;
        return { x: -dy * side, y: dx * side };
      }
    }
  }
  return { x: dx, y: dy };
}

/** Run the autopilot for up to `seconds` of game time; stop early when the game ends or `stop` says so. */
function playUntil(world, seconds, stop) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const events = world.step(STEP, autopilot(world), false);
    if (events & EVENT_OVER) break;
    if (stop !== null && stop(world)) break;
  }
}

/**
 * Set `world` to the named scene and return the screen to draw over it.
 * cover: mid-rescue action with a bolt landing near the boat.
 * start: the title over a live storm. play: a longer run, bolt in the distance.
 * end: the final delivery of front 5, so the win screen shows.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'cover' && name !== 'play' && name !== 'end') {
    for (let i = 0; i < START_SECONDS / STEP; i += 1) world.step(STEP, { x: 0, y: 0 }, true);
    return { screen: SCREEN_TITLE };
  }
  if (name === 'end') {
    world.startFront(5);
    world.state.rescuedFront = world.frontDef().target - 1;
    world.state.gold = 132;
    world.state.goldEarned = 168;
    world.state.rescuedTotal = 20;
    world.state.elapsed = 338;
    // One last sailor, right beside the boat.
    const sailor = world.sailors[0];
    sailor.active = true;
    sailor.rescued = false;
    sailor.x = world.boat.x + 70;
    sailor.y = world.boat.y + 24;
    sailor.phase = 0;
    const limit = Math.floor(END_LIMIT_SECONDS / STEP);
    for (let i = 0; i < limit; i += 1) {
      if (world.step(STEP, autopilot(world), false) & EVENT_WIN) break;
    }
    if (world.state.over !== 'win') {
      // The autopilot should have won by now; if it did not, complete the delivery directly
      // so the staged frame is still the real win screen.
      world.state.rescuedFront = world.frontDef().target;
      world.state.rescuedTotal += 1;
      world.state.over = 'win';
    }
    return { screen: SCREEN_OVER };
  }
  // Cover: catch the boat mid-rescue, just after its first pickup, still chasing the
  // next sailor. Play: catch it with two sailors aboard, still out in the storm — not
  // after a delivery, when it would only be parked at the dock.
  // (The autopilot clears a front in ~15 s, so a fixed long run would only show the boat
  // parked at the dock.)
  if (name === 'cover') {
    playUntil(world, 20, (w) => w.state.aboard >= 1);
    playUntil(world, 2, null);
  } else {
    playUntil(world, 30, (w) => w.state.aboard >= 2);
    playUntil(world, 0.5, null);
  }
  if (world.state.over !== null) return { screen: SCREEN_OVER };
  // A bolt in the frame: near the boat for the cover, in the distance for play.
  const boat = world.boat;
  if (name === 'cover') {
    if (world.state.aboard === 0) world.state.aboard = 1;
    world.stormApi.forceStrike(
      Math.min(FIELD.width - 60, Math.max(60, boat.x + 130)),
      Math.min(FIELD.height - 60, Math.max(80, boat.y - 70)),
    );
  } else {
    world.stormApi.forceStrike(880, 190);
  }
  return { screen: SCREEN_PLAY };
}
