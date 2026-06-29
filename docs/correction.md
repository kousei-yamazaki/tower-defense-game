# 修正依頼書（簡易）

***

## 件名

タワーディフェンスWebアプリの動作不具合修正

***

## 概要

Flask経由でアプリを起動した際に、画面は表示されるがJavaScript・CSSが正常に動作しない。

***

## 発生事象

* run\_app.batで起動するとUIが崩れる、または操作できない
* HTMLを直接開く場合のみ正常動作する

***

## 原因

以下の構成不備によるもの

* index.htmlがstaticフォルダ内に配置されている
* CSS/JSの読み込みパスがFlask形式になっていない
* Flaskのテンプレート機能を使用していない

***

## 修正内容

### 1. フォルダ構成の修正

以下の構成に変更すること

```
project/
├── app.py
├── templates/
│   └── index.html
├── static/
│   ├── style.css
│   └── main.js
```

### 2. Flaskコード修正（app.py）

```python
from flask import Flask, render_template

app = Flask(__name__)

@app.route("/")
def index():
    return render_template("index.html")

if __name__ == "__main__":
    app.run(debug=True)
```

***

## 完了条件

* run\_app.batで起動した状態で画面が正常に表示されること
* CSSが適用されていること
* JavaScriptが動作し、タワー配置が可能であること

***

## 備考

HTMLの直接起動を前提としない構成とすること
