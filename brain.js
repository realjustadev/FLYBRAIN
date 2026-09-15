/* 果蝇突触监测面板
 * 拍一次翅膀 → 突触网络爆亮一次;
 * 撞击死亡 → 立即脑死亡:神经元熄灭、脉冲湮灭、脑电图拉平线。
 * (向 flybody 的果蝇神经力学模型致敬)
 */
(() => {
'use strict';

const cv = document.getElementById('brain');
if (!cv) return;
const ctx = cv.getContext('2d');

// ---------- 状态 ----------
const S = {
  life: 1,        // 1 = 存活,0 = 脑死亡(向目标值渐变)
  target: 1,
  activity: 0.85, // 突触活性 0~1.6
  deadAt: -1,
  t: 0,
};
let neurons = [], edges = [], pulses = [], eeg = [];
let W = 0, H = 0, K = 1; // K:设备像素缩放系数

function rng(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let z = Math.imul(seed ^ seed >>> 15, 1 | seed);
    z = z + Math.imul(z ^ z >>> 7, 61 | z) ^ z;
    return ((z ^ z >>> 14) >>> 0) / 4294967296;
  };
}

// ---------- 布局 ----------
function layout() {
  const dpr = window.devicePixelRatio || 1;
  const r = cv.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return;
  W = Math.round(r.width * dpr);
  H = Math.round(r.height * dpr);
  cv.width = W; cv.height = H;
  K = Math.max(0.75, Math.min(1.5, W / 300));
  build();
}

function build() {
  neurons = []; edges = []; pulses = []; eeg = [];
  const R = rng(20250915);
  const eegH = Math.max(56 * K, H * 0.2);
  const region = {
    x: W * 0.1, y: H * 0.17,
    w: W * 0.8, h: H - H * 0.17 - eegH - 10 * K,
  };
  // 黄金角螺旋布点,天生有机
  const N = 26;
  for (let i = 0; i < N; i++) {
    const rr = Math.sqrt((i + 0.5) / N);
    const th = i * 2.39996 + (R() - 0.5) * 0.7;
    neurons.push({
      x: region.x + region.w / 2 + Math.cos(th) * rr * region.w / 2 * 0.94 + (R() - 0.5) * 8 * K,
      y: region.y + region.h / 2 + Math.sin(th) * rr * region.h / 2 * 0.94 + (R() - 0.5) * 8 * K,
      r: (i % 9 === 0 ? 5.6 : 3.2) * K + R() * 1.2 * K, // 少数 hub 神经元
      e: 0,                                              // 兴奋度 0~1
    });
  }
  // 每个神经元连最近的 2 个,再加几条长程投射
  const seen = new Set();
  const addEdge = (a, b) => {
    if (a === b) return;
    const key = a < b ? a + '_' + b : b + '_' + a;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ a, b });
  };
  for (let i = 0; i < N; i++) {
    const ds = neurons
      .map((n, j) => ({ j, d: (n.x - neurons[i].x) ** 2 + (n.y - neurons[i].y) ** 2 }))
      .sort((p, q) => p.d - q.d);
    addEdge(i, ds[1].j);
    addEdge(i, ds[2].j);
  }
  for (let k = 0; k < 6; k++) {
    addEdge(Math.floor(R() * N), Math.floor(R() * N));
  }
}

// ---------- 对外 API ----------
function ignite(n) {
  for (let k = 0; k < n; k++) {
    const i = Math.floor(Math.random() * neurons.length);
    if (!neurons[i]) return;
    neurons[i].e = 1;
    edges.forEach((e, ei) => {
      if (e.a === i || e.b === i) {
        if (Math.random() < 0.8) {
          pulses.push({
            e: ei,
            dir: e.a === i ? 1 : -1,
            t: 0,
            v: 0.02 + Math.random() * 0.03,
          });
        }
      }
    });
  }
}

window.Brain = {
  flap() {
    if (S.target < 1) return;
    S.activity = Math.min(1.6, S.activity + 0.4);
    ignite(2);
  },
  die() {
    S.target = 0;
    S.deadAt = S.t;
    pulses.length = 0;   // 脉冲当场湮灭
  },
  revive() {
    S.target = 1;
    S.activity = 0.55;
  },
};

// ---------- 更新 ----------
function update(dt) {
  S.t += dt;
  // 死亡快、复苏也要干脆
  S.life += (S.target - S.life) * (S.target < S.life ? 0.25 : 0.14) * dt;
  S.life = Math.max(0, Math.min(1, S.life));

  if (S.target >= 1) {
    S.activity += (0.85 - S.activity) * 0.008 * dt;
    if (Math.random() < 0.012 * S.activity * dt) ignite(1); // 自发放电
  } else {
    S.activity = Math.max(0, S.activity - 0.3 * dt);
  }

  // 脉冲沿突触传导
  for (const p of pulses) p.t += p.v * dt;
  const arrived = pulses.filter(p => p.t >= 1);
  pulses = pulses.filter(p => p.t < 1);
  for (const p of arrived) {
    const e = edges[p.e];
    const at = p.dir > 0 ? e.b : e.a;
    neurons[at].e = 1;
    // 有限连锁传导
    if (Math.random() < 0.5 * S.life * Math.min(S.activity, 1.3)) {
      const cands = [];
      edges.forEach((ee, ei) => {
        if (ei !== p.e && (ee.a === at || ee.b === at)) cands.push(ei);
      });
      if (cands.length) {
        const ei = cands[Math.floor(Math.random() * cands.length)];
        pulses.push({
          e: ei,
          dir: edges[ei].a === at ? 1 : -1,
          t: 0,
          v: 0.02 + Math.random() * 0.025,
        });
      }
    }
  }

  // 兴奋衰减
  for (const n of neurons) n.e *= Math.pow(0.93, dt);

  // 脑电图采样
  const maxPts = Math.max(40, Math.floor(W / (2.2 * K)));
  let v;
  if (S.target >= 1) {
    v = 0.25 + 0.55 * Math.min(S.activity, 1.2) / 1.2 * (0.7 + 0.3 * Math.sin(S.t * 0.35))
      + (Math.random() - 0.5) * 0.18;
  } else {
    const recent = S.t - S.deadAt < 30;
    v = (Math.random() - 0.5) * (recent ? 0.06 : 0.012); // 拉平
  }
  eeg.push(Math.max(0, v * S.life));
  while (eeg.length > maxPts) eeg.shift();
}

