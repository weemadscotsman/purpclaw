#!/usr/bin/env python3
"""
voice_stt.py — PURPCLAW Local Speech-to-Text Service
=====================================================
Port 7896  |  Uses faster-whisper for local transcription (no cloud)

Endpoints:
  POST /transcribe          — transcribe uploaded audio bytes (wav/webm/ogg)
  POST /transcribe/stream   — chunked streaming transcription (SSE)
  GET  /health              — service health
  GET  /devices             — list available audio input devices
  GET  /models              — list available whisper models
  POST /listen/start        — start continuous mic capture → SSE transcript stream
  POST /listen/stop         — stop mic capture
  GET  /listen/stream       — SSE stream of live transcription events

Install:
  pip install faster-whisper sounddevice numpy

Models (auto-downloaded to ~/.cache/huggingface):
  tiny      — ~40MB  very fast, lower accuracy
  base      — ~75MB  fast, decent accuracy   ← default
  small     — ~245MB medium speed, good accuracy
  medium    — ~769MB slower, great accuracy
  large-v3  — ~3GB   best accuracy, slow on CPU
"""

import os
import sys
import json
import time
import queue
import struct
import threading
import tempfile
import http.server
import socketserver
from datetime import datetime
from pathlib import Path

PORT        = int(os.environ.get('STT_PORT', '7896'))
MODEL_SIZE  = os.environ.get('STT_MODEL', 'base')
DEVICE      = os.environ.get('STT_DEVICE', 'cpu')       # 'cpu' or 'cuda'
COMPUTE     = os.environ.get('STT_COMPUTE', 'int8')     # 'int8' or 'float16'
LANGUAGE    = os.environ.get('STT_LANGUAGE')            # None = auto-detect
if LANGUAGE is not None and LANGUAGE.strip().lower() in ('', 'auto', 'none', 'null'):
    LANGUAGE = None
SAMPLE_RATE = 16000                                      # whisper expects 16kHz

# ── Optional dep check ────────────────────────────────────────────────────────
try:
    from faster_whisper import WhisperModel
    WHISPER_OK = True
except ImportError:
    WHISPER_OK = False
    print('[STT] WARNING: faster-whisper not installed. Run: pip install faster-whisper')
    print('[STT] Transcription endpoints will return 503 until installed.')

try:
    import sounddevice as sd
    import numpy as np
    AUDIO_OK = True
except ImportError:
    AUDIO_OK = False
    print('[STT] WARNING: sounddevice/numpy not installed. Run: pip install sounddevice numpy')
    print('[STT] Live mic capture will be unavailable.')

# ── Model singleton ───────────────────────────────────────────────────────────
_model     = None
_model_lock = threading.Lock()

def get_model():
    global _model
    with _model_lock:
        if _model is None and WHISPER_OK:
            print(f'[STT] Loading whisper model "{MODEL_SIZE}" on {DEVICE} ({COMPUTE})…')
            t0 = time.time()
            _model = WhisperModel(MODEL_SIZE, device=DEVICE, compute_type=COMPUTE)
            print(f'[STT] Model loaded in {time.time()-t0:.1f}s')
        return _model

# ── Live mic capture state ────────────────────────────────────────────────────
_listen_active = False
_listen_thread = None
_listen_queue  = queue.Queue(maxsize=256)
_listen_clients = []   # list of response objects for SSE
_listen_lock   = threading.Lock()

def _mic_worker():
    """Runs in background thread — captures mic, transcribes chunks, pushes to SSE queue."""
    global _listen_active
    if not AUDIO_OK or not WHISPER_OK:
        _listen_active = False
        return

    model = get_model()
    CHUNK_SEC  = float(os.environ.get('STT_CHUNK_SEC', '2.0'))
    chunk_size = int(SAMPLE_RATE * CHUNK_SEC)

    print(f'[STT] Mic capture started (chunk={CHUNK_SEC}s, rate={SAMPLE_RATE}Hz)')
    try:
        with sd.InputStream(samplerate=SAMPLE_RATE, channels=1, dtype='float32') as stream:
            while _listen_active:
                audio_chunk, _ = stream.read(chunk_size)
                audio_flat = audio_chunk.flatten()

                # Skip near-silence
                rms = float(np.sqrt(np.mean(audio_flat ** 2)))
                if rms < 0.005:
                    continue

                segs, info = model.transcribe(audio_flat, beam_size=5, language=LANGUAGE,
                                               vad_filter=True, vad_parameters={'threshold': 0.5})
                text = ' '.join(s.text.strip() for s in segs).strip()
                if text:
                    ts = datetime.utcnow().isoformat()
                    event = json.dumps({'ts': ts, 'text': text, 'lang': info.language, 'rms': round(rms, 4)})
                    try:
                        _listen_queue.put_nowait(event)
                    except queue.Full:
                        pass
    except Exception as e:
        print(f'[STT] Mic worker error: {e}')
    finally:
        _listen_active = False
        print('[STT] Mic capture stopped')

# ── HTTP helpers ──────────────────────────────────────────────────────────────
CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
}

def send_json(handler, status, data, extra_headers=None):
    body = json.dumps(data, indent=2).encode()
    handler.send_response(status)
    for k, v in CORS_HEADERS.items():
        handler.send_header(k, v)
    if extra_headers:
        for k, v in extra_headers.items():
            handler.send_header(k, v)
    handler.send_header('Content-Type', 'application/json')
    handler.send_header('Content-Length', str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)

