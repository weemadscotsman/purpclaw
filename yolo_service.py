#!/usr/bin/env python3
"""
PURPCLAW YOLO Detection Service
Loads YOLO model once and serves detection requests via HTTP.
 Eliminates model loading overhead on each call.
"""

import os
import sys
import json
import base64
import asyncio
import numpy as np
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import threading
import traceback

# Suppress ultralytics banner
os.environ['YOLO_VERBOSE'] = 'False'

from ultralytics import YOLO
import cv2

PORT = 7779
MODEL_PATH = 'yolov8n.pt'
model = None
model_lock = threading.Lock()

def load_model():
    """Load YOLO model once at startup."""
    global model
    if model is None:
        print(f"[YOLO] Loading model: {MODEL_PATH}")
        model = YOLO(MODEL_PATH)
        print("[YOLO] Model loaded successfully")
    return model

class YOLOHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # Quiet logging

    def do_POST(self):
        """Handle POST /detect - detect objects in base64 image."""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)

            # Parse JSON request
            try:
                req = json.loads(body.decode('utf-8'))
            except:
                self.send_error(400, "Invalid JSON")
                return

            # Get image (base64 or path)
            img_data = req.get('image')
            confidence = float(req.get('confidence', 0.5))

            img = None

            if isinstance(img_data, str):
                # Check if it's a base64 image (data URI or raw base64)
                if img_data.startswith('data:image'):
                    # Data URI format: data:image/png;base64,xxxxx
                    img_data = img_data.split(',')[1]

                try:
                    # Try as base64 first
                    img_bytes = base64.b64decode(img_data)
                    nparr = np.frombuffer(img_bytes, np.uint8)
                    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                except Exception:
                    # Try as file path
                    if os.path.exists(img_data):
                        img = cv2.imread(img_data)
                    else:
                        self.send_error(400, f"Invalid image source: {img_data}")
                        return

            if img is None:
                self.send_error(400, "Could not decode image")
                return

            # Run detection with cached model
            with model_lock:
                m = load_model()
                results = m(img, conf=confidence, verbose=False)

            # Parse results
            detections = []
            for r in results:
                for box in r.boxes:
                    cls_name = r.names[int(box.cls[0])]
                    conf = float(box.conf[0])
                    x1, y1, x2, y2 = map(int, box.xyxy[0])
                    detections.append({
                        "class": cls_name,
                        "conf": round(conf, 3),
                        "bbox": [x1, y1, x2, y2],
                        "center": [int((x1+x2)/2), int((y1+y2)/2)]
                    })

            response = {
                "count": len(detections),
                "objects": detections,
                "success": True
            }

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(response).encode('utf-8'))

        except Exception as e:
            error_response = {
                "error": str(e),
                "trace": traceback.format_exc(),
                "success": False
            }
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(error_response).encode('utf-8'))

    def do_GET(self):
        """Health check endpoint."""
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        response = {"status": "ok", "model": MODEL_PATH, "port": PORT}
        self.wfile.write(json.dumps(response).encode('utf-8'))

def main():
    """Start the YOLO service."""
    print(f"[YOLO] Starting YOLO Detection Service on port {PORT}")

    # Preload model
    load_model()

    # Start HTTP server
    server = HTTPServer(('127.0.0.1', PORT), YOLOHandler)
    print(f"[YOLO] Service ready on http://127.0.0.1:{PORT}")
    print(f"[YOLO] POST /detect with JSON body: {{'image': '<base64_or_path>', 'confidence': 0.5}}")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[YOLO] Shutting down...")
        server.shutdown()

if __name__ == '__main__':
    main()