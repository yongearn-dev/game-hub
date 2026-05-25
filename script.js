"use strict";
import { Timer, Leaderboard, launchConfetti, playSound, shuffle } from '../shared/hub.js';

/* =====================
   State
===================== */
const state = {
  images: [],        // [{src, answer, dataUrl}]
  queue: [],         // shuffled queue for this game
  currentIdx: 0,
  currentStep: 0,
  totalSteps: 5,
  revealInterval: null,
  autoReveal: false,
  revealed: false,
  scored: false,

  config: {
    revealSpeed: 2000,
    revealSteps: 5,
    teams: 2,
    teamNames: ['隊伍 1', '隊伍 2'],
    maxScore: 10,
    deductPerStep: 1,
    questionsPerRound: 10
  }
};

/* =====================
   DOM refs
===================== */
const screens = {
  setup: document.getElementById('screen-setup'),
  game:  document.getElementById('screen-game'),
  end:   document.getElementById('screen-end')
};

const dom = {
  dropZone:       document.getElementById('drop-zone'),
  fileInput:      document.getElementById('file-input'),
  imageQueue:     document.getElementById('image-queue'),
  imgCount:       document.getElementById('img-count'),
  answerModal:    document.getElementById('answer-modal'),
  modalPreview:   document.getElementById('modal-preview'),
  modalAnswer:    document.getElementById('modal-answer'),
  modalConfirm:   document.getElementById('modal-confirm'),
  modalCancel:    document.getElementById('modal-cancel'),
  startBtn:       document.getElementById('start-btn'),
  teamNameInputs: document.getElementById('team-name-inputs'),

  qCounter:      document.getElementById('q-counter'),
  revealStage:   document.getElementById('reveal-stage'),
  scoreBar:      document.getElementById('score-bar'),
  canvas:        document.getElementById('pixel-canvas'),
  ptsBadge:      document.getElementById('pts-badge'),
  answerOverlay: document.getElementById('answer-overlay'),
  answerDisplay: document.getElementById('answer-display'),
  revealBar:     document.getElementById('reveal-bar'),
  hintBox:       document.getElementById('hint-box'),
  teamBtns:      document.getElementById('team-btns'),
  btnReveal:     document.getElementById('btn-reveal'),
  btnShowAnswer: document.getElementById('btn-show-answer'),
  btnNext:       document.getElementById('btn-next'),

  finalLeaderboard: document.getElementById('final-leaderboard'),
  btnPlayAgain:     document.getElementById('btn-play-again')
};

const TEAM_COLORS = ['#f5c542','#3498db','#e94560','#2ecc71','#9b59b6','#e67e22'];
const ctx = dom.canvas.getContext('2d');
const leaderboard = new Leaderboard('score-bar');

/* =====================
   Setup: Image Upload
===================== */
let pendingImageFile = null;
let pendingEditIndex = null;

dom.dropZone.onclick = () => dom.fileInput.click();
dom.fileInput.onchange = e => handleFiles(e.target.files);
dom.dropZone.ondragover = e => { e.preventDefault(); dom.dropZone.classList.add('drag-over'); };
dom.dropZone.ondragleave = () => dom.dropZone.classList.remove('drag-over');
dom.dropZone.ondrop = e => {
  e.preventDefault();
  dom.dropZone.classList.remove('drag-over');
  handleFiles(e.dataTransfer.files);
};

function handleFiles(files) {
  [...files].forEach(file => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = e => {
      pendingImageFile = { src: e.target.result, answer: '', dataUrl: e.target.result };
      showAnswerModal(e.target.result, null);
    };
    reader.readAsDataURL(file);
  });
}

function showAnswerModal(src, editIndex) {
  pendingEditIndex = editIndex;
  dom.modalPreview.src = src;
  dom.modalAnswer.value = editIndex !== null ? (state.images[editIndex]?.answer || '') : '';
  dom.answerModal.classList.remove('hidden');
  setTimeout(() => dom.modalAnswer.focus(), 100);
}

dom.modalConfirm.onclick = confirmAnswer;
dom.modalAnswer.onkeydown = e => { if (e.key === 'Enter') confirmAnswer(); };
dom.modalCancel.onclick = () => {
  dom.answerModal.classList.add('hidden');
  pendingImageFile = null;
  pendingEditIndex = null;
};

function confirmAnswer() {
  const answer = dom.modalAnswer.value.trim();
  if (!answer) { dom.modalAnswer.style.borderColor = 'var(--accent)'; return; }
  dom.modalAnswer.style.borderColor = '';

  if (pendingEditIndex !== null) {
    state.images[pendingEditIndex].answer = answer;
  } else if (pendingImageFile) {
    state.images.push({ ...pendingImageFile, answer });
  }

  dom.answerModal.classList.add('hidden');
  pendingImageFile = null;
  pendingEditIndex = null;
  renderImageQueue();
  updateStartBtn();
}

