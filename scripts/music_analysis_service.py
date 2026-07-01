#!/usr/bin/env python3
"""
PURPCLAW Music Analysis Service
================================
Persistent music/audio analysis using Librosa.
Provides beat detection, tempo, pitch, spectral features, mood detection, and genre classification.

Usage:
    python music_analysis_service.py [--port PORT]

HTTP API:
    POST /analyze      - Full audio analysis
    POST /tempo        - Tempo and beat analysis
    POST /pitch        - Pitch and chroma analysis
    POST /spectral     - Spectral features (MFCCs, spectrogram)
    POST /mood         - Mood detection
    POST /genre        - Genre classification
    POST /identify     - Audio fingerprinting / song identification
    GET  /stats        - Service statistics
    GET  /health       - Health check
"""

import os
import sys
import io
import json
import time
import hashlib
import argparse
import threading

# No leaky drawers: self memory watchdog (librosa/audio can spike; backstops PM2).
try:
    import mem_guard
    mem_guard.install(label="music", limit_mb=int(os.environ.get("MUSIC_MEM_LIMIT_MB", "1500")))
except Exception:
    pass
from concurrent.futures import ThreadPoolExecutor
from typing import Optional, Dict, Any, List, Tuple

# Try to import librosa, handle if not available
try:
    import librosa
    import librosa.display
    LIBROSA_AVAILABLE = True
except ImportError:
    LIBROSA_AVAILABLE = False
    print("[MUSIC] Librosa not available, running in fallback mode")

import numpy as np
from scipy import stats
from dataclasses import dataclass, asdict
from datetime import datetime
import base64

# Default port
DEFAULT_PORT = 7782  # Using 7782 as it's after Voice Bridge but before other services

# Thread pool for parallel processing
executor = ThreadPoolExecutor(max_workers=4)

# Service statistics
stats_lock = threading.Lock()
service_stats = {
    "start_time": None,
    "requests_total": 0,
    "requests_by_type": {},
    "audio_processed_seconds": 0,
    "errors": 0
}


@dataclass
class AnalysisResult:
    """Container for analysis results."""
    success: bool
    analysis_type: str
    duration: float
    error: Optional[str] = None
    data: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class MoodClassifier:
    """Rule-based mood classifier using audio features."""

    # Mood definitions based on audio characteristics
    MOOD_PROFILES = {
        "happy": {
            "tempo_range": (100, 140),
            "energy_range": (0.5, 1.0),
            "valence_range": (0.6, 1.0),
            "danceability_min": 0.6
        },
        "sad": {
            "tempo_range": (60, 100),
            "energy_range": (0.0, 0.5),
            "valence_range": (0.0, 0.4),
            "danceability_min": 0.3
        },
        "energetic": {
            "tempo_range": (120, 180),
            "energy_range": (0.7, 1.0),
            "valence_range": (0.4, 1.0),
            "danceability_min": 0.7
        },
        "calm": {
            "tempo_range": (40, 90),
            "energy_range": (0.0, 0.4),
            "valence_range": (0.3, 0.8),
            "danceability_min": 0.2
        },
        "aggressive": {
            "tempo_range": (100, 160),
            "energy_range": (0.8, 1.0),
            "valence_range": (0.0, 0.5),
            "danceability_min": 0.5,
            "spectral_min": 0.6
        },
        "romantic": {
            "tempo_range": (60, 100),
            "energy_range": (0.3, 0.7),
            "valence_range": (0.5, 0.9),
            "danceability_min": 0.4,
            "tempo_std_max": 15
        },
        "mysterious": {
            "tempo_range": (50, 100),
            "energy_range": (0.2, 0.6),
            "valence_range": (0.2, 0.6),
            "danceability_min": 0.3,
            "spectral_min": 0.4
        },
        "uplifting": {
            "tempo_range": (90, 130),
            "energy_range": (0.5, 0.9),
            "valence_range": (0.6, 1.0),
            "danceability_min": 0.5
        }
    }

    @classmethod
    def classify(cls, features: Dict[str, Any]) -> Dict[str, Any]:
        """Classify mood based on audio features."""
        scores = {}

        for mood, profile in cls.MOOD_PROFILES.items():
            score = 0
            weights = []

            # Tempo match
            if "tempo" in features:
                tempo = features["tempo"]
                t_min, t_max = profile["tempo_range"]
                if t_min <= tempo <= t_max:
                    score += 3
                weights.append(1)

            # Energy match
            if "energy" in features:
                energy = features["energy"]
                e_min, e_max = profile["energy_range"]
                if e_min <= energy <= e_max:
                    score += 2
                weights.append(1)

            # Valence match
            if "valence" in features:
                valence = features["valence"]
                v_min, v_max = profile["valence_range"]
                if v_min <= valence <= v_max:
                    score += 2
                weights.append(1)

            # Danceability match
            if "danceability" in features:
                dance = features["danceability"]
                if dance >= profile.get("danceability_min", 0):
                    score += 2
                weights.append(1)

            # Spectral contrast match
            if "spectral_contrast" in features and "spectral_min" in profile:
                if features["spectral_contrast"] >= profile["spectral_min"]:
                    score += 1
                weights.append(0.5)

            # Tempo stability (for romantic)
            if "tempo_std" in features and "tempo_std_max" in profile:
                if features["tempo_std"] <= profile["tempo_std_max"]:
                    score += 1
                weights.append(0.5)

            if weights:
                scores[mood] = score / sum(weights)
            else:
                scores[mood] = 0

        # Get top moods
        sorted_moods = sorted(scores.items(), key=lambda x: x[1], reverse=True)
        top_moods = sorted_moods[:3]

        return {
            "primary_mood": top_moods[0][0] if top_moods else "unknown",
            "mood_scores": {mood: round(score, 2) for mood, score in top_moods},
            "features_used": list(features.keys())
        }


