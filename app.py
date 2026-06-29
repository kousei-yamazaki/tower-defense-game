from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import sqlite3
import os

app = Flask(__name__)
CORS(app)

DB_PATH = os.path.join(os.path.dirname(__file__), 'game.db')


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    conn.execute('''
        CREATE TABLE IF NOT EXISTS scores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player_name TEXT,
            score INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    conn.close()


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/score', methods=['POST'])
def save_score():
    data = request.get_json()
    player_name = data.get('player_name', 'Anonymous')
    score = data.get('score', 0)

    conn = get_db()
    conn.execute(
        'INSERT INTO scores (player_name, score) VALUES (?, ?)',
        (player_name, score)
    )
    conn.commit()
    conn.close()

    return jsonify({'status': 'ok', 'message': 'Score saved'}), 201


@app.route('/scores', methods=['GET'])
def get_scores():
    conn = get_db()
    rows = conn.execute(
        'SELECT player_name, score, created_at FROM scores ORDER BY score DESC LIMIT 10'
    ).fetchall()
    conn.close()

    scores = [dict(row) for row in rows]
    return jsonify(scores)


if __name__ == '__main__':
    init_db()
    app.run(debug=True, port=5000)
