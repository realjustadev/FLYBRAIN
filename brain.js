/* 果蝇全脑突触监测面板 —— 风格移植自 NEUROFLY (github.com/realjustadev/neurogenesis)
 * 解剖学分区的果蝇全脑 3D 点云:9 大脑区、霓虹配色、突触脉冲传导、全息扫描线。
 * 游戏联动:拍一次翅膀 → 全脑爆发;撞击死亡 → 立即脑死亡(灰化、断链、EEG 拉平)。
 */
(() => {
'use strict';

const cv = document.getElementById('brain');
if (!cv) return;
const ctx = cv.getContext('2d');
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
function mulberry(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hexRGB(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/* ---------- 脑区调色板(NEUROFLY 同款) ---------- */
const REGIONS = {
  medulla: { c: '#5ee6ff' }, lobula: { c: '#a78bff' }, proto: { c: '#3dffb0' },
  mb: { c: '#ff7eb6' }, cx: { c: '#ffc247' }, al: { c: '#7cff6b' },
  lh: { c: '#ff9e5e' }, sega: { c: '#ff5e7a' }, vnc: { c: '#00e5c3' },
};
for (const k in REGIONS) REGIONS[k].rgb = hexRGB(REGIONS[k].c);

/* ---------- 状态 ---------- */
const S = {
  life: 1, target: 1,   // 1 = 存活,0 = 脑死亡
  activity: 0.85,       // 突触活性 0~1.6
  deadAt: -1, t: 0,
};
let pts = [], pulses = [], eeg = [], rings = [];
let W = 0, H = 0;
const rot = { y: 0.55, x: 0.14 };
let proj = null;
let sweepT = Math.random() * 8, sweepY = -1;

/* ---------- 构建全脑点云(解剖学分形,移植自 NEUROFLY buildFlyBrain) ---------- */
function buildFlyBrain() {
  const R = mulberry(90210);
  const out = [];
  const add = (x, y, z, r) => out.push({ p: [x, y, z], r, e: 0, cool: 0, edges: [], idx: out.length });
  const J = a => (R() - .5) * a;

  // 原脑(中央脑,双半球)
  for (let i = 0; i < 380; i++) {
    const u = R() * TAU, v = Math.acos(2 * R() - 1);
    const dx = Math.sin(v) * Math.cos(u), dy = Math.cos(v), dz = Math.sin(v) * Math.sin(u);
    const hemi = dx < 0 ? -1 : 1;
    let x = hemi * (0.30 + 0.70 * Math.pow(Math.abs(dx), 0.8));
    const bottom = clamp((-dy - 0.3) / 0.6, 0, 1);
    x *= 1 - 0.5 * bottom;
    const wr = Math.sin(8 * Math.atan2(x, dz) + dy * 4);
    const rr = 1 + 0.03 * wr;
    add(x * 0.34 * rr, 0.06 + dy * 0.30 * rr, dz * 0.40 * rr, 'proto');
  }
  // 视叶(双侧,4 层嵌套曲壳:髓部 ×2 + 小叶复合体 ×2)+ 视柄
  for (let side = -1; side <= 1; side += 2) {
    const cx0 = side * 0.62, cy0 = 0.02, cz0 = -0.06;
    for (let L = 0; L < 4; L++) {
      const aL = 0.16 + L * 0.08, bL = 0.30 + L * 0.05, cL = 0.32 + L * 0.06;
      for (let i = 0; i < 70; i++) {
        const lon = (R() * 2 - 1) * 1.05, lat = (R() * 2 - 1) * 1.05;
        const ox = Math.cos(lat) * Math.cos(lon), oy = Math.sin(lat), oz = Math.cos(lat) * Math.sin(lon);
        const stri = 1 + 0.025 * Math.sin(lon * 38 + L * 2);
        add(cx0 + side * ox * aL * stri, cy0 + oy * bL, cz0 + oz * cL * stri, L < 2 ? 'medulla' : 'lobula');
      }
    }
    for (let i = 0; i < 10; i++) {
      add(side * (0.36 + R() * 0.18), 0.02 + J(0.05), -0.02 + J(0.08), 'medulla');
    }
  }
  // 蘑菇体(双侧:萼 + 柄 + α/β/γ 叶)
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 32; i++) {
      const a = R() * TAU, r2 = Math.sqrt(R()) * 0.085;
      add(side * 0.19 + Math.cos(a) * r2, 0.34 + Math.sin(a) * r2 * 0.8, -0.02 + J(0.07), 'mb');
    }
    for (let i = 0; i < 34; i++) {
      const t = R();
      add(side * (0.185 - 0.045 * t) + J(0.03), 0.30 - t * 0.28 + J(0.03), t * 0.16 + J(0.03), 'mb');
    }
    for (let i = 0; i < 20; i++) {
      const t = R();
      add(side * (0.135 - 0.015 * t) + J(0.025), 0.05 + t * 0.22 + J(0.02), 0.15 - t * 0.04 + J(0.02), 'mb');
    }
    for (let i = 0; i < 20; i++) {
      const t = R();
      add(side * (0.13 - 0.10 * t) + J(0.02), 0.02 + J(0.02), 0.16 - t * 0.02 + J(0.02), 'mb');
    }
    for (let i = 0; i < 20; i++) {
      const t = R();
      add(side * (0.125 - 0.09 * t) + J(0.02), -0.04 + J(0.02), 0.19 - t * 0.02 + J(0.02), 'mb');
    }
  }
  // 中央复合体(椭球体环 + 扇形体 9 列 + 结节)
  for (let i = 0; i < 55; i++) {
    const a = R() * TAU;
    add(Math.cos(a) * 0.13, 0.24 + Math.sin(a) * 0.115, 0.03 + J(0.025), 'cx');
  }
  for (let i = 0; i < 80; i++) {
    const col = (R() * 9) | 0, row = R();
    add(-0.105 + col * 0.0262 + J(0.008), 0.115 + row * 0.05, -0.06 - J(row) * 0.05, 'cx');
  }
  for (let i = 0; i < 18; i++) {
    const s = R() < 0.5 ? -1 : 1;
    add(s * 0.035 + J(0.02), 0.06 + J(0.02), -0.02 + J(0.02), 'cx');
  }
  // 触角叶(双侧,肾小球簇)
  for (let side = -1; side <= 1; side += 2) {
    const ax = side * 0.19, ay = -0.10, az = 0.40;
    for (let g = 0; g < 12; g++) {
      const gx = ax + J(0.16), gy = ay + J(0.15), gz = az + J(0.15);
      for (let i = 0; i < 10; i++) add(gx + J(0.055), gy + J(0.055), gz + J(0.055), 'al');
    }
  }
  // 侧角(双侧)
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 45; i++) {
      const a = R() * TAU, r2 = Math.sqrt(R());
      add(side * 0.30 + Math.cos(a) * r2 * 0.07, 0.08 + Math.sin(a) * r2 * 0.09, 0.24 + J(0.16), 'lh');
    }
  }
  // 食道下神经节
  for (let i = 0; i < 120; i++) {
    const s = R() < 0.5 ? -1 : 1;
    const a = R() * TAU, r2 = Math.sqrt(R());
    add(s * (0.06 + r2 * 0.18), -0.38 + Math.sin(a) * r2 * 0.15, 0.14 + Math.cos(a) * r2 * 0.20, 'sega');
  }
  // 颈连索 + 腹神经索(分节)
  for (let i = 0; i < 35; i++) {
    const t = R();
    add(J(0.07), -0.52 - t * 0.26, 0.05 - t * 0.17, 'vnc');
  }
  for (let seg = 0; seg < 4; seg++) {
    const sy = -0.82 - seg * 0.10, sz = -0.16 - seg * 0.05, s = 1 - seg * 0.16;
    for (let i = 0; i < 29; i++) {
      const a = R() * TAU, r2 = Math.sqrt(R());
      add(Math.cos(a) * r2 * 0.10 * s, sy + Math.sin(a) * r2 * 0.075 * s, sz + J(0.16 * s), 'vnc');
    }
  }
  return out;
}

