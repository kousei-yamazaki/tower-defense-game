# 追加要件定義書：ゲーム速度変更機能

***

## 1. 概要

### 1.1 機能概要

ゲームの進行速度をユーザーが変更できる機能を追加する。  
操作によりゲームの更新処理を高速化し、快適なプレイを実現する。

***

## 2. 機能要件

### 2.1 倍速機能

#### 2.1.1 概要

ゲーム速度を以下の倍率で変更可能とする

* 1倍（通常速度）
* 2倍
* 4倍
* 8倍

***

### 2.2 UI要件

#### 2.2.1 表示内容

画面上に速度変更ボタンを配置する

```
[ x1 ][ x2 ][ x4 ][ x8 ]
```

#### 2.2.2 配置位置

* タワー選択エリア（`#tower-select-area`）内に配置する
* 既存のタワー選択ボタン・ウェーブ開始ボタンと同一行に並べる

***

### 2.3 操作仕様

* ボタン押下により速度を変更する
* 現在選択中の速度を視覚的に区別する（`selected` クラスを付与）

***

## 3. システム仕様

### 3.1 速度管理

#### 3.1.1 変数定義

```js
let gameSpeed = 1;
```

`game.js` のゲーム状態変数として定義する。

#### 3.1.2 初期値

```js
gameSpeed = 1
```

`init()` 関数内でリセットする。

***

### 3.2 ゲームループ仕様

#### 3.2.1 処理内容

ゲームループ（`gameLoop()`）内の更新処理を、速度倍率に応じて複数回実行する。

#### 3.2.2 実装仕様

現在の `gameLoop()` は `setInterval(gameLoop, 100)` で100ms間隔で呼び出されている。  
`gameSpeed` の値に応じて、1回の `gameLoop()` 呼び出し内で更新処理を複数回実行する。

```js
for (let i = 0; i < gameSpeed; i++) {
    updateGame();
}
```

ただし、現在の実装では `gameLoop()` 内に更新処理が直接記述されているため、  
更新処理を `updateGame()` 関数として切り出し、`gameLoop()` から呼び出す構成に変更する。

***

### 3.3 速度変更処理

#### 3.3.1 関数仕様

```js
function setSpeed(speed) { ... }
```

#### 3.3.2 処理内容

* `gameSpeed` の値を変更する
* 速度ボタン（`.speed-btn`）の `selected` クラスを更新する

```js
function setSpeed(speed) {
  gameSpeed = speed;
  document.querySelectorAll('.speed-btn').forEach(btn => {
    btn.classList.toggle('selected', parseInt(btn.dataset.speed) === speed);
  });
}
```

***

### 3.4 HTML追加仕様

`templates/index.html` の `#tower-select-area` 内に速度ボタンを追加する。

```html
<span class="select-label">速度：</span>
<button class="speed-btn selected" data-speed="1" onclick="setSpeed(1)">x1</button>
<button class="speed-btn" data-speed="2" onclick="setSpeed(2)">x2</button>
<button class="speed-btn" data-speed="4" onclick="setSpeed(4)">x4</button>
<button class="speed-btn" data-speed="8" onclick="setSpeed(8)">x8</button>
```

***

### 3.5 CSS追加仕様

`static/style.css` に `.speed-btn` のスタイルを追加する。  
既存の `.tower-btn` に準じたデザインとする。

```css
.speed-btn {
  background: #81C784;
  color: #fff;
  border: 2px solid #66BB6A;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.speed-btn:hover {
  background: #66BB6A;
  transform: translateY(-1px);
  box-shadow: 0 3px 8px rgba(0,0,0,0.2);
}

.speed-btn.selected {
  background: #FFF176;
  color: #333;
  border-color: #F9A825;
  box-shadow: 0 0 0 3px rgba(249, 168, 37, 0.4);
  transform: translateY(-2px);
}
```

***

## 4. 非機能要件

### 4.1 パフォーマンス

* 高倍率設定時（8倍）においても画面がフリーズしないこと
* 必要に応じて最大速度を制限可能とする

***

## 5. 制約事項

* リアルタイム時間変更ではなく、更新回数増加による疑似的高速化とする
* ゲームの時間管理は既存ロジックを維持する
* ゲームループは既存の `setInterval(gameLoop, 100)` を変更しない

***

## 6. 完了条件

* UIから速度変更が可能であること
* 各倍率でゲーム進行速度が変化すること
* 操作に対して即時に反映されること
* `init()` 呼び出し時（リスタート時）に速度が1倍にリセットされること

***

## 7. 影響範囲

* `game.js`：`gameSpeed` 変数追加、`updateGame()` 関数切り出し、`setSpeed()` 関数追加、`init()` 修正
* `templates/index.html`：速度ボタン追加
* `static/style.css`：`.speed-btn` スタイル追加

***

## 8. 実装対象ファイル

| ファイル | 変更内容 |
| --- | --- |
| `static/game.js` | `gameSpeed` 変数追加、`updateGame()` 切り出し、`setSpeed()` 追加、`init()` 修正 |
| `templates/index.html` | 速度ボタン追加 |
| `static/style.css` | `.speed-btn` スタイル追加 |
