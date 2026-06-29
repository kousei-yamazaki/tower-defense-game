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

// タワー定義
const TOWER_DEFS = {
  normal: { name:'通常', cost:20, color:'#1565C0', range:1.5, damage:20, rate:1000, aoe:false, slow:false },
  area:   { name:'範囲', cost:30, color:'#6A1B9A', range:2.0, damage:10, rate:1200, aoe:true,  slow:false },
  slow:   { name:'スロー', cost:25, color:'#00838F', range:1.5, damage:5,  rate:1500, aoe:false, slow:true  }
};

// 敵定義
const ENEMY_DEFS = {
  normal: { name:'通常敵', hp:60,  speed:1.2, reward:10, color:'#E53935', radius:10 },
  fast:   { name:'高速敵', hp:30,  speed:2.5, reward:15, color:'#FB8C00', radius:8  },
  tank:   { name:'タンク', hp:180, speed:0.6, reward:25, color:'#6D4C41', radius:14 }
};

// ウェーブ定義（各ウェーブで出現する敵の種類と数）
const WAVE_DEFS = [
  [{type:'normal', count:5}],
  [{type:'normal', count:5}, {type:'fast', count:3}],
  [{type:'normal', count:6}, {type:'fast', count:4}],
  [{type:'normal', count:4}, {type:'fast', count:4}, {type:'tank', count:2}],
  [{type:'normal', count:6}, {type:'fast', count:6}, {type:'tank', count:3}],
];

// ---------- ゲーム状態 ----------
let gold = 100;
let hp = 10;
let wave = 1;
let score = 0;
let selectedTower = 'normal';
let towers = [];
let enemies = [];
let gameRunning = false;
let waveInProgress = false;
let gameLoopId = null;
let spawnQueue = [];
let spawnTimer = 0;
const SPAWN_INTERVAL = 1200; // ms

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
const gameoverModal  = document.getElementById('gameover-modal');
const rankingModal   = document.getElementById('ranking-modal');
const modalTitle     = document.getElementById('modal-title');
const modalScore     = document.getElementById('modal-score');
const playerNameInput = document.getElementById('player-name');
const rankingBody    = document.getElementById('ranking-body');

// ---------- 初期化 ----------
function init() {
  gold = 100; hp = 10; wave = 1; score = 0;
  towers = []; enemies = [];
  waveInProgress = false;
  spawnQueue = []; spawnTimer = 0;
  gameRunning = true;
  gameoverModal.classList.add('hidden');
  rankingModal.classList.add('hidden');
  btnStartWave.disabled = false;
  updateUI();
  if (gameLoopId) clearInterval(gameLoopId);
  gameLoopId = setInterval(gameLoop, 100);
  render();
}

// ---------- UI更新 ----------
function updateUI() {
  goldDisplay.textContent  = gold;
  hpDisplay.textContent    = hp;
  waveDisplay.textContent  = wave;
  scoreDisplay.textContent = score;
}

function showMessage(msg, duration = 2000) {
  messageArea.textContent = msg;
  if (duration > 0) setTimeout(() => { messageArea.textContent = ''; }, duration);
}

// ---------- タワー選択 ----------
document.querySelectorAll('.tower-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    selectedTower = btn.dataset.type;
    document.querySelectorAll('.tower-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  });
});

// ---------- キャンバスクリック（タワー配置） ----------
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
  // 所持金チェック
  const def = TOWER_DEFS[selectedTower];
  if (gold < def.cost) {
    showMessage(`⚠ Goldが足りません（必要: ${def.cost}G）`);
    return;
  }

  gold -= def.cost;
  towers.push({
    col, row,
    type: selectedTower,
    cooldown: 0
  });
  updateUI();
  render();
});

// ---------- ウェーブ開始 ----------
btnStartWave.addEventListener('click', () => {
  if (waveInProgress) return;
  startWave();
});