/* ---------- 突触连线:空间哈希 + 最近邻 ---------- */
function wire(pts) {
  const CELL = 0.17, grid = new Map();
  for (let i = 0; i < pts.length; i++) {
    const k = ((pts[i].p[0] / CELL) | 0) + '_' + ((pts[i].p[1] / CELL) | 0) + '_' + ((pts[i].p[2] / CELL) | 0);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  }
  const R2 = CELL * CELL;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i].p;
    const cx = (p[0] / CELL) | 0, cy = (p[1] / CELL) | 0, cz = (p[2] / CELL) | 0;
    const cand = [];
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      const cell = grid.get((cx + a) + '_' + (cy + b) + '_' + (cz + c));
      if (!cell) continue;
      for (const j of cell) {
        if (j === i) continue;
        const q = pts[j].p;
        const dx = p[0] - q[0], dy = p[1] - q[1], dz = p[2] - q[2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < R2) cand.push([d2, j]);
      }
    }
    cand.sort((a, b) => a[0] - b[0]);
    for (let n = 0; n < Math.min(3, cand.length); n++) {
      const j = cand[n][1];
      if (!pts[i].edges.includes(j)) { pts[i].edges.push(j); pts[j].edges.push(i); }
    }
  }
}

/* ---------- 尺寸 ---------- */
function layout() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const r = cv.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return;
  W = r.width; H = r.height;
  cv.width = Math.max(2, Math.round(W * dpr));
  cv.height = Math.max(2, Math.round(H * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
new ResizeObserver(layout).observe(cv);
layout();
pts = buildFlyBrain();
wire(pts);
proj = new Float32Array(pts.length * 3);

/* ---------- 投影(偏航 + 俯仰 + 透视) ---------- */
function project() {
  const cy = Math.cos(rot.y), sy = Math.sin(rot.y);
  const cx = Math.cos(rot.x), sx = Math.sin(rot.x);
  const s = Math.min(W, H) * 0.30, CX = W / 2, CY = H * 0.40;
  const lift = 0.02;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i].p;
    const ym = p[1] - lift;
    const x1 = p[0] * cy + p[2] * sy, z1 = -p[0] * sy + p[2] * cy;
    const y1 = ym * cx - z1 * sx, z2 = ym * sx + z1 * cx;
    const k = 3.3 / (3.3 + z2);
    proj[i * 3] = CX + x1 * s * k;
    proj[i * 3 + 1] = CY - y1 * s * k;
    proj[i * 3 + 2] = k;
  }
}

