/* Flappy Fly · 果蝇扑翼
 * 灵感来自 TuragaLab/flybody 的 MuJoCo 果蝇神经力学模型:
 * 拍翅获得升力、穿越沟壑地形、触地即致命(floor_contacts_fatal=True)。
 * 纯原生 Canvas 实现,无任何依赖。
 */
(() => {
'use strict';

// ---------- 常量 ----------
const W = 480, H = 720;          // 逻辑分辨率
const GROUND_H = 80;             // 地面高度
const GROUND_Y = H - GROUND_H;

const CFG = {
  gravity: 0.45,                 // 重力加速度(每帧^2,60fps 基准)
  flapVy: -8.4,                  // 拍翅瞬间的竖直速度
  maxFall: 11,                   // 下落 terminal velocity
  flyX: 140,                     // 苍蝇水平位置
  pipeW: 74,                     // 沟壑墙宽
  gapStart: 184,                 // 初始缺口高度
  gapMin: 134,
  gapShrink: 1.6,                // 每分缩小量
  speedStart: 2.6,
  speedMax: 4.3,
  speedGain: 0.045,              // 每分加速度
  spawnDist: 198,                // 两堵墙的间距
};

const STATES = { READY: 0, PLAY: 1, DYING: 2, DEAD: 3 };
const FONT = '"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif';

// ---------- 画布与 DPR ----------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
function fitCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = Math.round(rect.width  * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  ctx.textBaseline = 'middle';
}
window.addEventListener('resize', fitCanvas);
fitCanvas();

// ---------- 音效(WebAudio 合成,无音频文件) ----------
const Sfx = {
  ctx: null,
  muted: localStorage.getItem('flappyfly_muted') === '1',
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },
  blip(f0, f1, dur, type = 'triangle', vol = 0.12) {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, vol = 0.2) {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource();
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.buffer = buf;
    src.connect(g).connect(this.ctx.destination);
    src.start(t);
  },
  flap()  { this.blip(520, 260, 0.07, 'triangle', 0.10); },
  score() { this.blip(660, 660, 0.06, 'square', 0.06);
            setTimeout(() => this.blip(990, 990, 0.09, 'square', 0.06), 70); },
  hit()   { this.noise(0.22, 0.22); this.blip(160, 55, 0.30, 'sawtooth', 0.16); },
  toggle() {
    this.muted = !this.muted;
    localStorage.setItem('flappyfly_muted', this.muted ? '1' : '0');
  },
};

// ---------- 世界状态 ----------
let state = STATES.READY;
let score = 0;
let best = parseInt(localStorage.getItem('flappyfly_best') || '0', 10);
let newBest = false;
let time = 0;                    // 全局时间(帧)
let shake = 0;                   // 屏幕震动强度
let deadLockUntil = 0;           // 死亡后短暂锁定输入,防误触
let hitCause = '';               // 'pipe' | 'ground'
let flash = null;                // {txt, life}
let speed = CFG.speedStart;

const fly = {
  x: CFG.flyX, y: H * 0.42, vy: 0, angle: 0,
  wingPhase: 0, wingBoost: 0,
  reset() {
    this.y = H * 0.42; this.vy = 0; this.angle = 0;
    this.wingBoost = 0;
  },
};

let pipes = [];                  // {x, gapY, gapH, scored}
let nextSpawn = CFG.spawnDist;   // 距下一堵墙的剩余行程
let groundOff = 0;               // 地面网格滚动偏移
let prevGapY = H * 0.45;

// 背景:尘埃粒子层(视差)与星点
const motes = Array.from({ length: 42 }, () => ({
  x: Math.random() * W, y: Math.random() * H,
  z: 0.25 + Math.random() * 0.75,          // 视差深度
  r: 1 + Math.random() * 2.2,
  a: 0.04 + Math.random() * 0.14,
}));
const stars = Array.from({ length: 70 }, () => ({
  x: Math.random() * W, y: Math.random() * GROUND_Y,
  r: 0.4 + Math.random() * 1.1,
  tw: Math.random() * Math.PI * 2,          // 闪烁相位
}));

// 粒子特效
let parts = [];
function burst(x, y, n, opt = {}) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = (opt.speed || 3) * (0.4 + Math.random() * 0.9);
    parts.push({
      x, y,
      vx: Math.cos(a) * sp + (opt.vx || 0),
      vy: Math.sin(a) * sp + (opt.vy || 0),
      life: 1, decay: 0.02 + Math.random() * 0.03,
      r: (opt.r || 2.5) * (0.6 + Math.random() * 0.8),
      color: opt.color || '255,255,255',
      grav: opt.grav || 0,
    });
  }
}

