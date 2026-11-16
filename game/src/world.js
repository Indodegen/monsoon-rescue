// The game's rules and state, with no drawing and no browser in it: the boat, the storm,
// the sailors, the fronts, the shop and the score. step() advances one fixed step and returns
// what happened as bit flags, so the caller can react (and play sounds) without the world
// knowing about screens or sound. Nothing here allocates after createWorld returns.

import { BOAT, DEBRIS, FIELD, FRONT_BONUS, FRONT_COUNT, FRONTS, LIGHTNING, SAILOR, UPGRADES } from './config.js';
import { createBoat } from './boat.js';
import { createStorm } from './storm.js';
import { createSailors } from './sailors.js';

export const EVENT_PICKUP = 1;
export const EVENT_DELIVER = 2;
export const EVENT_HIT = 4;
export const EVENT_LIGHTNING = 8;
export const EVENT_FRONT = 16;
export const EVENT_OVER = 32;
export const EVENT_WIN = 64;

function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function createWorld(random) {
  const boatApi = createBoat();
  const stormApi = createStorm(random);
  const sailorsApi = createSailors(random);
  const state = {
    front: 1,
    hp: 100,
    gold: 0,
    goldEarned: 0,
    rescuedTotal: 0,
    rescuedFront: 0,
    timeLeft: 0,
    elapsed: 0,
    aboard: 0,
    over: null,
    upgrades: { engine: 0, capacity: 0, hull: 0, rod: 0, lantern: 0 },
  };

  function frontDef() {
    return FRONTS[state.front - 1];
  }

  function maxHp() {
    return UPGRADES[2].apply(state.upgrades);
  }

  function topSpeed() {
    return BOAT.baseSpeed * UPGRADES[0].apply(state.upgrades);
  }

  function capacity() {
    return UPGRADES[1].apply(state.upgrades);
  }

  function pickupRadius() {
    return UPGRADES[4].apply(state.upgrades);
  }

  function lightningDamage() {
    return UPGRADES[3].apply(state.upgrades);
  }

  function reset() {
    state.front = 1;
    state.hp = 100;
    state.gold = 0;
    state.goldEarned = 0;
    state.rescuedTotal = 0;
    state.rescuedFront = 0;
    state.timeLeft = frontDef().time;
    state.elapsed = 0;
    state.aboard = 0;
    state.over = null;
    state.upgrades = { engine: 0, capacity: 0, hull: 0, rod: 0, lantern: 0 };
    boatApi.reset();
    stormApi.reset();
    sailorsApi.reset();
    sailorsApi.maintain(frontDef().keep, boatApi.boat.x, boatApi.boat.y);
  }

  /** Begin a front: clear the sea, put the boat back at its mooring, stock the sailors. */
  function startFront(front) {
    state.front = front;
    state.rescuedFront = 0;
    state.timeLeft = frontDef().time;
    state.aboard = 0;
    boatApi.reset();
    stormApi.reset();
    sailorsApi.reset();
    sailorsApi.maintain(frontDef().keep, boatApi.boat.x, boatApi.boat.y);
  }

  /**
   * Buy a shop upgrade by index (0-4). Returns true when the purchase went through.
   * The hull upgrade also repairs the boat on the spot.
   */
  function buyUpgrade(index) {
    const def = UPGRADES[index];
    if (def === undefined) return false;
    const level = state.upgrades[def.key];
    if (level >= def.costs.length) return false;
    const cost = def.costs[level];
    if (state.gold < cost) return false;
    state.gold -= cost;
    state.upgrades[def.key] = level + 1;
    if (def.key === 'hull') state.hp = Math.min(maxHp(), state.hp + 40);
    return true;
  }

  function damage(amount) {
    state.hp = Math.max(0, state.hp - amount);
    boatApi.boat.invulnerable = BOAT.invulnerable;
    if (state.hp === 0) state.over = 'hp';
  }

  /**
   * One fixed step. `steer` is a unit-ish {x, y}. With `harmless` set (the title and shop
   * backdrops) the sea moves but nothing hurts, scores or ends the game.
   */
  function step(dt, steer, harmless) {
    let events = 0;
    const boat = boatApi.boat;
    const front = frontDef();

    boatApi.step(dt, steer, topSpeed());
    sailorsApi.step(dt);
    const struck = stormApi.step(dt, front, boat.x, boat.y);

    if (harmless) return events;

    state.elapsed += dt;
    state.timeLeft -= dt;
    if (state.timeLeft <= 0) {
      state.timeLeft = 0;
      state.over = 'time';
      return EVENT_OVER;
    }

    // Keep sailors coming while this front still needs rescues.
    const stillNeeded = front.target - state.rescuedFront - state.aboard;
    sailorsApi.maintain(Math.min(front.keep, Math.max(0, stillNeeded)), boat.x, boat.y);

    // Lightning: a bolt that lands close hurts, unless the rod takes it.
    if (struck && boat.invulnerable === 0) {
      const bolt = stormApi.state.lightning;
      if (dist2(boat.x, boat.y, bolt.x, bolt.y) < LIGHTNING.hurtRadius * LIGHTNING.hurtRadius) {
        const dmg = lightningDamage();
        if (dmg > 0) {
          damage(dmg);
          events |= EVENT_LIGHTNING;
        } else {
          events |= EVENT_LIGHTNING;
        }
        if (state.over !== null) return events | EVENT_OVER;
      }
    }

    // Debris: a hit costs hull, shoves the boat and breaks the debris apart.
    for (const item of stormApi.state.debris) {
      if (!item.active || boat.invulnerable > 0) continue;
      const reach = BOAT.radius + item.size * 0.7;
      if (dist2(boat.x, boat.y, item.x, item.y) < reach * reach) {
        item.active = false;
        boatApi.knockback(item.x, item.y);
        damage(DEBRIS.damage);
        events |= EVENT_HIT;
        if (state.over !== null) return events | EVENT_OVER;
        break;
      }
    }

    // Sailors: sail close and they climb aboard, while there is room.
    const reach = pickupRadius();
    for (const s of sailorsApi.sailors) {
      if (!s.active || state.aboard >= capacity()) continue;
      if (dist2(boat.x, boat.y, s.x, s.y) < reach * reach) {
        s.active = false;
        s.rescued = true;
        state.aboard += 1;
        events |= EVENT_PICKUP;
        break;
      }
    }

    // The dock: hand the sailors over, take the gold, and maybe clear the front.
    if (state.aboard > 0 && boatApi.inDeliverZone()) {
      const earned = state.aboard * SAILOR.gold;
      state.gold += earned;
      state.goldEarned += earned;
      state.rescuedTotal += state.aboard;
      state.rescuedFront += state.aboard;
      state.aboard = 0;
      events |= EVENT_DELIVER;
      if (state.rescuedFront >= front.target) {
        const bonus = FRONT_BONUS(state.front);
        state.gold += bonus;
        state.goldEarned += bonus;
        if (state.front >= FRONT_COUNT) {
          state.over = 'win';
          return events | EVENT_WIN | EVENT_OVER;
        }
        return events | EVENT_FRONT;
      }
    }
    return events;
  }

  /** A small read-only summary for the play-test driver and the results screen. */
  function snapshot() {
    let nearestSailor = null;
    let nearestSailorD = Infinity;
    for (const s of sailorsApi.sailors) {
      if (!s.active) continue;
      const d = (s.x - boatApi.boat.x) * (s.x - boatApi.boat.x) + (s.y - boatApi.boat.y) * (s.y - boatApi.boat.y);
      if (d < nearestSailorD) {
        nearestSailorD = d;
        nearestSailor = { x: Math.round(s.x), y: Math.round(s.y) };
      }
    }
    let nearestDebris = null;
    let nearestDebrisD = Infinity;
    for (const item of stormApi.state.debris) {
      if (!item.active) continue;
      const d = (item.x - boatApi.boat.x) * (item.x - boatApi.boat.x) + (item.y - boatApi.boat.y) * (item.y - boatApi.boat.y);
      if (d < nearestDebrisD) {
        nearestDebrisD = d;
        nearestDebris = { x: Math.round(item.x), y: Math.round(item.y) };
      }
    }
    return {
      front: state.front,
      hp: state.hp,
      maxHp: maxHp(),
      gold: state.gold,
      goldEarned: state.goldEarned,
      rescuedTotal: state.rescuedTotal,
      rescuedFront: state.rescuedFront,
      target: frontDef().target,
      timeLeft: Math.ceil(state.timeLeft),
      elapsed: Math.round(state.elapsed),
      aboard: state.aboard,
      capacity: capacity(),
      upgrades: { ...state.upgrades },
      over: state.over,
      boatX: Math.round(boatApi.boat.x),
      boatY: Math.round(boatApi.boat.y),
      nearestSailor,
      nearestDebris,
      sailorsAfloat: sailorsApi.sailors.filter((s) => s.active).length,
      debrisAfloat: stormApi.debrisCount(),
    };
  }

  reset();
  return {
    state,
    boat: boatApi.boat,
    boatApi,
    storm: stormApi.state,
    stormApi,
    sailors: sailorsApi.sailors,
    sailorsApi,
    reset,
    startFront,
    buyUpgrade,
    step,
    snapshot,
    maxHp,
    topSpeed,
    capacity,
    pickupRadius,
    lightningDamage,
    lightRadius: boatApi.lightRadius,
    frontDef,
  };
}
