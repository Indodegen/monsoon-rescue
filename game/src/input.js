// Keyboard and pointer input. Held keys give a steering direction (eight ways); one-shot
// presses (start, pause, restart, mute, shop buys) are queued as bit flags and taken once by
// the loop, so a press between two frames is never lost and never counted twice. Holding the
// mouse button steers the boat toward the pointer; the keyboard always wins while held.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_RESTART = 4;
export const ACTION_MUTE = 8;
export const ACTION_BUY1 = 16;
export const ACTION_BUY2 = 32;
export const ACTION_BUY3 = 64;
export const ACTION_BUY4 = 128;
export const ACTION_BUY5 = 256;
export const ACTION_CLICK = 512;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const RESTART = new Set(['KeyR']);
const MUTE = new Set(['KeyM']);
const BUY = new Map([
  ['Digit1', ACTION_BUY1],
  ['Digit2', ACTION_BUY2],
  ['Digit3', ACTION_BUY3],
  ['Digit4', ACTION_BUY4],
  ['Digit5', ACTION_BUY5],
  ['Numpad1', ACTION_BUY1],
  ['Numpad2', ACTION_BUY2],
  ['Numpad3', ACTION_BUY3],
  ['Numpad4', ACTION_BUY4],
  ['Numpad5', ACTION_BUY5],
]);

export function createInput(target) {
  let up = false;
  let down = false;
  let left = false;
  let right = false;
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseHeld = false;

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code)) up = true;
    else if (DOWN.has(event.code)) down = true;
    else if (LEFT.has(event.code)) left = true;
    else if (RIGHT.has(event.code)) right = true;
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (RESTART.has(event.code)) {
      if (!event.repeat) actions |= ACTION_RESTART;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (BUY.has(event.code)) {
      if (!event.repeat) actions |= BUY.get(event.code);
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (UP.has(event.code)) up = false;
    else if (DOWN.has(event.code)) down = false;
    else if (LEFT.has(event.code)) left = false;
    else if (RIGHT.has(event.code)) right = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    up = false;
    down = false;
    left = false;
    right = false;
    mouseHeld = false;
  });
  target.addEventListener('pointerdown', (event) => {
    mouseX = event.clientX;
    mouseY = event.clientY;
    mouseHeld = true;
    actions |= ACTION_CLICK;
  });
  target.addEventListener('pointermove', (event) => {
    mouseX = event.clientX;
    mouseY = event.clientY;
  });
  target.addEventListener('pointerup', () => {
    mouseHeld = false;
  });

  return {
    /** The held steering direction as a unit-ish {x, y} (-1, 0 or 1 each way). */
    steer() {
      const x = (right ? 1 : 0) - (left ? 1 : 0);
      const y = (down ? 1 : 0) - (up ? 1 : 0);
      return { x, y };
    },
    /** Whether the keyboard is steering right now (it beats the mouse). */
    keyboardSteering() {
      return up || down || left || right;
    },
    /** The pointer's last position in client pixels, and whether its button is held. */
    mouse() {
      return { x: mouseX, y: mouseY, held: mouseHeld };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