// ---------- 游戏流程 ----------
function resetRun() {
  pipes = []; parts = [];
  score = 0; newBest = false;
  speed = CFG.speedStart;
  nextSpawn = CFG.spawnDist * 0.9;
  prevGapY = H * 0.45;
  hitCause = '';
  fly.reset();
}

function startPlay() {
  resetRun();
  state = STATES.PLAY;
  document.body.classList.remove('is-dead');
  dispatchEvent(new CustomEvent('ff:revive'));
  if (window.Brain) Brain.revive();
  flap();
}

function flap() {
  fly.vy = CFG.flapVy;
  fly.wingBoost = 1;
  Sfx.ensure(); Sfx.flap();
  if (window.Brain) Brain.flap();
  burst(fly.x - 12, fly.y + 10, 3, { speed: 1.6, r: 2, color: '200,220,255' });
}

function die(cause) {
  if (state !== STATES.PLAY) return;
  state = STATES.DYING;
  hitCause = cause;
  shake = 14;
  Sfx.hit();
  if (window.Brain) Brain.die();          // 撞击 → 立即脑死亡
  document.body.classList.add('is-dead');
  dispatchEvent(new CustomEvent('ff:death', { detail: { score } }));
  burst(fly.x, fly.y, 26, { speed: 4.5, r: 3, color: cause === 'ground' ? '220,120,90' : '140,220,200' });
  if (score > best) { best = score; newBest = true; localStorage.setItem('flappyfly_best', String(best)); }
}

function currentGap() {
  return Math.max(CFG.gapMin, CFG.gapStart - score * CFG.gapShrink);
}

function spawnPipe() {
  const gapH = currentGap();
  const lo = gapH / 2 + 56, hi = GROUND_Y - gapH / 2 - 56;
  // 与上一堵墙的缺口保持可达的跨度
  let gapY = prevGapY + (Math.random() * 2 - 1) * 165;
  gapY = Math.min(hi, Math.max(lo, gapY));
  prevGapY = gapY;
  pipes.push({ x: W + 40, gapY, gapH, scored: false });
}

