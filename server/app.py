import re
import base64
import io
import json
import os
import sqlite3
from datetime import datetime

import tldextract
from flask import Flask, jsonify, request
from flask_cors import CORS
from PIL import Image

app = Flask(__name__)
CORS(app)  # <-- enable CORS for all origins

UPLOAD_FOLDER = "uploads/screenshots"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

DB_FILE = "ad_data.db"

# Initialize SQLite database


def init_db():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('''
    CREATE TABLE IF NOT EXISTS ads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ad_id TEXT,
        bid_meta TEXT,
        dom_html TEXT,
        http_request TEXT,
        etld TEXT,
        screenshot_path TEXT,
        context TEXT,
        created_at TEXT
    )
    ''')
    conn.commit()
    conn.close()


init_db()

# Sanitize filename


def sanitize_filename(name):
    return re.sub(r"[^a-zA-Z0-9_-]", "_", name)


@app.route("/upload_ad", methods=["POST"])
def upload_ad():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"status": "error", "message": "No JSON data received"}), 400

        ad_id = data.get("ad_id", "no-id")
        bid_meta = json.dumps(data.get("bid_meta", {}))
        dom_html = data.get("dom_html", "")
        ad_url = data.get("ad_url", "")
        screenshot_b64 = data.get("screenshot")
        context_url = data.get("context", "")

        # Compute ETLD from ad URL
        ext = tldextract.extract(ad_url)
        etld = f"{ext.domain}.{ext.suffix}" if ext.suffix else ext.domain

        safe_id = sanitize_filename(ad_id)
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        screenshot_path = None

        # Save screenshot if valid
        if screenshot_b64:
            try:
                if "," in screenshot_b64:
                    header, encoded = screenshot_b64.split(",", 1)
                else:
                    encoded = screenshot_b64
                img_bytes = base64.b64decode(encoded)
                image = Image.open(io.BytesIO(img_bytes))
                image.verify()  # will raise exception if invalid
                screenshot_file = os.path.join(UPLOAD_FOLDER, f"{safe_id}_{timestamp}.png")
                with open(screenshot_file, "wb") as f:
                    f.write(img_bytes)
                screenshot_path = screenshot_file
            except Exception as e:
                print("Screenshot invalid or empty, skipping:", e)
                screenshot_path = None

        # Insert into SQLite
        conn = sqlite3.connect(DB_FILE)
        c = conn.cursor()
        c.execute('''
        INSERT INTO ads (ad_id, bid_meta, dom_html, http_request, etld, screenshot_path, context, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (ad_id, bid_meta, dom_html, ad_url, etld, screenshot_path, context_url, datetime.utcnow().isoformat()))
        conn.commit()
        conn.close()

        return jsonify({"status": "success", "screenshot_saved": screenshot_path is not None})

    except Exception as e:
        # Catch all other errors
        return jsonify({"status": "error", "message": str(e)}), 400


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5500)
