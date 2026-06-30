"""
migrate_db.py
=============
ランキングDBマイグレーションスクリプト

【実行方法】
    python migrate_db.py

【処理内容】
1. game_versions テーブルを作成（バージョン管理）
2. scores テーブルに game_version_id カラムを追加
3. 既存データを v1.0.0（旧バージョン）として保存
4. 現在のバージョン v2.0.0 を登録
"""

import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'game.db')


def migrate():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    print("=== ランキングDBマイグレーション開始 ===\n")

    # -------------------------------------------------------
    # STEP 1: game_versions テーブルを作成
    # -------------------------------------------------------
    print("[STEP 1] game_versions テーブルを作成...")
    cur.execute('''
        CREATE TABLE IF NOT EXISTS game_versions (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            version     TEXT    NOT NULL UNIQUE,
            description TEXT,
            max_wave    INTEGER NOT NULL DEFAULT 99,
            is_current  INTEGER NOT NULL DEFAULT 0,  -- 1=現在有効, 0=旧バージョン
            created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    print("  -> game_versions テーブル作成完了\n")

    # -------------------------------------------------------
    # STEP 2: 旧バージョン v1.0.0 を登録（既存データ用）
    # -------------------------------------------------------
    print("[STEP 2] 旧バージョン v1.0.0 を登録...")
    cur.execute('''
        INSERT OR IGNORE INTO game_versions (version, description, max_wave, is_current)
        VALUES (?, ?, ?, ?)
    ''', (
        'v1.0.0',
        '初期バージョン（タワー3種・Wave仕様変更前）',
        99,
        0   # 旧バージョン = 無効
    ))
    v1_id = cur.execute(
        "SELECT id FROM game_versions WHERE version = 'v1.0.0'"
    ).fetchone()['id']
    print(f"  -> v1.0.0 登録完了 (id={v1_id})\n")

    # -------------------------------------------------------
    # STEP 3: 現在のバージョン v2.0.0 を登録
    # -------------------------------------------------------
    print("[STEP 3] 現在のバージョン v2.0.0 を登録...")
    cur.execute('''
        INSERT OR IGNORE INTO game_versions (version, description, max_wave, is_current)
        VALUES (?, ?, ?, ?)
    ''', (
        'v2.0.0',
        'タワー8種・手札システム・倍速機能追加版',
        99,
        1   # 現在有効
    ))
    v2_id = cur.execute(
        "SELECT id FROM game_versions WHERE version = 'v2.0.0'"
    ).fetchone()['id']
    print(f"  -> v2.0.0 登録完了 (id={v2_id})\n")

    # -------------------------------------------------------
    # STEP 4: scores テーブルに game_version_id カラムを追加
    # -------------------------------------------------------
    print("[STEP 4] scores テーブルに game_version_id カラムを追加...")
    existing_cols = [
        row[1] for row in cur.execute("PRAGMA table_info(scores)").fetchall()
    ]
    if 'game_version_id' not in existing_cols:
        cur.execute('''
            ALTER TABLE scores
            ADD COLUMN game_version_id INTEGER
                REFERENCES game_versions(id)
        ''')
        print("  -> game_version_id カラム追加完了")
    else:
        print("  -> game_version_id カラムは既に存在します（スキップ）")

    # -------------------------------------------------------
    # STEP 5: 既存データを v1.0.0 に紐付け
    # -------------------------------------------------------
    print("\n[STEP 5] 既存スコアを v1.0.0 に紐付け...")
    cur.execute('''
        UPDATE scores
        SET game_version_id = ?
        WHERE game_version_id IS NULL
    ''', (v1_id,))
    updated = cur.rowcount
    print(f"  -> {updated} 件のスコアを v1.0.0 に紐付けました\n")

    conn.commit()
    conn.close()

    print("=== マイグレーション完了 ===")
    print(f"  旧バージョン (v1.0.0, id={v1_id}): 既存スコート {updated} 件を保存")
    print(f"  現在バージョン (v2.0.0, id={v2_id}): 新規スコアはこちらに保存されます")
    print()
    print("次のステップ:")
    print("  1. app.py を更新済みバージョンに差し替えてください")
    print("  2. python app.py で起動確認してください")


if __name__ == '__main__':
    migrate()