function renderImageQueue() {
  dom.imgCount.textContent = `(${state.images.length} 張)`;
  dom.imageQueue.innerHTML = state.images.map((img, i) => `
    <div class="img-thumb" data-index="${i}">
      <img src="${img.dataUrl}" alt="img ${i}"/>
      <div class="img-answer">${img.answer || '未填答案'}</div>
      <div class="img-remove" data-remove="${i}">✕</div>
    </div>
  `).join('');

  dom.imageQueue.querySelectorAll('.img-thumb').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.dataset.remove !== undefined) {
        state.images.splice(+e.target.dataset.remove, 1);
        renderImageQueue(); updateStartBtn();
        return;
      }
      showAnswerModal(state.images[+el.dataset.index].dataUrl, +el.dataset.index);
    });
  });
}

function updateStartBtn() {
  dom.startBtn.disabled = state.images.length === 0;
}

/* =====================
   Setup: Options
===================== */
function initPills(groupId, key) {
  document.getElementById(groupId).querySelectorAll('.option-pill').forEach(p => {
    p.onclick = () => {
      document.getElementById(groupId).querySelectorAll('.option-pill').forEach(x => x.classList.remove('selected'));
      p.classList.add('selected');
      state.config[key] = isNaN(+p.dataset.val) ? p.dataset.val : +p.dataset.val;
    };
  });
}

initPills('speed-options',      'revealSpeed');
initPills('steps-options',      'revealSteps');
initPills('team-count-options', 'teams');
initPills('max-score-options',  'maxScore');
initPills('deduct-options',     'deductPerStep');
initPills('q-options',          'questionsPerRound');

// Rebuild team name inputs when team count changes
document.getElementById('team-count-options').addEventListener('click', e => {
  if (!e.target.classList.contains('option-pill')) return;
  renderTeamNameInputs(+e.target.dataset.val);
});

function renderTeamNameInputs(count) {
  state.config.teams = count;
  dom.teamNameInputs.innerHTML = Array.from({length: count}, (_, i) => `
    <div class="team-input-row">
      <div class="team-color-dot" style="background:${TEAM_COLORS[i]}"></div>
      <input class="team-name-input" type="text" placeholder="隊伍 ${i+1}" value="${state.config.teamNames[i] || `隊伍 ${i+1}`}" data-ti="${i}"/>
    </div>
  `).join('');
  dom.teamNameInputs.querySelectorAll('input').forEach(inp => {
    inp.oninput = () => { state.config.teamNames[+inp.dataset.ti] = inp.value || `隊伍 ${+inp.dataset.ti + 1}`; };
  });
}
renderTeamNameInputs(2);

/* =====================
   Start Game
===================== */
dom.startBtn.onclick = startGame;

function startGame() {
  state.config.totalSteps = state.config.revealSteps;
  const names = [...dom.teamNameInputs.querySelectorAll('input')].map((inp, i) =>
    inp.value.trim() || `隊伍 ${i+1}`
  );
  state.config.teamNames = names;

  leaderboard.setTeams(names);

  state.queue = shuffle([...state.images]);
  if (state.config.questionsPerRound !== 999) {
    state.queue = state.queue.slice(0, state.config.questionsPerRound);
  }
  state.currentIdx = 0;

  showScreen('game');
  loadQuestion();
}

/* =====================
   Game Logic
===================== */
function loadQuestion() {
  if (state.currentIdx >= state.queue.length) { endGame(); return; }

  const q = state.queue[state.currentIdx];
  state.currentStep = 0;
  state.revealed = false;
  state.scored = false;
  state.totalSteps = state.config.revealSteps;

  dom.qCounter.textContent = `第 ${state.currentIdx + 1} / ${state.queue.length} 題`;
  dom.revealStage.textContent = `像素 0/${state.totalSteps}`;
  dom.hintBox.textContent = '';
  dom.answerOverlay.classList.remove('show');
  dom.btnNext.disabled = true;
  dom.ptsBadge.textContent = `+${state.config.maxScore}`;

  // Update score bar
  renderScoreBar();

  // Draw fully pixelated image first
  drawPixelated(q.dataUrl, getPixelSize(0)).then(() => {
    // Enable team buttons
    renderTeamButtons();
    updateRevealProgress();
  });
}

// Returns pixel block size at step N (higher = more pixelated)
function getPixelSize(step) {
  const minPx = 1;
  const maxPx = 64;
  const ratio = 1 - (step / state.totalSteps);
  return Math.max(minPx, Math.round(maxPx * Math.pow(ratio, 1.5)));
}