/* ---------- 放电与脉冲 ---------- */
function fire(pt) {
  pt.e = Math.max(pt.e, 0.6); pt.cool = 0.14;
  for (let k = 0; k < pt.edges.length; k++) {
    if (Math.random() < 0.7) spawnPulse(pt, pt.edges[k]);
  }
}
function spawnPulse(a, bIdx) {
  if (pulses.length > 420) return;
  pulses.push({ ai: a.idx, b: bIdx, t: 0, sp: 2.2 + Math.random() * 2.4 });
}
function burst(n) {
  for (let k = 0; k < n; k++) {
    fire(pts[(Math.random() * pts.length) | 0]);
  }
}

/* ---------- 对外 API ---------- */
window.Brain = {
  flap() {
    if (S.target < 1) return;
    S.activity = Math.min(1.6, S.activity + 0.4);
    burst(14);
  },
  die() {
    S.target = 0;
    S.deadAt = S.t;
    pulses.length = 0;
    for (const p of pts) p.e = 0;
  },
  revive() {
    S.target = 1;
    S.activity = 0.6;
  },
};

/* ---------- 更新 ---------- */
function update(dt) {
  S.t += dt;
  S.life += (S.target - S.life) * (S.target < S.life ? 0.25 : 0.14) * dt;
  S.life = clamp(S.life, 0, 1);
  if (S.target >= 1) {
    S.activity += (0.85 - S.activity) * 0.008 * dt;
  } else {
    S.activity = Math.max(0, S.activity - 0.3 * dt);
  }

  // 自发放电(由全局活性驱动)
  if (S.life > 0.25) {
    let fireN = dt * 5.5 * S.activity * S.life;
    while (fireN > 0) {
      if (fireN > 1 || Math.random() < fireN) fire(pts[(Math.random() * pts.length) | 0]);
      fireN--;
    }
  }

  // 衰减与点火(兴奋超过阈值 → 沿突触连锁传播)
  const decay = Math.exp(-dt * 1.9);
  for (const pt of pts) {
    pt.e *= decay;
    if (pt.cool > 0) pt.cool -= dt;
    if (pt.e > 1.0 && pt.cool <= 0 && S.life > 0.2) {
      pt.e = 0.25; pt.cool = 0.16;
      const n = pt.edges;
      for (let k = 0; k < n.length && k < 3; k++) {
        if (Math.random() < 0.75) spawnPulse(pt, n[k]);
      }
    }
  }
  // 脉冲传导
  for (let i = pulses.length - 1; i >= 0; i--) {
    const pu = pulses[i];
    pu.t += dt * pu.sp;
    if (pu.t >= 1) {
      const tg = pts[pu.b];
      tg.e = Math.min(2.0, tg.e + 0.6);
      pulses.splice(i, 1);
    }
  }
  if (pulses.length > 420) pulses.splice(0, pulses.length - 420);

  // 自动旋转
  if (S.life > 0.2) rot.y += dt * 0.14;

  // 全息扫描线(每 8 秒扫过一次)
  sweepT = (sweepT + dt) % 8;
  sweepY = -1;
  if (S.life > 0.5 && sweepT < 2) {
    const eegH = Math.max(56, H * 0.2);
    sweepY = (H - eegH) * (sweepT / 2);
    for (let i = 0; i < pts.length; i++) {
      if (Math.abs(proj[i * 3 + 1] - sweepY) < 5) pts[i].e = Math.max(pts[i].e, 0.55);
    }
  }

  // 扩散环衰减
  for (let i = rings.length - 1; i >= 0; i--) {
    const g = rings[i];
    g.r += dt * 200; g.a -= dt * 1.6;
    if (g.a <= 0) rings.splice(i, 1);
  }

  // 脑电图采样
  const maxPts = Math.max(40, Math.floor(W / 2.2));
  let v;
  if (S.target >= 1) {
    v = 0.25 + 0.55 * Math.min(S.activity, 1.2) / 1.2 * (0.7 + 0.3 * Math.sin(S.t * 0.35))
      + (Math.random() - 0.5) * 0.18;
  } else {
    const recent = S.t - S.deadAt < 30;
    v = (Math.random() - 0.5) * (recent ? 0.06 : 0.012);
  }
  eeg.push(Math.max(0, v * S.life));
  while (eeg.length > maxPts) eeg.shift();
}

