// ===================================================
//  タワーディフェンスゲーム  game.js
// ===================================================

// ---------- 定数 ----------
const COLS = 10;
const ROWS = 6;
const CELL = 60; // px

// 経路定義（列インデックスの配列、行は上から下へ蛇行）
// (col, row) の順で経路を定義
const PATH = [
  {c:0,r:0},{c:1,r:0},{c:2,r:0},{c:3,r:0},
  {c:3,r:1},{c:3,r:2},
  {c:2,r:2},{c:1,r:2},{c:0,r:2},
  {c:0,r:3},{c:0,r:4},
  {c:1,r:4},{c:2,r:4},{c:3,r:4},{c:4,r:4},{c:5,r:4},
  {c:5,r:3},{c:5,r:2},{c:5,r:1},{c:5,r:0},
  {c:6,r:0},{c:7,r:0},
  {c:7,r:1},{c:7,r:2},{c:7,r:3},{c:7,r:4},{c:7,r:5},
  {c:8,r:5},{c:9,r:5}
];

// 経路セルのセット（高速検索用）
const PATH_SET = new Set(PATH.map(p => `${p.c},${p.r}`));

// ===================================================
//  タワー定義（8種類）
// ===================================================
// DPS = damage / (rate/1000)
// normal:   20 / 1.0  = 20 DPS  コスト20
// area:     12 / 1.2  = 10 DPS  コスト30 (範囲)
// slow:      5 / 1.5  =  3 DPS  コスト25 (スロー付き・スロー中被ダメ増加)
// sniper:   60 / 3.0  = 20 DPS  コスト40 (長射程・高火力)
// rapid:     8 / 0.4  = 20 DPS  コスト35 (高速連射)
// support:   0 / -    =  0 DPS  コスト30 (周囲タワー強化)
// gold:      0 / -    =  0 DPS  コスト50 (資源生成)
// wall:      0 / -    =  0 DPS  コスト15 (敵の足止め・スタン)
const TOWER_DEFS = {
  normal:  { name:'通常',     cost:20, color:'#1565C0', range:1.5, damage:20, rate:1000, aoe:false, slow:false, special:null,      icon:'🗼' },
  area:    { name:'範囲',     cost:30, color:'#6A1B9A', range:2.0, damage:12, rate:1200, aoe:true,  slow:false, special:null,      icon:'💥' },
  slow:    { name:'スロー',   cost:25, color:'#00838F', range:1.5, damage:5,  rate:1500, aoe:false, slow:true,  special:null,      icon:'❄️' },
  sniper:  { name:'スナイパー', cost:40, color:'#B71C1C', range:3.5, damage:60, rate:3000, aoe:false, slow:false, special:null,    icon:'🎯' },
  rapid:   { name:'連射',     cost:35, color:'#E65100', range:1.2, damage:8,  rate:400,  aoe:false, slow:false, special:null,      icon:'⚡' },
  support: { name:'サポート', cost:30, color:'#558B2F', range:2.0, damage:0,  rate:5000, aoe:false, slow:false, special:'support', icon:'🔰' },
  gold:    { name:'ゴールド', cost:50, color:'#F9A825', range:0,   damage:0,  rate:8000, aoe:false, slow:false, special:'gold',    icon:'💰' },
  wall:    { name:'壁',       cost:15, color:'#5D4037', range:1.0, damage:0,  rate:2000, aoe:false, slow:false, special:'wall',    icon:'🧱' }
};

// スロータワー調整定数
const SLOW_DURATION = 3000;       // スロー効果時間 (ms) ← 延長（旧2000）
const SLOW_DAMAGE_MULT = 1.5;     // スロー中の被ダメージ倍率

// 壁タワー調整定数
const WALL_STUN_DURATION = 2000;  // 壁タワーによるスタン時間 (ms)
const WALL_STUN_COOLDOWN = 4000;  // 壁タワーのクールダウン (ms)

