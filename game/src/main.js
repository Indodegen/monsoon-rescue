// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. The
// game moves between five screens: title, play, shop, paused and game over.
//
// ?seed=N fixes the storm. ?shot=cover|start|play|end (with &seed=N) stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady for a screenshot.
// window.__monsoon() reports the screen and the world's numbers, for testing.

import { BEST_KEY, DEFAULT_SEED, STEP, UPGRADES } from './config.js';
import { createRandom } from './rng.js';
import { createWorld, EVENT_DELIVER, EVENT_FRONT, EVENT_HIT, EVENT_LIGHTNING, EVENT_OVER, EVENT_PICKUP, EVENT_WIN } from './world.js';
import { ACTION_BUY1, ACTION_BUY2, ACTION_BUY3, ACTION_BUY4, ACTION_BUY5, ACTION_CLICK, ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_SHOP, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : DEFAULT_SEED;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world, scene.screen, 0, false);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes and each hit.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Rescue the sailors and bring them to the dock.');
  }

  function endGame() {
    screen = SCREEN_OVER;
    if (world.state.rescuedTotal > best) {
      best = world.state.rescuedTotal;
      saveBest(best);
    }
    if (world.state.over === 'win') {
      audio.fanfare();
      announce(`All fronts cleared. ${world.state.rescuedTotal} sailors rescued.`);
    } else {
      audio.fail();
      announce(`Game over. ${world.state.rescuedTotal} sailors rescued.`);
    }
  }

  function nextFront() {
    world.startFront(world.state.front + 1);
    screen = SCREEN_PLAY;
    announce(`Front ${world.state.front}. Rescue ${world.frontDef().target} sailors.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions !== 0) audio.unlock();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Muted.' : 'Sound on.');
    }
    if (actions & ACTION_RESTART) {
      if (screen !== SCREEN_TITLE) {
        audio.click();
        startGame();
      }
      return;
    }
    if (screen === SCREEN_TITLE || screen === SCREEN_OVER) {
      if (actions & (ACTION_CONFIRM | ACTION_CLICK)) {
        audio.click();
        startGame();
      }
      return;
    }
    if (screen === SCREEN_SHOP) {
      const buys = [ACTION_BUY1, ACTION_BUY2, ACTION_BUY3, ACTION_BUY4, ACTION_BUY5];
      for (let i = 0; i < buys.length; i += 1) {
        if (actions & buys[i]) {
          if (world.buyUpgrade(i)) audio.coin();
          else audio.denied();
        }
      }
      if (actions & ACTION_CLICK) handleShopClick();
      if (actions & ACTION_CONFIRM) {
        audio.click();
        nextFront();
      }
      return;
    }
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
  }

  function handleShopClick() {
    // One click on the shop buys a row or takes the next front; anywhere else does nothing.
    const mouse = input.mouse();
    const field = renderer.clientToField(mouse.x, mouse.y);
    const hit = renderer.shopHit(field.x, field.y);
    if (hit.buy >= 0) {
      if (world.buyUpgrade(hit.buy)) audio.coin();
      else audio.denied();
    } else if (hit.next) {
      audio.click();
      nextFront();
    }
  }

  function steer() {
    const keys = input.steer();
    if (keys.x !== 0 || keys.y !== 0) return keys;
    const mouse = input.mouse();
    if (!mouse.held) return { x: 0, y: 0 };
    const field = renderer.clientToField(mouse.x, mouse.y);
    const dx = field.x - world.boat.x;
    const dy = field.y - world.boat.y;
    const len = Math.hypot(dx, dy);
    if (len < 24) return { x: 0, y: 0 };
    return { x: dx / len, y: dy / len };
  }

  function react(events) {
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_DELIVER) audio.bell();
    if (events & EVENT_HIT) {
      audio.thud();
      announce(`Hit. Hull ${world.state.hp}.`);
    }
    if (events & EVENT_LIGHTNING) audio.crack();
    if (events & EVENT_FRONT) {
      screen = SCREEN_SHOP;
      announce(`Front ${world.state.front} cleared. Spend your gold, then move on.`);
    }
    if (events & EVENT_WIN) audio.fanfare();
    if (events & EVENT_OVER) endGame();
  }

  function step() {
    if (screen === SCREEN_TITLE || screen === SCREEN_SHOP) {
      world.step(STEP, { x: 0, y: 0 }, true);
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const events = world.step(STEP, steer(), false);
    const boat = world.boat;
    audio.engine(Math.min(1, Math.hypot(boat.vx, boat.vy) / world.topSpeed()));
    react(events);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY || screen === SCREEN_SHOP) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY || screen === SCREEN_SHOP)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world, screen, best, audio.isMuted());
  }

  // Leaving the tab pauses a running game rather than letting the storm play unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  // The play-test hook: the screen and the world's numbers, nothing the player can use to cheat.
  window.__monsoon = () => ({ screen, muted: audio.isMuted(), ...world.snapshot() });

  announce('Monsoon Rescue. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
