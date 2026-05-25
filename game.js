// ATTABOY — neon vector shooter
// Vanilla JS canvas game.

(() => {
  // ---------- Canvas & constants ----------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;   // 720
  const H = canvas.height;  // 1080

  // ---------- Tweakable knobs (exposed to tweaks panel) ----------
  const Knobs = window.Knobs = /*EDITMODE-BEGIN*/{
    "theme": "cyan",
    "renderStyle": "neon",
    "enemySpeed": 1,
    "bulletSpeed": 1,
    "shakeIntensity": 1,
    "starfieldDensity": 1,
    "godMode": false,
    "muted": false,
    "showFps": false
  }/*EDITMODE-END*/;

  const Themes = {
    cyan:      { bg: "#04050d", accent: "#00f0ff", accent2: "#4afcff", danger: "#ff2a6d", gold: "#ffd84d", enemy: "#ff2a6d", enemyAlt: "#a13bff", boss: "#ff3838" },
    amber:     { bg: "#0c0904", accent: "#ffb000", accent2: "#ffd86b", danger: "#ff4500", gold: "#ffe89e", enemy: "#ff4500", enemyAlt: "#ff7b00", boss: "#ff2222" },
    mint:      { bg: "#04130c", accent: "#00ff9d", accent2: "#7dffc6", danger: "#ff3d7f", gold: "#d4ff3d", enemy: "#ff3d7f", enemyAlt: "#3d8bff", boss: "#ff3838" },
    violet:    { bg: "#0e0418", accent: "#c77dff", accent2: "#e0aaff", danger: "#ff2dd0", gold: "#ffea00", enemy: "#ff2dd0", enemyAlt: "#ff5d8f", boss: "#ff3838" },
    synthwave: { bg: "#0a0420", accent: "#ff37c7", accent2: "#62f7ff", danger: "#ffe500", gold: "#62f7ff", enemy: "#ff37c7", enemyAlt: "#7c4dff", boss: "#ffe500" },
    mono:      { bg: "#020a02", accent: "#33ff66", accent2: "#8aff99", danger: "#aaff66", gold: "#ddffaa", enemy: "#33ff66", enemyAlt: "#66ffaa", boss: "#aaff66" }
  };

  // Style determines HOW we draw — glow, fill, line weight, special effects.
  // Theme determines color. They compose.
  const Styles = {
    neon:      { glow: 1.0, lineW: 1.0, fill: 0.18, scanlines: true,  gridBg: false, bgGradient: true,  stars: true,  pixel: false, blueprint: false },
    wireframe: { glow: 0.0, lineW: 1.5, fill: 0.0,  scanlines: false, gridBg: false, bgGradient: false, stars: true,  pixel: false, blueprint: false },
    pixel:     { glow: 0.0, lineW: 0.0, fill: 1.0,  scanlines: false, gridBg: false, bgGradient: false, stars: true,  pixel: true,  blueprint: false },
    blueprint: { glow: 0.0, lineW: 1.2, fill: 0.0,  scanlines: false, gridBg: true,  bgGradient: false, stars: false, pixel: false, blueprint: true }
  };
  let S = Styles.neon;
  let T = Themes.cyan;

  function applyTheme(name) {
    T = Themes[name] || Themes.cyan;
    const r = document.documentElement;
    r.style.setProperty('--accent', T.accent);
    r.style.setProperty('--accent-2', T.accent2);
    r.style.setProperty('--danger', T.danger);
    r.style.setProperty('--gold', T.gold);
    r.style.setProperty('--bg', T.bg);
    r.style.setProperty('--grid', hexToRgba(T.accent, 0.08));
  }
  function applyStyle(name) {
    S = Styles[name] || Styles.neon;
    document.getElementById('frame').classList.toggle('no-scanlines', !S.scanlines);
    if (S.blueprint || S.pixel || S.glow === 0) buildStars();
  }
  function hexToRgba(hex, a) {
    const h = hex.replace('#','');
    const n = parseInt(h.length === 3 ? h.split('').map(c=>c+c).join('') : h, 16);
    return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`;
  }

  // Listen for tweaks updates from the panel
  window.addEventListener('attaboy:tweak', (e) => {
    Object.assign(Knobs, e.detail);
    if (e.detail.theme) applyTheme(e.detail.theme);
    if (e.detail.renderStyle) applyStyle(e.detail.renderStyle);
    if (e.detail.muted !== undefined && window.SFX) window.SFX.setMuted(e.detail.muted);
    if (e.detail.starfieldDensity !== undefined) buildStars();
  });

  // ---------- Input ----------
  const keys = new Set();
  const keyDownOnce = new Set();
  window.addEventListener('keydown', (e) => {
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' ','Spacebar'].includes(e.key)) e.preventDefault();
    if (!keys.has(e.code)) keyDownOnce.add(e.code);
    keys.add(e.code);
    // Resume audio context on first interaction
    if (window.SFX) window.SFX.resume();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));

  // ---------- Game state ----------
  const State = { TITLE: 'title', WAVE_INTRO: 'wave_intro', PLAYING: 'playing', PAUSED: 'paused', GAMEOVER: 'gameover' };
  let state = State.TITLE;
  let prevState = null;

  if (localStorage.getItem('attaboy:gm') === '1') Knobs.godMode = true;

  const game = {
    score: 0,
    hiScore: parseInt(localStorage.getItem('attaboy:hi') || '0', 10),
    kills: 0,
    wave: 1,
    lives: 3,
    waveTimer: 0,        // time spent in current wave
    waveSpawnQueue: [],  // upcoming enemy spawns for the wave
    spawnTimer: 0,
    waveActive: false,
    shake: 0,
    shakeX: 0, shakeY: 0,
    fps: 0
  };

  // ---------- Entities ----------
  const player = {
    x: W / 2, y: H - 130,
    vx: 0,
    w: 44, h: 56,
    r: 18,                 // hit radius
    cooldown: 0,
    fireRate: 0.18,        // seconds between shots
    invul: 0,
    shield: 0,             // seconds left
    multi: 0,              // seconds left
    rapid: 0,              // seconds left
    thrust: 0,             // visual thrust phase
    alive: true
  };

  const bullets = [];        // {x,y,vx,vy,dmg}
  const enemyBullets = [];
  const enemies = [];        // {kind,x,y,vx,vy,hp,maxHp,r,t,phase,...}
  const particles = [];      // {x,y,vx,vy,life,maxLife,color,size,kind}
  const powerups = [];       // {x,y,vy,kind,life}
  let stars = [];

  // ---------- Stars ----------
  function buildStars() {
    stars = [];
    const layers = [
      { count: 50, speed: 18, size: 1, alpha: 0.35 },
      { count: 30, speed: 45, size: 1.5, alpha: 0.55 },
      { count: 14, speed: 90, size: 2.5, alpha: 0.9 }
    ];
    const mul = Knobs.starfieldDensity;
    layers.forEach(L => {
      const n = Math.round(L.count * mul);
      for (let i = 0; i < n; i++) {
        stars.push({
          x: Math.random() * W,
          y: Math.random() * H,
          speed: L.speed,
          size: L.size,
          alpha: L.alpha
        });
      }
    });
  }
  buildStars();

  // ---------- Enemy archetypes ----------
  // kind: 'grunt' | 'diver' | 'tank' | 'weaver' | 'boss'
  function spawnEnemy(kind, opts = {}) {
    const base = {
      grunt:  { r: 18, hp: 1, score: 100, color: T.enemy,    speed: 95,  fire: 0 },
      diver:  { r: 16, hp: 1, score: 200, color: T.enemyAlt, speed: 130, fire: 0 },
      weaver: { r: 18, hp: 2, score: 250, color: T.enemyAlt, speed: 110, fire: 1.5 },
      tank:   { r: 26, hp: 4, score: 500, color: T.enemy,    speed: 60,  fire: 2.2 },
      boss:   { r: 80, hp: 50, score: 5000, color: T.boss,   speed: 28,  fire: 0.8 }
    }[kind];
    const e = {
      kind, ...base,
      x: opts.x ?? Math.random() * (W - 120) + 60,
      y: opts.y ?? -40,
      vx: opts.vx ?? 0,
      vy: base.speed * Knobs.enemySpeed,
      t: 0,
      phase: Math.random() * Math.PI * 2,
      hp: base.hp,
      maxHp: base.hp,
      fireCd: base.fire ? 1 + Math.random() * 1.5 : 0,
      lastDmgT: -10
    };
    if (kind === 'boss') {
      e.x = W / 2;
      e.y = -120;
      e.targetY = 180;
      e.hp = 40 + game.wave * 6;
      e.maxHp = e.hp;
      e.score = 5000 + game.wave * 500;
    }
    enemies.push(e);
    return e;
  }

  // ---------- Wave planning ----------
  function buildWave(n) {
    const q = [];
    const push = (kind, delay, x, vx) => q.push({ kind, delay, x: x ?? null, vx: vx ?? 0 });

    // Boss every 5 waves
    if (n % 5 === 0) {
      push('boss', 1.0);
      // also spawn a few escorts
      for (let i = 0; i < 4; i++) push('diver', 2 + i * 0.4, 120 + i * 130);
      return q;
    }

    const difficulty = n;
    let t = 0.4;

    // Opener: row of grunts
    const gruntCols = Math.min(7, 4 + Math.floor(difficulty / 2));
    for (let i = 0; i < gruntCols; i++) {
      push('grunt', t, 90 + i * (540 / Math.max(1, gruntCols - 1)));
    }
    t += 1.6;

    // Wave 2+: divers from sides
    if (n >= 2) {
      for (let i = 0; i < 3 + Math.min(4, difficulty); i++) {
        push('diver', t, (i % 2 ? 120 : 600), (i % 2 ? 1 : -1) * 30);
        t += 0.35;
      }
      t += 0.6;
    }
    // Wave 3+: weavers
    if (n >= 3) {
      const wcount = 2 + Math.min(4, Math.floor((difficulty - 1) / 2));
      for (let i = 0; i < wcount; i++) {
        push('weaver', t, 120 + Math.random() * (W - 240));
        t += 0.6;
      }
      t += 0.4;
    }
    // Wave 4+: tank
    if (n >= 4) {
      const tcount = Math.min(3, Math.floor(difficulty / 3));
      for (let i = 0; i < tcount; i++) {
        push('tank', t, 200 + i * 160);
        t += 1.2;
      }
      // some grunt support
      for (let i = 0; i < 3; i++) push('grunt', t + i * 0.25, 100 + i * 200);
      t += 1.5;
    }
    return q;
  }

  function startWave(n) {
    game.wave = n;
    game.waveSpawnQueue = buildWave(n);
    game.spawnTimer = 0;
    game.waveTimer = 0;
    game.waveActive = true;
    // Show toast
    showWaveToast(n);
    if (n % 5 === 0) { window.SFX && window.SFX.bossAlert(); }
    else { window.SFX && window.SFX.waveStart(); }
  }

  // ---------- Screen helpers ----------
  const screens = {
    title: document.getElementById('screen-title'),
    pause: document.getElementById('screen-pause'),
    over:  document.getElementById('screen-over'),
  };
  const hud = document.getElementById('hud');
  const flash = document.getElementById('flash');
  const frame = document.getElementById('frame');
  const ui = {
    score: document.getElementById('ui-score'),
    wave: document.getElementById('ui-wave'),
    lives: document.getElementById('ui-lives'),
    powerups: document.getElementById('ui-powerups'),
    hiTitle: document.getElementById('ui-hiscore-title'),
    finalScore: document.getElementById('ui-final-score'),
    finalWave: document.getElementById('ui-final-wave'),
    finalHi: document.getElementById('ui-final-hi'),
    finalKills: document.getElementById('ui-final-kills'),
    overTitle: document.getElementById('ui-over-title'),
  };

  function showScreen(name) {
    Object.entries(screens).forEach(([k, el]) => el.classList.toggle('hidden', k !== name));
    hud.classList.toggle('hidden', name !== null);
  }
  function hideAllScreens() {
    Object.values(screens).forEach(el => el.classList.add('hidden'));
    hud.classList.remove('hidden');
  }

  function showWaveToast(n) {
    const isBoss = n % 5 === 0;
    const el = document.createElement('div');
    el.className = 'wave-toast' + (isBoss ? ' boss' : '');
    el.innerHTML = `
      <div class="label">${isBoss ? 'WARNING' : 'WAVE'}</div>
      <div class="num">${isBoss ? '!!!' : String(n).padStart(2, '0')}</div>
      <div class="name">${isBoss ? 'BOSS APPROACHING' : (n === 1 ? 'SIGNAL ACQUIRED' : ['INCOMING','SECTOR CLEAR','HOSTILES','SWARM','BREACH','VANGUARD','REINFORCEMENTS','OUTPOST','VOID GATE','RELAY'][(n-1) % 10])}</div>
    `;
    frame.appendChild(el);
    setTimeout(() => el.remove(), 2300);
  }

  function showCallout(text, x, y, color) {
    const el = document.createElement('div');
    el.className = 'attaboy-callout';
    el.textContent = text;
    el.style.left = (x / W * 100) + '%';
    el.style.top = (y / H * 100) + '%';
    if (color) { el.style.color = color; el.style.textShadow = `0 0 8px ${color}, 0 0 24px ${hexToRgba(color, 0.6)}`; }
    frame.appendChild(el);
    setTimeout(() => el.remove(), 1100);
  }

  function flashScreen(color = T.danger, intensity = 0.55) {
    flash.style.background = color;
    flash.style.transition = 'none';
    flash.style.opacity = intensity;
    requestAnimationFrame(() => {
      flash.style.transition = 'opacity 0.28s ease-out';
      flash.style.opacity = '0';
    });
  }

  function shake(amount) {
    game.shake = Math.max(game.shake, amount * Knobs.shakeIntensity);
  }

  // ---------- HUD update ----------
  function renderHud() {
    ui.score.textContent = game.score.toLocaleString();
    ui.wave.textContent = String(game.wave).padStart(2, '0');
    // lives pips
    if (ui.lives.children.length !== Math.max(3, game.lives)) {
      ui.lives.innerHTML = '';
      const total = Math.max(3, game.lives);
      for (let i = 0; i < total; i++) {
        const pip = document.createElement('div');
        pip.className = 'pip';
        ui.lives.appendChild(pip);
      }
    }
    [...ui.lives.children].forEach((pip, i) => {
      pip.classList.toggle('lost', i >= game.lives);
    });

    // Powerups
    const badges = [];
    if (player.multi > 0)  badges.push({ k: 'multi',  txt: 'MULTI · M', p: player.multi / 10 });
    if (player.shield > 0) badges.push({ k: 'shield', txt: 'SHIELD · S', p: player.shield / 8 });
    if (player.rapid > 0)  badges.push({ k: 'rapid',  txt: 'RAPID · R', p: player.rapid / 8 });
    ui.powerups.innerHTML = badges.map(b => `
      <div class="powerup-badge ${b.k}" style="--p:${Math.max(0, Math.min(1, b.p))}">
        ${b.txt} <div class="bar"></div>
      </div>
    `).join('');
  }

  // ---------- Reset ----------
  function resetGame() {
    game.score = 0;
    game.kills = 0;
    game.wave = 1;
    game.lives = 3;
    game.waveActive = false;
    bullets.length = 0;
    enemyBullets.length = 0;
    enemies.length = 0;
    particles.length = 0;
    powerups.length = 0;
    player.x = W / 2;
    player.y = H - 200;
    player.cooldown = 0;
    player.invul = 0;
    player.shield = 0;
    player.multi = 0;
    player.rapid = 0;
    player.alive = true;
  }

  // ---------- Bullet firing ----------
  function tryFire() {
    if (player.cooldown > 0 || !player.alive) return;
    const rate = player.rapid > 0 ? player.fireRate * 0.45 : player.fireRate;
    player.cooldown = rate;
    const spd = 900 * Knobs.bulletSpeed;
    const ox = 0, oy = -22;
    if (player.multi > 0) {
      bullets.push({ x: player.x - 14, y: player.y + oy, vx: -60, vy: -spd, dmg: 1 });
      bullets.push({ x: player.x + ox, y: player.y + oy - 4, vx: 0, vy: -spd, dmg: 1 });
      bullets.push({ x: player.x + 14, y: player.y + oy, vx:  60, vy: -spd, dmg: 1 });
    } else {
      bullets.push({ x: player.x - 8, y: player.y + oy, vx: 0, vy: -spd, dmg: 1 });
      bullets.push({ x: player.x + 8, y: player.y + oy, vx: 0, vy: -spd, dmg: 1 });
    }
    window.SFX && window.SFX.shoot();
    // Muzzle flash particles
    for (let i = 0; i < 4; i++) {
      particles.push({
        x: player.x + (Math.random()-0.5) * 12,
        y: player.y - 18,
        vx: (Math.random()-0.5) * 80,
        vy: -200 - Math.random() * 100,
        life: 0.12, maxLife: 0.12,
        size: 2 + Math.random() * 2,
        color: T.gold,
        kind: 'spark'
      });
    }
  }

  function enemyFire(e, towardsPlayer = true) {
    const spd = 280 + (game.wave * 8);
    let dx, dy;
    if (towardsPlayer) {
      const ddx = player.x - e.x, ddy = player.y - e.y;
      const d = Math.hypot(ddx, ddy) || 1;
      dx = (ddx / d) * spd;
      dy = (ddy / d) * spd;
    } else {
      dx = 0; dy = spd;
    }
    enemyBullets.push({ x: e.x, y: e.y + e.r, vx: dx, vy: dy, r: 5 });
  }

  // ---------- Explosions & particles ----------
  function explode(x, y, color, big = false) {
    const count = big ? 36 : 16;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (big ? 200 : 140) * (0.4 + Math.random() * 0.8);
      particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.5 + Math.random() * 0.5,
        maxLife: 1,
        size: big ? 3 + Math.random() * 3 : 2 + Math.random() * 2,
        color,
        kind: 'shard'
      });
    }
    // Rings
    particles.push({ x, y, life: big ? 0.5 : 0.3, maxLife: big ? 0.5 : 0.3, size: 0, color, kind: 'ring', maxR: big ? 160 : 80 });
    if (big) shake(18); else shake(6);
    if (big) window.SFX && window.SFX.explodeBig();
    else window.SFX && window.SFX.explodeSmall();
  }

  function hitSpark(x, y) {
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 120 + Math.random() * 120;
      particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.18, maxLife: 0.18,
        size: 1.5 + Math.random() * 1.5,
        color: T.gold,
        kind: 'spark'
      });
    }
  }

  // ---------- Powerups ----------
  function maybeDropPowerup(x, y, chance) {
    if (Math.random() > chance) return;
    const kinds = ['multi', 'shield', 'rapid', 'life'];
    const weights = [0.4, 0.3, 0.25, 0.05];
    let r = Math.random(), kind = 'multi';
    for (let i = 0; i < kinds.length; i++) { r -= weights[i]; if (r <= 0) { kind = kinds[i]; break; } }
    powerups.push({ x, y, vy: 110, vx: (Math.random()-0.5) * 40, kind, life: 12, phase: Math.random() * 6.28 });
  }

  function applyPowerup(kind) {
    window.SFX && window.SFX.powerup();
    if (kind === 'multi')  { player.multi = 10; showCallout('MULTI-SHOT', player.x, player.y - 60, T.gold); }
    if (kind === 'shield') { player.shield = 8; showCallout('SHIELD UP', player.x, player.y - 60, T.accent2); }
    if (kind === 'rapid')  { player.rapid = 8; showCallout('RAPID FIRE', player.x, player.y - 60, T.danger); }
    if (kind === 'life')   { game.lives = Math.min(game.lives + 1, 9); showCallout('+1 LIFE', player.x, player.y - 60, T.accent); }
  }

  // ---------- Update ----------
  function update(dt) {
    // ---- Player ----
    if (state === State.PLAYING && player.alive) {
      const accel = 1600, max = 480, friction = 12;
      let inputX = 0;
      if (keys.has('ArrowLeft') || keys.has('KeyA'))  inputX -= 1;
      if (keys.has('ArrowRight') || keys.has('KeyD')) inputX += 1;
      player.vx += inputX * accel * dt;
      if (inputX === 0) player.vx -= player.vx * Math.min(1, friction * dt);
      player.vx = Math.max(-max, Math.min(max, player.vx));
      player.x += player.vx * dt;
      const pad = 28;
      if (player.x < pad)     { player.x = pad; player.vx = 0; }
      if (player.x > W - pad) { player.x = W - pad; player.vx = 0; }
      player.thrust += dt * 30;

      if (keys.has('Space') || keys.has('ArrowUp')) tryFire();
      player.cooldown = Math.max(0, player.cooldown - dt);
      player.invul = Math.max(0, player.invul - dt);
      player.shield = Math.max(0, player.shield - dt);
      player.multi = Math.max(0, player.multi - dt);
      player.rapid = Math.max(0, player.rapid - dt);
    }

    // ---- Bullets ----
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.y < -20 || b.x < -20 || b.x > W + 20) bullets.splice(i, 1);
    }
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
      const b = enemyBullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.y > H + 20 || b.y < -20 || b.x < -20 || b.x > W + 20) enemyBullets.splice(i, 1);
    }

    // ---- Enemies ----
    if (state === State.PLAYING) {
      // Spawning from queue
      game.waveTimer += dt;
      while (game.waveSpawnQueue.length && game.waveSpawnQueue[0].delay <= game.waveTimer) {
        const sp = game.waveSpawnQueue.shift();
        spawnEnemy(sp.kind, { x: sp.x, vx: sp.vx || 0 });
      }

      // If wave queue empty and no enemies left, next wave
      if (game.waveActive && game.waveSpawnQueue.length === 0 && enemies.length === 0) {
        game.waveActive = false;
        // brief delay
        setTimeout(() => {
          if (state === State.PLAYING) startWave(game.wave + 1);
        }, 1200);
      }
    }

    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      e.t += dt;
      // Movement per kind
      if (e.kind === 'grunt') {
        e.y += e.vy * dt;
        e.x += Math.sin(e.t * 1.4 + e.phase) * 30 * dt;
      } else if (e.kind === 'diver') {
        e.y += e.vy * dt * (e.t > 0.5 ? 1.2 : 0.5);
        e.x += e.vx * dt * 60 + Math.sin(e.t * 2.5 + e.phase) * 80 * dt;
      } else if (e.kind === 'weaver') {
        e.y += e.vy * dt * 0.6;
        e.x += Math.sin(e.t * 1.8 + e.phase) * 220 * dt;
      } else if (e.kind === 'tank') {
        e.y += e.vy * dt;
        // slight oscillation
        e.x += Math.sin(e.t * 0.6 + e.phase) * 10 * dt;
      } else if (e.kind === 'boss') {
        if (e.y < e.targetY) {
          e.y += e.vy * dt;
        } else {
          e.x += Math.sin(e.t * 0.4) * 220 * dt;
          // clamp
          if (e.x < 120) e.x = 120;
          if (e.x > W - 120) e.x = W - 120;
        }
      }
      // Edge wrap horizontal padding
      if (e.kind !== 'boss') {
        if (e.x < e.r) { e.x = e.r; }
        if (e.x > W - e.r) { e.x = W - e.r; }
      }

      // Firing
      if (e.fire > 0 && e.y > 50) {
        e.fireCd -= dt;
        if (e.fireCd <= 0) {
          if (e.kind === 'boss') {
            // 3-shot fan
            const base = Math.atan2(player.y - e.y, player.x - e.x);
            [-0.25, 0, 0.25].forEach(off => {
              const a = base + off;
              const spd = 320;
              enemyBullets.push({ x: e.x, y: e.y + e.r, vx: Math.cos(a)*spd, vy: Math.sin(a)*spd, r: 6 });
            });
          } else {
            enemyFire(e, e.kind === 'weaver' || e.kind === 'tank');
          }
          e.fireCd = e.fire + Math.random() * 0.6;
        }
      }

      // Despawn if past bottom
      if (e.y > H + 100 && e.kind !== 'boss') {
        enemies.splice(i, 1);
        continue;
      }

      // Collision with player bullets
      for (let j = bullets.length - 1; j >= 0; j--) {
        const b = bullets[j];
        const dx = b.x - e.x, dy = b.y - e.y;
        if (dx*dx + dy*dy < (e.r + 5) * (e.r + 5)) {
          bullets.splice(j, 1);
          e.hp -= b.dmg;
          e.lastDmgT = e.t;
          hitSpark(b.x, b.y);
          window.SFX && window.SFX.enemyHit();
          if (e.hp <= 0) {
            game.score += e.score;
            game.kills++;
            explode(e.x, e.y, e.kind === 'boss' ? T.boss : e.color, e.kind === 'boss' || e.kind === 'tank');
            if (e.kind === 'boss') {
              flashScreen(T.gold, 0.7);
              shake(30);
              showCallout('BOSS DOWN!', e.x, e.y, T.gold);
            } else if (e.kind === 'tank' || Math.random() < 0.04) {
              showCallout('ATTABOY!', e.x, e.y - 30, T.gold);
              window.SFX && window.SFX.attaboy();
            }
            // chance to drop powerup
            const dropChance = e.kind === 'boss' ? 1.0 : e.kind === 'tank' ? 0.6 : e.kind === 'weaver' ? 0.18 : 0.06;
            maybeDropPowerup(e.x, e.y, dropChance);
            enemies.splice(i, 1);
          }
          break;
        }
      }
    }

    // ---- Player vs enemy bullets / enemies ----
    if (state === State.PLAYING && player.alive && player.invul <= 0 && !Knobs.godMode) {
      // bullets
      for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const b = enemyBullets[i];
        const dx = b.x - player.x, dy = b.y - player.y;
        if (dx*dx + dy*dy < (player.r + b.r) * (player.r + b.r)) {
          enemyBullets.splice(i, 1);
          damagePlayer();
          break;
        }
      }
      // body
      for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        const dx = e.x - player.x, dy = e.y - player.y;
        if (dx*dx + dy*dy < (player.r + e.r) * (player.r + e.r)) {
          // damage enemy too
          e.hp -= 2;
          e.lastDmgT = e.t;
          if (e.hp <= 0) {
            game.score += e.score;
            game.kills++;
            explode(e.x, e.y, e.color, e.kind === 'tank');
            enemies.splice(i, 1);
          }
          damagePlayer();
          break;
        }
      }
    }

    // ---- Powerups ----
    for (let i = powerups.length - 1; i >= 0; i--) {
      const p = powerups[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.phase += dt * 5;
      p.life -= dt;
      if (p.x < 20 || p.x > W - 20) p.vx *= -1;
      if (p.y > H + 30 || p.life <= 0) { powerups.splice(i, 1); continue; }
      const dx = p.x - player.x, dy = p.y - player.y;
      if (dx*dx + dy*dy < (player.r + 16) * (player.r + 16)) {
        applyPowerup(p.kind);
        powerups.splice(i, 1);
      }
    }

    // ---- Particles ----
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      if (p.kind !== 'ring') {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= (1 - dt * 1.5);
        p.vy *= (1 - dt * 1.5);
      } else {
        p.size += (p.maxR / p.maxLife) * dt;
      }
    }

    // ---- Stars ----
    for (const s of stars) {
      s.y += s.speed * dt;
      if (s.y > H) { s.y = -2; s.x = Math.random() * W; }
    }

    // ---- Shake ----
    if (game.shake > 0) {
      game.shakeX = (Math.random() - 0.5) * game.shake;
      game.shakeY = (Math.random() - 0.5) * game.shake;
      game.shake *= (1 - dt * 6);
      if (game.shake < 0.3) { game.shake = 0; game.shakeX = 0; game.shakeY = 0; }
    }
  }

  let _godSeq = [];
  function toggleGodMode() {
    Knobs.godMode = !Knobs.godMode;
    const label = Knobs.godMode ? 'GOD MODE' : 'NORMAL MODE';
    const color = Knobs.godMode ? T.gold : T.dim;
    if (Knobs.godMode) localStorage.setItem('attaboy:gm', '1');
    else localStorage.removeItem('attaboy:gm');
    const el = document.createElement('div');
    el.className = 'attaboy-callout';
    el.textContent = label;
    el.style.left = '50%';
    el.style.top = '50%';
    el.style.zIndex = '45';
    if (color) { el.style.color = color; el.style.textShadow = `0 0 8px ${color}, 0 0 24px ${hexToRgba(color, 0.6)}`; }
    frame.appendChild(el);
    setTimeout(() => el.remove(), 1100);
  }

  function damagePlayer() {
    if (player.shield > 0) {
      player.shield = 0;
      player.invul = 0.6;
      flashScreen(T.accent2, 0.45);
      shake(10);
      window.SFX && window.SFX.enemyHit();
      showCallout('SHIELD BROKEN', player.x, player.y - 60, T.accent2);
      return;
    }
    game.lives--;
    player.invul = 1.6;
    flashScreen(T.danger, 0.6);
    shake(18);
    window.SFX && window.SFX.playerHit();
    explode(player.x, player.y, T.accent, false);
    if (game.lives <= 0) {
      player.alive = false;
      // big death explosion
      setTimeout(() => {
        explode(player.x, player.y, T.accent, true);
        flashScreen(T.danger, 0.7);
        setTimeout(() => endGame(), 700);
      }, 300);
    }
  }

  function endGame() {
    state = State.GAMEOVER;
    if (game.score > game.hiScore) {
      game.hiScore = game.score;
      localStorage.setItem('attaboy:hi', String(game.hiScore));
      ui.overTitle.textContent = 'NEW HI-SCORE';
      ui.overTitle.style.color = T.gold;
      ui.overTitle.style.textShadow = `0 0 12px ${T.gold}, 0 0 32px ${hexToRgba(T.gold, 0.4)}`;
      ui.finalHi.classList.add('new');
    } else {
      ui.overTitle.textContent = 'GAME OVER';
      ui.overTitle.style.color = '';
      ui.overTitle.style.textShadow = '';
      ui.finalHi.classList.remove('new');
    }
    ui.finalScore.textContent = game.score.toLocaleString();
    ui.finalWave.textContent = String(game.wave).padStart(2, '0');
    ui.finalHi.textContent = game.hiScore.toLocaleString();
    ui.finalKills.textContent = String(game.kills);
    showScreen('over');
    window.SFX && window.SFX.gameOver();
  }

  // ---------- Render ----------
  function clearBg() {
    if (S.blueprint) {
      ctx.fillStyle = '#0e2a4a';
      ctx.fillRect(0, 0, W, H);
      // Blueprint grid
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth = 1;
      ctx.shadowBlur = 0;
      const minor = 40;
      ctx.beginPath();
      for (let x = 0; x <= W; x += minor) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); }
      for (let y = 0; y <= H; y += minor) { ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); }
      ctx.stroke();
      // Major grid
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      for (let x = 0; x <= W; x += 200) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); }
      for (let y = 0; y <= H; y += 200) { ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); }
      ctx.stroke();
      // Corner ruler ticks
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = '10px "Orbitron"';
      for (let x = 0; x <= W; x += 200) ctx.fillText(String(x), x + 4, 12);
      return;
    }
    ctx.fillStyle = T.bg;
    ctx.fillRect(0, 0, W, H);
    if (S.bgGradient) {
      const g = ctx.createLinearGradient(0, 0, 0, H * 0.6);
      g.addColorStop(0, hexToRgba(T.enemy, 0.06));
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H * 0.6);
    }
  }

  function drawStars() {
    if (!S.stars) return;
    for (const s of stars) {
      if (S.pixel) {
        // pixel mode: tiny white squares, no aa
        ctx.fillStyle = s.alpha > 0.6 ? '#ffffff' : (s.alpha > 0.4 ? '#aaaaaa' : '#555555');
        ctx.fillRect(Math.floor(s.x), Math.floor(s.y), Math.max(1, Math.floor(s.size)), Math.max(1, Math.floor(s.size)));
      } else {
        ctx.fillStyle = `rgba(255,255,255,${s.alpha})`;
        ctx.fillRect(s.x, s.y, s.size, s.size);
      }
    }
  }

  function neonStroke(color, width = 2, glow = 12) {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(0.5, width * S.lineW);
    ctx.shadowColor = color;
    ctx.shadowBlur = glow * S.glow;
  }
  function neonFill(color, glow = 10) {
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = glow * S.glow;
  }
  function styleFillAlpha(baseAlpha) {
    return Math.max(0, baseAlpha * S.fill / 0.18);
  }
  function noGlow() { ctx.shadowBlur = 0; }

  function drawPlayer() {
    if (!player.alive) return;
    // Style override (pixel / blueprint / wireframe)
    if (S.pixel && window.AttaboyStyles) { window.AttaboyStyles.Pixel.drawPlayer(ctx, player, T); return; }
    if (S.blueprint && window.AttaboyStyles) { window.AttaboyStyles.Blueprint.drawPlayer(ctx, player, T); return; }
    if (S.glow === 0 && window.AttaboyStyles) { window.AttaboyStyles.Wireframe.drawPlayer(ctx, player, T); return; }
    const x = player.x, y = player.y;
    const blink = player.invul > 0 && Math.floor(player.invul * 24) % 2 === 0;
    if (blink) return;

    // Thrust flame
    ctx.save();
    const flameLen = 18 + Math.sin(player.thrust) * 4;
    const flameW = 14;
    neonStroke(T.gold, 2, 16);
    ctx.beginPath();
    ctx.moveTo(x - flameW/2, y + 18);
    ctx.lineTo(x, y + 18 + flameLen);
    ctx.lineTo(x + flameW/2, y + 18);
    ctx.stroke();
    ctx.fillStyle = hexToRgba(T.gold, 0.4);
    ctx.fill();
    ctx.restore();

    // Body — sleek arrowhead
    ctx.save();
    neonStroke(T.accent, 2.5, 16);
    ctx.beginPath();
    ctx.moveTo(x, y - 26);            // nose
    ctx.lineTo(x + 10, y - 4);
    ctx.lineTo(x + 22, y + 14);       // right wing tip
    ctx.lineTo(x + 8, y + 12);
    ctx.lineTo(x, y + 18);
    ctx.lineTo(x - 8, y + 12);
    ctx.lineTo(x - 22, y + 14);       // left wing tip
    ctx.lineTo(x - 10, y - 4);
    ctx.closePath();
    ctx.fillStyle = hexToRgba(T.accent, 0.12);
    ctx.fill();
    ctx.stroke();

    // Cockpit
    neonStroke(T.gold, 1.5, 10);
    ctx.beginPath();
    ctx.moveTo(x, y - 14);
    ctx.lineTo(x + 4, y - 4);
    ctx.lineTo(x - 4, y - 4);
    ctx.closePath();
    ctx.fillStyle = hexToRgba(T.gold, 0.35);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Shield aura
    if (player.shield > 0) {
      ctx.save();
      const r = 30 + Math.sin(performance.now() / 120) * 2;
      const a = 0.3 + 0.2 * (player.shield > 1.5 ? 1 : (player.shield > 0.5 ? 0.7 : (Math.sin(performance.now()/80) + 1) * 0.5));
      neonStroke(T.accent2, 2, 14);
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
      // inner ring
      ctx.globalAlpha = a * 0.5;
      ctx.beginPath();
      ctx.arc(x, y, r - 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    noGlow();
  }

  function drawBullets() {
    if (S.pixel && window.AttaboyStyles) { window.AttaboyStyles.Pixel.drawBullets(ctx, bullets, enemyBullets, T); return; }
    if (S.blueprint && window.AttaboyStyles) { window.AttaboyStyles.Blueprint.drawBullets(ctx, bullets, enemyBullets, T); return; }
    if (S.glow === 0 && window.AttaboyStyles) { window.AttaboyStyles.Wireframe.drawBullets(ctx, bullets, enemyBullets, T); return; }
    ctx.save();
    for (const b of bullets) {
      neonStroke(T.gold, 2, 14);
      ctx.fillStyle = T.gold;
      // glowing slash
      ctx.beginPath();
      ctx.moveTo(b.x, b.y - 12);
      ctx.lineTo(b.x, b.y + 4);
      ctx.stroke();
      // hot core
      neonFill('#fff8c8', 8);
      ctx.fillRect(b.x - 1.5, b.y - 8, 3, 8);
    }
    noGlow();
    for (const b of enemyBullets) {
      neonStroke(T.danger, 2, 12);
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = hexToRgba(T.danger, 0.6);
      ctx.fill();
    }
    noGlow();
    ctx.restore();
  }

  function drawEnemy(e) {
    if (S.pixel && window.AttaboyStyles) { window.AttaboyStyles.Pixel.drawEnemy(ctx, e, T); return; }
    if (S.blueprint && window.AttaboyStyles) { window.AttaboyStyles.Blueprint.drawEnemy(ctx, e, T); return; }
    if (S.glow === 0 && window.AttaboyStyles) { window.AttaboyStyles.Wireframe.drawEnemy(ctx, e, T); return; }
    const x = e.x, y = e.y;
    // hit-flash white tint
    const damaged = e.t - e.lastDmgT < 0.07;
    const color = damaged ? '#ffffff' : e.color;
    ctx.save();
    neonStroke(color, 2.2, 14);
    ctx.fillStyle = hexToRgba(e.color, damaged ? 0.5 : 0.18);

    if (e.kind === 'grunt') {
      // Diamond
      ctx.beginPath();
      ctx.moveTo(x, y - e.r);
      ctx.lineTo(x + e.r, y);
      ctx.lineTo(x, y + e.r);
      ctx.lineTo(x - e.r, y);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      // eye
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill();
    } else if (e.kind === 'diver') {
      // Inverted triangle
      ctx.beginPath();
      ctx.moveTo(x - e.r, y - e.r * 0.8);
      ctx.lineTo(x + e.r, y - e.r * 0.8);
      ctx.lineTo(x, y + e.r);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      // notch
      ctx.beginPath();
      ctx.moveTo(x - 5, y - 6);
      ctx.lineTo(x + 5, y - 6);
      ctx.lineTo(x, y);
      ctx.closePath();
      ctx.strokeStyle = color;
      ctx.stroke();
    } else if (e.kind === 'weaver') {
      // Bowtie
      ctx.beginPath();
      ctx.moveTo(x - e.r, y - e.r);
      ctx.lineTo(x + e.r, y + e.r);
      ctx.lineTo(x + e.r, y - e.r);
      ctx.lineTo(x - e.r, y + e.r);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill();
    } else if (e.kind === 'tank') {
      // Hexagon
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        const px = x + Math.cos(a) * e.r;
        const py = y + Math.sin(a) * e.r;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      // inner hex
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        const px = x + Math.cos(a) * (e.r - 8);
        const py = y + Math.sin(a) * (e.r - 8);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.strokeStyle = color;
      ctx.stroke();
      // HP pips
      const pips = e.maxHp;
      for (let i = 0; i < pips; i++) {
        ctx.fillStyle = i < e.hp ? color : 'rgba(255,255,255,0.15)';
        ctx.fillRect(x - 10 + i * 6, y + e.r + 6, 4, 3);
      }
    } else if (e.kind === 'boss') {
      // Big segmented core
      const r = e.r;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r * 0.7;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      // inner eye
      neonStroke(T.gold, 2, 16);
      ctx.beginPath();
      ctx.arc(x, y, 22 + Math.sin(e.t * 4) * 4, 0, Math.PI * 2);
      ctx.fillStyle = hexToRgba(T.gold, 0.4);
      ctx.fill();
      ctx.stroke();
      // pupil
      ctx.fillStyle = T.bg;
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = T.danger;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
      // wings/tendrils
      neonStroke(color, 2, 12);
      for (let s = -1; s <= 1; s += 2) {
        ctx.beginPath();
        ctx.moveTo(x + s * r * 0.9, y);
        ctx.lineTo(x + s * (r + 30), y - 10);
        ctx.lineTo(x + s * (r + 50), y + 10);
        ctx.lineTo(x + s * r, y + 20);
        ctx.stroke();
      }
      // HP bar
      const barW = 320, barH = 8;
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x - barW/2, y - r - 30, barW, barH);
      ctx.fillStyle = T.danger;
      ctx.fillRect(x - barW/2, y - r - 30, barW * (e.hp / e.maxHp), barH);
      neonStroke(T.danger, 1, 8);
      ctx.strokeRect(x - barW/2, y - r - 30, barW, barH);
    }
    noGlow();
    ctx.restore();
  }

  function drawPowerups() {
    for (const p of powerups) {
      if (S.pixel && window.AttaboyStyles) { window.AttaboyStyles.Pixel.drawPowerup(ctx, p, T); continue; }
      if (S.blueprint && window.AttaboyStyles) { window.AttaboyStyles.Blueprint.drawPowerup(ctx, p, T); continue; }
      if (S.glow === 0 && window.AttaboyStyles) { window.AttaboyStyles.Wireframe.drawPowerup(ctx, p, T); continue; }
      ctx.save();
      const letter = p.kind === 'multi' ? 'M' : p.kind === 'shield' ? 'S' : p.kind === 'rapid' ? 'R' : '+';
      const color = p.kind === 'multi' ? T.gold : p.kind === 'shield' ? T.accent2 : p.kind === 'rapid' ? T.danger : T.accent;
      const blink = p.life < 3 && Math.floor(p.phase) % 2 === 0;
      const alpha = blink ? 0.4 : 1;
      ctx.globalAlpha = alpha;
      neonStroke(color, 2, 14);
      ctx.fillStyle = hexToRgba(color, 0.2);
      const r = 14;
      // hexagonal capsule
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + p.phase * 0.3;
        const px = p.x + Math.cos(a) * r;
        const py = p.y + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      // letter
      ctx.fillStyle = color;
      ctx.shadowColor = color; ctx.shadowBlur = 12;
      ctx.font = '900 16px "Orbitron", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(letter, p.x, p.y + 1);
      ctx.restore();
    }
    noGlow();
  }

  function drawParticles() {
    for (const p of particles) {
      if (S.pixel && window.AttaboyStyles) { window.AttaboyStyles.Pixel.drawParticle(ctx, p, T); continue; }
      if (S.blueprint && window.AttaboyStyles) { window.AttaboyStyles.Blueprint.drawParticle(ctx, p, T); continue; }
      if (S.glow === 0 && window.AttaboyStyles) { window.AttaboyStyles.Wireframe.drawParticle(ctx, p, T); continue; }
      const t = p.life / p.maxLife;
      ctx.save();
      ctx.globalAlpha = Math.max(0, t);
      if (p.kind === 'ring') {
        neonStroke(p.color, 2, 12);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.kind === 'spark') {
        neonFill(p.color, 10);
        ctx.fillRect(p.x - p.size/2, p.y - p.size/2, p.size, p.size);
      } else {
        // shard
        neonStroke(p.color, 2, 10);
        const a = Math.atan2(p.vy, p.vx);
        const len = p.size * 2.2;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - Math.cos(a) * len, p.y - Math.sin(a) * len);
        ctx.stroke();
      }
      ctx.restore();
    }
    noGlow();
  }

  function drawFps() {
    if (!Knobs.showFps) return;
    ctx.save();
    ctx.fillStyle = T.dim || '#5a6680';
    ctx.font = '12px "Orbitron"';
    ctx.fillText(`${Math.round(game.fps)} FPS`, 12, H - 12);
    ctx.restore();
  }

  function render() {
    ctx.setTransform(1, 0, 0, 1, game.shakeX, game.shakeY);
    clearBg();
    drawStars();
    drawParticles();
    drawPowerups();
    enemies.forEach(drawEnemy);
    drawBullets();
    drawPlayer();
    drawFps();
  }

  // ---------- Loop ----------
  let last = performance.now();
  let fpsAccum = 0, fpsFrames = 0;
  function loop(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05; // clamp

    if (state === State.PLAYING) update(dt);
    else {
      // Keep stars and particles animating on menus
      for (const s of stars) { s.y += s.speed * dt; if (s.y > H) { s.y = -2; s.x = Math.random() * W; } }
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt; if (p.life <= 0) { particles.splice(i, 1); continue; }
        if (p.kind !== 'ring') {
          p.x += p.vx * dt; p.y += p.vy * dt;
          p.vx *= (1 - dt * 1.5); p.vy *= (1 - dt * 1.5);
        } else { p.size += (p.maxR / p.maxLife) * dt; }
      }
      if (game.shake > 0) {
        game.shakeX = (Math.random() - 0.5) * game.shake;
        game.shakeY = (Math.random() - 0.5) * game.shake;
        game.shake *= (1 - dt * 6);
      }
    }
    render();
    renderHud();

    fpsAccum += dt; fpsFrames++;
    if (fpsAccum >= 0.5) { game.fps = fpsFrames / fpsAccum; fpsAccum = 0; fpsFrames = 0; }

    requestAnimationFrame(loop);
  }

  // ---------- State transitions ----------
  function goTitle() {
    state = State.TITLE;
    ui.hiTitle.textContent = game.hiScore.toLocaleString();
    showScreen('title');
    enemies.length = 0;
    bullets.length = 0;
    enemyBullets.length = 0;
    powerups.length = 0;
  }
  function startGame() {
    resetGame();
    state = State.PLAYING;
    hideAllScreens();
    startWave(1);
  }
  function pause() {
    if (state !== State.PLAYING) return;
    prevState = state;
    state = State.PAUSED;
    showScreen('pause');
  }
  function resume() {
    if (state !== State.PAUSED) return;
    state = State.PLAYING;
    hideAllScreens();
  }

  // ---------- Wire up UI ----------
  document.querySelector('.logo').addEventListener('touchstart', (e) => {
    e.preventDefault();
    const now = Date.now();
    _godSeq = _godSeq.filter(t => now - t < 2000);
    _godSeq.push(now);
    if (_godSeq.length >= 3) { _godSeq = []; toggleGodMode(); }
  }, { passive: false });

  document.getElementById('btn-start').addEventListener('click', () => { window.SFX && window.SFX.ui(); startGame(); });
  document.getElementById('btn-resume').addEventListener('click', () => { window.SFX && window.SFX.ui(); resume(); });
  document.getElementById('btn-quit').addEventListener('click',   () => { window.SFX && window.SFX.ui(); goTitle(); });
  document.getElementById('btn-retry').addEventListener('click',  () => { window.SFX && window.SFX.ui(); startGame(); });
  document.getElementById('btn-menu').addEventListener('click',   () => { window.SFX && window.SFX.ui(); goTitle(); });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowUp') {
      const now = Date.now();
      _godSeq = _godSeq.filter(t => now - t < 2000);
      _godSeq.push(now);
      if (_godSeq.length >= 3) { _godSeq = []; toggleGodMode(); }
    } else if (!['Space','Enter','KeyP','Escape'].includes(e.code)) {
      _godSeq = [];
    }
    if (state === State.TITLE && (e.code === 'Space' || e.code === 'Enter')) {
      startGame();
    } else if (state === State.GAMEOVER && (e.code === 'Space' || e.code === 'Enter')) {
      startGame();
    } else if (state === State.PLAYING && e.code === 'KeyP') {
      pause();
    } else if (state === State.PAUSED && (e.code === 'KeyP' || e.code === 'Escape')) {
      resume();
    }
  });

  // Expose for tweaks
  window.AttaboyGame = {
    setTheme: applyTheme,
    rebuildStars: buildStars,
    getState: () => state,
    Themes
  };

  // Init theme & start loop
  applyTheme(Knobs.theme);
  applyStyle(Knobs.renderStyle);
  ui.hiTitle.textContent = game.hiScore.toLocaleString();
  requestAnimationFrame(loop);

})();