// ===================================================
//  デッキ定義（全8種）
// ===================================================
const DECK_TYPES = ['normal','area','slow','sniper','rapid','support','gold','wall'];
const HAND_SIZE = 3;

// 手札・デッキ状態
let deck = [];
let hand = [];
let selectedHandIndex = 0; // 手札の選択インデックス

// ---------- 売却モード ----------
let sellMode = false;

// ---------- 敵定義（ベースステータス）----------
const ENEMY_DEFS = {
  normal: { name:'通常敵', baseHp:60,  baseSpeed:1.2, reward:10, color:'#E53935', radius:10, hpMult:1.0, speedMult:1.0 },
  fast:   { name:'高速敵', baseHp:30,  baseSpeed:2.5, reward:15, color:'#FB8C00', radius:8,  hpMult:0.7, speedMult:1.5 },
  tank:   { name:'タンク', baseHp:180, baseSpeed:0.6, reward:25, color:'#6D4C41', radius:14, hpMult:2.0, speedMult:0.5 }
};

// 最大ウェーブ
const MAX_WAVE = 99;

// ウェーブごとの敵出現数を計算
function getEnemyCountForWave(w) {
  return 5 + w * 2;
}

// ウェーブごとの敵タイプ構成を動的生成
function buildWaveDef(w) {
  const total = getEnemyCountForWave(w);
  if (w <= 2) {
    return [{ type: 'normal', count: total }];
  } else if (w <= 5) {
    const fast = Math.floor(total * 0.3);
    return [
      { type: 'normal', count: total - fast },
      { type: 'fast',   count: fast }
    ];
  } else if (w <= 10) {
    const fast = Math.floor(total * 0.3);
    const tank = Math.floor(total * 0.1);
    return [
      { type: 'normal', count: total - fast - tank },
      { type: 'fast',   count: fast },
      { type: 'tank',   count: tank }
    ];
  } else {
    const fast = Math.floor(total * 0.35);
    const tank = Math.floor(total * 0.15);
    return [
      { type: 'normal', count: total - fast - tank },
      { type: 'fast',   count: fast },
      { type: 'tank',   count: tank }
    ];
  }
}

// ウェーブ・敵タイプに応じたステータスを計算
function calcEnemyStats(type, w) {
  const def = ENEMY_DEFS[type];
  const hp    = Math.floor((def.baseHp    + w * 10) * def.hpMult);
  const speed = (def.baseSpeed + w * 0.02) * def.speedMult;
  return { hp, speed };
}

// ---------- ゲーム状態 ----------
let gold = 100;
let hp = 10;
let wave = 1;
let score = 0;
let towers = [];
let enemies = [];
let gameRunning = false;
let waveInProgress = false;
let gameLoopId = null;
let spawnQueue = [];
let spawnTimer = 0;
const SPAWN_INTERVAL = 1200; // ms
let gameSpeed = 1;

// ---------- エフェクト ----------
let bullets = [];   // 弾エフェクト
let hitEffects = []; // ヒットエフェクト（点滅）

// ---------- Canvas ----------
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// ---------- UI要素 ----------
const goldDisplay  = document.getElementById('gold-display');
const hpDisplay    = document.getElementById('hp-display');
const waveDisplay  = document.getElementById('wave-display');
const scoreDisplay = document.getElementById('score-display');
const messageArea  = document.getElementById('message-area');
const btnStartWave = document.getElementById('btn-start-wave');
const btnSellMode  = document.getElementById('btn-sell-mode');
const gameoverModal  = document.getElementById('gameover-modal');
const rankingModal   = document.getElementById('ranking-modal');
const modalTitle     = document.getElementById('modal-title');
const modalScore     = document.getElementById('modal-score');
const playerNameInput = document.getElementById('player-name');
const rankingBody    = document.getElementById('ranking-body');
const handArea       = document.getElementById('hand-area');

// ===================================================
//  デッキ・手札システム
// ===================================================

