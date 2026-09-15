/* 全球排行榜客户端
 * 后端:Val Town HTTP val(免费),浏览器直接 GET/POST,无需登录。
 * API 为空时自动进入离线模式:成绩只存本地。
 */
(() => {
'use strict';

// Val Town 端点(免费 HTTP val + SQLite);为空 = 离线模式
const API = "https://realjustadev--6567271eb0a911f19f5b1607ee4eb77e.web.val.run";

const $ = id => document.getElementById(id);
const listEl = $('lbList'), statusEl = $('lbStatus');
const bar = $('submitBar'), input = $('nameInput'), btn = $('submitBtn'), msg = $('submitMsg');

const LS = { cache: 'ff_lb_cache', name: 'ff_name' };
const pid = (() => {
  let p = localStorage.getItem('ff_pid');
  if (!p) {
    p = Math.random().toString(36).slice(2, 10);
    localStorage.setItem('ff_pid', p);
  }
  return p;
})();

let currentScore = 0, submitted = false, busy = false;

function localTop() {
  try { return JSON.parse(localStorage.getItem(LS.cache) || '[]'); }
  catch (e) { return []; }
}

function saveLocal(rec) {
  const a = localTop();
  a.push(rec);
  a.sort((x, y) => y.s - x.s);
  localStorage.setItem(LS.cache, JSON.stringify(a.slice(0, 50)));
}

function render(list, note) {
  listEl.innerHTML = '';
  if (!list || !list.length) {
    const li = document.createElement('li');
    li.className = 'lb-empty';
    li.textContent = '暂无记录 · 抢占第一吧';
    listEl.appendChild(li);
  } else {
    list.slice(0, 5).forEach((r, i) => {
      const li = document.createElement('li');
      if (r.pid === pid) li.className = 'me';
      const rank = document.createElement('span');
      rank.className = 'lb-rank';
      rank.textContent = (i + 1) + '.';
      const name = document.createElement('span');
      name.className = 'lb-name';
      name.textContent = r.n;
      const score = document.createElement('span');
      score.className = 'lb-score';
      score.textContent = r.s;
      li.append(rank, name, score);
      listEl.appendChild(li);
    });
  }
  statusEl.textContent = note || '';
}

async function fetchTop() {
  if (!API) { render(localTop().slice(0, 5), '离线模式'); return; }
  try {
    const r = await fetch(API, { cache: 'no-store' });
    render(await r.json(), '● LIVE');
  } catch (e) {
    render(localTop().slice(0, 5), '离线');
  }
}

async function submit() {
  if (busy || submitted) return;
  busy = true; btn.disabled = true;
  msg.textContent = '提交中…';
  msg.className = 'show';

  const name = (input.value || '').trim().slice(0, 8) || '无名蝇';
  localStorage.setItem(LS.name, name);
  saveLocal({ n: name, s: currentScore, t: Date.now(), pid });

  if (API) {
    try {
      const r = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ n: name, s: currentScore }),
      });
      const d = await r.json();
      if (d && Array.isArray(d.top)) {
        render(d.top, '● LIVE');
        const rank = d.top.findIndex(x => x.n === name && x.s === currentScore) + 1;
        msg.textContent = rank ? `已上榜 ✓ 当前第 ${rank} 名` : '已提交 ✓';
      } else {
        msg.textContent = '已提交 ✓';
      }
      submitted = true;
    } catch (e) {
      msg.textContent = '网络不通 · 成绩已存本地';
    }
  } else {
    msg.textContent = '离线模式 · 成绩已存本地';
    submitted = true;
    render(localTop().slice(0, 5), '离线模式');
  }
  busy = false; btn.disabled = false;
}

function show(score) {
  currentScore = score;
  submitted = false;
  input.value = localStorage.getItem(LS.name) || '';
  msg.textContent = ''; msg.className = '';
  btn.disabled = false;
  bar.classList.add('show');
  setTimeout(() => { try { input.focus(); } catch (e) {} }, 400);
}

function hide() {
  bar.classList.remove('show');
  try { input.blur(); } catch (e) {}
}

window.addEventListener('ff:death', e => show(e.detail.score));
window.addEventListener('ff:revive', hide);
btn.addEventListener('click', submit);
input.addEventListener('keydown', e => {
  e.stopPropagation();               // 别让空格/回车漏进游戏
  if (e.key === 'Enter') submit();
});
fetchTop();
})();
