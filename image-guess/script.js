"use strict";
import { Timer, Leaderboard, launchConfetti, playSound, shuffle } from '../shared/hub.js';

/* ====== Data ====== */
const IMAGE_BASE = "https://yongearn-dev.github.io/guess-word-game/images/";
const SHEET_URL  = "https://opensheet.elk.sh/1nmgda-PSW0qNpEnT65HozbrbK4SPoOlfq3WlEIQSgf4/Sheet1";

const DIFF_SCORE = { easy:1, normal:2, hard:3, extreme:5 };
const TEAM_COLORS = ['#f5c542','#3498db','#e94560','#2ecc71','#9b59b6','#e67e22'];

const GROUP_MAP = {
  zh:[{value:"bible",label:"聖經"},{value:"other",label:"其他"}],
  th:[{value:"bible",label:"พระคัมภีร์"},{value:"other",label:"อื่นๆ"}]
};
const CAT_MAP = {
  bible:[{value:"person",label:"人物"},{value:"place",label:"地方"},{value:"vocab",label:"詞彙"}],
  other:[{value:"travel",label:"旅行"},{value:"life",label:"生活"},{value:"food",label:"美食"},{value:"knowledge",label:"知識"}]
};

/* ====== State ====== */
let allQ = [], pool = [], queue = [];
let qIdx = 0, currentQ = null, hintUsed = false, currentPts = 0;
let activeTeam = 0;

const cfg = {
  mode:'standard', language:'', group:'', categories:[],
  questionsPerRound:10, teams:3,
  timer:{ enabled:false, perQuestion:30, total:300 },
  teamNames:['隊伍 1','隊伍 2','隊伍 3']
};

/* ====== Shared components ====== */
const timer = new Timer('hub-timer');
const leaderboard = new Leaderboard('score-bar');

/* ====== DOM ====== */
const $ = id => document.getElementById(id);
const screens = { setup:$('screen-setup'), game:$('screen-game'), end:$('screen-end') };

// Fetch data
fetch(SHEET_URL).then(r=>r.json()).then(d=>{ allQ=d; });

/* ====== Setup UI ====== */
function pill(groupId, key, transform) {
  $(groupId)?.querySelectorAll('.option-pill').forEach(p => {
    p.onclick = () => {
      $(groupId).querySelectorAll('.option-pill').forEach(x=>x.classList.remove('selected'));
      p.classList.add('selected');
      const v = transform ? transform(p.dataset.val) : p.dataset.val;
      setNested(cfg, key, v);
    };
  });
}
function setNested(obj, path, val) {
  const parts = path.split('.');
  let cur = obj;
  parts.slice(0,-1).forEach(p=>cur=cur[p]);
  cur[parts[parts.length-1]] = isNaN(val) ? val : +val;
}

pill('mode-options','mode');
pill('pq-options','timer.perQuestion');
pill('total-time-options','timer.total');
pill('q-options','questionsPerRound');

// Mode switch
$('mode-options').addEventListener('click', e => {
  if (!e.target.classList.contains('option-pill')) return;
  cfg.mode = e.target.dataset.val;
  $('std-opts').style.display = cfg.mode==='standard'?'block':'none';
  $('ta-opts').style.display  = cfg.mode==='timeAttack'?'block':'none';
});

// Team count
$('team-count-options').addEventListener('click', e => {
  if (!e.target.classList.contains('option-pill')) return;
  renderTeamInputs(+e.target.dataset.val);
});

function renderTeamInputs(n) {
  cfg.teams = n;
  $('team-name-inputs').innerHTML = Array.from({length:n},(_,i)=>`
    <div class="team-input-row">
      <div class="team-color-dot" style="background:${TEAM_COLORS[i]}"></div>
      <input class="team-name-input" type="text" placeholder="隊伍 ${i+1}"
        value="${cfg.teamNames[i]||`隊伍 ${i+1}`}" data-ti="${i}"/>
    </div>`).join('');
  $('team-name-inputs').querySelectorAll('input').forEach(inp=>{
    inp.oninput=()=>{ cfg.teamNames[+inp.dataset.ti]=inp.value||`隊伍 ${+inp.dataset.ti+1}`; };
  });
}
renderTeamInputs(3);

// Language / group / category
$('lang-sel').onchange = function() {
  cfg.language = this.value;
  const grp = $('group-sel');
  grp.disabled = !cfg.language;
  grp.innerHTML = '<option value="">選擇組別</option>';
  (GROUP_MAP[cfg.language]||[]).forEach(g=>{
    grp.innerHTML += `<option value="${g.value}">${g.label}</option>`;
  });
};
$('group-sel').onchange = function() {
  cfg.group = this.value;
  $('cat-checks').innerHTML='';
  (CAT_MAP[cfg.group]||[]).forEach(c=>{
    const lbl=document.createElement('label');
    lbl.style.cssText='display:flex;align-items:center;gap:6px;padding:6px 12px;background:rgba(255,255,255,.07);border-radius:8px;cursor:pointer;font-size:14px;color:var(--text2);';
    lbl.innerHTML=`<input type="checkbox" value="${c.value}" style="accent-color:var(--primary)"> ${c.label}`;
    lbl.querySelector('input').onchange=updateCats;
    $('cat-checks').appendChild(lbl);
  });
};
function updateCats(){
  cfg.categories=[...$('cat-checks').querySelectorAll('input:checked')].map(i=>i.value);
}

/* ====== Start ====== */
$('start-btn').onclick = startGame;

function startGame() {
  const names=[...$('team-name-inputs').querySelectorAll('input')].map((i,idx)=>i.value.trim()||`隊伍 ${idx+1}`);
  cfg.teamNames=names;
  leaderboard.setTeams(names);
  buildPool();
  qIdx=0; activeTeam=0;
  showScreen('game');
  cfg.mode==='timeAttack' ? waitForNextTeam() : loadQuestion();
}