// デッキをシャッフルして初期化
function initDeck() {
  deck = [];
  // 各タワーを複数枚デッキに入れる（各2枚）
  DECK_TYPES.forEach(type => {
    deck.push(type);
    deck.push(type);
  });
  shuffleDeck();
}

function shuffleDeck() {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
}

// 1枚ドロー
function drawCard() {
  if (deck.length === 0) {
    // デッキ切れ時は再シャッフル
    initDeck();
  }
  return deck.shift();
}

// 手札を3枚になるまで補充
function fillHand() {
  while (hand.length < HAND_SIZE) {
    hand.push(drawCard());
  }
  if (selectedHandIndex >= hand.length) selectedHandIndex = 0;
  renderHand();
}

// タワー設置後に手札を全削除して3枚再抽選
function refreshHand() {
  hand = [];
  for (let i = 0; i < HAND_SIZE; i++) {
    hand.push(drawCard());
  }
  selectedHandIndex = 0;
  renderHand();
}

// 手札UIを描画
function renderHand() {
  if (!handArea) return;
  handArea.innerHTML = '';
  hand.forEach((type, i) => {
    const def = TOWER_DEFS[type];
    const card = document.createElement('div');
    card.className = 'hand-card' + (i === selectedHandIndex ? ' selected' : '');
    card.innerHTML = `
      <div class="card-icon">${def.icon}</div>
      <div class="card-name">${def.name}</div>
      <div class="card-cost">${def.cost}G</div>
    `;
    card.addEventListener('click', () => {
      selectedHandIndex = i;
      renderHand();
    });
    handArea.appendChild(card);
  });
}

// ---------- 売却モード切替 ----------
function toggleSellMode() {
  sellMode = !sellMode;
  if (btnSellMode) {
    btnSellMode.classList.toggle('sell-mode-active', sellMode);
    btnSellMode.textContent = sellMode ? '🚫 売却モード解除' : '💸 売却モード';
  }
  canvas.style.cursor = sellMode ? 'crosshair' : 'pointer';
  if (sellMode) {
    showMessage('💸 売却モード：タワーをクリックして売却（設置コストの50%返却）', 0);
  } else {
    showMessage('');
  }
}

// ---------- 初期化 ----------
function init() {
  gold = 100; hp = 10; wave = 1; score = 0;
  towers = []; enemies = [];
  bullets = []; hitEffects = [];
  waveInProgress = false;
  spawnQueue = []; spawnTimer = 0;
  gameRunning = true;
  sellMode = false;
  gameoverModal.classList.add('hidden');
  rankingModal.classList.add('hidden');
  btnStartWave.disabled = false;
  if (btnSellMode) {
    btnSellMode.classList.remove('sell-mode-active');
    btnSellMode.textContent = '💸 売却モード';
  }
  canvas.style.cursor = 'pointer';
  setSpeed(1);

  // デッキ・手札初期化
  initDeck();
  hand = [];
  selectedHandIndex = 0;
  fillHand();

  updateUI();
  if (gameLoopId) clearInterval(gameLoopId);
  gameLoopId = setInterval(gameLoop, 100);
  render();
}

// ---------- UI更新 ----------
function updateUI() {
  goldDisplay.textContent  = gold;
  hpDisplay.textContent    = hp;
  waveDisplay.textContent  = `${wave} / ${MAX_WAVE}`;
  scoreDisplay.textContent = score;
}

function showMessage(msg, duration = 2000) {
  messageArea.textContent = msg;
  if (duration > 0) setTimeout(() => { messageArea.textContent = ''; }, duration);
}

