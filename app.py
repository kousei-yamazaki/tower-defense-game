from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import sqlite3
import os

app = Flask(__name__)
CORS(app)

DB_PATH = os.path.join(os.path.dirname(__file__), 'game.db')

# -------------------------------------------------------
# 現在の有効バージョン識別子
# バランス調整時はここを更新し、migrate_db.py を実行する
# -------------------------------------------------------
CURRENT_VERSION = 'v2.0.0'


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """
    初回起動時にテーブルを作成する。
    既にマイグレーション済みの場合は何もしない。
    """
    conn = get_db()

    # scores テーブル（game_version_id 付き）
    conn.execute('''
        CREATE TABLE IF NOT EXISTS scores (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            player_name     TEXT    NOT NULL,
            score           INTEGER NOT NULL,
            game_version_id INTEGER REFERENCES game_versions(id),
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # game_versions テーブル
    conn.execute('''
        CREATE TABLE IF NOT EXISTS game_versions (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            version     TEXT    NOT NULL UNIQUE,
            description TEXT,
            max_wave    INTEGER NOT NULL DEFAULT 99,
            is_current  INTEGER NOT NULL DEFAULT 0,
            created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # 現在バージョンが未登録なら挿入
    conn.execute('''
        INSERT OR IGNORE INTO game_versions (version, description, max_wave, is_current)
        VALUES (?, ?, ?, ?)
    ''', (CURRENT_VERSION, 'タワー8種・手札システム・倍速機能追加版', 99, 1))

    conn.commit()
    conn.close()


def get_current_version_id(conn):
    """現在有効なバージョンの id を返す。"""
    row = conn.execute(
        'SELECT id FROM game_versions WHERE version = ?', (CURRENT_VERSION,)
    ).fetchone()
    return row['id'] if row else None


# -------------------------------------------------------
# ルート
# -------------------------------------------------------

@app.route('/')
def index():
    return render_template('index.html')


# -------------------------------------------------------
# POST /score  ─ スコア保存
# -------------------------------------------------------
@app.route('/score', methods=['POST'])
def save_score():
    data = request.get_json()
    if not data:
        return jsonify({'status': 'error', 'message': 'Invalid JSON'}), 400

    player_name = data.get('player_name', 'Anonymous')
    score = data.get('score', 0)

    conn = get_db()
    version_id = get_current_version_id(conn)

    conn.execute(
        'INSERT INTO scores (player_name, score, game_version_id) VALUES (?, ?, ?)',
        (player_name, score, version_id)
    )
    conn.commit()
    conn.close()

    return jsonify({'status': 'ok', 'message': 'Score saved'}), 201


# -------------------------------------------------------
# GET /scores  ─ 現在バージョンのランキング取得（上位10件）
# -------------------------------------------------------
@app.route('/scores', methods=['GET'])
def get_scores():
    conn = get_db()

    # クエリパラメータで version 指定可能（省略時は現在バージョン）
    version = request.args.get('version', CURRENT_VERSION)

    rows = conn.execute('''
        SELECT
            s.player_name,
            s.score,
            s.created_at,
            gv.version AS game_version
        FROM scores s
        JOIN game_versions gv ON s.game_version_id = gv.id
        WHERE gv.version = ?
        ORDER BY s.score DESC
        LIMIT 10
    ''', (version,)).fetchall()
    conn.close()

    scores = [dict(row) for row in rows]
    return jsonify(scores)


# -------------------------------------------------------
# GET /scores/all  ─ 全バージョンのスコア一覧（管理用）
# -------------------------------------------------------
@app.route('/scores/all', methods=['GET'])
def get_all_scores():
    conn = get_db()
    rows = conn.execute('''
        SELECT
            s.id,
            s.player_name,
            s.score,
            s.created_at,
            gv.version      AS game_version,
            gv.is_current   AS is_current_version
        FROM scores s
        LEFT JOIN game_versions gv ON s.game_version_id = gv.id
        ORDER BY gv.version DESC, s.score DESC
    ''').fetchall()
    conn.close()

    scores = [dict(row) for row in rows]
    return jsonify(scores)


# -------------------------------------------------------
# GET /versions  ─ バージョン一覧取得
# -------------------------------------------------------
@app.route('/versions', methods=['GET'])
def get_versions():
    conn = get_db()
    rows = conn.execute('''
        SELECT
            id,
            version,
            description,
            max_wave,
            is_current,
            created_at
        FROM game_versions
        ORDER BY id DESC
    ''').fetchall()
    conn.close()

    versions = [dict(row) for row in rows]
    return jsonify(versions)


if __name__ == '__main__':
    init_db()
    app.run(debug=True, port=5000)