function drawPixelated(src, blockSize) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const W = dom.canvas.width;
      const H = dom.canvas.height;

      if (blockSize <= 1) {
        ctx.drawImage(img, 0, 0, W, H);
      } else {
        // Draw small, then scale up
        const offW = Math.ceil(W / blockSize);
        const offH = Math.ceil(H / blockSize);
        const off = document.createElement('canvas');
        off.width = offW; off.height = offH;
        const octx = off.getContext('2d');
        octx.imageSmoothingEnabled = false;
        octx.drawImage(img, 0, 0, offW, offH);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(off, 0, 0, W, H);
      }
      resolve();
    };
    img.src = src;
  });
}

function revealOneStep() {
  if (state.revealed) return;
  if (state.currentStep >= state.totalSteps) {
    revealAnswer();
    return;
  }
  state.currentStep++;
  const q = state.queue[state.currentIdx];
  const px = getPixelSize(state.currentStep);
  drawPixelated(q.dataUrl, px);

  // Update points badge
  const pts = getCurrentPoints();
  dom.ptsBadge.textContent = pts > 0 ? `+${pts}` : '0';
  if (pts <= 0) dom.ptsBadge.style.background = 'rgba(255,255,255,0.15)';
  else dom.ptsBadge.style.background = 'var(--accent)';

  dom.revealStage.textContent = `像素 ${state.currentStep}/${state.totalSteps}`;
  dom.hintBox.textContent = state.currentStep === Math.floor(state.totalSteps / 2)
    ? '💡 提示：已揭示一半！'
    : '';

  updateRevealProgress();
  playSound.reveal();

  if (state.currentStep >= state.totalSteps) {
    setTimeout(() => revealAnswer(), 500);
  }
}

function getCurrentPoints() {
  return Math.max(0, state.config.maxScore - (state.currentStep * state.config.deductPerStep));
}

function updateRevealProgress() {
  const pct = (state.currentStep / state.totalSteps) * 100;
  dom.revealBar.style.width = pct + '%';
}

function revealAnswer() {
  if (state.revealed) return;
  state.revealed = true;
  const q = state.queue[state.currentIdx];
  dom.answerDisplay.textContent = q.answer;
  dom.answerOverlay.classList.add('show');
  drawPixelated(q.dataUrl, 1); // full quality
  dom.btnNext.disabled = false;
  updateRevealProgress();
  dom.revealBar.style.width = '100%';
  dom.revealStage.textContent = '✅ 已揭示';
  renderTeamButtons(); // update scores shown
}

function renderTeamButtons() {
  const pts = getCurrentPoints();
  dom.teamBtns.innerHTML = state.config.teamNames.map((name, i) => `
    <button class="team-score-btn"
      style="background:${TEAM_COLORS[i]};color:${i===0?'#1a1a00':'#fff'}"
      ${state.scored ? 'disabled' : ''}
      data-team="${i}">
      ${name} +${pts}
    </button>
  `).join('');

  dom.teamBtns.querySelectorAll('.team-score-btn').forEach(btn => {
    btn.onclick = () => {
      if (state.scored) return;
      const ti = +btn.dataset.team;
      const pts = getCurrentPoints();
      if (pts <= 0) return;
      leaderboard.addScore(ti, pts);
      state.scored = true;
      renderScoreBar();
      playSound.correct();
      if (!state.revealed) revealAnswer();
      dom.teamBtns.querySelectorAll('button').forEach(b => b.disabled = true);
    };
  });
}

function renderScoreBar() {
  const scores = leaderboard.getCurrentScores();
  dom.scoreBar.innerHTML = scores.map((s, i) => `
    <div class="score-chip">
      <span class="dot" style="background:${s.color}"></span>
      <span>${s.name}</span>
      <span class="chip-score" style="color:var(--primary);margin-left:6px;font-size:18px">${s.score}</span>
    </div>
  `).join('');
}

/* =====================
   Controls
===================== */
dom.btnReveal.onclick = () => revealOneStep();

dom.btnShowAnswer.onclick = () => revealAnswer();

dom.btnNext.onclick = () => {
  state.currentIdx++;
  loadQuestion();
};

/* =====================
   End Game
===================== */
function endGame() {
  showScreen('end');
  playSound.fanfare();
  launchConfetti();
  leaderboard.el = dom.finalLeaderboard;
  leaderboard.render();
}

dom.btnPlayAgain.onclick = () => {
  showScreen('setup');
};

/* =====================
   Utils
===================== */
function showScreen(name) {
  Object.values(screens).forEach(s => s.style.display = 'none');
  screens[name].style.display = 'block';
}