// ---------- キャンバスクリック（タワー配置 / 売却） ----------
canvas.addEventListener('click', e => {
  if (!gameRunning) return;
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width  / rect.width;
  const scaleY = canvas.height / rect.height;
  const mx = (e.clientX - rect.left) * scaleX;
  const my = (e.clientY - rect.top)  * scaleY;
  const col = Math.floor(mx / CELL);
  const row = Math.floor(my / CELL);

  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return;

  // ===== 売却モード =====
  if (sellMode) {
    const idx = towers.findIndex(t => t.col === col && t.row === row);
    if (idx === -1) {
      showMessage('⚠ そこにはタワーがありません');
      return;
    }
    const tower = towers[idx];
    const def = TOWER_DEFS[tower.type];
    const refund = Math.floor(def.cost * 0.5);
    gold += refund;
    towers.splice(idx, 1);
    updateUI();
    render();
    showMessage(`💰 ${def.name}タワーを売却しました（+${refund}G）`);
    return;
  }

  // ===== 通常配置モード =====
  // 経路上チェック
  if (PATH_SET.has(`${col},${row}`)) {
    showMessage('⚠ 経路上には配置できません');
    return;
  }
  // 重複チェック
  if (towers.some(t => t.col === col && t.row === row)) {
    showMessage('⚠ すでにタワーがあります');
    return;
  }

  // 手札から選択中のカードを使用
  if (hand.length === 0) {
    showMessage('⚠ 手札がありません');
    return;
  }
  const selectedType = hand[selectedHandIndex];
  const def = TOWER_DEFS[selectedType];

  // 所持金チェック
  if (gold < def.cost) {
    showMessage(`⚠ Goldが足りません（必要: ${def.cost}G）`);
    return;
  }

  gold -= def.cost;
  towers.push({
    col, row,
    type: selectedType,
    cooldown: 0,
    buffMult: 1.0  // サポートタワーによる強化倍率
  });

  // タワー設置後に手札を全削除して3枚再抽選
  refreshHand();

  updateUI();
  render();
});

// ---------- 売却モードボタン ----------
if (btnSellMode) {
  btnSellMode.addEventListener('click', () => {
    if (!gameRunning) return;
    toggleSellMode();
  });
}

// ---------- ウェーブ開始 ----------
btnStartWave.addEventListener('click', () => {
  if (waveInProgress) return;
  startWave();
});

function startWave() {
  waveInProgress = true;
  btnStartWave.disabled = true;
  const waveDef = buildWaveDef(wave);

  // スポーンキューを構築（ウェーブ強化済みステータスを付与）
  spawnQueue = [];
  waveDef.forEach(group => {
    for (let i = 0; i < group.count; i++) {
      spawnQueue.push(group.type);
    }
  });
  // シャッフル
  for (let i = spawnQueue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [spawnQueue[i], spawnQueue[j]] = [spawnQueue[j], spawnQueue[i]];
  }
  spawnTimer = 0;
}

// ---------- 敵スポーン ----------
function spawnEnemy(type) {
  const def = ENEMY_DEFS[type];
  const stats = calcEnemyStats(type, wave);
  enemies.push({
    type,
    hp: stats.hp,
    maxHp: stats.hp,
    speed: stats.speed,
    reward: def.reward,
    color: def.color,
    radius: def.radius,
    pathIndex: 0,
    x: PATH[0].c * CELL + CELL / 2,
    y: PATH[0].r * CELL + CELL / 2,
    slowTimer: 0,
    wallStunTimer: 0,  // 壁タワーによるスタン（完全停止）
    alive: true,
    reached: false,
    hitFlash: 0  // ヒットエフェクト用タイマー
  });
}

// ===================================================
//  エフェクト生成
// ===================================================

// 弾エフェクトを追加
function addBullet(fromX, fromY, toX, toY, color) {
  bullets.push({
    x: fromX, y: fromY,
    tx: toX, ty: toY,
    color: color,
    life: 200, // ms
    maxLife: 200
  });
}

// ヒットエフェクト（敵の点滅）
function addHitEffect(enemy) {
  enemy.hitFlash = 150; // ms
}

// ===================================================
//  ゲームループ
// ===================================================
let lastTime = Date.now();

