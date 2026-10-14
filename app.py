"""
VF-DIAG PRO - VinFast EV OBD-II Live Diagnostic & Battery Health Pro
Desktop Application Launcher (Flask + PyWebView / Standalone Web Desktop)
"""

import os
import sys
import json
import logging
import threading
import time
# pyrefly: ignore [missing-import]
from flask import Flask, request, jsonify, send_from_directory
# pyrefly: ignore [missing-import]
import webview

from decoder import VinFastDecoder
from obd_reader import VinFastOBDReader

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("VFDiagApp")

# Setup directories with PyInstaller sys._MEIPASS support
def get_resource_path(relative_path: str) -> str:
    if hasattr(sys, '_MEIPASS'):
        return os.path.join(sys._MEIPASS, relative_path)
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), relative_path)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = get_resource_path("static")
SAMPLE_FILE = get_resource_path("RLNV5JSE0TH720262_BMS_DataFlow_Report_20261013_161604.xlsx")

import atexit

app = Flask(__name__, static_folder=STATIC_DIR)

# Initialize core engines
decoder = VinFastDecoder()
obd_reader = VinFastOBDReader(decoder)

# Register safe shutdown cleanup
atexit.register(obd_reader.close)

# Pre-load sample data if available
if os.path.exists(SAMPLE_FILE):
    try:
        sample_summary = decoder.decode_all_from_excel(SAMPLE_FILE)
        obd_reader.current_state = sample_summary
        logger.info("Successfully loaded sample VinFast BMS DataFlow Report.")
    except Exception as e:
        logger.warning(f"Could not load initial sample file: {e}")

# ----------------- Flask Routes -----------------

@app.route("/api/auto_connect", methods=["POST"])
def auto_connect_obd():
    res = obd_reader.auto_connect_and_scan()
    return jsonify(res)

@app.route("/api/reset_session", methods=["POST"])
def reset_session():
    obd_reader.analyzer.reset_session()
    return jsonify({"success": True, "message": "Phiên đo năng lượng đã được đặt lại."})

@app.route("/")
def index():
    return send_from_directory(STATIC_DIR, "index.html")

@app.route("/<path:path>")
def static_proxy(path):
    return send_from_directory(STATIC_DIR, path)

@app.route("/api/ports", methods=["GET"])
def get_ports():
    ports = obd_reader.get_available_ports()
    return jsonify(ports)

@app.route("/api/connect", methods=["POST"])
def connect_obd():
    data = request.json or {}
    port = data.get("port", "")
    baud = int(data.get("baud", 115200))
    success = obd_reader.connect(port, baud)
    return jsonify({"success": success, "port": port, "baud": baud})

@app.route("/api/disconnect", methods=["POST"])
def disconnect_obd():
    obd_reader.disconnect()
    return jsonify({"success": True})

@app.route("/api/start_scan", methods=["POST"])
def start_scan():
    obd_reader.start_live_scan()
    return jsonify({"success": True, "scanning": True})

@app.route("/api/stop_scan", methods=["POST"])
def stop_scan():
    obd_reader.stop_live_scan()
    return jsonify({"success": True, "scanning": False})

@app.route("/api/demo", methods=["POST"])
def start_demo():
    obd_reader.connect_simulation()
    return jsonify({"success": True, "simulation": True})

@app.route("/api/state", methods=["GET"])
def get_state():
    return jsonify(obd_reader.current_state)

@app.route("/api/parameters", methods=["GET"])
def get_parameters():
    raw_items = obd_reader.current_state.get("raw_items", [])
    if not raw_items:
        # Fallback to decoder parameters
        raw_items = decoder.parameters
    return jsonify(raw_items)

@app.route("/api/upload_file", methods=["POST"])
def upload_file():
    if "file" not in request.files:
        return jsonify({"success": False, "error": "Không tìm thấy file"}), 400

    uploaded = request.files["file"]
    if not uploaded.filename:
        return jsonify({"success": False, "error": "Chưa chọn file"}), 400

    temp_path = os.path.join(BASE_DIR, f"temp_{int(time.time())}_{uploaded.filename}")
    uploaded.save(temp_path)

    try:
        summary = decoder.decode_all_from_excel(temp_path)
        obd_reader.current_state = summary
        if os.path.exists(temp_path):
            os.remove(temp_path)
        return jsonify({"success": True, "data": summary})
    except Exception as e:
        logger.error(f"Error parsing file {uploaded.filename}: {e}")
        if os.path.exists(temp_path):
            os.remove(temp_path)
        return jsonify({"success": False, "error": str(e)}), 500

# ----------------- App Launcher -----------------

def run_server():
    app.run(host="127.0.0.1", port=8765, debug=False, use_reloader=False)

def main():
    # Start Flask in background thread
    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()
    time.sleep(0.8)

    # Automatically attempt OBD connection and scan immediately
    threading.Thread(target=obd_reader.auto_connect_and_scan, daemon=True).start()

    logger.info("=" * 60)
    logger.info("  VF-DIAG PRO - VINFAST EV OBD-II DIAGNOSTIC SOFTWARE")
    logger.info("  Web UI Available at: http://127.0.0.1:8765")
    logger.info("=" * 60)

    # Launch PyWebView desktop window
    try:
        window = webview.create_window(
            title="VF-DIAG PRO | VinFast EV Live Diagnostic & Battery Health",
            url="http://127.0.0.1:8765",
            width=1320,
            height=860,
            min_size=(1024, 700),
            background_color="#080c14"
        )
        webview.start()
    except Exception as e:
        logger.warning(f"PyWebView GUI window failed or was closed ({e}).")
        logger.info("Application is still active in browser mode at http://127.0.0.1:8765")
        # Keep alive for browser use
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            pass

if __name__ == "__main__":
    main()