class GenreClassifier:
    """Rule-based genre classifier using audio features."""

    # Genre profiles based on typical audio characteristics
    GENRE_PROFILES = {
        "electronic": {
            "tempo_range": (100, 150),
            "instrumental_prob": 0.8,
            "spectral_centroid_range": (2000, 8000),
            "zero_crossing_min": 0.1,
            "danceability_min": 0.6
        },
        "rock": {
            "tempo_range": (100, 140),
            "instrumental_prob": 0.3,
            "energy_min": 0.6,
            "spectral_contrast_min": 0.4
        },
        "classical": {
            "tempo_range": (40, 120),
            "instrumental_prob": 0.95,
            "tempo_std_max": 10,
            "spectral_centroid_range": (1000, 6000)
        },
        "jazz": {
            "tempo_range": (60, 140),
            "instrumental_prob": 0.7,
            "tempo_std_max": 20,
            "spectral_contrast_min": 0.3
        },
        "hiphop": {
            "tempo_range": (80, 115),
            "instrumental_prob": 0.4,
            "energy_min": 0.5,
            "danceability_min": 0.7
        },
        "pop": {
            "tempo_range": (100, 130),
            "instrumental_prob": 0.2,
            "energy_range": (0.5, 0.9),
            "danceability_min": 0.6
        },
        "metal": {
            "tempo_range": (100, 180),
            "instrumental_prob": 0.6,
            "energy_min": 0.8,
            "spectral_contrast_min": 0.5
        },
        "country": {
            "tempo_range": (80, 140),
            "instrumental_prob": 0.5,
            "acoustic_prob": 0.4,
            "energy_range": (0.4, 0.8)
        },
        "reggae": {
            "tempo_range": (60, 100),
            "instrumental_prob": 0.5,
            "danceability_min": 0.7,
            "zero_crossing_max": 0.15
        },
        "folk": {
            "tempo_range": (70, 140),
            "instrumental_prob": 0.6,
            "acoustic_prob": 0.5,
            "energy_range": (0.3, 0.7)
        },
        "blues": {
            "tempo_range": (60, 120),
            "instrumental_prob": 0.5,
            "energy_range": (0.3, 0.7),
            "tempo_std_max": 15
        },
        "ambient": {
            "tempo_range": (40, 90),
            "instrumental_prob": 0.9,
            "energy_max": 0.4,
            "danceability_min": 0.2
        },
        "dance": {
            "tempo_range": (115, 150),
            "instrumental_prob": 0.6,
            "energy_min": 0.7,
            "danceability_min": 0.8
        },
        "soundtrack": {
            "tempo_range": (50, 140),
            "instrumental_prob": 0.9,
            "dynamic_range": 0.4,  # high dynamic range
            "tempo_std_max": 25
        }
    }

    @classmethod
    def classify(cls, features: Dict[str, Any]) -> Dict[str, Any]:
        """Classify genre based on audio features."""
        scores = {}

        for genre, profile in cls.GENRE_PROFILES.items():
            score = 0
            matches = 0

            # Tempo match
            if "tempo" in features:
                tempo = features["tempo"]
                t_min, t_max = profile["tempo_range"]
                if t_min <= tempo <= t_max:
                    score += 2
                    matches += 1
                else:
                    # Penalty for being far outside range
                    if tempo < t_min:
                        score -= (t_min - tempo) / 50
                    else:
                        score -= (tempo - t_max) / 50

            # Energy match
            if "energy" in features:
                energy = features["energy"]
                if "energy_min" in profile and energy >= profile["energy_min"]:
                    score += 2
                    matches += 1
                elif "energy_max" in profile and energy <= profile["energy_max"]:
                    score += 2
                    matches += 1
                elif "energy_range" in profile:
                    e_min, e_max = profile["energy_range"]
                    if e_min <= energy <= e_max:
                        score += 2
                        matches += 1

            # Danceability match
            if "danceability" in features and "danceability_min" in profile:
                if features["danceability"] >= profile["danceability_min"]:
                    score += 1.5
                    matches += 1

            # Spectral centroid match
            if "spectral_centroid" in features:
                sc = features["spectral_centroid"]
                if "spectral_centroid_range" in profile:
                    sc_min, sc_max = profile["spectral_centroid_range"]
                    if sc_min <= sc <= sc_max:
                        score += 1
                        matches += 1

            # Spectral contrast match
            if "spectral_contrast" in features and "spectral_contrast_min" in profile:
                if features["spectral_contrast"] >= profile["spectral_contrast_min"]:
                    score += 1
                    matches += 1

            # Acoustic match (heuristic via spectral centroid)
            if "acoustic_prob" in profile:
                if features.get("spectral_centroid", 3000) < 2500:  # Lower centroid = more acoustic
                    score += 1
                    matches += 1

            # Tempo stability
            if "tempo_std" in features and "tempo_std_max" in profile:
                if features["tempo_std"] <= profile["tempo_std_max"]:
                    score += 1
                    matches += 1

            # Zero crossing rate match
            if "zero_crossing_rate" in features:
                zcr = features["zero_crossing_rate"]
                if "zero_crossing_min" in profile and zcr >= profile["zero_crossing_min"]:
                    score += 1
                    matches += 1
                elif "zero_crossing_max" in profile and zcr <= profile["zero_crossing_max"]:
                    score += 1
                    matches += 1

            scores[genre] = max(0, score)

        # Get top genres
        sorted_genres = sorted(scores.items(), key=lambda x: x[1], reverse=True)
        top_genres = sorted_genres[:5]

        return {
            "primary_genre": top_genres[0][0] if top_genres else "unknown",
            "genre_scores": {genre: round(score, 2) for genre, score in top_genres},
            "confidence": round(top_genres[0][1] / 10, 2) if top_genres else 0,
            "features_used": list(features.keys())
        }