// ---------- 绘制 ----------
function draw() {
  ctx.clearRect(0, 0, W, H);
  const mix = S.life; // 1 存活 → 0 死亡

  // 标题行
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = `${11 * K}px "Segoe UI","Microsoft YaHei",sans-serif`;
  ctx.fillStyle = `rgba(127,209,201,${0.35 + 0.45 * mix})`;
  ctx.fillText('突触活性 · SYNAPTIC ACTIVITY', 12 * K, 16 * K);
  ctx.textAlign = 'right';
  if (S.life < 0.5) {
    const blink = S.t - S.deadAt < 150 ? (S.t % 20 < 12 ? 1 : 0.25) : 1;
    ctx.fillStyle = `rgba(226,87,75,${0.95 * blink})`;
    ctx.font = `700 ${12 * K}px "Segoe UI","Microsoft YaHei",sans-serif`;
    ctx.fillText('BRAIN DEAD · 脑死亡', W - 12 * K, 16 * K);
  } else {
    ctx.fillStyle = 'rgba(230,245,255,0.9)';
    ctx.font = `700 ${12 * K}px "Segoe UI",sans-serif`;
    ctx.fillText(Math.round(Math.min(S.activity, 1.2) / 1.2 * 100) + '%', W - 12 * K, 16 * K);
  }
  // 活性条
  const bw = 64 * K;
  ctx.fillStyle = 'rgba(127,209,201,0.12)';
  ctx.fillRect(W - 12 * K - bw, 26 * K, bw, 3.5 * K);
  ctx.fillStyle = S.life < 0.5 ? 'rgba(226,87,75,0.8)' : 'rgba(127,209,201,0.85)';
  ctx.fillRect(W - 12 * K - bw, 26 * K, bw * Math.min(S.activity, 1.2) / 1.2 * mix, 3.5 * K);

  // 突触(边)
  ctx.lineWidth = 1 * K;
  ctx.strokeStyle = `rgba(127,209,201,${0.06 + 0.14 * mix})`;
  ctx.beginPath();
  for (const e of edges) {
    ctx.moveTo(neurons[e.a].x, neurons[e.a].y);
    ctx.lineTo(neurons[e.b].x, neurons[e.b].y);
  }
  ctx.stroke();

  // 神经元(死亡时灰化)
  for (const n of neurons) {
    if (n.e > 0.04 && mix > 0.05) {
      const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 4.5);
      g.addColorStop(0, `rgba(190,255,235,${0.5 * n.e * mix})`);
      g.addColorStop(1, 'rgba(190,255,235,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r * 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
    const cr = Math.round(90 + (127 - 90) * mix);
    const cg = Math.round(95 + (209 - 95) * mix);
    const cb = Math.round(106 + (201 - 106) * mix);
    ctx.fillStyle = `rgba(${cr},${cg},${cb},${0.55 + 0.45 * mix})`;
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // 脉冲(白色信号点)
  ctx.fillStyle = `rgba(240,255,248,${0.9 * mix + 0.05})`;
  for (const p of pulses) {
    const e = edges[p.e];
    const a = neurons[p.dir > 0 ? e.a : e.b];
    const b = neurons[p.dir > 0 ? e.b : e.a];
    const x = a.x + (b.x - a.x) * p.t;
    const y = a.y + (b.y - a.y) * p.t;
    ctx.beginPath();
    ctx.arc(x, y, 2.1 * K, 0, Math.PI * 2);
    ctx.fill();
  }

  // 脑电图
  const eegH = Math.max(56 * K, H * 0.2);
  const y0 = H - 16 * K;
  const amp = (eegH - 26 * K);
  ctx.strokeStyle = 'rgba(127,209,201,0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(10 * K, y0);
  ctx.lineTo(W - 10 * K, y0);
  ctx.stroke();
  if (eeg.length > 1) {
    ctx.strokeStyle = S.life < 0.5 ? 'rgba(226,87,75,0.9)' : 'rgba(127,209,201,0.9)';
    ctx.lineWidth = 1.6 * K;
    ctx.beginPath();
    const step = (W - 20 * K) / (Math.max(40, Math.floor(W / (2.2 * K))) - 1);
    const off = W - 10 * K - (eeg.length - 1) * step;
    eeg.forEach((v, i) => {
      const x = off + i * step;
      const y = y0 - v * amp;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
  ctx.textAlign = 'left';
  ctx.font = `${9.5 * K}px "Segoe UI","Microsoft YaHei",sans-serif`;
  ctx.fillStyle = 'rgba(160,185,215,0.55)';
  ctx.fillText('EEG · 脑电图', 12 * K, H - 30 * K);
}

// ---------- 主循环 ----------
let last = performance.now();
function loop(now) {
  const dt = Math.min((now - last) / 16.667, 3);
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

new ResizeObserver(layout).observe(cv);
layout();
requestAnimationFrame(loop);
})();
