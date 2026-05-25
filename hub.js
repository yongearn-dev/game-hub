/* =============================================
   GAME HUB — Shared Components (ES Module)
   Usage: import { Timer, Leaderboard, Confetti, playSound } from '../shared/hub.js'
   ============================================= */

/* ---- Timer ---- */
export class Timer {
  constructor(elementId) {
    this.el = document.getElementById(elementId);
    this._interval = null;
    this._remaining = 0;
    this._onEnd = null;
    this._onTick = null;
  }

  start(seconds, { onEnd, onTick, warning = 10 } = {}) {
    this.stop();
    this._remaining = seconds;
    this._onEnd = onEnd;
    this._onTick = onTick;
    this._warning = warning;
    this._render();
    this.el?.classList.remove('hidden');

    this._interval = setInterval(() => {
      this._remaining--;
      this._render();
      onTick?.(this._remaining);
      if (this._remaining <= this._warning) this.el?.classList.add('warning');
      if (this._remaining <= 0) {
        this.stop();
        onEnd?.();
      }
    }, 1000);
  }

  stop() {
    clearInterval(this._interval);
    this._interval = null;
    this.el?.classList.remove('warning');
  }

  hide() {
    this.stop();
    this.el?.classList.add('hidden');
  }

  _render() {
    if (!this.el) return;
    const m = Math.floor(this._remaining / 60);
    const s = String(this._remaining % 60).padStart(2, '0');
    this.el.textContent = m > 0 ? `${m}:${s}` : String(this._remaining);
  }
}

/* ---- Leaderboard ---- */
export class Leaderboard {
  constructor(elementId) {
    this.el = document.getElementById(elementId);
    this.scores = [];  // [{ name, score, color }]
  }

  setTeams(teams) {
    this.scores = teams.map((name, i) => ({
      name,
      score: 0,
      color: ['#f5c542','#3498db','#e94560','#2ecc71','#9b59b6','#e67e22'][i % 6]
    }));
  }

  addScore(teamIndex, points) {
    if (this.scores[teamIndex]) {
      this.scores[teamIndex].score += points;
      this._popAnimation(teamIndex);
    }
  }

  render() {
    if (!this.el) return;
    const sorted = [...this.scores]
      .map((s, i) => ({ ...s, originalIndex: i }))
      .sort((a, b) => b.score - a.score);

    const medals = ['🥇', '🥈', '🥉'];
    this.el.innerHTML = sorted.map((s, rank) => `
      <li style="animation-delay:${rank * 0.08}s">
        <span class="rank-num">${medals[rank] || (rank + 1)}</span>
        <span class="dot" style="background:${s.color}"></span>
        <span>${s.name}</span>
        <span class="team-score">${s.score}</span>
      </li>
    `).join('');
  }

  getCurrentScores() { return [...this.scores]; }

  _popAnimation(index) {
    const chips = document.querySelectorAll('.score-chip');
    if (chips[index]) {
      chips[index].style.animation = 'none';
      chips[index].offsetHeight; // reflow
      chips[index].style.animation = 'score-pop .4s';
      chips[index].querySelector?.('.chip-score')?.classList?.add('active');
    }
  }
}

/* ---- Score Bar (top of screen chips) ---- */
export function renderScoreBar(containerId, scores) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = scores.map((s, i) => `
    <div class="score-chip" id="chip-${i}">
      <span class="dot" style="background:${['#f5c542','#3498db','#e94560','#2ecc71','#9b59b6','#e67e22'][i % 6]}"></span>
      <span>${s.name}</span>
      <span class="chip-score">${s.score}</span>
    </div>
  `).join('');
}

/* ---- Confetti ---- */
export function launchConfetti(container = document.body, count = 60) {
  const colors = ['#f5c542','#e94560','#3498db','#2ecc71','#9b59b6','#e67e22','#fff'];
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.style.cssText = `
      position:fixed;
      top:-10px;
      left:${Math.random() * 100}vw;
      width:${6 + Math.random() * 8}px;
      height:${6 + Math.random() * 8}px;
      background:${colors[Math.floor(Math.random() * colors.length)]};
      border-radius:${Math.random() > 0.5 ? '50%' : '2px'};
      transform:rotate(${Math.random() * 360}deg);
      animation:confetti-fall ${1.5 + Math.random() * 2}s ${Math.random() * 0.5}s forwards;
      z-index:9999;
      pointer-events:none;
    `;
    container.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }
}

/* ---- Sound FX (Web Audio API) ---- */
let _audioCtx = null;
function getCtx() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return _audioCtx;
}

export const playSound = {
  correct() {
    try {
      const ctx = getCtx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.setValueAtTime(523, ctx.currentTime);
      o.frequency.setValueAtTime(784, ctx.currentTime + 0.1);
      g.gain.setValueAtTime(0.3, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      o.start(); o.stop(ctx.currentTime + 0.5);
    } catch(e) {}
  },
  wrong() {
    try {
      const ctx = getCtx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sawtooth';
      o.connect(g); g.connect(ctx.destination);
      o.frequency.setValueAtTime(200, ctx.currentTime);
      o.frequency.setValueAtTime(150, ctx.currentTime + 0.2);
      g.gain.setValueAtTime(0.2, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      o.start(); o.stop(ctx.currentTime + 0.4);
    } catch(e) {}
  },
  tick() {
    try {
      const ctx = getCtx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = 1000;
      g.gain.setValueAtTime(0.1, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
      o.start(); o.stop(ctx.currentTime + 0.05);
    } catch(e) {}
  },
  reveal() {
    try {
      const ctx = getCtx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.connect(g); g.connect(ctx.destination);
      o.frequency.setValueAtTime(300, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.3);
      g.gain.setValueAtTime(0.25, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      o.start(); o.stop(ctx.currentTime + 0.5);
    } catch(e) {}
  },
  fanfare() {
    try {
      const ctx = getCtx();
      [[523,.0],[659,.12],[784,.24],[1047,.36]].forEach(([freq, delay]) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.frequency.value = freq;
        g.gain.setValueAtTime(0, ctx.currentTime + delay);
        g.gain.setValueAtTime(0.25, ctx.currentTime + delay + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.35);
        o.start(ctx.currentTime + delay);
        o.stop(ctx.currentTime + delay + 0.35);
      });
    } catch(e) {}
  }
};

/* ---- Shuffle ---- */
export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