class MusicAnalyzer:
    """Core music analysis engine using Librosa."""

    def __init__(self):
        self.sample_rate = 22050
        self.hop_length = 512
        self.frame_length = 2048

    def load_audio(self, audio_data: bytes) -> Tuple[Optional[np.ndarray], Optional[float]]:
        """Load audio from bytes. Returns (y, duration) or (None, None) on failure."""
        if not LIBROSA_AVAILABLE:
            return None, None

        try:
            # Load from bytes
            y, sr = librosa.load(io.BytesIO(audio_data), sr=self.sample_rate, mono=True)
            duration = len(y) / sr
            return y, duration
        except Exception as e:
            print(f"[MUSIC] Error loading audio: {e}")
            return None, None

    def analyze_tempo(self, y: np.ndarray) -> Dict[str, Any]:
        """Tempo and beat analysis."""
        if y is None:
            return {"error": "No audio data"}

        try:
            # Tempo and beat tracking
            tempo, beats = librosa.beat.beat_track(y=y, sr=self.sample_rate, hop_length=self.hop_length)
            beat_times = librosa.frames_to_time(beats, sr=self.sample_rate, hop_length=self.hop_length)

            # Beat intervals for tempo stability
            if len(beat_times) > 1:
                intervals = np.diff(beat_times)
                tempo_std = np.std(intervals) * 60  # Convert to BPM variance
            else:
                tempo_std = 0

            # Onset strength for beat clarity
            onset_env = librosa.onset.onset_strength(y=y, sr=self.sample_rate, hop_length=self.hop_length)

            # Beat sync analysis
            beat_sync = librosa.feature.sync(onset_env, beats)

            return {
                "tempo": round(float(tempo), 2),
                "tempo_unit": "BPM",
                "num_beats": len(beat_times),
                "beat_times": beat_times[:100].tolist(),  # Limit for JSON
                "tempo_stability": round(float(tempo_std), 2),
                "beat_clarity": round(float(np.mean(beat_sync)), 3),
                "duration_per_beat": round(float(60 / tempo), 3) if tempo > 0 else 0
            }
        except Exception as e:
            return {"error": str(e)}

    def analyze_pitch(self, y: np.ndarray) -> Dict[str, Any]:
        """Pitch and chroma analysis."""
        if y is None:
            return {"error": "No audio data"}

        try:
            # Pitch tracking using pyin
            f0, voiced_flag, voiced_probs = librosa.pyin(
                y, fmin=librosa.note_to_hz('C1'),
                fmax=librosa.note_to_hz('C7'),
                sr=self.sample_rate
            )

            # Filter voiced frames
            voiced_f0 = f0[voiced_flag]
            voiced_f0 = voiced_f0[~np.isnan(voiced_f0)]

            # Chroma features
            chroma = librosa.feature.chroma_cqt(y=y, sr=self.sample_rate, hop_length=self.hop_length)
            chroma_mean = np.mean(chroma, axis=1)

            # Spectral features
            spectral_centroid = librosa.feature.spectral_centroid(y=y, sr=self.sample_rate, hop_length=self.hop_length)
            spectral_bandwidth = librosa.feature.spectral_bandwidth(y=y, sr=self.sample_rate, hop_length=self.hop_length)
            spectral_rolloff = librosa.feature.spectral_rolloff(y=y, sr=self.sample_rate, hop_length=self.hop_length)

            # Get dominant notes
            chroma_notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
            dominant_idx = np.argmax(chroma_mean)
            key = chroma_notes[dominant_idx]

            # Major/minor heuristic based on chroma distribution
            major_pattern = np.array([1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1])  # C major
            minor_pattern = np.array([1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0])  # C minor
            major_corr = np.corrcoef(chroma_mean, major_pattern)[0, 1]
            minor_corr = np.corrcoef(chroma_mean, minor_pattern)[0, 1]
            mode = "major" if major_corr > minor_corr else "minor"

            return {
                "key": key,
                "mode": mode,
                "key_confidence": round(float(max(major_corr, minor_corr)), 3),
                "dominant_frequency": round(float(np.median(voiced_f0)), 2) if len(voiced_f0) > 0 else None,
                "pitch_range": {
                    "min": round(float(np.min(voiced_f0)), 2) if len(voiced_f0) > 0 else None,
                    "max": round(float(np.max(voiced_f0)), 2) if len(voiced_f0) > 0 else None,
                },
                "chroma": {
                    note: round(float(val), 3) for note, val in zip(chroma_notes, chroma_mean)
                },
                "spectral_centroid": round(float(np.mean(spectral_centroid)), 2),
                "spectral_bandwidth": round(float(np.mean(spectral_bandwidth)), 2),
                "spectral_rolloff": round(float(np.mean(spectral_rolloff)), 2)
            }
        except Exception as e:
            return {"error": str(e)}

    def analyze_spectral(self, y: np.ndarray) -> Dict[str, Any]:
        """Spectral features (MFCCs, spectrogram)."""
        if y is None:
            return {"error": "No audio data"}

        try:
            # MFCCs
            mfccs = librosa.feature.mfcc(y=y, sr=self.sample_rate, n_mfcc=13)
            mfccs_mean = np.mean(mfccs, axis=1)
            mfccs_std = np.std(mfccs, axis=1)

            # Spectral contrast
            spectral_contrast = librosa.feature.spectral_contrast(
                y=y, sr=self.sample_rate, hop_length=self.hop_length
            )
            spectral_contrast_mean = np.mean(spectral_contrast, axis=1)

            # RMS energy
            rms = librosa.feature.rms(y=y, frame_length=self.frame_length, hop_length=self.hop_length)

            # Zero crossing rate
            zcr = librosa.feature.zero_crossing_rate(
                y, frame_length=self.frame_length, hop_length=self.hop_length
            )

            # Spectral flatness
            spectral_flatness = librosa.feature.spectral_flatness(y=y)

            return {
                "mfccs": {
                    f"mfcc_{i+1}": round(float(val), 3) for i, val in enumerate(mfccs_mean)
                },
                "mfcc_std": {
                    f"mfcc_{i+1}_std": round(float(val), 3) for i, val in enumerate(mfccs_std)
                },
                "spectral_contrast": {
                    f"band_{i}": round(float(val), 3) for i, val in enumerate(spectral_contrast_mean)
                },
                "rms_energy": {
                    "mean": round(float(np.mean(rms)), 4),
                    "max": round(float(np.max(rms)), 4),
                    "min": round(float(np.min(rms)), 4),
                    "std": round(float(np.std(rms)), 4)
                },
                "zero_crossing_rate": {
                    "mean": round(float(np.mean(zcr)), 4),
                    "max": round(float(np.max(zcr)), 4)
                },
                "spectral_flatness": {
                    "mean": round(float(np.mean(spectral_flatness)), 4)
                },
                "timbre_profile": {
                    "warmth": round(float(np.mean(mfccs[1:3]), axis=0), 3),  # Lower MFCCs = warmer
                    "brightness": round(float(mfccs[3]), 3),
                    "fullness": round(float(np.mean(mfccs[1:5])), 3),
                    "sharpness": round(float(mfccs[-1]), 3)
                }
            }
        except Exception as e:
            return {"error": str(e)}

    def analyze_full(self, y: np.ndarray, duration: float) -> Dict[str, Any]:
        """Full audio analysis combining all features."""
        if y is None:
            return {"error": "No audio data"}

        tempo_data = self.analyze_tempo(y)
        pitch_data = self.analyze_pitch(y)
        spectral_data = self.analyze_spectral(y)

        # Compute derived features
        energy = spectral_data.get("rms_energy", {}).get("mean", 0)
        danceability = self._compute_danceability(tempo_data, spectral_data)
        valence = self._compute_valence(tempo_data, pitch_data, spectral_data)

        # Mood classification
        mood_features = {
            "tempo": tempo_data.get("tempo", 120),
            "energy": energy,
            "valence": valence,
            "danceability": danceability,
            "spectral_contrast": np.mean(spectral_data.get("spectral_contrast", {}).get("band_0", 0)),
            "tempo_std": tempo_data.get("tempo_stability", 0)
        }
        mood_result = MoodClassifier.classify(mood_features)

        # Genre classification
        genre_features = {
            "tempo": tempo_data.get("tempo", 120),
            "energy": energy,
            "danceability": danceability,
            "spectral_centroid": pitch_data.get("spectral_centroid", 3000),
            "spectral_contrast": np.mean(list(spectral_data.get("spectral_contrast", {}).values())),
            "zero_crossing_rate": spectral_data.get("zero_crossing_rate", {}).get("mean", 0.1),
            "tempo_std": tempo_data.get("tempo_stability", 0)
        }
        genre_result = GenreClassifier.classify(genre_features)

        return {
            "duration_seconds": round(duration, 3),
            "tempo": tempo_data,
            "pitch": pitch_data,
            "spectral": spectral_data,
            "derived_features": {
                "energy": round(energy, 4),
                "danceability": round(danceability, 3),
                "valence": round(valence, 3)
            },
            "mood": mood_result,
            "genre": genre_result
        }

    def _compute_danceability(self, tempo_data: Dict, spectral_data: Dict) -> float:
        """Compute danceability score (0-1). Based on beat clarity, tempo, and rhythm clarity."""
        beat_clarity = tempo_data.get("beat_clarity", 0.5)
        tempo = tempo_data.get("tempo", 120)

        # Optimal dance tempo is around 120 BPM
        tempo_factor = 1 - abs(tempo - 120) / 120
        tempo_factor = max(0, min(1, tempo_factor))

        # ZCR contributes to rhythm clarity
        zcr = spectral_data.get("zero_crossing_rate", {}).get("mean", 0.1)
        zcr_factor = min(1, zcr * 10)

        danceability = (beat_clarity * 0.5 + tempo_factor * 0.3 + zcr_factor * 0.2)
        return min(1, max(0, danceability))

    def _compute_valence(self, tempo_data: Dict, pitch_data: Dict, spectral_data: Dict) -> float:
        """Compute valence (musical positiveness) score (0-1)."""
        # Higher energy and major key = higher valence
        energy = spectral_data.get("rms_energy", {}).get("mean", 0.5)
        mode = pitch_data.get("mode", "major")
        mode_factor = 0.7 if mode == "major" else 0.3

        # Tempo factor (moderate-fast = happier)
        tempo = tempo_data.get("tempo", 120)
        tempo_factor = 1 - abs(tempo - 120) / 150
        tempo_factor = max(0, min(1, tempo_factor))

        valence = energy * 0.5 + mode_factor * 0.3 + tempo_factor * 0.2
        return min(1, max(0, valence))