function updateGame(dt) {
  // スポーン処理
  if (spawnQueue.length > 0) {
    spawnTimer += dt;
    if (spawnTimer >= SPAWN_INTERVAL) {
      spawnTimer -= SPAWN_INTERVAL;
      spawnEnemy(spawnQueue.shift());
    }
  }

  // 敵移動
  enemies.forEach(enemy => {
    if (!enemy.alive || enemy.reached) return;

    if (enemy.hitFlash > 0) enemy.hitFlash -= dt;

    // 壁スタン中は完全停止
    if (enemy.wallStunTimer > 0) {
      enemy.wallStunTimer -= dt;
      return; // 移動しない
    }

    // スロー中は速度40%
    const slowFactor = (enemy.slowTimer > 0) ? 0.4 : 1.0;
    if (enemy.slowTimer > 0) enemy.slowTimer -= dt;

    const speed = enemy.speed * slowFactor * (dt / 100);
    moveEnemy(enemy, speed);
  });

  // サポートタワーのバフ計算（毎フレーム再計算）
  towers.forEach(t => { t.buffMult = 1.0; });
  towers.forEach(tower => {
    if (TOWER_DEFS[tower.type].special !== 'support') return;
    const tx = tower.col * CELL + CELL / 2;
    const ty = tower.row * CELL + CELL / 2;
    const rangePixel = TOWER_DEFS[tower.type].range * CELL;
    towers.forEach(other => {
      if (other === tower) return;
      const ox = other.col * CELL + CELL / 2;
      const oy = other.row * CELL + CELL / 2;
      if (Math.hypot(ox - tx, oy - ty) <= rangePixel) {
        other.buffMult = Math.min(other.buffMult + 0.3, 2.0); // 最大2倍
      }
    });
  });

  // タワー攻撃
  towers.forEach(tower => {
    const def = TOWER_DEFS[tower.type];
    tower.cooldown -= dt;
    if (tower.cooldown > 0) return;

    const tx = tower.col * CELL + CELL / 2;
    const ty = tower.row * CELL + CELL / 2;

    // 特殊タワー処理
    if (def.special === 'gold') {
      // ゴールドタワー：敵が存在する間（またはwave中）のみゴールド生成
      if (waveInProgress || enemies.length > 0) {
        gold += 5;
        updateUI();
      }
      tower.cooldown = def.rate;
      return;
    }
    if (def.special === 'support') {
      // サポートタワー：バフは上で計算済み
      tower.cooldown = def.rate;
      return;
    }
    if (def.special === 'wall') {
      // 壁タワー：範囲内の敵をスタン（完全停止）
      const rangePixel = def.range * CELL;
      let hit = false;
      enemies.forEach(enemy => {
        if (!enemy.alive || enemy.reached) return;
        const dx = enemy.x - tx, dy = enemy.y - ty;
        if (Math.hypot(dx, dy) <= rangePixel) {
          enemy.wallStunTimer = WALL_STUN_DURATION;
          hit = true;
        }
      });
      if (hit) tower.cooldown = WALL_STUN_COOLDOWN;
      return;
    }

    const rangePixel = def.range * CELL;
    const actualDamage = Math.floor(def.damage * (tower.buffMult || 1.0));

    if (def.aoe) {
      // 範囲攻撃
      let hit = false;
      enemies.forEach(enemy => {
        if (!enemy.alive || enemy.reached) return;
        const dx = enemy.x - tx, dy = enemy.y - ty;
        if (Math.hypot(dx, dy) <= rangePixel) {
          // スロー中の敵は被ダメージ増加
          const dmgMult = (enemy.slowTimer > 0) ? SLOW_DAMAGE_MULT : 1.0;
          enemy.hp -= Math.floor(actualDamage * dmgMult);
          hit = true;
          addHitEffect(enemy);
          if (enemy.hp <= 0) killEnemy(enemy);
        }
      });
      if (hit) {
        addBullet(tx, ty, tx, ty, def.color); // 範囲爆発エフェクト
        tower.cooldown = def.rate;
      }
    } else {
      // 単体攻撃（最も進んでいる敵を優先）
      let target = null;
      let maxProgress = -1;
      enemies.forEach(enemy => {
        if (!enemy.alive || enemy.reached) return;
        const dx = enemy.x - tx, dy = enemy.y - ty;
        if (Math.hypot(dx, dy) <= rangePixel && enemy.pathIndex > maxProgress) {
          maxProgress = enemy.pathIndex;
          target = enemy;
        }
      });
      if (target) {
        if (def.slow) {
          // スロー効果付与（延長された効果時間）
          target.slowTimer = SLOW_DURATION;
        }
        // スロー中の敵は被ダメージ増加
        const dmgMult = (target.slowTimer > 0) ? SLOW_DAMAGE_MULT : 1.0;
        target.hp -= Math.floor(actualDamage * dmgMult);
        addBullet(tx, ty, target.x, target.y, def.color);
        addHitEffect(target);
        if (target.hp <= 0) killEnemy(target);
        tower.cooldown = def.rate;
      }
    }
  });

  // ゴール到達チェック
  enemies.forEach(enemy => {
    if (enemy.reached && enemy.alive) {
      enemy.alive = false;
      hp--;
      updateUI();
      if (hp <= 0) triggerGameOver();
    }
  });

  // 死亡・到達済みを除去
  enemies = enemies.filter(e => e.alive && !e.reached);

  // 弾エフェクト更新
  bullets.forEach(b => { b.life -= dt; });
  bullets = bullets.filter(b => b.life > 0);

  // ウェーブ終了チェック
  if (waveInProgress && spawnQueue.length === 0 && enemies.length === 0) {
    waveInProgress = false;
    score = wave;
    updateUI();
    if (wave >= MAX_WAVE) {
      triggerGameClear();
    } else {
      wave++;
      updateUI();
      btnStartWave.disabled = false;
      showMessage(`✅ ウェーブ ${wave - 1} クリア！次のウェーブを開始してください`, 3000);
    }
  }
}

