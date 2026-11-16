// Drawing only: the world's state and the current screen in, pixels out. The 1280x480
// playfield is scaled to fit the window and centred, the margin filled with the backdrop
// colour. The sea is deep teal, the dock glows warm amber, rain slants in the wind, and the
// boat carries a lantern glow. Canvas shapes only — no images, no copied art.

import { BOAT, DOCK, DELIVER, FIELD, FONT, FRONTS, PALETTE, UPGRADES } from './config.js';
import { LIGHTNING_STRIKE, LIGHTNING_WARN } from './storm.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_SHOP = 'shop';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

/** The shop panel's rows, in field coordinates, so clicks can buy (main.js asks here). */
const SHOP = { x: 240, y: 66, width: 800, rowTop: 168, rowHeight: 44, nextY: 400, nextHeight: 46 };

function formatTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align, bold) {
    const key = `${size}${bold ? 'b' : ''}`;
    if (!fonts.has(key)) fonts.set(key, `${bold ? '700 ' : ''}${size}px ${FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align;
    context.textBaseline = 'alphabetic';
    context.fillText(value, x, y);
  }

  /** Client (CSS) pixels to field coordinates, for mouse steering and shop clicks. */
  function clientToField(clientX, clientY) {
    const ratio = window.devicePixelRatio || 1;
    const px = clientX * ratio;
    const py = clientY * ratio;
    return { x: (px - view.x) / view.scale, y: (py - view.y) / view.scale };
  }

  function drawSea(world) {
    const gradient = context.createLinearGradient(0, 0, 0, FIELD.height);
    gradient.addColorStop(0, PALETTE.seaTop);
    gradient.addColorStop(1, PALETTE.seaDeep);
    context.fillStyle = gradient;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    const elapsed = world.state.elapsed;
    // Distant rain-squall bands: slow, dark, vertical weather drifting with the wind.
    for (let i = 0; i < 3; i += 1) {
      const bandWidth = 150 + i * 40;
      const bx = (((i * 520 - elapsed * 16) % (FIELD.width + 500)) + FIELD.width + 500) % (FIELD.width + 500) - 250;
      const band = context.createLinearGradient(bx, 0, bx + bandWidth, 0);
      band.addColorStop(0, 'rgba(6, 32, 42, 0)');
      band.addColorStop(0.5, 'rgba(6, 32, 42, 0.20)');
      band.addColorStop(1, 'rgba(6, 32, 42, 0)');
      context.fillStyle = band;
      context.fillRect(bx, 0, bandWidth, FIELD.height);
    }
    // Foam patches: pale clusters riding the swell, drifting almost imperceptibly.
    context.fillStyle = PALETTE.foam;
    for (let i = 0; i < 6; i += 1) {
      const fx = 120 + i * 190 + Math.sin(elapsed * 0.22 + i * 1.7) * 12;
      const fy = 110 + ((i * 67) % 260) + Math.cos(elapsed * 0.18 + i * 2.3) * 5;
      context.globalAlpha = 0.10 + (i % 3) * 0.03;
      context.beginPath();
      context.ellipse(fx, fy, 26 + (i % 3) * 12, 5 + (i % 2) * 3, 0, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    // Slow swells: five sine lines rolling across the water.
    context.strokeStyle = PALETTE.seaLine;
    context.lineWidth = 2;
    for (let row = 0; row < 5; row += 1) {
      const baseY = 120 + row * 72;
      context.globalAlpha = 0.38 - row * 0.05;
      context.beginPath();
      for (let x = 0; x <= FIELD.width; x += 16) {
        const y = baseY + Math.sin(x * 0.012 + elapsed * (1.1 + row * 0.3) + row * 2.1) * 7;
        if (x === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.stroke();
    }
    // Wave glints: short bright dashes riding the crests, twinkling as the sea moves.
    context.strokeStyle = 'rgba(190, 235, 240, 0.5)';
    context.lineWidth = 2;
    for (let row = 1; row < 5; row += 2) {
      const baseY = 120 + row * 72;
      for (let x = 40 + row * 30; x < FIELD.width; x += 96) {
        const twinkle = 0.25 + 0.25 * Math.sin(elapsed * 2 + x * 0.05 + row * 1.3);
        const y = baseY + Math.sin(x * 0.012 + elapsed * (1.1 + row * 0.3) + row * 2.1) * 7;
        context.globalAlpha = twinkle;
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x + 14, y);
        context.stroke();
      }
    }
    context.globalAlpha = 1;
  }

  /** Rain splashes on the surface: small rings blooming where drops land. The positions
   * are fixed and the phase is a function of elapsed time, so the frame is deterministic. */
  const SPLASHES = [];
  for (let i = 0; i < 24; i += 1) {
    SPLASHES.push({ x: 60 + ((i * 173) % 1160), y: 90 + ((i * 97) % 340) });
  }

  function drawRainSplashes(world) {
    const elapsed = world.state.elapsed;
    context.strokeStyle = PALETTE.foam;
    context.lineWidth = 1.5;
    for (let i = 0; i < SPLASHES.length; i += 1) {
      const p = SPLASHES[i];
      const phase = (elapsed * 0.9 + i * 0.37) % 1;
      context.globalAlpha = 0.32 * (1 - phase);
      context.beginPath();
      context.ellipse(p.x, p.y, 2 + phase * 11, 1 + phase * 3.5, 0, 0, Math.PI * 2);
      context.stroke();
    }
    context.globalAlpha = 1;
  }

  /** Buoys and rocky islets: fixed scenery that fills the mid-sea, purely decorative.
   * Positions are constants and the bob is a function of elapsed time, so the frame is
   * deterministic. The islets are background, never collidable. */
  const BUOYS = [
    { x: 150, y: 330 },
    { x: 520, y: 408 },
    { x: 760, y: 168 },
    { x: 985, y: 335 },
    { x: 330, y: 150 },
  ];
  const ISLETS = [
    { x: 92, y: 418, rx: 34, ry: 12 },
    { x: 1180, y: 424, rx: 28, ry: 10 },
  ];

  function drawScenery(world) {
    const elapsed = world.state.elapsed;
    // Rocky islets, low and dark, with a foam ring where the sea meets them.
    for (const islet of ISLETS) {
      context.strokeStyle = 'rgba(159, 216, 224, 0.35)';
      context.lineWidth = 2;
      context.beginPath();
      context.ellipse(islet.x, islet.y + 4, islet.rx + 8, islet.ry + 3, 0, 0, Math.PI * 2);
      context.stroke();
      context.fillStyle = '#0b2b36';
      context.beginPath();
      context.ellipse(islet.x, islet.y, islet.rx, islet.ry, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#123845';
      context.beginPath();
      context.ellipse(islet.x - 8, islet.y - 5, islet.rx * 0.45, islet.ry * 0.5, 0, 0, Math.PI * 2);
      context.fill();
    }
    // Buoys: striped cones riding the swell, each with a foam ring and a blinking light.
    for (let i = 0; i < BUOYS.length; i += 1) {
      const buoy = BUOYS[i];
      const bob = Math.sin(elapsed * 1.3 + i * 2.1) * 2.5;
      const bx = buoy.x;
      const by = buoy.y + bob;
      context.strokeStyle = 'rgba(159, 216, 224, 0.4)';
      context.lineWidth = 2;
      context.beginPath();
      context.ellipse(bx, by + 8, 14, 4, 0, 0, Math.PI * 2);
      context.stroke();
      context.fillStyle = '#ff7a1a';
      context.beginPath();
      context.moveTo(bx - 9, by + 6);
      context.lineTo(bx + 9, by + 6);
      context.lineTo(bx + 4, by - 8);
      context.lineTo(bx - 4, by - 8);
      context.closePath();
      context.fill();
      context.fillStyle = '#f4f1e6';
      context.fillRect(bx - 6.5, by - 2, 13, 4);
      context.strokeStyle = '#3a2a18';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(bx, by - 8);
      context.lineTo(bx, by - 16);
      context.stroke();
      // A slow blink: on for half the cycle, off for half.
      if (Math.sin(elapsed * 1.1 + i * 1.9) > 0) {
        context.fillStyle = '#ffd76a';
        context.beginPath();
        context.arc(bx, by - 18, 3, 0, Math.PI * 2);
        context.fill();
      }
    }
  }

  function drawClouds(world) {
    const elapsed = world.state.elapsed;
    // A distant storm bank along the horizon: a low, dark mass with a ragged base.
    context.fillStyle = '#081c26';
    context.globalAlpha = 0.85;
    context.beginPath();
    context.moveTo(0, 52);
    for (let x = 0; x <= FIELD.width; x += 40) {
      context.lineTo(x, 46 + Math.sin(x * 0.008 + 1.2) * 6 + Math.sin(x * 0.021) * 3);
    }
    context.lineTo(FIELD.width, 0);
    context.lineTo(0, 0);
    context.closePath();
    context.fill();
    // Near cloud masses: layered clusters with dark bellies and lighter tops, drifting.
    for (let i = 0; i < 4; i += 1) {
      const speed = 6 + i * 3;
      const cx = ((i * 340 + elapsed * speed) % (FIELD.width + 360)) - 180;
      const cy = 34 + i * 12;
      context.fillStyle = '#081a24';
      context.globalAlpha = 0.8;
      context.beginPath();
      context.ellipse(cx, cy + 10, 150, 24, 0, 0, Math.PI * 2);
      context.ellipse(cx + 90, cy + 16, 110, 18, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#12303e';
      context.globalAlpha = 0.7;
      context.beginPath();
      context.ellipse(cx, cy - 4, 130, 20, 0, 0, Math.PI * 2);
      context.ellipse(cx + 80, cy + 2, 95, 15, 0, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  function drawDock(world) {
    // The dock's glow column: warm light spilling down the water from the pier, so the
    // dock reads from anywhere on the play field.
    const column = context.createLinearGradient(0, 0, 0, 210);
    column.addColorStop(0, 'rgba(255, 179, 71, 0.22)');
    column.addColorStop(1, 'rgba(255, 179, 71, 0)');
    context.fillStyle = column;
    context.fillRect(DOCK.x0, 0, DOCK.x1 - DOCK.x0, 210);
    // The dock light's reflection: a shimmering path of warm dashes on the water below
    // the pier, dancing with the swell.
    for (let i = 0; i < 6; i += 1) {
      const ry = 128 + i * 22;
      const wobble = Math.sin(world.state.elapsed * 1.6 + i * 1.1) * 10;
      const width = 120 - i * 12;
      context.fillStyle = 'rgba(255, 190, 100, 0.20)';
      context.globalAlpha = 0.20 - i * 0.02;
      context.fillRect(1140 - width / 2 + wobble, ry, width, 4);
    }
    context.globalAlpha = 1;
    // The searchlight: a slow amber wedge sweeping the sea from the pier's lantern.
    const lx = DOCK.x0 + 30;
    const ly = DOCK.y0 + 6;
    const beamAngle = (Math.PI * 0.62) + Math.sin(world.state.elapsed * 0.25) * 0.45;
    const beamLen = 560;
    const beamSpread = 0.16;
    context.save();
    context.beginPath();
    context.rect(0, 0, FIELD.width, FIELD.height);
    context.clip();
    context.fillStyle = 'rgba(255, 207, 125, 0.10)';
    context.beginPath();
    context.moveTo(lx, ly + 30);
    context.lineTo(lx + Math.cos(beamAngle - beamSpread) * beamLen, ly + 30 + Math.sin(beamAngle - beamSpread) * beamLen);
    context.lineTo(lx + Math.cos(beamAngle + beamSpread) * beamLen, ly + 30 + Math.sin(beamAngle + beamSpread) * beamLen);
    context.closePath();
    context.fill();
    context.fillStyle = 'rgba(255, 207, 125, 0.07)';
    context.beginPath();
    context.moveTo(lx, ly + 30);
    context.lineTo(lx + Math.cos(beamAngle - 0.07) * beamLen, ly + 30 + Math.sin(beamAngle - 0.07) * beamLen);
    context.lineTo(lx + Math.cos(beamAngle + 0.07) * beamLen, ly + 30 + Math.sin(beamAngle + 0.07) * beamLen);
    context.closePath();
    context.fill();
    context.restore();
    // The lit delivery water beside the pier: a warm pool with a dashed edge.
    context.fillStyle = 'rgba(255, 179, 71, 0.16)';
    context.fillRect(DELIVER.x0, DELIVER.y0, DELIVER.x1 - DELIVER.x0, DELIVER.y1 - DELIVER.y0);
    context.strokeStyle = PALETTE.dockLight;
    context.globalAlpha = 0.9;
    context.setLineDash([8, 6]);
    context.lineWidth = 3;
    context.strokeRect(DELIVER.x0 + 2, DELIVER.y0 + 2, DELIVER.x1 - DELIVER.x0 - 4, DELIVER.y1 - DELIVER.y0 - 4);
    context.setLineDash([]);
    context.globalAlpha = 1;
    // The pier deck: planks, posts and a lantern that throws the warm light.
    context.fillStyle = PALETTE.dockWood;
    context.fillRect(DOCK.x0, DOCK.y0, DOCK.x1 - DOCK.x0, DOCK.y1 - DOCK.y0);
    context.strokeStyle = PALETTE.dockDark;
    context.lineWidth = 2;
    for (let x = DOCK.x0 + 28; x < DOCK.x1; x += 28) {
      context.beginPath();
      context.moveTo(x, DOCK.y0);
      context.lineTo(x, DOCK.y1);
      context.stroke();
    }
    // Wood grain along the planks.
    context.strokeStyle = 'rgba(60, 38, 18, 0.5)';
    context.lineWidth = 1;
    for (let x = DOCK.x0 + 8; x < DOCK.x1; x += 28) {
      context.beginPath();
      context.moveTo(x, DOCK.y0 + 12);
      context.lineTo(x + 20, DOCK.y0 + 12);
      context.moveTo(x + 4, DOCK.y0 + 30);
      context.lineTo(x + 24, DOCK.y0 + 30);
      context.stroke();
    }
    context.fillStyle = PALETTE.dockDark;
    for (let x = DOCK.x0 + 14; x < DOCK.x1; x += 56) {
      context.fillRect(x - 4, DOCK.y1 - 6, 8, 14);
    }
    // Pilings under the pier's far end, reaching a little into the water.
    context.fillStyle = PALETTE.dockDark;
    for (const px of [1180, 1230, 1272]) {
      context.fillRect(px - 4, DOCK.y1, 8, 14);
    }
    // Lantern post and its glow.
    context.strokeStyle = '#3a2a18';
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(lx, ly);
    context.lineTo(lx, ly + 26);
    context.stroke();
    // A small amber flag on the post, so the pier has a silhouette from the sea.
    context.fillStyle = PALETTE.dockLight;
    context.beginPath();
    context.moveTo(lx, ly + 2);
    context.lineTo(lx + 20, ly + 8);
    context.lineTo(lx, ly + 14);
    context.closePath();
    context.fill();
    const glow = context.createRadialGradient(lx, ly + 30, 4, lx, ly + 30, 110);
    glow.addColorStop(0, 'rgba(255, 207, 125, 0.60)');
    glow.addColorStop(1, 'rgba(255, 207, 125, 0)');
    context.fillStyle = glow;
    context.fillRect(lx - 110, ly - 80, 220, 220);
    context.fillStyle = PALETTE.dockLight;
    context.beginPath();
    context.arc(lx, ly + 30, 8, 0, Math.PI * 2);
    context.fill();
    text('DOCK', (DOCK.x0 + DOCK.x1) / 2, DOCK.y1 - 10, 15, PALETTE.dockGlow, 'center', true);
  }

  function drawSailors(world) {
    for (const s of world.sailors) {
      if (!s.active) continue;
      const bob = Math.sin(s.phase) * 2;
      // Life ring.
      context.lineWidth = 6;
      context.strokeStyle = PALETTE.ring;
      context.beginPath();
      context.arc(s.x, s.y + bob, 13, 0, Math.PI * 2);
      context.stroke();
      context.strokeStyle = PALETTE.ringWhite;
      context.lineWidth = 3;
      context.beginPath();
      context.arc(s.x, s.y + bob, 13, 0.6, 1.8);
      context.arc(s.x, s.y + bob, 13, Math.PI + 0.6, Math.PI + 1.8);
      context.stroke();
      // Head and shoulders in the water.
      context.fillStyle = PALETTE.sailorSkin;
      context.beginPath();
      context.arc(s.x, s.y + bob - 4, 7, 0, Math.PI * 2);
      context.fill();
      // A waving arm: the call for help.
      const wave = Math.sin(s.phase * 1.6) * 0.7;
      context.strokeStyle = PALETTE.sailorSkin;
      context.lineWidth = 4;
      context.beginPath();
      context.moveTo(s.x + 4, s.y + bob - 2);
      context.lineTo(s.x + 14, s.y + bob - 16 + wave * 6);
      context.stroke();
      // A small splash ring, widening and fading.
      const splash = (s.phase % (Math.PI * 2)) / (Math.PI * 2);
      context.strokeStyle = `rgba(159, 216, 224, ${0.5 * (1 - splash)})`;
      context.lineWidth = 2;
      context.beginPath();
      context.ellipse(s.x, s.y + bob + 8, 10 + splash * 14, 4 + splash * 3, 0, 0, Math.PI * 2);
      context.stroke();
    }
  }

  function drawDebris(world) {
    for (const item of world.storm.debris) {
      if (!item.active) continue;
      context.save();
      context.translate(item.x, item.y);
      context.rotate(item.rot);
      if (item.kind === 0) {
        // A log.
        context.fillStyle = PALETTE.debrisLog;
        context.beginPath();
        context.roundRect(-item.size, -item.size * 0.32, item.size * 2, item.size * 0.64, 4);
        context.fill();
        context.strokeStyle = '#4a3018';
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(-item.size + 4, 0);
        context.lineTo(item.size - 4, 0);
        context.stroke();
      } else {
        // A barrel.
        context.fillStyle = PALETTE.debrisBarrel;
        context.beginPath();
        context.arc(0, 0, item.size * 0.8, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = '#5d241a';
        context.lineWidth = 2;
        context.beginPath();
        context.arc(0, 0, item.size * 0.5, 0, Math.PI * 2);
        context.stroke();
      }
      context.restore();
    }
  }

  function drawBoat(world) {
    const boat = world.boat;
    const speed = Math.hypot(boat.vx, boat.vy);
    // Wake first, under the hull.
    for (const drop of boat.wake) {
      if (drop.life <= 0) continue;
      context.fillStyle = `rgba(159, 216, 224, ${0.35 * drop.life})`;
      context.beginPath();
      context.arc(drop.x, drop.y, 4 + (1 - drop.life) * 7, 0, Math.PI * 2);
      context.fill();
    }
    // A faint V-wake trailing from the stern while the boat is under way.
    if (speed > 60) {
      const sternX = boat.x - Math.cos(boat.heading) * BOAT.radius;
      const sternY = boat.y - Math.sin(boat.heading) * BOAT.radius;
      context.strokeStyle = 'rgba(159, 216, 224, 0.18)';
      context.lineWidth = 3;
      for (const side of [-1, 1]) {
        const a = boat.heading + Math.PI + side * 0.42;
        context.beginPath();
        context.moveTo(sternX, sternY);
        context.lineTo(sternX + Math.cos(a) * 46, sternY + Math.sin(a) * 46);
        context.stroke();
      }
    }
    // The boat's shadow on the water: a soft dark ellipse under the hull.
    context.fillStyle = 'rgba(2, 14, 20, 0.30)';
    context.beginPath();
    context.ellipse(boat.x, boat.y + 10, 34, 10, 0, 0, Math.PI * 2);
    context.fill();
    // Lantern glow around the boat.
    const radius = world.lightRadius(world.state.upgrades.lantern);
    const glow = context.createRadialGradient(boat.x, boat.y, 8, boat.x, boat.y, radius);
    glow.addColorStop(0, 'rgba(255, 207, 125, 0.30)');
    glow.addColorStop(1, 'rgba(255, 207, 125, 0)');
    context.fillStyle = glow;
    context.fillRect(boat.x - radius, boat.y - radius, radius * 2, radius * 2);
    // The lantern's reflection: a shimmering warm column on the water below the boat.
    context.globalAlpha = 0.8 + 0.2 * Math.sin(world.state.elapsed * 2.2);
    const refl = context.createRadialGradient(boat.x, boat.y + 30, 2, boat.x, boat.y + 30, 46);
    refl.addColorStop(0, 'rgba(255, 207, 125, 0.22)');
    refl.addColorStop(1, 'rgba(255, 207, 125, 0)');
    context.fillStyle = refl;
    context.save();
    context.translate(boat.x, boat.y + 30);
    context.scale(0.45, 1);
    context.beginPath();
    context.arc(0, 0, 46, 0, Math.PI * 2);
    context.fill();
    context.restore();
    context.globalAlpha = 1;
    // Blink while invulnerable after a hit.
    if (boat.invulnerable > 0 && Math.floor(boat.invulnerable * 10) % 2 === 0) return;
    context.save();
    context.translate(boat.x, boat.y);
    context.rotate(boat.heading);
    // The hull is drawn 1.75x its original size, matching the collision radius.
    context.scale(BOAT.drawScale, BOAT.drawScale);
    // Hull: a pointed bow, a flat stern, white with an orange trim.
    context.fillStyle = PALETTE.boatHull;
    context.beginPath();
    context.moveTo(22, 0);
    context.quadraticCurveTo(10, -13, -14, -12);
    context.quadraticCurveTo(-20, -8, -20, 0);
    context.quadraticCurveTo(-20, 8, -14, 12);
    context.quadraticCurveTo(10, 13, 22, 0);
    context.fill();
    context.strokeStyle = PALETTE.boatTrim;
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(20, 0);
    context.quadraticCurveTo(10, -11, -12, -10);
    context.quadraticCurveTo(-18, -7, -18, 0);
    context.quadraticCurveTo(-18, 7, -12, 10);
    context.quadraticCurveTo(10, 11, 20, 0);
    context.stroke();
    // Hull shading: a dark waterline along the bottom edge, a pale highlight on top.
    context.strokeStyle = 'rgba(20, 40, 50, 0.35)';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(-14, 11);
    context.quadraticCurveTo(10, 12, 20, 0);
    context.stroke();
    context.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(-12, -10);
    context.quadraticCurveTo(10, -11, 20, 0);
    context.stroke();
    // Cabin and mast.
    context.fillStyle = PALETTE.boatCabin;
    context.fillRect(-10, -7, 14, 14);
    // Cabin roof highlight and a lit window.
    context.fillStyle = 'rgba(255, 255, 255, 0.25)';
    context.fillRect(-10, -7, 14, 3);
    context.fillStyle = PALETTE.dockLight;
    context.fillRect(-6, -3, 5, 6);
    context.strokeStyle = '#3a2a18';
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(2, -6);
    context.lineTo(2, -20);
    context.stroke();
    // The lantern on the mast, and the sailors aboard (small heads in the stern).
    context.fillStyle = PALETTE.dockLight;
    context.beginPath();
    context.arc(2, -22, 4, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.sailorSkin;
    for (let i = 0; i < world.state.aboard; i += 1) {
      context.beginPath();
      context.arc(-13 + (i % 2) * 6, 4 + Math.floor(i / 2) * 6, 3.4, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
    // Bow spray while the boat is running fast.
    if (speed > 140) {
      const bx = boat.x + Math.cos(boat.heading) * 40;
      const by = boat.y + Math.sin(boat.heading) * 40;
      context.fillStyle = 'rgba(220, 245, 248, 0.7)';
      for (let i = 0; i < 3; i += 1) {
        const a = boat.heading + (i - 1) * 0.5;
        const d = 6 + ((world.state.elapsed * 30 + i * 7) % 10);
        context.beginPath();
        context.arc(bx + Math.cos(a) * d, by + Math.sin(a) * d, 2.5, 0, Math.PI * 2);
        context.fill();
      }
    }
  }

  /**
   * Where to go, at a glance. A gold chevron floats just ahead of the boat pointing at
   * the current objective (the nearest stranded sailor, or the dock once the boat is full
   * or the front's rescues are done). And any sailor drifting outside the field — a
   * sailor wraps around at x = FIELD.width + 20, so it spends a few seconds off the
   * right edge — gets a ring marker clamped to the screen edge, pointing back in.
   * The dock itself is fixed inside the field, so it never needs an edge marker.
   */
  function drawMarkers(world) {
    const boat = world.boat;
    const state = world.state;
    const elapsed = state.elapsed;
    // Edge markers for sailors outside the field.
    for (const s of world.sailors) {
      if (!s.active) continue;
      if (s.x >= 0 && s.x <= FIELD.width && s.y >= 0 && s.y <= FIELD.height) continue;
      const mx = Math.min(FIELD.width - 16, Math.max(16, s.x));
      const my = Math.min(FIELD.height - 16, Math.max(60, s.y));
      context.lineWidth = 4;
      context.strokeStyle = PALETTE.ring;
      context.beginPath();
      context.arc(mx, my, 9, 0, Math.PI * 2);
      context.stroke();
      const dx = s.x - mx;
      const dy = s.y - my;
      const len = Math.hypot(dx, dy) || 1;
      const angle = Math.atan2(dy, dx);
      context.save();
      context.translate(mx + (dx / len) * 16, my + (dy / len) * 16);
      context.rotate(angle);
      context.fillStyle = PALETTE.ring;
      context.beginPath();
      context.moveTo(8, 0);
      context.lineTo(-5, -6);
      context.lineTo(-5, 6);
      context.closePath();
      context.fill();
      context.restore();
    }
    // Guidance chevron toward the current objective.
    const full = state.aboard >= world.capacity();
    const done = state.rescuedFront + state.aboard >= world.frontDef().target;
    let tx;
    let ty;
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
    const dx = tx - boat.x;
    const dy = ty - boat.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 90) return;
    const angle = Math.atan2(dy, dx);
    const pulse = 0.6 + 0.3 * Math.sin(elapsed * 4);
    const cx = boat.x + (dx / dist) * 58;
    const cy = boat.y + (dy / dist) * 58;
    context.save();
    context.translate(cx, cy);
    context.rotate(angle);
    context.globalAlpha = pulse;
    context.fillStyle = PALETTE.gold;
    context.beginPath();
    context.moveTo(12, 0);
    context.lineTo(-7, -8);
    context.lineTo(-2, 0);
    context.lineTo(-7, 8);
    context.closePath();
    context.fill();
    context.restore();
    context.globalAlpha = 1;
  }

  function drawRain(world) {
    context.strokeStyle = PALETTE.rain;
    context.lineWidth = 1.4;
    context.globalAlpha = 0.4;
    context.beginPath();
    for (const drop of world.storm.rain) {
      if (!drop.active) continue;
      context.moveTo(drop.x, drop.y);
      context.lineTo(drop.x - 5, drop.y + drop.len);
    }
    context.stroke();
    context.globalAlpha = 1;
  }

  function drawLightning(world) {
    const bolt = world.storm.lightning;
    if (bolt.state === LIGHTNING_WARN) {
      // A pulsing ring warns where the bolt will land.
      const pulse = 34 + Math.sin(world.state.elapsed * 18) * 8;
      context.strokeStyle = 'rgba(255, 90, 78, 0.85)';
      context.lineWidth = 3;
      context.beginPath();
      context.arc(bolt.x, bolt.y, pulse, 0, Math.PI * 2);
      context.stroke();
      context.fillStyle = 'rgba(255, 90, 78, 0.15)';
      context.beginPath();
      context.arc(bolt.x, bolt.y, pulse, 0, Math.PI * 2);
      context.fill();
    } else if (bolt.state === LIGHTNING_STRIKE) {
      // The sky flashes, then the bolt.
      context.fillStyle = `rgba(255, 255, 240, ${0.22 * bolt.flash})`;
      context.fillRect(0, 0, FIELD.width, FIELD.height);
      if (bolt.bolt.length > 1) {
        context.strokeStyle = 'rgba(147, 197, 253, 0.8)';
        context.lineWidth = 7;
        context.beginPath();
        bolt.bolt.forEach((p, i) => (i === 0 ? context.moveTo(p.x, p.y) : context.lineTo(p.x, p.y)));
        context.stroke();
        context.strokeStyle = '#ffffff';
        context.lineWidth = 2.5;
        context.beginPath();
        bolt.bolt.forEach((p, i) => (i === 0 ? context.moveTo(p.x, p.y) : context.lineTo(p.x, p.y)));
        context.stroke();
      }
      // The strike lights the water where it lands: a bright pool and a glow.
      const pool = context.createRadialGradient(bolt.x, bolt.y, 4, bolt.x, bolt.y, 150);
      pool.addColorStop(0, `rgba(190, 220, 255, ${0.45 * bolt.flash})`);
      pool.addColorStop(1, 'rgba(190, 220, 255, 0)');
      context.fillStyle = pool;
      context.fillRect(bolt.x - 150, bolt.y - 150, 300, 300);
      context.fillStyle = `rgba(255, 255, 255, ${0.5 * bolt.flash})`;
      context.beginPath();
      context.ellipse(bolt.x, bolt.y, 26, 8, 0, 0, Math.PI * 2);
      context.fill();
    }
  }

  /** Low fog banks and a vignette: the storm's atmosphere over the finished frame.
   * Drawn after the weather, before the HUD, so the interface stays crisp. */
  function drawFog(world) {
    const elapsed = world.state.elapsed;
    for (let i = 0; i < 2; i += 1) {
      const fy = 150 + i * 190;
      const fx = (((i * 620 - elapsed * 9) % (FIELD.width + 700)) + FIELD.width + 700) % (FIELD.width + 700) - 350;
      const fog = context.createLinearGradient(fx, 0, fx + 420, 0);
      fog.addColorStop(0, 'rgba(180, 210, 218, 0)');
      fog.addColorStop(0.5, 'rgba(180, 210, 218, 0.07)');
      fog.addColorStop(1, 'rgba(180, 210, 218, 0)');
      context.fillStyle = fog;
      context.fillRect(fx, fy, 420, 46);
    }
    // A vignette: the edges fall away into the storm, the action stays lit.
    const vignette = context.createRadialGradient(
      FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.45,
      FIELD.width / 2, FIELD.height / 2, FIELD.width * 0.62,
    );
    vignette.addColorStop(0, 'rgba(2, 12, 18, 0)');
    vignette.addColorStop(1, 'rgba(2, 12, 18, 0.22)');
    context.fillStyle = vignette;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
  }

  function drawHud(world, muted) {
    // Top bar: it stops short of the dock's corner so the pier stays fully visible.
    context.fillStyle = 'rgba(4, 20, 28, 0.72)';
    context.fillRect(0, 0, 996, 46);
    // Hull bar.
    const hp = world.state.hp;
    const max = world.maxHp();
    const frac = hp / max;
    context.fillStyle = '#0a2230';
    context.fillRect(16, 14, 180, 18);
    context.fillStyle = frac > 0.5 ? PALETTE.hpGood : frac > 0.25 ? PALETTE.hpWarn : PALETTE.hpBad;
    context.fillRect(18, 16, 176 * frac, 14);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 1.5;
    context.strokeRect(16, 14, 180, 18);
    text(`HULL ${hp}`, 106, 30, 15, PALETTE.text, 'center', true);
    // Rescued, gold, front, timer, capacity.
    const front = world.frontDef();
    text(`Rescued ${world.state.rescuedFront}/${front.target}`, 232, 30, 19, PALETTE.text, 'left', true);
    text(`Gold ${world.state.gold}`, 400, 30, 19, PALETTE.gold, 'left', true);
    text(`Front ${world.state.front}/${FRONTS.length}`, 540, 30, 19, PALETTE.text, 'left', true);
    const timeLeft = world.state.timeLeft;
    text(formatTime(timeLeft), 660, 30, 19, timeLeft < 15 ? PALETTE.danger : PALETTE.text, 'left', true);
    // Aboard: little life rings, filled for each sailor on board.
    text('Aboard', 790, 30, 19, PALETTE.text, 'left', true);
    const cap = world.capacity();
    for (let i = 0; i < cap; i += 1) {
      const cx = 872 + i * 24;
      context.lineWidth = 4;
      context.strokeStyle = i < world.state.aboard ? PALETTE.ring : '#3d6b78';
      context.beginPath();
      context.arc(cx, 23, 8, 0, Math.PI * 2);
      context.stroke();
    }
    if (muted) text('MUTED', FIELD.width - 16, 30, 15, PALETTE.muted, 'right', true);
    // Controls hint along the bottom.
    text('WASD / arrows move · hold mouse to steer · P pause · R restart · M mute', 16, FIELD.height - 12, 14, PALETTE.muted, 'left');
  }

  function drawPanel(title, lines, prompt, accent) {
    const width = 640;
    const height = 120 + lines.length * 30 + 56;
    const x = (FIELD.width - width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, width, height);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.strokeRect(x, y, width, height);
    text(title, FIELD.width / 2, y + 58, 40, accent ?? PALETTE.text, 'center', true);
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + 104 + index * 30, 20, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 26, 20, PALETTE.gold, 'center', true);
  }

  function drawTitle(world, best) {
    drawPanel(
      'MONSOON RESCUE',
      [
        'Pilot the rescue boat through five storm fronts.',
        'Pick up stranded sailors — up to your capacity — and bring them to the dock.',
        'Dodge debris and lightning. Spend gold on upgrades between fronts.',
        best > 0 ? `Best rescue: ${best} sailors` : 'No rescues yet — the sea is waiting.',
      ],
      'Press Space or click to start',
    );
  }

  function drawShop(world) {
    const state = world.state;
    const width = SHOP.width;
    const x = SHOP.x;
    const y = SHOP.y;
    const height = 380;
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, width, height);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.strokeRect(x, y, width, height);
    text(`FRONT ${state.front} CLEARED!`, FIELD.width / 2, y + 46, 34, PALETTE.gold, 'center', true);
    text(`Gold: ${state.gold}   ·   Rescued so far: ${state.rescuedTotal}`, FIELD.width / 2, y + 78, 19, PALETTE.text, 'center');
    for (let i = 0; i < UPGRADES.length; i += 1) {
      const def = UPGRADES[i];
      const level = state.upgrades[def.key];
      const maxed = level >= def.costs.length;
      const cost = maxed ? 0 : def.costs[level];
      const rowY = SHOP.rowTop + i * SHOP.rowHeight;
      const afford = !maxed && state.gold >= cost;
      context.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.01)';
      context.fillRect(x + 16, rowY, width - 32, SHOP.rowHeight - 6);
      text(`[${i + 1}] ${def.name}`, x + 30, rowY + 24, 19, afford || maxed ? PALETTE.text : PALETTE.muted, 'left', true);
      text(def.desc, x + 190, rowY + 24, 17, PALETTE.muted, 'left');
      // Level pips.
      for (let p = 0; p < def.costs.length; p += 1) {
        context.fillStyle = p < level ? PALETTE.gold : '#2c4b57';
        context.beginPath();
        context.arc(x + 470 + p * 20, rowY + 18, 6, 0, Math.PI * 2);
        context.fill();
      }
      text(maxed ? 'MAXED' : `${cost} gold`, x + width - 30, rowY + 24, 18, maxed ? PALETTE.muted : afford ? PALETTE.gold : PALETTE.danger, 'right', true);
    }
    // Next front button.
    context.fillStyle = '#1d4b5c';
    context.fillRect(x + 220, SHOP.nextY, 360, SHOP.nextHeight);
    context.strokeStyle = PALETTE.dockLight;
    context.lineWidth = 2;
    context.strokeRect(x + 220, SHOP.nextY, 360, SHOP.nextHeight);
    text(`Next: Front ${state.front + 1}  (Enter)`, FIELD.width / 2, SHOP.nextY + 31, 20, PALETTE.text, 'center', true);
  }

  function drawOver(world, best) {
    const state = world.state;
    const won = state.over === 'win';
    const reason = state.over === 'hp' ? 'The hull gave out in the storm.' : state.over === 'time' ? 'The storm front closed in — time ran out.' : 'Every sailor is safe ashore.';
    const lines = [
      reason,
      `Rescued: ${state.rescuedTotal} sailors   ·   Gold earned: ${state.goldEarned}`,
      `Time at sea: ${formatTime(state.elapsed)}   ·   Fronts cleared: ${won ? FRONTS.length : state.front - 1} of ${FRONTS.length}`,
      state.rescuedTotal > best ? 'A new best rescue!' : `Best rescue: ${best} sailors`,
    ];
    drawPanel(won ? 'ALL FRONTS CLEARED!' : 'THE STORM WON', lines, 'Press R to play again', won ? PALETTE.gold : PALETTE.danger);
  }

  /** Which shop upgrade row a field point is on (-1 when none), and whether it is the next button. */
  function shopHit(fieldX, fieldY) {
    if (fieldX < SHOP.x || fieldX > SHOP.x + SHOP.width) return { buy: -1, next: false };
    if (fieldY >= SHOP.nextY && fieldY <= SHOP.nextY + SHOP.nextHeight) return { buy: -1, next: true };
    for (let i = 0; i < UPGRADES.length; i += 1) {
      const rowY = SHOP.rowTop + i * SHOP.rowHeight;
      if (fieldY >= rowY && fieldY <= rowY + SHOP.rowHeight - 6) return { buy: i, next: false };
    }
    return { buy: -1, next: false };
  }

  /** Paint one frame: the sea, then the HUD or a panel for the screen the game is on. */
  function draw(world, screen, best, muted) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    drawSea(world);
    drawRainSplashes(world);
    drawScenery(world);
    drawClouds(world);
    drawDock(world);
    drawSailors(world);
    drawDebris(world);
    drawBoat(world);
    if (screen === SCREEN_PLAY) drawMarkers(world);
    drawRain(world);
    drawLightning(world);
    drawFog(world);
    if (screen === SCREEN_TITLE) {
      drawHud(world, muted);
      drawTitle(world, best);
      return;
    }
    drawHud(world, muted);
    if (screen === SCREEN_SHOP) drawShop(world);
    else if (screen === SCREEN_PAUSED) drawPanel('Paused', ['The storm waits for no one — except now.'], 'Press P to resume');
    else if (screen === SCREEN_OVER) drawOver(world, best);
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, clientToField, shopHit };
}
