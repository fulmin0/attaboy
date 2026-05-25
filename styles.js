// Attaboy — alternative render styles (pixel art + blueprint).
// Exposes window.AttaboyStyles with sprite tables + custom draw fns.
// game.js dispatches to these when Knobs.renderStyle is 'pixel' or 'blueprint'.

(function () {
  // Pixel sprite bitmaps. # = primary color, + = accent (cockpit/eye), o = secondary, . = empty.
  const SPRITES = {
    player: [
      "....##....",
      "...####...",
      "..##++##..",
      "..######..",
      ".########.",
      "###.##.###",
      "###.##.###",
      "##......##",
      "#........#"
    ],
    thrust: [
      "..##..",
      ".####.",
      "..##..",
      "...#..",
    ],
    grunt: [
      "..####..",
      ".######.",
      "##.##.##",
      "########",
      "##.##.##",
      ".######.",
      "..####..",
    ],
    diver: [
      "########",
      "##.##.##",
      "########",
      ".######.",
      "..####..",
      "...##...",
    ],
    weaver: [
      "##....##",
      "###..###",
      ".######.",
      "..####..",
      ".######.",
      "###..###",
      "##....##",
    ],
    tank: [
      "..######..",
      ".########.",
      "##.####.##",
      "##.####.##",
      "##########",
      ".########.",
      "..######..",
      "...####...",
    ],
    boss: [
      "....########....",
      "..############..",
      ".####++++++####.",
      "###++######++###",
      "##++########++##",
      "##++########++##",
      "###++######++###",
      ".####++++++####.",
      "..############..",
      "....########....",
    ],
    bullet: [
      "##",
      "##",
      "##",
      "++"
    ],
    eBullet: [
      ".##.",
      "####",
      "####",
      ".##.",
    ],
    powerM: [
      "########",
      "#.####.#",
      "#.#++#.#",
      "#.####.#",
      "########",
    ]
  };

  function drawSprite(ctx, sprite, cx, cy, scale, primary, secondary) {
    const h = sprite.length;
    const w = sprite[0].length;
    const ox = cx - (w * scale) / 2;
    const oy = cy - (h * scale) / 2;
    for (let y = 0; y < h; y++) {
      const row = sprite[y];
      for (let x = 0; x < w; x++) {
        const ch = row[x];
        if (ch === '.') continue;
        ctx.fillStyle = ch === '+' ? secondary : primary;
        ctx.fillRect(Math.floor(ox + x * scale), Math.floor(oy + y * scale), scale, scale);
      }
    }
  }

  // ── Pixel-mode renderers ──────────────────────────────────────────────
  const Pixel = {
    drawPlayer(ctx, p, T) {
      const blink = p.invul > 0 && Math.floor(p.invul * 24) % 2 === 0;
      if (blink) return;
      // Thrust
      const flameOn = Math.floor(p.thrust * 0.3) % 2 === 0;
      drawSprite(ctx, SPRITES.thrust, p.x, p.y + 30, 4, T.gold, T.gold);
      if (flameOn) {
        ctx.fillStyle = T.gold;
        ctx.fillRect(Math.floor(p.x - 4), Math.floor(p.y + 28), 8, 4);
      }
      // Body
      drawSprite(ctx, SPRITES.player, p.x, p.y, 5, T.accent, T.gold);
      // Shield
      if (p.shield > 0) {
        ctx.strokeStyle = T.accent2;
        ctx.lineWidth = 3;
        ctx.strokeRect(Math.floor(p.x - 32), Math.floor(p.y - 32), 64, 64);
      }
    },
    drawEnemy(ctx, e, T) {
      const damaged = e.t - e.lastDmgT < 0.07;
      const color = damaged ? '#ffffff' : e.color;
      const scale = e.kind === 'boss' ? 10 : (e.kind === 'tank' ? 5 : 4);
      const sprite = SPRITES[e.kind] || SPRITES.grunt;
      drawSprite(ctx, sprite, e.x, e.y, scale, color, T.gold);

      if (e.kind === 'tank') {
        // HP pips beneath
        for (let i = 0; i < e.maxHp; i++) {
          ctx.fillStyle = i < e.hp ? color : '#444';
          ctx.fillRect(Math.floor(e.x - 10 + i * 6), Math.floor(e.y + e.r + 6), 4, 4);
        }
      }
      if (e.kind === 'boss') {
        const barW = 320, barH = 10;
        ctx.fillStyle = '#000';
        ctx.fillRect(e.x - barW/2, e.y - e.r - 30, barW, barH);
        ctx.fillStyle = T.danger;
        ctx.fillRect(e.x - barW/2, e.y - e.r - 30, barW * (e.hp / e.maxHp), barH);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(e.x - barW/2, e.y - e.r - 30, barW, barH);
      }
    },
    drawBullets(ctx, bullets, eBullets, T) {
      for (const b of bullets) {
        drawSprite(ctx, SPRITES.bullet, b.x, b.y, 3, T.gold, '#ffffff');
      }
      for (const b of eBullets) {
        drawSprite(ctx, SPRITES.eBullet, b.x, b.y, 3, T.danger, T.danger);
      }
    },
    drawPowerup(ctx, p, T) {
      const color = p.kind === 'multi' ? T.gold : p.kind === 'shield' ? T.accent2 : p.kind === 'rapid' ? T.danger : T.accent;
      const blink = p.life < 3 && Math.floor(p.phase) % 2 === 0;
      if (blink) return;
      // Pixel capsule
      ctx.fillStyle = color;
      ctx.fillRect(Math.floor(p.x - 14), Math.floor(p.y - 14), 28, 28);
      ctx.fillStyle = '#000';
      ctx.fillRect(Math.floor(p.x - 11), Math.floor(p.y - 11), 22, 22);
      ctx.fillStyle = color;
      ctx.font = '900 18px "VT323", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.kind === 'multi' ? 'M' : p.kind === 'shield' ? 'S' : p.kind === 'rapid' ? 'R' : '+', p.x, p.y + 1);
    },
    drawParticle(ctx, p, T) {
      const t = p.life / p.maxLife;
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, t);
      const s = Math.max(2, Math.floor(p.size * 1.2));
      if (p.kind === 'ring') {
        ctx.globalAlpha = Math.max(0, t * 0.7);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3;
        ctx.strokeRect(Math.floor(p.x - p.size), Math.floor(p.y - p.size), Math.floor(p.size * 2), Math.floor(p.size * 2));
      } else {
        ctx.fillRect(Math.floor(p.x - s/2), Math.floor(p.y - s/2), s, s);
      }
      ctx.globalAlpha = 1;
    }
  };

  // ── Blueprint-mode renderers ──────────────────────────────────────────
  // Same outlined shapes as neon but no fill, white strokes, with technical labels.
  const Blueprint = {
    drawPlayer(ctx, p, T) {
      const blink = p.invul > 0 && Math.floor(p.invul * 24) % 2 === 0;
      if (blink) return;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.shadowBlur = 0;
      // Same arrowhead shape
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - 26);
      ctx.lineTo(p.x + 10, p.y - 4);
      ctx.lineTo(p.x + 22, p.y + 14);
      ctx.lineTo(p.x + 8, p.y + 12);
      ctx.lineTo(p.x, p.y + 18);
      ctx.lineTo(p.x - 8, p.y + 12);
      ctx.lineTo(p.x - 22, p.y + 14);
      ctx.lineTo(p.x - 10, p.y - 4);
      ctx.closePath();
      ctx.stroke();
      // Construction crosshair
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(p.x - 36, p.y); ctx.lineTo(p.x + 36, p.y);
      ctx.moveTo(p.x, p.y - 36); ctx.lineTo(p.x, p.y + 36);
      ctx.stroke();
      // Label
      ctx.fillStyle = '#ffffff';
      ctx.font = '10px "Orbitron"';
      ctx.textAlign = 'left';
      ctx.fillText('U-01·HERO', p.x + 28, p.y + 4);
      // Shield ring
      if (p.shield > 0) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 32, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    },
    drawEnemy(ctx, e, T) {
      const damaged = e.t - e.lastDmgT < 0.07;
      const color = damaged ? T.danger : '#ffffff';
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6;
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'transparent';

      if (e.kind === 'grunt') {
        ctx.beginPath();
        ctx.moveTo(e.x, e.y - e.r); ctx.lineTo(e.x + e.r, e.y);
        ctx.lineTo(e.x, e.y + e.r); ctx.lineTo(e.x - e.r, e.y);
        ctx.closePath();
        ctx.stroke();
      } else if (e.kind === 'diver') {
        ctx.beginPath();
        ctx.moveTo(e.x - e.r, e.y - e.r * 0.8);
        ctx.lineTo(e.x + e.r, e.y - e.r * 0.8);
        ctx.lineTo(e.x, e.y + e.r);
        ctx.closePath();
        ctx.stroke();
      } else if (e.kind === 'weaver') {
        ctx.beginPath();
        ctx.moveTo(e.x - e.r, e.y - e.r);
        ctx.lineTo(e.x + e.r, e.y + e.r);
        ctx.lineTo(e.x + e.r, e.y - e.r);
        ctx.lineTo(e.x - e.r, e.y + e.r);
        ctx.closePath();
        ctx.stroke();
      } else if (e.kind === 'tank') {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
          const px = e.x + Math.cos(a) * e.r, py = e.y + Math.sin(a) * e.r;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
      } else if (e.kind === 'boss') {
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
          const px = e.x + Math.cos(a) * e.r;
          const py = e.y + Math.sin(a) * e.r * 0.7;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
        // hp bar
        const barW = 320, barH = 6;
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(e.x - barW/2, e.y - e.r - 30, barW, barH);
        ctx.fillStyle = T.danger;
        ctx.fillRect(e.x - barW/2, e.y - e.r - 30, barW * (e.hp / e.maxHp), barH);
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
        ctx.strokeRect(e.x - barW/2, e.y - e.r - 30, barW, barH);
      }
      // measurement tick marks
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(e.x - e.r - 6, e.y); ctx.lineTo(e.x - e.r - 12, e.y);
      ctx.moveTo(e.x + e.r + 6, e.y); ctx.lineTo(e.x + e.r + 12, e.y);
      ctx.stroke();
      // label
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '9px "Orbitron"';
      ctx.textAlign = 'left';
      const tag = ({grunt:'X-A', diver:'X-D', weaver:'X-W', tank:'X-T', boss:'BOSS'})[e.kind] || 'X';
      ctx.fillText(tag, e.x + e.r + 14, e.y + 3);
    },
    drawBullets(ctx, bullets, eBullets, T) {
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
      for (const b of bullets) {
        ctx.beginPath();
        ctx.moveTo(b.x - 4, b.y); ctx.lineTo(b.x + 4, b.y);
        ctx.moveTo(b.x, b.y - 6); ctx.lineTo(b.x, b.y + 6);
        ctx.stroke();
      }
      ctx.strokeStyle = T.danger;
      for (const b of eBullets) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.stroke();
      }
    },
    drawPowerup(ctx, p, T) {
      const color = p.kind === 'multi' ? T.gold : p.kind === 'shield' ? T.accent2 : p.kind === 'rapid' ? T.danger : '#ffffff';
      ctx.strokeStyle = color; ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(p.x - 14, p.y - 14, 28, 28);
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.font = '900 14px "Orbitron"';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(p.kind === 'multi' ? 'M' : p.kind === 'shield' ? 'S' : p.kind === 'rapid' ? 'R' : '+', p.x, p.y + 1);
    },
    drawParticle(ctx, p, T) {
      const t = p.life / p.maxLife;
      ctx.globalAlpha = Math.max(0, t);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.shadowBlur = 0;
      if (p.kind === 'ring') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        // tiny crosses
        ctx.beginPath();
        ctx.moveTo(p.x - 3, p.y); ctx.lineTo(p.x + 3, p.y);
        ctx.moveTo(p.x, p.y - 3); ctx.lineTo(p.x, p.y + 3);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  };

  // ── Wireframe-mode renderers ──────────────────────────────────────────
  // Theme-colored outlines only, no fill, no glow — classic Asteroids feel.
  function wireDraw(drawShape, color) {
    return function (ctx, e, T) {
      const damaged = e.t - e.lastDmgT < 0.07;
      ctx.strokeStyle = damaged ? '#ffffff' : (color === 'auto' ? e.color : color(T, e));
      ctx.lineWidth = 1.8;
      ctx.shadowBlur = 0;
      drawShape(ctx, e, T);
    };
  }
  const Wireframe = {
    drawPlayer(ctx, p, T) {
      const blink = p.invul > 0 && Math.floor(p.invul * 24) % 2 === 0;
      if (blink) return;
      ctx.strokeStyle = T.accent;
      ctx.lineWidth = 2;
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - 26);
      ctx.lineTo(p.x + 10, p.y - 4);
      ctx.lineTo(p.x + 22, p.y + 14);
      ctx.lineTo(p.x + 8, p.y + 12);
      ctx.lineTo(p.x, p.y + 18);
      ctx.lineTo(p.x - 8, p.y + 12);
      ctx.lineTo(p.x - 22, p.y + 14);
      ctx.lineTo(p.x - 10, p.y - 4);
      ctx.closePath();
      ctx.stroke();
      // Cockpit dot
      ctx.fillStyle = T.gold;
      ctx.beginPath();
      ctx.arc(p.x, p.y - 4, 2, 0, Math.PI * 2);
      ctx.fill();
      // Thrust
      const flameLen = 14 + Math.sin(p.thrust) * 4;
      ctx.strokeStyle = T.gold;
      ctx.beginPath();
      ctx.moveTo(p.x - 6, p.y + 18);
      ctx.lineTo(p.x, p.y + 18 + flameLen);
      ctx.lineTo(p.x + 6, p.y + 18);
      ctx.stroke();
      if (p.shield > 0) {
        ctx.strokeStyle = T.accent2;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 30, 0, Math.PI * 2);
        ctx.stroke();
      }
    },
    drawEnemy(ctx, e, T) {
      const damaged = e.t - e.lastDmgT < 0.07;
      ctx.strokeStyle = damaged ? '#ffffff' : e.color;
      ctx.lineWidth = 1.8;
      ctx.shadowBlur = 0;
      if (e.kind === 'grunt') {
        ctx.beginPath();
        ctx.moveTo(e.x, e.y - e.r); ctx.lineTo(e.x + e.r, e.y);
        ctx.lineTo(e.x, e.y + e.r); ctx.lineTo(e.x - e.r, e.y);
        ctx.closePath();
        ctx.stroke();
      } else if (e.kind === 'diver') {
        ctx.beginPath();
        ctx.moveTo(e.x - e.r, e.y - e.r * 0.8);
        ctx.lineTo(e.x + e.r, e.y - e.r * 0.8);
        ctx.lineTo(e.x, e.y + e.r);
        ctx.closePath();
        ctx.stroke();
      } else if (e.kind === 'weaver') {
        ctx.beginPath();
        ctx.moveTo(e.x - e.r, e.y - e.r);
        ctx.lineTo(e.x + e.r, e.y + e.r);
        ctx.lineTo(e.x + e.r, e.y - e.r);
        ctx.lineTo(e.x - e.r, e.y + e.r);
        ctx.closePath();
        ctx.stroke();
      } else if (e.kind === 'tank') {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
          const px = e.x + Math.cos(a) * e.r, py = e.y + Math.sin(a) * e.r;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
        // HP pips
        for (let i = 0; i < e.maxHp; i++) {
          ctx.fillStyle = i < e.hp ? e.color : 'rgba(255,255,255,0.15)';
          ctx.fillRect(e.x - 10 + i * 6, e.y + e.r + 6, 4, 3);
        }
      } else if (e.kind === 'boss') {
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
          const px = e.x + Math.cos(a) * e.r;
          const py = e.y + Math.sin(a) * e.r * 0.7;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
        // Inner eye
        ctx.strokeStyle = T.gold;
        ctx.beginPath();
        ctx.arc(e.x, e.y, 22 + Math.sin(e.t * 4) * 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = T.danger;
        ctx.beginPath();
        ctx.arc(e.x, e.y, 4, 0, Math.PI * 2);
        ctx.fill();
        // HP bar
        const barW = 320, barH = 6;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(e.x - barW/2, e.y - e.r - 30, barW, barH);
        ctx.fillStyle = T.danger;
        ctx.fillRect(e.x - barW/2, e.y - e.r - 30, barW * (e.hp / e.maxHp), barH);
        ctx.strokeStyle = T.danger; ctx.lineWidth = 1;
        ctx.strokeRect(e.x - barW/2, e.y - e.r - 30, barW, barH);
      }
    },
    drawBullets(ctx, bullets, eBullets, T) {
      ctx.shadowBlur = 0;
      ctx.strokeStyle = T.gold;
      ctx.lineWidth = 2;
      for (const b of bullets) {
        ctx.beginPath();
        ctx.moveTo(b.x, b.y - 8); ctx.lineTo(b.x, b.y + 4);
        ctx.stroke();
      }
      ctx.strokeStyle = T.danger;
      for (const b of eBullets) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.stroke();
      }
    },
    drawPowerup(ctx, p, T) {
      const color = p.kind === 'multi' ? T.gold : p.kind === 'shield' ? T.accent2 : p.kind === 'rapid' ? T.danger : T.accent;
      ctx.strokeStyle = color; ctx.lineWidth = 1.8;
      ctx.shadowBlur = 0;
      const r = 14;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + p.phase * 0.3;
        const px = p.x + Math.cos(a) * r, py = p.y + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.font = '900 14px "Orbitron"';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(p.kind === 'multi' ? 'M' : p.kind === 'shield' ? 'S' : p.kind === 'rapid' ? 'R' : '+', p.x, p.y + 1);
    },
    drawParticle(ctx, p, T) {
      const t = p.life / p.maxLife;
      ctx.globalAlpha = Math.max(0, t);
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 1.5;
      ctx.shadowBlur = 0;
      if (p.kind === 'ring') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        const a = Math.atan2(p.vy, p.vx);
        const len = p.size * 2.2;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - Math.cos(a) * len, p.y - Math.sin(a) * len);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  };

  window.AttaboyStyles = { Pixel, Blueprint, Wireframe };
})();
