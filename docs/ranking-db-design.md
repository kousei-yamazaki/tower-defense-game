# ランキングDB設計書（バージョン管理対応）

***

## 1. 概要

ゲームのウェーブ仕様・難易度変更に伴い、過去スコアと現在スコアが混在する問題を解決するため、
ゲームバージョンごとにランキングを分離できるDB設計に変更した。

***

## 2. テーブル設計

### 2.1 game_versions テーブル（新規追加）

```sql
CREATE TABLE game_versions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    version     TEXT    NOT NULL UNIQUE,       -- バージョン識別子 例: 'v2.0.0'
    description TEXT,                          -- バージョンの説明
    max_wave    INTEGER NOT NULL DEFAULT 99,   -- そのバージョンの最大Wave数
    is_current  INTEGER NOT NULL DEFAULT 0,    -- 1=現在有効, 0=旧バージョン
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### 登録済みバージョン

| id | version | description                        | is_current |
|----|---------|------------------------------------|------------|
| 1  | v1.0.0  | 初期バージョン（タワー3種・Wave仕様変更前） | 0（旧）    |
| 2  | v2.0.0  | タワー8種・手札システム・倍速機能追加版    | 1（現在）  |

***

### 2.2 scores テーブル（拡張）

```sql
CREATE TABLE scores (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    player_name     TEXT    NOT NULL,
    score           INTEGER NOT NULL,              -- 到達Wave数
    game_version_id INTEGER REFERENCES game_versions(id),  -- ★追加
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### 変更点

| カラム           | 変更内容                                      |
|-----------------|----------------------------------------------|
| game_version_id | 新規追加。game_versions.id への外部キー参照    |

***

## 3. マイグレーション手順

### 3.1 初回マイグレーション（既存DBへの適用）

```bash
python migrate_db.py
```

#### 処理内容

1. `game_versions` テーブルを作成
2. 旧バージョン `v1.0.0` を登録（`is_current = 0`）
3. 現在バージョン `v2.0.0` を登録（`is_current = 1`）
4. `scores` テーブルに `game_version_id` カラムを追加
5. 既存スコア（4件）を `v1.0.0` に紐付け（データは削除しない）

#### 実行結果

```
=== ランキングDBマイグレーション開始 ===

[STEP 1] game_versions テーブルを作成...
  -> game_versions テーブル作成完了

[STEP 2] 旧バージョン v1.0.0 を登録...
  -> v1.0.0 登録完了 (id=1)

[STEP 3] 現在のバージョン v2.0.0 を登録...
  -> v2.0.0 登録完了 (id=2)

[STEP 4] scores テーブルに game_version_id カラムを追加...
  -> game_version_id カラム追加完了

[STEP 5] 既存スコアを v1.0.0 に紐付け...
  -> 4 件のスコアを v1.0.0 に紐付けました

=== マイグレーション完了 ===
```

***

### 3.2 将来のバランス調整時の手順

1. `app.py` の `CURRENT_VERSION` を更新する

```python
# app.py
CURRENT_VERSION = 'v3.0.0'  # 新バージョンに変更
```

2. `migrate_db.py` に新バージョンを追加して実行する

```python
# migrate_db.py に追記
cur.execute('''
    INSERT OR IGNORE INTO game_versions (version, description, max_wave, is_current)
    VALUES (?, ?, ?, ?)
''', ('v3.0.0', '敵種類拡張・ボス追加版', 99, 1))

# 旧バージョンを無効化
cur.execute("UPDATE game_versions SET is_current = 0 WHERE version != 'v3.0.0'")
```

3. `python migrate_db.py` を実行する

> **ポイント**: 旧バージョンのスコアは削除されず、`is_current = 0` として保持される。

***

## 4. ランキング取得クエリ

### 4.1 現在バージョンのランキング（通常使用）

```sql
SELECT
    s.player_name,
    s.score,
    s.created_at,
    gv.version AS game_version
FROM scores s
JOIN game_versions gv ON s.game_version_id = gv.id
WHERE gv.version = 'v2.0.0'   -- 現在バージョンのみ
ORDER BY s.score DESC
LIMIT 10;
```

### 4.2 特定バージョンのランキング（バージョン指定）

```sql
SELECT
    s.player_name,
    s.score,
    s.created_at,
    gv.version AS game_version
FROM scores s
JOIN game_versions gv ON s.game_version_id = gv.id
WHERE gv.version = 'v1.0.0'   -- 旧バージョンも参照可能
ORDER BY s.score DESC
LIMIT 10;
```

### 4.3 全バージョンのスコア一覧（管理用）

```sql
SELECT
    s.id,
    s.player_name,
    s.score,
    s.created_at,
    gv.version      AS game_version,
    gv.is_current   AS is_current_version
FROM scores s
LEFT JOIN game_versions gv ON s.game_version_id = gv.id
ORDER BY gv.version DESC, s.score DESC;
```

***

## 5. API設計

### 5.1 エンドポイント一覧

| メソッド | パス          | 説明                                     |
|---------|--------------|------------------------------------------|
| POST    | /score       | スコア保存（現在バージョンに自動紐付け）     |
| GET     | /scores      | 現在バージョンのランキング取得（上位10件）   |
| GET     | /scores?version=v1.0.0 | 指定バージョンのランキング取得  |
| GET     | /scores/all  | 全バージョンのスコア一覧（管理用）          |
| GET     | /versions    | バージョン一覧取得                         |

***

### 5.2 POST /score

#### リクエスト

```json
{
    "player_name": "プレイヤー名",
    "score": 42
}
```

#### レスポンス（成功）

```json
{
    "status": "ok",
    "message": "Score saved"
}
```

> スコアは自動的に `CURRENT_VERSION`（現在 `v2.0.0`）に紐付けられる。

***

### 5.3 GET /scores

#### リクエスト例

```
GET /scores
GET /scores?version=v1.0.0
```

#### レスポンス例

```json
[
    {
        "player_name": "Alice",
        "score": 87,
        "created_at": "2026-06-30 10:00:00",
        "game_version": "v2.0.0"
    },
    {
        "player_name": "Bob",
        "score": 65,
        "created_at": "2026-06-30 09:30:00",
        "game_version": "v2.0.0"
    }
]
```

***

### 5.4 GET /scores/all（管理用）

#### レスポンス例

```json
[
    {
        "id": 5,
        "player_name": "Alice",
        "score": 87,
        "created_at": "2026-06-30 10:00:00",
        "game_version": "v2.0.0",
        "is_current_version": 1
    },
    {
        "id": 1,
        "player_name": "a",
        "score": 3580,
        "created_at": "2026-06-29 01:33:52",
        "game_version": "v1.0.0",
        "is_current_version": 0
    }
]
```

***

### 5.5 GET /versions

#### レスポンス例

```json
[
    {
        "id": 2,
        "version": "v2.0.0",
        "description": "タワー8種・手札システム・倍速機能追加版",
        "max_wave": 99,
        "is_current": 1,
        "created_at": "2026-06-30 00:40:04"
    },
    {
        "id": 1,
        "version": "v1.0.0",
        "description": "初期バージョン（タワー3種・Wave仕様変更前）",
        "max_wave": 99,
        "is_current": 0,
        "created_at": "2026-06-30 00:40:04"
    }
]
```

***

## 6. 設計方針まとめ

| 要件                                   | 対応方法                                                    |
|---------------------------------------|-------------------------------------------------------------|
| ゲームバージョンごとにランキングを分離    | `game_versions` テーブルで管理し、`scores` に外部キーを追加  |
| 将来のバランス調整にも対応できる設計      | `CURRENT_VERSION` 定数を変更するだけで切り替え可能           |
| 既存データは削除せず旧バージョンとして扱う | `is_current = 0` で無効化。データは保持                     |
| 現在バージョンのみランキング表示          | `WHERE gv.version = ?` でフィルタリング                     |

***

## 7. ファイル構成

```
tower-defense-game/
├── app.py              ← API実装（更新済み）
├── migrate_db.py       ← マイグレーションスクリプト（新規追加）
├── game.db             ← SQLiteデータベース（マイグレーション済み）
└── docs/
    └── ranking-db-design.md  ← 本ドキュメント
```