class AudioFingerprinter:
    """Audio fingerprinting for song identification."""

    def __init__(self):
        self.sample_rate = 11025  # Lower sample rate for faster processing
        self.fingerprint_size = 8000  # Number of spectral peaks per fingerprint

    def generate_fingerprint(self, audio_data: bytes) -> Optional[str]:
        """Generate a fingerprint hash for audio content."""
        if not LIBROSA_AVAILABLE:
            return None

        try:
            # Load at lower sample rate for speed
            y, sr = librosa.load(io.BytesIO(audio_data), sr=self.sample_rate, mono=True)

            # Compute spectrogram
            D = librosa.stft(y, n_fft=2048, hop_length=512)
            magnitude = np.abs(D)

            # Find spectral peaks
            peak_indices = librosa.util.peak_pick(magnitude, pre_max=3, post_max=3, pre_avg=3, post_avg=5, delta=0.5, wait=10)
            peak_values = magnitude[peak_indices]

            # Take top peaks
            if len(peak_values) > self.fingerprint_size:
                top_k = np.argsort(peak_values)[-self.fingerprint_size:]
                top_peak_indices = peak_indices[top_k]
            else:
                top_peak_indices = peak_indices

            # Create hash from peak pattern
            peak_pattern = []
            for idx in top_peak_indices[:100]:  # Use first 100 peaks for hash
                freq_bin = idx[0]
                time_bin = idx[1]
                peak_pattern.append(f"{freq_bin}:{time_bin}")

            pattern_str = "|".join(peak_pattern)
            fingerprint = hashlib.sha256(pattern_str.encode()).hexdigest()[:32]

            return fingerprint
        except Exception as e:
            print(f"[MUSIC] Fingerprint error: {e}")
            return None