// ---------- 更新 ----------
function update(dt) {
  time += dt;

  // 视差尘埃
  const scroll = (state === STATES.PLAY || state === STATES.DYING) ? speed : 0.5;
  for (const m of motes) {
    m.x -= scroll * m.z * 0.55 * dt;
    if (m.x < -6) { m.x = W + 6; m.y = Math.random() * H; }
  }
  groundOff = (groundOff + scroll * dt) % 40;

  if (flash) { flash.life -= dt; if (flash.life <= 0) flash = null; }
  if (shake > 0) shake = Math.max(0, shake - 0.9 * dt);

  // 粒子
  for (const p of parts) {
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vy += p.grav * dt;
    p.life -= p.decay * dt;
  }
  parts = parts.filter(p => p.life > 0);

  // 翅膀相位(果蝇 200Hz 扑翼的艺术化版本)
  fly.wingPhase += 1.15 * dt;
  fly.wingBoost *= Math.pow(0.94, dt);

  if (state === STATES.READY) {
    fly.y = H * 0.42 + Math.sin(time * 0.05) * 8;
    fly.angle = Math.sin(time * 0.05 + 1) * 0.08;
    return;
  }

  if (state === STATES.PLAY) {
    speed = Math.min(CFG.speedMax, CFG.speedStart + score * CFG.speedGain);

    fly.vy = Math.min(fly.vy + CFG.gravity * dt, CFG.maxFall);
    fly.y += fly.vy * dt;

    // 姿态:上升抬头、下落俯冲
    const target = fly.vy < 0
      ? Math.max(-0.45, fly.vy * 0.055)
      : Math.min(1.25, fly.vy * 0.05);
    fly.angle += (target - fly.angle) * Math.min(1, 0.16 * dt);

    // 顶部缓冲(不致命)
    if (fly.y < 16) { fly.y = 16; fly.vy = Math.max(fly.vy, 0); }

    // 生成墙体
    nextSpawn -= speed * dt;
    if (nextSpawn <= 0) { spawnPipe(); nextSpawn = CFG.spawnDist; }

    // 移动墙体 + 计分
    for (const p of pipes) {
      p.x -= speed * dt;
      if (!p.scored && p.x + CFG.pipeW < fly.x - 12) {
        p.scored = true;
        score++;
        Sfx.score();
        burst(p.x + CFG.pipeW / 2, p.gapY, 8, { speed: 2.4, r: 2, color: '130,230,210' });
        if (score % 10 === 0) flash = { txt: score + ' ! 速度提升', life: 70 };
      }
    }
    pipes = pipes.filter(p => p.x > -CFG.pipeW - 10);

    // 碰撞检测:身体圆 + 头部圆 对 墙体矩形
    const headOff = 12;
    const hx = fly.x + Math.cos(fly.angle) * headOff;
    const hy = fly.y + Math.sin(fly.angle) * headOff;
    for (const p of pipes) {
      const topH = p.gapY - p.gapH / 2;
      const botY = p.gapY + p.gapH / 2;
      if (circleRect(fly.x, fly.y, 11, p.x, 0, CFG.pipeW, topH) ||
          circleRect(hx, hy, 7,    p.x, 0, CFG.pipeW, topH) ||
          circleRect(fly.x, fly.y, 11, p.x, botY, CFG.pipeW, GROUND_Y - botY) ||
          circleRect(hx, hy, 7,    p.x, botY, CFG.pipeW, GROUND_Y - botY)) {
        die('pipe');
        break;
      }
    }
    // 触地即死 —— floor_contacts_fatal=True
    if (state === STATES.PLAY && fly.y + 11 >= GROUND_Y) {
      fly.y = GROUND_Y - 11;
      die('ground');
    }
    return;
  }

  if (state === STATES.DYING) {
    // 墙体停止,苍蝇翻滚坠地
    fly.vy = Math.min(fly.vy + CFG.gravity * 1.15 * dt, CFG.maxFall);
    fly.y += fly.vy * dt;
    fly.angle += 0.09 * dt;
    if (fly.y + 11 >= GROUND_Y) {
      fly.y = GROUND_Y - 11;
      burst(fly.x, fly.y + 6, 10, { speed: 2.6, r: 2.4, color: '180,160,130' });
      state = STATES.DEAD;
      deadLockUntil = time + 24;
    }
    return;
  }
}