function gameLoop() {
  if (!gameRunning) return;

  const now = Date.now();
  const dt = now - lastTime;
  lastTime = now;

  for (let i = 0; i < gameSpeed; i++) {
    updateGame(dt);
  }

  render();
}

// ---------- 速度変更 ----------
function setSpeed(speed) {
  gameSpeed = speed;
  document.querySelectorAll('.speed-btn').forEach(btn => {
    btn.classList.toggle('selected', parseInt(btn.dataset.speed) === speed);
  });
}

function killEnemy(enemy) {
  enemy.alive = false;
  gold += enemy.reward;
  updateUI();
}

// ---------- 敵移動ロジック ----------
function moveEnemy(enemy, speed) {
  if (enemy.pathIndex >= PATH.length - 1) {
    enemy.reached = true;
    return;
  }

  const target = PATH[enemy.pathIndex + 1];
  const tx = target.c * CELL + CELL / 2;
  const ty = target.r * CELL + CELL / 2;
  const dx = tx - enemy.x;
  const dy = ty - enemy.y;
  const dist = Math.hypot(dx, dy);

  if (dist <= speed) {
    enemy.x = tx;
    enemy.y = ty;
    enemy.pathIndex++;
    if (enemy.pathIndex >= PATH.length - 1) {
      enemy.reached = true;
    }
  } else {
    enemy.x += (dx / dist) * speed;
    enemy.y += (dy / dist) * speed;
  }
}

