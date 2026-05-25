// Tiny Web Audio retro SFX module — no assets needed.
// Exposes window.SFX with named effect methods.
(function () {
  let ctx = null;
  let master = null;
  let muted = false;

  function ensure() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  }

  function resume() {
    ensure();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  function tone({ type = 'square', freq = 440, freqEnd = null, dur = 0.12, vol = 0.3, attack = 0.005, release = 0.06, detune = 0 }) {
    if (muted || !ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), t + dur);
    osc.detune.value = detune;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.linearRampToValueAtTime(vol * 0.7, t + dur);
    g.gain.linearRampToValueAtTime(0, t + dur + release);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + dur + release + 0.02);
  }

  // Filtered noise burst (for explosions / hits)
  function noise({ dur = 0.2, vol = 0.4, freq = 800, q = 2, type = 'bandpass', sweepTo = null }) {
    if (muted || !ctx) return;
    const t = ctx.currentTime;
    const bufSize = Math.ceil(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.setValueAtTime(freq, t);
    if (sweepTo !== null) filt.frequency.exponentialRampToValueAtTime(Math.max(60, sweepTo), t + dur);
    filt.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt).connect(g).connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  const SFX = {
    init() { ensure(); },
    resume,
    setMuted(m) { muted = !!m; },
    setVolume(v) { ensure(); if (master) master.gain.value = Math.max(0, Math.min(1, v)); },

    shoot() {
      tone({ type: 'square', freq: 1200, freqEnd: 420, dur: 0.07, vol: 0.18, release: 0.04 });
      tone({ type: 'triangle', freq: 1800, freqEnd: 700, dur: 0.05, vol: 0.08, release: 0.03 });
    },
    enemyHit() {
      noise({ dur: 0.08, vol: 0.35, freq: 2200, q: 4, sweepTo: 600 });
      tone({ type: 'square', freq: 220, freqEnd: 90, dur: 0.05, vol: 0.12, release: 0.03 });
    },
    explodeSmall() {
      noise({ dur: 0.22, vol: 0.45, freq: 1400, q: 1, sweepTo: 120 });
      tone({ type: 'sawtooth', freq: 140, freqEnd: 60, dur: 0.18, vol: 0.18, release: 0.08 });
    },
    explodeBig() {
      noise({ dur: 0.55, vol: 0.55, freq: 900, q: 0.7, sweepTo: 80 });
      tone({ type: 'sawtooth', freq: 110, freqEnd: 40, dur: 0.4, vol: 0.25, release: 0.18 });
      setTimeout(() => noise({ dur: 0.3, vol: 0.35, freq: 600, q: 0.7, sweepTo: 60 }), 80);
    },
    playerHit() {
      tone({ type: 'square', freq: 320, freqEnd: 80, dur: 0.32, vol: 0.3, release: 0.12 });
      noise({ dur: 0.35, vol: 0.35, freq: 700, q: 1.5, sweepTo: 100 });
    },
    powerup() {
      const notes = [440, 660, 880, 1320];
      notes.forEach((f, i) => setTimeout(() => {
        tone({ type: 'triangle', freq: f, dur: 0.09, vol: 0.22, release: 0.05 });
        tone({ type: 'square', freq: f * 2, dur: 0.08, vol: 0.08, release: 0.04 });
      }, i * 55));
    },
    waveStart() {
      [330, 440, 554, 660].forEach((f, i) => setTimeout(() => {
        tone({ type: 'square', freq: f, dur: 0.12, vol: 0.18, release: 0.05 });
      }, i * 90));
    },
    bossAlert() {
      [180, 130, 180, 130, 220].forEach((f, i) => setTimeout(() => {
        tone({ type: 'sawtooth', freq: f, dur: 0.18, vol: 0.28, release: 0.07 });
      }, i * 140));
    },
    gameOver() {
      [660, 523, 415, 330, 247, 196].forEach((f, i) => setTimeout(() => {
        tone({ type: 'square', freq: f, dur: 0.18, vol: 0.22, release: 0.08 });
      }, i * 130));
    },
    attaboy() {
      [880, 1175, 1568].forEach((f, i) => setTimeout(() => {
        tone({ type: 'triangle', freq: f, dur: 0.08, vol: 0.18, release: 0.04 });
      }, i * 50));
    },
    ui() { tone({ type: 'square', freq: 880, dur: 0.04, vol: 0.12, release: 0.02 }); }
  };

  window.SFX = SFX;
})();