function buildPool() {
  pool = allQ.filter(q=>{
    if(cfg.language && q.language!==cfg.language) return false;
    if(cfg.group    && q.group!==cfg.group)       return false;
    if(cfg.categories.length && !cfg.categories.includes(q.category)) return false;
    return true;
  });
  if(!pool.length) pool=[...allQ];
  shuffle(pool);
  queue=pool.slice(0, cfg.questionsPerRound===999?pool.length:cfg.questionsPerRound);
}

/* ====== Game ====== */
function loadQuestion() {
  timer.stop();
  if(qIdx>=queue.length){ endGame(); return; }
  currentQ=queue[qIdx++];
  hintUsed=false;
  currentPts=DIFF_SCORE[currentQ.difficulty]||1;

  $('q-counter').textContent=`第 ${qIdx}/${queue.length} 題`;
  $('q-bar').style.width=((qIdx-1)/queue.length*100)+'%';

  // Images
  $('image-row').innerHTML='';
  ['img1','img2','img3','img4'].map(k=>currentQ[k]).filter(Boolean).forEach((f,i,arr)=>{
    const img=document.createElement('img');
    img.src=IMAGE_BASE+f;
    $('image-row').appendChild(img);
    if(i<arr.length-1){
      const op=document.createElement('span');
      op.className='op-sym'; op.textContent='＋';
      $('image-row').appendChild(op);
    }
  });
  const eq=document.createElement('span');
  eq.className='result-sym'; eq.textContent='＝ ?';
  $('image-row').appendChild(eq);

  $('answer-box').classList.add('hidden');
  $('hint-box').classList.add('hidden');
  $('btn-hint').disabled=!currentQ.note;

  renderScoreBar();
  renderTeamBtns();

  if(cfg.mode==='standard' && cfg.timer.perQuestion>0){
    timer.start(cfg.timer.perQuestion, {
      warning:8,
      onTick: t => { if(t<=5) playSound.tick(); },
      onEnd: () => { showAnswer(); }
    });
  }
}

function renderScoreBar() {
  const scores=leaderboard.getCurrentScores();
  $('score-bar').innerHTML=scores.map((s,i)=>`
    <div class="score-chip">
      <span class="dot" style="background:${s.color}"></span>
      <span>${s.name}</span>
      <span style="color:var(--primary);margin-left:6px;font-weight:900">${s.score}</span>
    </div>`).join('');
}

function renderTeamBtns() {
  const pts=currentPts;
  if(cfg.mode==='timeAttack'){
    $('team-btns').innerHTML=`
      <button class="team-score-btn" style="background:${TEAM_COLORS[activeTeam]};color:${activeTeam===0?'#1a1a00':'#fff'}" data-team="${activeTeam}">
        <span>${cfg.teamNames[activeTeam]}</span>
        <span class="tsb-pts">+${pts}</span>
      </button>`;
  } else {
    $('team-btns').innerHTML=cfg.teamNames.map((n,i)=>`
      <button class="team-score-btn" style="background:${TEAM_COLORS[i]};color:${i===0?'#1a1a00':'#fff'}" data-team="${i}">
        <span>${n}</span><span class="tsb-pts">+${pts}</span>
      </button>`).join('');
  }
  $('team-btns').querySelectorAll('.team-score-btn').forEach(btn=>{
    btn.onclick=()=>{
      const i=+btn.dataset.team;
      leaderboard.addScore(i,currentPts);
      renderScoreBar();
      playSound.correct();
    };
  });
}

function showAnswer() {
  $('answer-box').textContent=currentQ.answer;
  $('answer-box').classList.remove('hidden');
  // Update pts on buttons to 0
  $('team-btns').querySelectorAll('.tsb-pts').forEach(s=>s.textContent='+'+currentPts);
}

$('btn-hint').onclick=()=>{
  if(!currentQ?.note) return;
  $('hint-box').textContent='💡 '+currentQ.note;
  $('hint-box').classList.remove('hidden');
  if(!hintUsed){ currentPts=Math.max(0,currentPts-1); hintUsed=true; renderTeamBtns(); }
};
$('btn-answer').onclick=showAnswer;
$('btn-next').onclick=loadQuestion;

/* ====== Time Attack ====== */
function waitForNextTeam() {
  timer.stop();
  $('image-row').innerHTML=`<div style="text-align:center;padding:40px;font-size:22px;color:var(--text2)">
    隊伍 ${activeTeam+1}（${cfg.teamNames[activeTeam]}）準備好了嗎？</div>`;
  $('btn-next').textContent=`▶ 開始 ${cfg.teamNames[activeTeam]}`;
  $('btn-next').onclick=startTATeam;
}

function startTATeam() {
  $('btn-next').textContent='下一題 ▶';
  $('btn-next').onclick=loadQuestion;
  qIdx=0; queue=[...pool]; shuffle(queue);
  timer.start(cfg.timer.total,{
    warning:30,
    onEnd:()=>{ activeTeam++; activeTeam>=cfg.teams?endGame():waitForNextTeam(); }
  });
  loadQuestion();
}

/* ====== End ====== */
function endGame() {
  timer.stop();
  showScreen('end');
  playSound.fanfare();
  launchConfetti();
  leaderboard.el=$('final-lb');
  leaderboard.render();
}
$('btn-replay').onclick=()=>{ showScreen('setup'); };

/* ====== Utils ====== */
function showScreen(n) {
  Object.values(screens).forEach(s=>s.style.display='none');
  screens[n].style.display='block';
}