/* ---------- 绘制 ---------- */
function draw() {
  ctx.clearRect(0, 0, W, H);
  const mix = S.life;
  const GRAY = [122, 128, 136];
  const tint = (c, a) => {
    const r = Math.round(c[0] * mix + GRAY[0] * (1 - mix));
    const g = Math.round(c[1] * mix + GRAY[1] * (1 - mix));
    const b = Math.round(c[2] * mix + GRAY[2] * (1 - mix));
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a.toFixed(3) + ')';
  };

  project();

  // 标题行
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = '11px "Segoe UI","Microsoft YaHei",sans-serif';
  ctx.fillStyle = `rgba(94,230,255,${0.4 + 0.4 * mix})`;
  ctx.fillText('SYNAPTIC ACTIVITY', 12, 16);
  ctx.textAlign = 'right';
  if (S.life < 0.5) {
    const blink = S.t - S.deadAt < 150 ? (S.t % 20 < 12 ? 1 : 0.25) : 1;
    ctx.fillStyle = `rgba(226,87,75,${0.95 * blink})`;
    ctx.font = 'bold 12px "Segoe UI","Microsoft YaHei",sans-serif';
    ctx.fillText('BRAIN DEAD', W - 12, 16);
  } else {
    ctx.fillStyle = 'rgba(230,245,255,0.9)';
    ctx.font = 'bold 12px "Segoe UI",sans-serif';
    ctx.fillText(Math.round(Math.min(S.activity, 1.2) / 1.2 * 100) + '%', W - 12, 16);
  }
  const bw = 64;
  ctx.fillStyle = 'rgba(94,230,255,0.12)';
  ctx.fillRect(W - 12 - bw, 26, bw, 3.5);
  ctx.fillStyle = S.life < 0.5 ? 'rgba(226,87,75,0.8)' : 'rgba(94,230,255,0.85)';
  ctx.fillRect(W - 12 - bw, 26, bw * Math.min(S.activity, 1.2) / 1.2 * mix, 3.5);

  // 扩散环(点击/爆发)
  for (const g of rings) {
    ctx.strokeStyle = `rgba(94,230,255,${g.a * 0.5})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(g.x, g.y, g.r, 0, TAU);
    ctx.stroke();
  }

  // 突触(按脑区着色)
  ctx.lineWidth = 1;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], oa = i * 3;
    const ea = clamp(0.05 + a.e * 0.22, 0, 0.55) * (0.35 + 0.65 * mix);
    if (ea < 0.06) continue;
    const cA = REGIONS[a.r].rgb;
    for (const j of a.edges) {
      if (j < i) continue;
      const b = pts[j], ob = j * 3;
      const e2 = clamp(ea + b.e * 0.22, 0.02, 0.6);
      ctx.strokeStyle = tint(cA, e2 * 0.85);
      ctx.beginPath();
      ctx.moveTo(proj[oa], proj[oa + 1]);
      ctx.lineTo(proj[ob], proj[ob + 1]);
      ctx.stroke();
    }
  }

  // 神经元(加性发光)
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < pts.length; i++) {
    const pt = pts[i], o = i * 3, k = proj[o + 2];
    const c = REGIONS[pt.r].rgb;
    const cr = Math.round(c[0] * mix + GRAY[0] * (1 - mix));
    const cg = Math.round(c[1] * mix + GRAY[1] * (1 - mix));
    const cb = Math.round(c[2] * mix + GRAY[2] * (1 - mix));
    const e = pt.e;
    const br = clamp(0.30 + e * 0.7, 0, 1);
    const r = (1.1 + e * 1.4) * k;
    ctx.fillStyle = `rgba(${cr},${cg},${cb},${(br * (0.35 + 0.65 * mix)).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(proj[o], proj[o + 1], r, 0, TAU);
    ctx.fill();
    if (e > 0.75) {
      ctx.fillStyle = `rgba(${cr},${cg},${cb},${((e - 0.75) * 0.24 * mix).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(proj[o], proj[o + 1], r * 3.2, 0, TAU);
      ctx.fill();
    }
  }
  // 脉冲
  ctx.fillStyle = `rgba(240,255,250,${0.9 * mix + 0.04})`;
  for (const pu of pulses) {
    const oa = pu.ai * 3, ob = pu.b * 3;
    const x = proj[oa] + (proj[ob] - proj[oa]) * pu.t;
    const y = proj[oa + 1] + (proj[ob + 1] - proj[oa + 1]) * pu.t;
    ctx.beginPath();
    ctx.arc(x, y, 1.8, 0, TAU);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';

  // 全息扫描线
  if (sweepY >= 0) {
    ctx.strokeStyle = 'rgba(61,255,176,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(8, sweepY);
    ctx.lineTo(W - 8, sweepY);
    ctx.stroke();
  }

  // 脑电图
  const eegH = Math.max(56, H * 0.2);
  const y0 = H - 16;
  const amp = eegH - 26;
  ctx.strokeStyle = 'rgba(94,230,255,0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(10, y0);
  ctx.lineTo(W - 10, y0);
  ctx.stroke();
  if (eeg.length > 1) {
    ctx.strokeStyle = S.life < 0.5 ? 'rgba(226,87,75,0.9)' : 'rgba(94,230,255,0.9)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    const step = (W - 20) / (Math.max(40, Math.floor(W / 2.2)) - 1);
    const off = W - 10 - (eeg.length - 1) * step;
    eeg.forEach((v, i) => {
      const x = off + i * step;
      const y = y0 - v * amp;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
  ctx.textAlign = 'left';
  ctx.font = '9.5px "Segoe UI","Microsoft YaHei",sans-serif';
  ctx.fillStyle = 'rgba(160,185,215,0.55)';
  ctx.fillText('EEG TRACE', 12, H - 30);
}

/* ---------- 交互:拖拽旋转 + 点击刺激 ---------- */
let dragging = false, lastX = 0, lastY = 0;
cv.addEventListener('pointerdown', e => {
  dragging = true; lastX = e.clientX; lastY = e.clientY;
  const r = cv.getBoundingClientRect();
  rings.push({ x: e.clientX - r.left, y: e.clientY - r.top, r: 6, a: 1 });
  if (S.target >= 1) {
    // 点击位置附近的神经元被激发
    let n = 0;
    for (let i = 0; i < pts.length && n < 40; i++) {
      const o = i * 3;
      const dx = proj[o] - (e.clientX - r.left), dy = proj[o + 1] - (e.clientY - r.top);
      if (dx * dx + dy * dy < 2200) { pts[i].e = 2.2; n++; }
    }
  }
});
window.addEventListener('pointermove', e => {
  if (!dragging) return;
  rot.y += (e.clientX - lastX) * 0.006;
  rot.x = clamp(rot.x + (e.clientY - lastY) * 0.005, -0.9, 0.9);
  lastX = e.clientX; lastY = e.clientY;
});
window.addEventListener('pointerup', () => { dragging = false; });

/* ---------- 主循环 ---------- */
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