// ===================================================
//  描画
// ===================================================
function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // グリッド背景
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const isPath = PATH_SET.has(`${c},${r}`);
      ctx.fillStyle = isPath ? '#D7CCC8' : '#C8E6C9';
      ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
      ctx.strokeStyle = '#B0BEC5';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(c * CELL, r * CELL, CELL, CELL);
    }
  }

  // 経路の矢印（方向表示）
  ctx.strokeStyle = '#A1887F';
  ctx.lineWidth = 2;
  for (let i = 0; i < PATH.length - 1; i++) {
    const from = PATH[i];
    const to   = PATH[i + 1];
    const fx = from.c * CELL + CELL / 2;
    const fy = from.r * CELL + CELL / 2;
    const tx = to.c   * CELL + CELL / 2;
    const ty = to.r   * CELL + CELL / 2;
    drawArrow(ctx, fx, fy, tx, ty);
  }

  // スタート・ゴールマーク
  drawLabel(PATH[0].c, PATH[0].r, 'START', '#43A047');
  drawLabel(PATH[PATH.length-1].c, PATH[PATH.length-1].r, 'GOAL', '#E53935');

  // タワー描画
  towers.forEach(tower => {
    const def = TOWER_DEFS[tower.type];
    const cx = tower.col * CELL + CELL / 2;
    const cy = tower.row * CELL + CELL / 2;

    // 売却モード中はタワーを赤くハイライト
    if (sellMode) {
      ctx.fillStyle = 'rgba(255, 0, 0, 0.25)';
      ctx.fillRect(tower.col * CELL, tower.row * CELL, CELL, CELL);
    }

    // 射程円（薄く）
    if (def.range > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, def.range * CELL, 0, Math.PI * 2);
      ctx.strokeStyle = def.color + '44';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // サポートタワーはバフ範囲を強調
    if (def.special === 'support') {
      ctx.beginPath();
      ctx.arc(cx, cy, def.range * CELL, 0, Math.PI * 2);
      ctx.strokeStyle = '#76FF03aa';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // タワー本体
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.roundRect(cx - 18, cy - 18, 36, 36, 6);
    ctx.fill();

    // バフ中は光らせる
    if (tower.buffMult > 1.0) {
      ctx.strokeStyle = '#FFFF00';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(cx - 18, cy - 18, 36, 36, 6);
      ctx.stroke();
    }

    // 売却モード中は赤枠
    if (sellMode) {
      ctx.strokeStyle = '#FF1744';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(cx - 18, cy - 18, 36, 36, 6);
      ctx.stroke();
    }

    // アイコン文字
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(def.icon, cx, cy);

    // 売却モード中は売却金額を表示
    if (sellMode) {
      const refund = Math.floor(def.cost * 0.5);
      ctx.fillStyle = '#FFD600';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(`+${refund}G`, cx, cy + 10);
    }
  });

  // 弾エフェクト描画
  bullets.forEach(b => {
    const alpha = b.life / b.maxLife;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = b.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.tx, b.ty);
    ctx.stroke();
    // 弾頭（円）
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(b.tx, b.ty, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1.0;
  });

  // 敵描画
  enemies.forEach(enemy => {
    if (!enemy.alive) return;
    const { x, y, radius, color, hp, maxHp, slowTimer, wallStunTimer, hitFlash } = enemy;

    // ヒットエフェクト（点滅）
    if (hitFlash > 0) {
      const flashAlpha = (hitFlash % 60 < 30) ? 1.0 : 0.3;
      ctx.globalAlpha = flashAlpha;
    }

    // スタン中は紫、スロー中は青みがかった色
    let drawColor = color;
    if (wallStunTimer > 0) {
      drawColor = '#CE93D8'; // 紫（スタン）
    } else if (slowTimer > 0) {
      drawColor = '#80DEEA'; // 水色（スロー）
    }

    ctx.fillStyle = drawColor;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // スタン中は停止マーク
    if (wallStunTimer > 0) {
      ctx.fillStyle = '#7B1FA2';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⏸', x, y - radius - 6);
    }

    ctx.globalAlpha = 1.0;

    // HPバー
    const barW = radius * 2.5;
    const barH = 4;
    const barX = x - barW / 2;
    const barY = y - radius - 8;
    ctx.fillStyle = '#555';
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = hp / maxHp > 0.5 ? '#66BB6A' : hp / maxHp > 0.25 ? '#FFA726' : '#EF5350';
    ctx.fillRect(barX, barY, barW * (hp / maxHp), barH);
  });
}