def read_body(handler):
    length = int(handler.headers.get('Content-Length', 0))
    return handler.rfile.read(length) if length else b''

# ── Request handler ───────────────────────────────────────────────────────────
class STTHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # suppress default access log

    def do_OPTIONS(self):
        self.send_response(204)
        for k, v in CORS_HEADERS.items():
            self.send_header(k, v)
        self.end_headers()

    def do_GET(self):
        p = self.path.split('?')[0].rstrip('/')

        if p == '/health':
            send_json(self, 200, {
                'status': 'healthy',
                'service': 'voice-stt',
                'port': PORT,
                'whisper': WHISPER_OK,
                'audio': AUDIO_OK,
                'model': MODEL_SIZE,
                'model_loaded': _model is not None,
                'listen_active': _listen_active,
            })

        elif p == '/devices':
            if not AUDIO_OK:
                send_json(self, 503, {'error': 'sounddevice not installed'})
                return
            devices = sd.query_devices()
            out = []
            for i, d in enumerate(devices):
                if d['max_input_channels'] > 0:
                    out.append({'index': i, 'name': d['name'], 'channels': d['max_input_channels'],
                                'rate': int(d['default_samplerate'])})
            send_json(self, 200, {'devices': out})

        elif p == '/models':
            send_json(self, 200, {
                'current': MODEL_SIZE,
                'available': ['tiny', 'base', 'small', 'medium', 'large-v2', 'large-v3'],
                'loaded': _model is not None,
                'note': 'Set STT_MODEL env var to change. Requires restart.'
            })

        elif p == '/listen/stream':
            # SSE stream of live transcription events
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Cache-Control', 'no-cache')
            self.send_header('Connection', 'keep-alive')
            for k, v in CORS_HEADERS.items():
                self.send_header(k, v)
            self.end_headers()
            try:
                self.wfile.write(b'data: {"type":"connected","service":"voice-stt"}\n\n')
                self.wfile.flush()
                while True:
                    try:
                        event = _listen_queue.get(timeout=1.0)
                        self.wfile.write(f'data: {event}\n\n'.encode())
                        self.wfile.flush()
                    except queue.Empty:
                        # Heartbeat
                        self.wfile.write(b': heartbeat\n\n')
                        self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                pass  # client disconnected

        else:
            send_json(self, 404, {'error': 'not found', 'path': p})

    def do_POST(self):
        global _listen_active, _listen_thread
        p = self.path.split('?')[0].rstrip('/')

        if p == '/transcribe':
            if not WHISPER_OK:
                send_json(self, 503, {'error': 'faster-whisper not installed', 'install': 'pip install faster-whisper'})
                return
            body = read_body(self)
            if not body:
                send_json(self, 400, {'error': 'No audio data in body'})
                return

            # Write to temp file (faster-whisper accepts file paths)
            suffix = '.wav'
            ct = self.headers.get('Content-Type', '')
            if 'webm' in ct: suffix = '.webm'
            elif 'ogg' in ct: suffix = '.ogg'
            elif 'mp4' in ct or 'mpeg' in ct: suffix = '.mp4'

            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as f:
                f.write(body)
                tmp_path = f.name
            try:
                model = get_model()
                t0 = time.time()
                segs, info = model.transcribe(tmp_path, beam_size=5, language=LANGUAGE)
                text = ' '.join(s.text.strip() for s in segs).strip()
                elapsed = round(time.time() - t0, 3)
                send_json(self, 200, {
                    'text': text,
                    'language': info.language,
                    'language_probability': round(info.language_probability, 3),
                    'duration': round(info.duration, 2) if info.duration else None,
                    'elapsed_sec': elapsed,
                })
            except Exception as e:
                send_json(self, 500, {'error': str(e)})
            finally:
                try: os.unlink(tmp_path)
                except: pass

        elif p == '/listen/start':
            if not AUDIO_OK:
                send_json(self, 503, {'error': 'sounddevice not installed'})
                return
            if not WHISPER_OK:
                send_json(self, 503, {'error': 'faster-whisper not installed'})
                return
            if _listen_active:
                send_json(self, 200, {'ok': True, 'was_active': True})
                return
            # Pre-load model before starting mic
            get_model()
            _listen_active = True
            _listen_thread = threading.Thread(target=_mic_worker, daemon=True)
            _listen_thread.start()
            send_json(self, 200, {'ok': True, 'started': True, 'model': MODEL_SIZE})

        elif p == '/listen/stop':
            _listen_active = False
            send_json(self, 200, {'ok': True, 'stopped': True})

        else:
            send_json(self, 404, {'error': 'not found', 'path': p})


# ── Boot ──────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    # Pre-load model in background so first transcription is fast
    if WHISPER_OK:
        threading.Thread(target=get_model, daemon=True).start()

    server = socketserver.ThreadingTCPServer(('0.0.0.0', PORT), STTHandler)
    server.allow_reuse_address = True
    print(f'[STT] PURPCLAW Speech-to-Text service on :{PORT}')
    print(f'[STT] Model: {MODEL_SIZE} | Device: {DEVICE} | Language: {LANGUAGE or "auto"}')
    print(f'[STT] Whisper available: {WHISPER_OK} | Audio available: {AUDIO_OK}')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('[STT] Shutting down.')
        server.shutdown()
