// Every tuning number and colour in one place. The playfield is a fixed 1280x480 logical
// area; the renderer scales it to the window, so no rule below depends on the screen size.
// The sea is a monsoon night: deep teal water, a warm amber dock light, rain and lightning.

export const FIELD = { width: 1280, height: 480 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** The seed the game uses when no ?seed= is given, so a fresh load always plays the same sea. */
export const DEFAULT_SEED = 20261116;

/** The dock: a wooden pier on the top-right corner. Its deck is solid; the lit water just
 * below it is where rescued sailors are delivered. */
export const DOCK = { x0: 1000, y0: 0, x1: 1280, y1: 42 };
export const DELIVER = { x0: 1000, y0: 42, x1: 1280, y1: 118 };

export const BOAT = {
  /** Collision radius, in field px. The drawn hull is scaled by drawScale below, so the
   * radius grows with it: a bigger boat is a bigger target, the same game at a bigger size. */
  radius: 30,
  /** How much bigger the drawn boat is than the original 17 px-radius hull (1.75x). */
  drawScale: 1.75,
  baseSpeed: 215,
  accel: 950,
  drag: 2.4,
  /** Seconds of no damage after a hit. */
  invulnerable: 1.1,
  /** Seconds of knockback slide after a debris hit. */
  knockback: 0.35,
  knockSpeed: 320,
};

export const HULL = { max: 100 };

export const SAILOR = {
  /** Picked up when the boat's centre is within this distance of the sailor. */
  pickupRadius: 48,
  /** How fast a stranded sailor drifts with the current (to the left), in px/s. */
  drift: 14,
  /** Gold for each sailor delivered to the dock. */
  gold: 12,
};

export const DEBRIS = {
  /** Seconds a debris hit takes from the hull. */
  damage: 8,
  minSize: 13,
  maxSize: 30,
};

export const LIGHTNING = {
  /** Damage when a strike lands close to the boat. */
  damage: 15,
  /** Seconds of warning (a pulsing ring) before the bolt lands. */
  telegraph: 0.7,
  /** Seconds the bolt is drawn. */
  strike: 0.22,
  /** A strike within this distance of the boat hurts. */
  hurtRadius: 56,
};

/** One front of the storm: how many sailors to rescue, how long the player has, and how
 * hard the storm pushes back. Five fronts, then the rescue is won. */
export const FRONTS = [
  { target: 3, time: 100, debris: 6, debrisSpeed: 55, lightningEvery: 6.5, rain: 70, keep: 4 },
  { target: 4, time: 105, debris: 8, debrisSpeed: 66, lightningEvery: 5.5, rain: 100, keep: 5 },
  { target: 5, time: 110, debris: 10, debrisSpeed: 77, lightningEvery: 4.6, rain: 130, keep: 5 },
  { target: 6, time: 115, debris: 12, debrisSpeed: 88, lightningEvery: 3.9, rain: 160, keep: 6 },
  { target: 7, time: 120, debris: 14, debrisSpeed: 99, lightningEvery: 3.2, rain: 190, keep: 6 },
];

export const FRONT_COUNT = FRONTS.length;

/** Gold for clearing a front: a base plus a per-front bonus. */
export const FRONT_BONUS = (front) => 20 + 10 * front;

/** The shop's five upgrades: what each level does and what it costs. */
export const UPGRADES = [
  {
    key: 'engine',
    name: 'Engine',
    desc: '+15% boat speed',
    costs: [25, 40, 60],
    apply: (u) => 1 + 0.15 * u.engine,
  },
  {
    key: 'capacity',
    name: 'Capacity',
    desc: '+1 sailor aboard',
    costs: [30, 50],
    apply: (u) => 3 + u.capacity,
  },
  {
    key: 'hull',
    name: 'Hull',
    desc: 'Repair 40, +20 max hull',
    costs: [20, 30, 45],
    apply: (u) => 100 + 20 * u.hull,
  },
  {
    key: 'rod',
    name: 'Lightning rod',
    desc: 'Lightning hurts less',
    costs: [35, 60],
    apply: (u) => (u.rod === 0 ? 15 : u.rod === 1 ? 7 : 0),
  },
  {
    key: 'lantern',
    name: 'Lantern',
    desc: 'Wider light, +6 pickup',
    costs: [15, 25, 40],
    apply: (u) => 46 + 6 * u.lantern,
  },
];

/** How many of each thing can exist at once; pools are allocated once, at boot. */
export const POOL = { debris: 24, sailors: 10, rain: 220, wake: 40 };

export const PALETTE = {
  backdrop: '#04141c',
  seaTop: '#0a3d4a',
  seaDeep: '#052530',
  seaLine: '#0e5566',
  foam: '#9fd8e0',
  rain: '#bfe6ee',
  dockWood: '#7a5230',
  dockDark: '#5d3d22',
  dockLight: '#ffb347',
  dockGlow: '#ffcf7d',
  boatHull: '#f4f1e6',
  boatTrim: '#e2703a',
  boatCabin: '#2f6f7e',
  sailorSkin: '#e8b98a',
  ring: '#ff7a1a',
  ringWhite: '#f4f1e6',
  debrisLog: '#6b4a2b',
  debrisBarrel: '#8a3b2e',
  hpGood: '#4ade80',
  hpWarn: '#facc15',
  hpBad: '#ef4444',
  gold: '#f2c94c',
  panel: '#0a2230',
  panelEdge: '#1d4b5c',
  text: '#eef6f7',
  muted: '#9fc3cc',
  danger: '#ff5a4e',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best result is kept between visits (this browser only). */
export const BEST_KEY = 'monsoon-rescue.best';