function drawArrow(ctx, fx, fy, tx, ty) {
  const headLen = 8;
  const angle = Math.atan2(ty - fy, tx - fx);
  const mx = (fx + tx) / 2;
  const my = (fy + ty) / 2;
  ctx.beginPath();
  ctx.moveTo(mx - Math.cos(angle) * 6, my - Math.sin(angle) * 6);
  ctx.lineTo(mx + Math.cos(angle) * 6, my + Math.sin(angle) * 6);
  ctx.moveTo(mx + Math.cos(angle) * 6, my + Math.sin(angle) * 6);
  ctx.lineTo(
    mx + Math.cos(angle) * 6 - headLen * Math.cos(angle - Math.PI / 6),
    my + Math.sin(angle) * 6 - headLen * Math.sin(angle - Math.PI / 6)
  );
  ctx.moveTo(mx + Math.cos(angle) * 6, my + Math.sin(angle) * 6);
  ctx.lineTo(
    mx + Math.cos(angle) * 6 - headLen * Math.cos(angle + Math.PI / 6),
    my + Math.sin(angle) * 6 - headLen * Math.sin(angle + Math.PI / 6)
  );
  ctx.stroke();
}

function drawLabel(col, row, text, color) {
  const cx = col * CELL + CELL / 2;
  const cy = row * CELL + CELL / 2;
  ctx.fillStyle = color;
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy);
}

// ---------- ゲームオーバー / クリア ----------
function triggerGameOver() {
  score = wave;
  updateUI();
  endGame('💀 ゲームオーバー');
}

function triggerGameClear() {
  score = MAX_WAVE;
  updateUI();
  endGame('🎉 CLEAR！Wave 99 到達！');
}

function endGame(title) {
  gameRunning = false;
  clearInterval(gameLoopId);
  modalTitle.textContent = title;
  modalScore.textContent = `到達ウェーブ: ${score} / ${MAX_WAVE}`;
  gameoverModal.classList.remove('hidden');
}

// ---------- スコア保存 ----------
document.getElementById('btn-save-score').addEventListener('click', async () => {
  const name = playerNameInput.value.trim() || 'Anonymous';
  try {
    const res = await fetch('/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player_name: name, score, wave })
    });
    if (res.ok) {
      showMessage('✅ スコアを保存しました！', 3000);
      document.getElementById('btn-save-score').disabled = true;
    }
  } catch (e) {
    showMessage('⚠ 保存に失敗しました', 3000);
  }
});

// ---------- ランキング表示 ----------
document.getElementById('btn-show-ranking').addEventListener('click', async () => {
  await loadRanking();
  rankingModal.classList.remove('hidden');
});

document.getElementById('btn-close-ranking').addEventListener('click', () => {
  rankingModal.classList.add('hidden');
});

async function loadRanking() {
  try {
    const res = await fetch('/scores');
    const data = await res.json();
    rankingBody.innerHTML = '';
    data.forEach((row, i) => {
      const tr = document.createElement('tr');
      const dt = new Date(row.created_at).toLocaleString('ja-JP');
      tr.innerHTML = `<td>${i + 1}</td><td>${row.player_name}</td><td>${row.score}</td><td>${dt}</td>`;
      rankingBody.appendChild(tr);
    });
  } catch (e) {
    rankingBody.innerHTML = '<tr><td colspan="4">取得失敗</td></tr>';
  }
}

// ---------- リスタート ----------
document.getElementById('btn-restart').addEventListener('click', () => {
  document.getElementById('btn-save-score').disabled = false;
  playerNameInput.value = '';
  init();
});

// ---------- 起動 ----------
init();
