// Sound, synthesised only: no audio files. A WebAudio context is created on the first user
// gesture (browsers refuse sound before one) and every effect is an oscillator or a burst of
// filtered noise. M mutes everything. In a headless browser the context still exists; every
// call guards so a missing or suspended context never throws.

export function createAudio() {
  let context = null;
  let master = null;
  let muted = false;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;

  function ensure() {
    if (context !== null) {
      if (context.state === 'suspended') context.resume().catch(() => {});
      return context !== null;
    }
    try {
      const Ctor = window.AudioContext ?? window.webkitAudioContext;
      if (!Ctor) return false;
      context = new Ctor();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(context.destination);
      // The engine hum: a low sawtooth through a low-pass, its pitch and loudness follow speed.
      engineOsc = context.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineFilter = context.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 240;
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      return true;
    } catch {
      context = null;
      return false;
    }
  }

  function tone(freq, dur, type, vol, when = 0, slideTo = null) {
    if (!ensure() || master === null) return;
    const t0 = context.currentTime + when;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noise(dur, vol, filterFreq, when = 0) {
    if (!ensure() || master === null) return;
    const t0 = context.currentTime + when;
    const len = Math.max(1, Math.floor(context.sampleRate * dur));
    const buffer = context.createBuffer(1, len, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = context.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(t0);
  }

  return {
    /** Call on any user gesture: creates (or resumes) the context so later sounds play. */
    unlock() {
      ensure();
    },
    /** 0 (still) to 1 (full speed): the engine hum follows the boat. */
    engine(amount) {
      if (!ensure() || engineOsc === null || engineGain === null) return;
      const target = muted ? 0 : 0.03 + 0.05 * amount;
      engineGain.gain.setTargetAtTime(target, context.currentTime, 0.1);
      engineOsc.frequency.setTargetAtTime(48 + 42 * amount, context.currentTime, 0.1);
    },
    /** Two bright notes when a sailor is pulled aboard. */
    pickup() {
      tone(660, 0.14, 'sine', 0.25);
      tone(990, 0.22, 'sine', 0.22, 0.09);
    },
    /** The dock bell when sailors are delivered. */
    bell() {
      tone(880, 0.5, 'sine', 0.28);
      tone(1318, 0.4, 'sine', 0.12, 0.02);
    },
    /** A coin tick when gold is paid out in the shop. */
    coin() {
      tone(1320, 0.1, 'triangle', 0.2);
      tone(1760, 0.16, 'triangle', 0.16, 0.07);
    },
    /** A dull thud when debris hits the hull. */
    thud() {
      tone(90, 0.25, 'sine', 0.4, 0, 45);
      noise(0.12, 0.25, 500);
    },
    /** The lightning crack: a sharp noise burst, then a low rumble. */
    crack() {
      noise(0.08, 0.5, 6000);
      noise(0.5, 0.2, 220, 0.05);
    },
    /** A short click for menus and the shop. */
    click() {
      tone(520, 0.07, 'square', 0.1);
    },
    /** A denied buzz when a shop purchase cannot be afforded. */
    denied() {
      tone(160, 0.18, 'square', 0.14, 0, 110);
    },
    /** A rising arpeggio when the last front is cleared. */
    fanfare() {
      const notes = [523, 659, 784, 1047];
      for (let i = 0; i < notes.length; i += 1) tone(notes[i], 0.35, 'triangle', 0.25, i * 0.13);
    },
    /** A low falling tone when the rescue fails. */
    fail() {
      tone(220, 0.7, 'sawtooth', 0.2, 0, 110);
    },
    toggleMute() {
      muted = !muted;
      if (master !== null && context !== null) {
        master.gain.setTargetAtTime(muted ? 0 : 0.5, context.currentTime, 0.02);
      }
      return muted;
    },
    isMuted() {
      return muted;
    },
  };
}