function circleRect(cx, cy, r, rx, ry, rw, rh) {
  const nx = Math.min(rx + rw, Math.max(rx, cx));
  const ny = Math.min(ry + rh, Math.max(ry, cy));
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

// ---------- 绘制 ----------
function draw() {
  // 背景
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#0b1020');
  sky.addColorStop(0.7, '#16223c');
  sky.addColorStop(1, '#1b2a44');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  if (shake > 0) {
    ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  }

  // 星点
  for (const s of stars) {
    ctx.globalAlpha = 0.25 + 0.35 * Math.abs(Math.sin(time * 0.03 + s.tw));
    ctx.fillStyle = '#cfe3ff';
    ctx.fillRect(s.x, s.y, s.r, s.r);
  }
  ctx.globalAlpha = 1;

  // 视差尘埃
  for (const m of motes) {
    ctx.globalAlpha = m.a;
    ctx.fillStyle = '#9fc4e8';
    ctx.beginPath();
    ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 沟壑墙
  for (const p of pipes) drawPipe(p);

  // 地面
  drawGround();

  // 粒子
  for (const p of parts) {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = `rgba(${p.color},1)`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 苍蝇
  drawFly();

  ctx.restore();

  // UI 层(不参与震动)
  drawUI();

  // 暗角
  const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.75);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.34)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
}

// 经典马里奥绿色水管
const PIPE_GREEN = {
  base: '#43b047',     // 主体绿
  light: '#9be564',    // 左侧高光带
  dark: '#1d7a2c',     // 右侧暗带
  outline: '#07341b',  // 深色描边
};

function drawPipe(p) {
  const topH = p.gapY - p.gapH / 2;
  const botY = p.gapY + p.gapH / 2;
  drawPipeSeg(p.x, 0, topH, true);
  drawPipeSeg(p.x, botY, GROUND_Y - botY, false);
}

function drawPipeSeg(x, y, h, isTop) {
  const w = CFG.pipeW, capH = 22, inset = 5;
  if (isTop) {
    // 管身收窄,管口帽檐加宽压在缺口一端
    drawPipeBands(x + inset, y, w - inset * 2, h - capH);
    drawPipeBands(x, y + h - capH, w, capH);
  } else {
    drawPipeBands(x, y, w, capH);
    drawPipeBands(x + inset, y + capH, w - inset * 2, h - capH);
  }
}

// 竖向明暗条纹 + 描边,马里奥水管的经典画法
function drawPipeBands(x, y, w, h) {
  if (h <= 0 || w <= 0) return;
  ctx.fillStyle = PIPE_GREEN.base;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = PIPE_GREEN.light;
  ctx.fillRect(x + 3, y, Math.round(w * 0.24), h);
  ctx.fillStyle = PIPE_GREEN.dark;
  ctx.fillRect(x + w - 3 - Math.round(w * 0.22), y, Math.round(w * 0.22), h);
  ctx.strokeStyle = PIPE_GREEN.outline;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawGround() {
  // 主体
  const g = ctx.createLinearGradient(0, GROUND_Y, 0, H);
  g.addColorStop(0, '#20222c');
  g.addColorStop(1, '#12141c');
  ctx.fillStyle = g;
  ctx.fillRect(0, GROUND_Y, W, GROUND_H);

  // 滚动网格线
  ctx.strokeStyle = 'rgba(127,209,201,0.10)';
  ctx.lineWidth = 1;
  for (let x = -40 + groundOff; x < W + 40; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, GROUND_Y + 6);
    ctx.lineTo(x - 18, H);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y + 22);
  ctx.lineTo(W, GROUND_Y + 22);
  ctx.stroke();

  // 顶部发光边缘
  ctx.fillStyle = 'rgba(127,209,201,0.75)';
  ctx.fillRect(0, GROUND_Y, W, 2.5);
  ctx.fillStyle = 'rgba(127,209,201,0.18)';
  ctx.fillRect(0, GROUND_Y + 2.5, W, 4);
}

function drawFly() {
  ctx.save();
  ctx.translate(fly.x, fly.y);
  ctx.rotate(fly.angle);

  // --- 翅膀(果蝇 200Hz 扑翼的艺术化呈现) ---
  const boost = fly.wingBoost;
  const amp = 0.55 + 0.55 * boost;
  const flapAngle = Math.sin(fly.wingPhase * (5 + 4 * boost)) * amp;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(-1, -5);
    ctx.rotate(side === -1 ? -0.9 - flapAngle * 0.9 : 0.9 + flapAngle * 0.9);
    // 残影
    ctx.fillStyle = 'rgba(215,232,255,0.16)';
    ctx.beginPath();
    ctx.ellipse(-11, 0, 13, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    // 翅膀本体
    ctx.fillStyle = 'rgba(225,240,255,0.42)';
    ctx.strokeStyle = 'rgba(235,245,255,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(-11, 0, 14, 5.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // 翅脉
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.beginPath();
    ctx.moveTo(-22, 0);
    ctx.lineTo(-2, -1);
    ctx.stroke();
    ctx.restore();
  }

  // --- 腿 ---
  ctx.strokeStyle = '#4a3620';
  ctx.lineWidth = 1.6;
  for (const lx of [-4, 3, 9]) {
    ctx.beginPath();
    ctx.moveTo(lx, 7);
    ctx.lineTo(lx - 2, 13);
    ctx.stroke();
  }

  // --- 腹部(带黑纹,果蝇的"虎纹"特征) ---
  const bodyG = ctx.createLinearGradient(0, -10, 0, 10);
  bodyG.addColorStop(0, '#d8a869');
  bodyG.addColorStop(1, '#a9743a');
  ctx.fillStyle = bodyG;
  ctx.beginPath();
  ctx.ellipse(-5, 1, 13.5, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#382716';
  for (const sx of [-13, -8, -3]) {
    ctx.beginPath();
    ctx.ellipse(sx, 1, 1.8, 8, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- 胸部 ---
  const thoG = ctx.createRadialGradient(4, -3, 2, 4, 0, 12);
  thoG.addColorStop(0, '#e3b578');
  thoG.addColorStop(1, '#b5813f');
  ctx.fillStyle = thoG;
  ctx.beginPath();
  ctx.ellipse(5, 0, 9, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // --- 头 + 红色复眼 ---
  ctx.fillStyle = '#c98f4e';
  ctx.beginPath();
  ctx.arc(13, -1, 7, 0, Math.PI * 2);
  ctx.fill();
  for (const ey of [-4.4, 2.4]) {
    const eyeG = ctx.createRadialGradient(15, -3 + ey * 0.4, 1, 14, -1 + ey * 0.5, 5);
    eyeG.addColorStop(0, '#e06a5a');
    eyeG.addColorStop(1, '#8e2318');
    ctx.fillStyle = eyeG;
    ctx.beginPath();
    ctx.arc(15, -1 + ey * 0.55, 4.2, 0, Math.PI * 2);
    ctx.fill();
  }
  // 高光
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  ctx.arc(16.4, -3.4, 1.1, 0, Math.PI * 2);
  ctx.fill();

  // --- 触角 ---
  ctx.strokeStyle = '#4a3620';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(17, -6);
  ctx.quadraticCurveTo(21, -10, 23, -9);
  ctx.stroke();

  ctx.restore();
}

function drawUI() {
  ctx.textAlign = 'center';

  // 分数
  if (state === STATES.PLAY || state === STATES.DYING || state === STATES.DEAD) {
    ctx.font = `700 58px ${FONT}`;
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.fillStyle = '#eef6ff';
    ctx.strokeText(String(score), W / 2, 84);
    ctx.fillText(String(score), W / 2, 84);
  }

  // 里程碑提示
  if (flash) {
    ctx.globalAlpha = Math.min(1, flash.life / 30);
    ctx.font = `700 26px ${FONT}`;
    ctx.fillStyle = '#7fd1c9';
    ctx.fillText(flash.txt, W / 2, 138);
    ctx.globalAlpha = 1;
  }

  // 静音按钮
  drawMuteIcon();

  if (state === STATES.READY) drawReady();
  if (state === STATES.DEAD) drawDead();
}

function drawMuteIcon() {
  const cx = W - 36, cy = 30;
  ctx.save();
  ctx.globalAlpha = 0.75;
  ctx.fillStyle = '#0d1526';
  ctx.beginPath();
  ctx.arc(cx, cy, 17, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(127,209,201,0.5)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = '#cfe3ff';
  ctx.beginPath();
  ctx.moveTo(cx - 7, cy - 3.5);
  ctx.lineTo(cx - 3, cy - 3.5);
  ctx.lineTo(cx + 1.5, cy - 7.5);
  ctx.lineTo(cx + 1.5, cy + 7.5);
  ctx.lineTo(cx - 3, cy + 3.5);
  ctx.lineTo(cx - 7, cy + 3.5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#cfe3ff';
  ctx.lineWidth = 1.8;
  if (Sfx.muted) {
    ctx.beginPath();
    ctx.moveTo(cx + 5, cy - 4); ctx.lineTo(cx + 11, cy + 4);
    ctx.moveTo(cx + 11, cy - 4); ctx.lineTo(cx + 5, cy + 4);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(cx + 3, cy, 5, -0.9, 0.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + 3, cy, 8.5, -0.9, 0.9);
    ctx.stroke();
  }
  ctx.restore();
  muteHit = { x: cx, y: cy, r: 20 };
}
let muteHit = null;

function drawReady() {
  // 标题
  ctx.font = `800 52px ${FONT}`;
  ctx.fillStyle = '#7fd1c9';
  ctx.shadowColor = 'rgba(127,209,201,0.45)';
  ctx.shadowBlur = 24;
  ctx.fillText('FLAPPY FLY', W / 2, 178);
  ctx.shadowBlur = 0;

  ctx.font = `600 30px ${FONT}`;
  ctx.fillStyle = '#e8f1ff';
  ctx.fillText('果 蝇 扑 翼', W / 2, 226);

  // 操作提示(避开 y≈302 的果蝇悬浮位置)
  const bob = Math.sin(time * 0.08) * 3;
  ctx.font = `500 21px ${FONT}`;
  ctx.fillStyle = 'rgba(232,241,255,0.9)';
  ctx.fillText('空格 / 点击 · 拍翅上升', W / 2, 388 + bob);

  // 规则彩蛋
  ctx.font = `400 15px ${FONT}`;
  ctx.fillStyle = 'rgba(160,185,215,0.75)';
  ctx.fillText('穿越绿色水管 · 触地即死', W / 2, 422 + bob);
  ctx.fillStyle = 'rgba(127,209,201,0.55)';
  ctx.font = `400 13px ${FONT}`;
  ctx.fillText('floor_contacts_fatal = True', W / 2, 446 + bob);

  if (best > 0) {
    ctx.font = `600 18px ${FONT}`;
    ctx.fillStyle = '#ffd98a';
    ctx.fillText('最佳 ' + best, W / 2, 486);
  }

  // 底部致意
  ctx.font = `400 13px ${FONT}`;
  ctx.fillStyle = 'rgba(160,185,215,0.6)';
  ctx.fillText('灵感来自 flybody · MuJoCo 果蝇神经力学模型', W / 2, H - 32);
}

function drawDead() {
  const a = Math.min(1, (time - deadLockUntil + 24) / 20);
  ctx.globalAlpha = a;

  // 面板
  const pw = 330, ph = 250, px = (W - pw) / 2, py = 210;
  ctx.fillStyle = 'rgba(9,13,24,0.92)';
  roundRect(px, py, pw, ph, 18);
  ctx.fill();
  ctx.strokeStyle = 'rgba(127,209,201,0.4)';
  ctx.lineWidth = 1.5;
  roundRect(px, py, pw, ph, 18);
  ctx.stroke();

  ctx.font = `700 32px ${FONT}`;
  ctx.fillStyle = '#ff8d7a';
  ctx.fillText('游 戏 结 束', W / 2, py + 46);

  ctx.font = `400 15px ${FONT}`;
  ctx.fillStyle = 'rgba(180,200,225,0.85)';
  ctx.fillText(hitCause === 'ground'
    ? '触地即致命 —— floor_contacts_fatal=True'
    : '一头撞上了绿色水管', W / 2, py + 76);

  ctx.font = `600 24px ${FONT}`;
  ctx.fillStyle = '#eef6ff';
  ctx.fillText(`得分 ${score}`, W / 2, py + 122);
  ctx.font = `500 18px ${FONT}`;
  ctx.fillStyle = '#ffd98a';
  ctx.fillText(`最佳 ${best}`, W / 2, py + 154);

  if (newBest) {
    ctx.font = `700 17px ${FONT}`;
    ctx.fillStyle = '#7fd1c9';
    const t = Math.sin(time * 0.15) * 0.5 + 0.5;
    ctx.globalAlpha = a * (0.65 + 0.35 * t);
    ctx.fillText('★ 新纪录 ★', W / 2, py + 184);
    ctx.globalAlpha = a;
  }

  if (time > deadLockUntil) {
    const bob = Math.sin(time * 0.09) * 2.5;
    ctx.font = `500 19px ${FONT}`;
    ctx.fillStyle = 'rgba(232,241,255,0.92)';
    ctx.fillText('空格 / 点击 · 再飞一次', W / 2, py + ph + 44 + bob);
  }
  ctx.globalAlpha = 1;
}

// ---------- 输入 ----------
function onAction(px, py) {
  // 静音按钮优先
  if (muteHit && px != null) {
    const dx = px - muteHit.x, dy = py - muteHit.y;
    if (dx * dx + dy * dy < muteHit.r * muteHit.r) { Sfx.toggle(); return; }
  }
  Sfx.ensure();
  if (state === STATES.READY) startPlay();
  else if (state === STATES.PLAY) flap();
  else if (state === STATES.DEAD && time > deadLockUntil) startPlay();
}

function canvasPos(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) / rect.width * W,
    y: (e.clientY - rect.top) / rect.height * H,
  };
}

window.addEventListener('keydown', e => {
  // 输入框/按钮聚焦时不抢按键(排行榜留名)
  if (/^(INPUT|BUTTON|TEXTAREA)$/.test(e.target.tagName)) return;
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
    e.preventDefault();
    if (!e.repeat) onAction(null, null);
  } else if (e.code === 'KeyM') {
    Sfx.toggle();
  } else if (e.code === 'KeyR' && (state === STATES.DEAD || state === STATES.PLAY)) {
    startPlay();
  }
});
canvas.addEventListener('pointerdown', e => {
  e.preventDefault();
  const p = canvasPos(e);
  onAction(p.x, p.y);
});
canvas.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('visibilitychange', () => {
  // 切走再回来时避免物理时间跳变
  last = performance.now();
});

// ---------- 主循环 ----------
let last = performance.now();
function loop(now) {
  const dt = Math.min((now - last) / 16.667, 3);
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

})();