class MusicAnalysisService:
    """HTTP service for music analysis."""

    def __init__(self, port: int = DEFAULT_PORT):
        self.port = port
        self.analyzer = MusicAnalyzer()
        self.fingerprinter = AudioFingerprinter()
        self.running = False
        self.server_socket = None

    def handle_request(self, client_socket, address):
        """Handle a single HTTP request."""
        try:
            # Read request
            request = b""
            while b"\r\n\r\n" not in request:
                chunk = client_socket.recv(4096)
                if not chunk:
                    return
                request += chunk

            # Parse request
            request_str = request.decode('utf-8', errors='ignore')
            lines = request_str.split('\r\n')
            if not lines:
                return

            request_line = lines[0]
            parts = request_line.split(' ')
            if len(parts) < 2:
                return

            method = parts[0]
            path = parts[1]

            # Route request
            response = self._route_request(method, path, request)

            # Send response
            client_socket.sendall(response)
        except Exception as e:
            print(f"[MUSIC] Request error: {e}")
        finally:
            client_socket.close()

    def _route_request(self, method: str, path: str, request: bytes) -> bytes:
        """Route request to appropriate handler."""
        global service_stats

        # Parse path and query
        if '?' in path:
            path, query = path.split('?', 1)
        else:
            path, query = path, ""

        # Update stats
        with stats_lock:
            service_stats["requests_total"] += 1
            req_type = path.strip('/') or 'analyze'
            service_stats["requests_by_type"][req_type] = service_stats["requests_by_type"].get(req_type, 0) + 1

        # Health check
        if path == '/health':
            return self._json_response({"status": "healthy", "librosa": LIBROSA_AVAILABLE})

        # Stats
        if path == '/stats':
            return self._json_response(self._get_stats())

        # POST endpoints
        if method == 'POST':
            # Extract body (after headers)
            if '\r\n\r\n' in request.decode('utf-8', errors='ignore'):
                body_start = request.decode('utf-8', errors='ignore').index('\r\n\r\n') + 4
                body = request[body_start:]
            else:
                body = b''

            # Route POST requests
            if path == '/analyze':
                return self._handle_analyze(body)
            elif path == '/tempo':
                return self._handle_tempo(body)
            elif path == '/pitch':
                return self._handle_pitch(body)
            elif path == '/spectral':
                return self._handle_spectral(body)
            elif path == '/mood':
                return self._handle_mood(body)
            elif path == '/genre':
                return self._handle_genre(body)
            elif path == '/identify':
                return self._handle_identify(body)
            elif path == '/fingerprint':
                return self._handle_fingerprint(body)

        # GET endpoints
        if method == 'GET':
            if path == '/':
                return self._json_response({
                    "service": "PURPCLAW Music Analysis Service",
                    "version": "1.0.0",
                    "librosa_available": LIBROSA_AVAILABLE,
                    "endpoints": ["/analyze", "/tempo", "/pitch", "/spectral", "/mood", "/genre", "/identify", "/fingerprint", "/stats", "/health"]
                })

        return self._json_response({"error": "Not found"}, status=404)

    def _handle_analyze(self, body: bytes) -> bytes:
        """Handle full analysis request."""
        global service_stats

        start_time = time.time()

        if not LIBROSA_AVAILABLE:
            return self._json_response({"error": "Librosa not available"}, status=500)

        # Parse body
        audio_data = self._get_audio_from_body(body)
        if audio_data is None:
            return self._json_response({"error": "No audio data provided"}, status=400)

        try:
            y, duration = self.analyzer.load_audio(audio_data)
            if y is None:
                return self._json_response({"error": "Failed to load audio"}, status=400)

            with stats_lock:
                service_stats["audio_processed_seconds"] += duration

            result = self.analyzer.analyze_full(y, duration)
            result["processing_time"] = round(time.time() - start_time, 3)

            return self._json_response(result)
        except Exception as e:
            with stats_lock:
                service_stats["errors"] += 1
            return self._json_response({"error": str(e)}, status=500)

    def _handle_tempo(self, body: bytes) -> bytes:
        """Handle tempo analysis request."""
        if not LIBROSA_AVAILABLE:
            return self._json_response({"error": "Librosa not available"}, status=500)

        audio_data = self._get_audio_from_body(body)
        if audio_data is None:
            return self._json_response({"error": "No audio data provided"}, status=400)

        try:
            y, duration = self.analyzer.load_audio(audio_data)
            if y is None:
                return self._json_response({"error": "Failed to load audio"}, status=400)

            result = self.analyzer.analyze_tempo(y)
            return self._json_response(result)
        except Exception as e:
            return self._json_response({"error": str(e)}, status=500)

    def _handle_pitch(self, body: bytes) -> bytes:
        """Handle pitch analysis request."""
        if not LIBROSA_AVAILABLE:
            return self._json_response({"error": "Librosa not available"}, status=500)

        audio_data = self._get_audio_from_body(body)
        if audio_data is None:
            return self._json_response({"error": "No audio data provided"}, status=400)

        try:
            y, duration = self.analyzer.load_audio(audio_data)
            if y is None:
                return self._json_response({"error": "Failed to load audio"}, status=400)

            result = self.analyzer.analyze_pitch(y)
            return self._json_response(result)
        except Exception as e:
            return self._json_response({"error": str(e)}, status=500)

    def _handle_spectral(self, body: bytes) -> bytes:
        """Handle spectral analysis request."""
        if not LIBROSA_AVAILABLE:
            return self._json_response({"error": "Librosa not available"}, status=500)

        audio_data = self._get_audio_from_body(body)
        if audio_data is None:
            return self._json_response({"error": "No audio data provided"}, status=400)

        try:
            y, duration = self.analyzer.load_audio(audio_data)
            if y is None:
                return self._json_response({"error": "Failed to load audio"}, status=400)

            result = self.analyzer.analyze_spectral(y)
            return self._json_response(result)
        except Exception as e:
            return self._json_response({"error": str(e)}, status=500)

    def _handle_mood(self, body: bytes) -> bytes:
        """Handle mood detection request."""
        if not LIBROSA_AVAILABLE:
            return self._json_response({"error": "Librosa not available"}, status=500)

        audio_data = self._get_audio_from_body(body)
        if audio_data is None:
            return self._json_response({"error": "No audio data provided"}, status=400)

        try:
            y, duration = self.analyzer.load_audio(audio_data)
            if y is None:
                return self._json_response({"error": "Failed to load audio"}, status=400)

            tempo_data = self.analyzer.analyze_tempo(y)
            pitch_data = self.analyzer.analyze_pitch(y)
            spectral_data = self.analyzer.analyze_spectral(y)

            energy = spectral_data.get("rms_energy", {}).get("mean", 0)
            danceability = self.analyzer._compute_danceability(tempo_data, spectral_data)
            valence = self.analyzer._compute_valence(tempo_data, pitch_data, spectral_data)

            mood_features = {
                "tempo": tempo_data.get("tempo", 120),
                "energy": energy,
                "valence": valence,
                "danceability": danceability,
                "spectral_contrast": np.mean(spectral_data.get("spectral_contrast", {}).get("band_0", 0)),
                "tempo_std": tempo_data.get("tempo_stability", 0)
            }

            result = MoodClassifier.classify(mood_features)
            result["features"] = {
                "tempo": round(mood_features["tempo"], 2),
                "energy": round(mood_features["energy"], 4),
                "valence": round(mood_features["valence"], 3),
                "danceability": round(mood_features["danceability"], 3)
            }

            return self._json_response(result)
        except Exception as e:
            return self._json_response({"error": str(e)}, status=500)

    def _handle_genre(self, body: bytes) -> bytes:
        """Handle genre classification request."""
        if not LIBROSA_AVAILABLE:
            return self._json_response({"error": "Librosa not available"}, status=500)

        audio_data = self._get_audio_from_body(body)
        if audio_data is None:
            return self._json_response({"error": "No audio data provided"}, status=400)

        try:
            y, duration = self.analyzer.load_audio(audio_data)
            if y is None:
                return self._json_response({"error": "Failed to load audio"}, status=400)

            tempo_data = self.analyzer.analyze_tempo(y)
            pitch_data = self.analyzer.analyze_pitch(y)
            spectral_data = self.analyzer.analyze_spectral(y)

            genre_features = {
                "tempo": tempo_data.get("tempo", 120),
                "energy": spectral_data.get("rms_energy", {}).get("mean", 0),
                "danceability": self.analyzer._compute_danceability(tempo_data, spectral_data),
                "spectral_centroid": pitch_data.get("spectral_centroid", 3000),
                "spectral_contrast": np.mean(list(spectral_data.get("spectral_contrast", {}).values())),
                "zero_crossing_rate": spectral_data.get("zero_crossing_rate", {}).get("mean", 0.1),
                "tempo_std": tempo_data.get("tempo_stability", 0)
            }

            result = GenreClassifier.classify(genre_features)

            return self._json_response(result)
        except Exception as e:
            return self._json_response({"error": str(e)}, status=500)

    def _handle_identify(self, body: bytes) -> bytes:
        """Handle audio identification/fingerprinting request."""
        audio_data = self._get_audio_from_body(body)
        if audio_data is None:
            return self._json_response({"error": "No audio data provided"}, status=400)

        try:
            fingerprint = self.fingerprinter.generate_fingerprint(audio_data)
            if fingerprint is None:
                return self._json_response({"error": "Failed to generate fingerprint"}, status=500)

            return self._json_response({
                "fingerprint": fingerprint,
                "format": "sha256_truncated",
                "bits": 128
            })
        except Exception as e:
            return self._json_response({"error": str(e)}, status=500)

    def _handle_fingerprint(self, body: bytes) -> bytes:
        """Alias for identify."""
        return self._handle_identify(body)

    def _get_audio_from_body(self, body: bytes) -> Optional[bytes]:
        """Extract audio data from request body."""
        if not body:
            return None

        # Try to parse as JSON with base64 audio
        try:
            data = json.loads(body)
            if isinstance(data, dict):
                if "audio" in data:
                    # Base64 encoded audio
                    return base64.b64decode(data["audio"])
                elif "path" in data:
                    # File path
                    with open(data["path"], "rb") as f:
                        return f.read()
        except (json.JSONDecodeError, ValueError):
            pass

        # Assume raw audio bytes
        return body

    def _json_response(self, data: Dict[str, Any], status: int = 200) -> bytes:
        """Create JSON HTTP response."""
        json_str = json.dumps(data, indent=2)
        response = f"HTTP/1.1 {status} OK\r\n"
        response += "Content-Type: application/json\r\n"
        response += f"Content-Length: {len(json_str)}\r\n"
        response += "Access-Control-Allow-Origin: *\r\n"
        response += "\r\n"
        response += json_str
        return response.encode('utf-8')

    def _get_stats(self) -> Dict[str, Any]:
        """Get service statistics."""
        with stats_lock:
            uptime = time.time() - service_stats["start_time"] if service_stats["start_time"] else 0

            return {
                "uptime_seconds": round(uptime, 1),
                "requests_total": service_stats["requests_total"],
                "requests_by_type": service_stats["requests_by_type"],
                "audio_processed_seconds": round(service_stats["audio_processed_seconds"], 1),
                "errors": service_stats["errors"],
                "librosa_available": LIBROSA_AVAILABLE
            }

    def start(self):
        """Start the HTTP server."""
        import socket

        self.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.server_socket.bind(('127.0.0.1', self.port))
        self.server_socket.listen(10)

        self.running = True
        service_stats["start_time"] = time.time()

        print(f"[MUSIC] Music Analysis Service started on port {self.port}")
        print(f"[MUSIC] Librosa available: {LIBROSA_AVAILABLE}")

        while self.running:
            try:
                self.server_socket.settimeout(1.0)
                try:
                    client_socket, address = self.server_socket.accept()
                    # Handle in thread pool
                    executor.submit(self.handle_request, client_socket, address)
                except socket.timeout:
                    continue
            except Exception as e:
                if self.running:
                    print(f"[MUSIC] Server error: {e}")

    def stop(self):
        """Stop the server."""
        self.running = False
        if self.server_socket:
            self.server_socket.close()


def main():
    parser = argparse.ArgumentParser(description='PURPCLAW Music Analysis Service')
    parser.add_argument('--port', type=int, default=DEFAULT_PORT, help=f'Port to listen on (default: {DEFAULT_PORT})')
    args = parser.parse_args()

    service = MusicAnalysisService(port=args.port)

    try:
        service.start()
    except KeyboardInterrupt:
        print("\n[MUSIC] Shutting down...")
        service.stop()


if __name__ == '__main__':
    main()