function startWave() {
  waveInProgress = true;
  btnStartWave.disabled = true;
  const waveIdx = Math.min(wave - 1, WAVE_DEFS.length - 1);
  const waveDef = WAVE_DEFS[waveIdx];

  // スポーンキューを構築
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
  enemies.push({
    type,
    hp: def.hp,
    maxHp: def.hp,
    speed: def.speed,
    reward: def.reward,
    color: def.color,
    radius: def.radius,
    pathIndex: 0,
    // ピクセル座標（経路の最初のセル中央）
    x: PATH[0].c * CELL + CELL / 2,
    y: PATH[0].r * CELL + CELL / 2,
    slowTimer: 0,
    alive: true,
    reached: false
  });
}

// ---------- ゲームループ ----------
let lastTime = Date.now();

function gameLoop() {
  if (!gameRunning) return;

  const now = Date.now();
  const dt = now - lastTime;
  lastTime = now;

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

    const slowFactor = enemy.slowTimer > 0 ? 0.4 : 1.0;
    if (enemy.slowTimer > 0) enemy.slowTimer -= dt;

    const speed = enemy.speed * slowFactor * (dt / 100);
    moveEnemy(enemy, speed);
  });

  // タワー攻撃
  towers.forEach(tower => {
    const def = TOWER_DEFS[tower.type];
    tower.cooldown -= dt;
    if (tower.cooldown > 0) return;

    const tx = tower.col * CELL + CELL / 2;
    const ty = tower.row * CELL + CELL / 2;
    const rangePixel = def.range * CELL;

    if (def.aoe) {
      // 範囲攻撃
      let hit = false;
      enemies.forEach(enemy => {
        if (!enemy.alive || enemy.reached) return;
        const dx = enemy.x - tx, dy = enemy.y - ty;
        if (Math.hypot(dx, dy) <= rangePixel) {
          enemy.hp -= def.damage;
          hit = true;
          if (enemy.hp <= 0) killEnemy(enemy);
        }
      });
      if (hit) tower.cooldown = def.rate;
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
        if (def.slow) target.slowTimer = 2000;
        target.hp -= def.damage;
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

  // ウェーブ終了チェック
  if (waveInProgress && spawnQueue.length === 0 && enemies.length === 0) {
    waveInProgress = false;
    wave++;
    score += wave * 50;
    updateUI();
    if (wave > WAVE_DEFS.length + 1) {
      triggerGameClear();
    } else {
      btnStartWave.disabled = false;
      showMessage(`✅ ウェーブ ${wave - 1} クリア！次のウェーブを開始してください`, 3000);
    }
  }

  render();
}

function killEnemy(enemy) {
  enemy.alive = false;
  gold += enemy.reward;
  score += enemy.reward * 2;
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

// ---------- 描画 ----------
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

    // 射程円（薄く）
    ctx.beginPath();
    ctx.arc(cx, cy, def.range * CELL, 0, Math.PI * 2);
    ctx.strokeStyle = def.color + '44';
    ctx.lineWidth = 1;
    ctx.stroke();

    // タワー本体
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.roundRect(cx - 18, cy - 18, 36, 36, 6);
    ctx.fill();

    // アイコン文字
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const icons = { normal:'🗼', area:'💥', slow:'❄️' };
    ctx.fillText(icons[tower.type], cx, cy);
  });

  // 敵描画
  enemies.forEach(enemy => {
    if (!enemy.alive) return;
    const { x, y, radius, color, hp, maxHp, slowTimer } = enemy;

    // スロー中は青みがかった色
    ctx.fillStyle = slowTimer > 0 ? '#80DEEA' : color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

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
  endGame('💀 ゲームオーバー');
}

function triggerGameClear() {
  score += 500; // クリアボーナス
  updateUI();
  endGame('🎉 ゲームクリア！');
}

function endGame(title) {
  gameRunning = false;
  clearInterval(gameLoopId);
  modalTitle.textContent = title;
  modalScore.textContent = `スコア: ${score}`;
  gameoverModal.classList.remove('hidden');
}

// ---------- スコア保存 ----------
document.getElementById('btn-save-score').addEventListener('click', async () => {
  const name = playerNameInput.value.trim() || 'Anonymous';
  try {
    const res = await fetch('/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player_name: name, score })
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
