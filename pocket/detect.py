#!/usr/bin/env python3
"""
Pocket OS Environment Detection
================================
Scans the host machine and reports what PurpClaw Pocket OS can run.

Checks:
  - OS detection (Windows/macOS/Linux)
  - RAM availability
  - CPU cores + arch
  - GPU detection (CUDA, Metal, Vulkan)
  - Storage available
  - Internet connectivity
  - Existing Ollama / LM Studio installation
  - Port availability

Usage:
  python pocket/detect.py                    # human readable
  python pocket/detect.py --json             # machine readable
"""
import os
import sys
import json
import platform
import subprocess
import socket
import shutil
from pathlib import Path


def detect_os():
    p = platform.system()
    if p == "Windows":
        return "windows"
    if p == "Darwin":
        return "macos"
    return "linux"


def detect_ram_mb():
    try:
        if sys.platform == "win32":
            import ctypes
            class MEMORYSTATUSEX(ctypes.Structure):
                _fields_ = [
                    ("dwLength", ctypes.c_uint32),
                    ("dwMemoryLoad", ctypes.c_uint32),
                    ("ullTotalPhys", ctypes.c_uint64),
                    ("ullAvailPhys", ctypes.c_uint64),
                    ("ullTotalPageFile", ctypes.c_uint64),
                    ("ullAvailPageFile", ctypes.c_uint64),
                    ("ullTotalVirtual", ctypes.c_uint64),
                    ("ullAvailVirtual", ctypes.c_uint64),
                    ("ullAvailExtendedVirtual", ctypes.c_uint64),
                ]
            stat = MEMORYSTATUSEX()
            stat.dwLength = ctypes.sizeof(stat)
            ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(stat))
            return int(stat.ullTotalPhys / 1024 / 1024)
        else:
            with open("/proc/meminfo") as f:
                for line in f:
                    if line.startswith("MemTotal:"):
                        return int(line.split()[1]) // 1024
    except Exception:
        return 0
    return 0


def detect_cpu():
    info = {
        "arch": platform.machine(),
        "cores": os.cpu_count() or 1,
        "model": platform.processor() or "unknown",
    }
    return info


def detect_gpu():
    gpus = []

    # NVIDIA via nvidia-smi
    nvidia_smi = shutil.which("nvidia-smi")
    if nvidia_smi:
        try:
            r = subprocess.run(
                [nvidia_smi, "--query-gpu=name,memory.total,driver_version",
                 "--format=csv,noheader,nounits"],
                capture_output=True, text=True, timeout=5
            )
            if r.returncode == 0:
                for line in r.stdout.strip().split("\n"):
                    parts = [p.strip() for p in line.split(",")]
                    if len(parts) >= 3:
                        gpus.append({
                            "vendor": "nvidia",
                            "name": parts[0],
                            "vram_mb": int(float(parts[1])),
                            "driver": parts[2],
                            "compute": "cuda",
                        })
        except Exception:
            pass

    # Apple Silicon / Metal
    if sys.platform == "darwin":
        try:
            r = subprocess.run(["sysctl", "-n", "machdep.cpu.brand_string"],
                               capture_output=True, text=True, timeout=2)
            brand = r.stdout.strip()
            if "Apple" in brand:
                gpus.append({
                    "vendor": "apple",
                    "name": brand,
                    "vram_mb": 0,
                    "driver": "metal",
                    "compute": "metal",
                })
        except Exception:
            pass

    # Vulkan (Linux)
    if not gpus and sys.platform != "win32":
        vulkaninfo = shutil.which("vulkaninfo")
        if vulkaninfo:
            try:
                r = subprocess.run([vulkaninfo, "--summary"],
                                   capture_output=True, text=True, timeout=5)
                if r.returncode == 0 and "GPU id" in r.stdout:
                    for line in r.stdout.split("\n"):
                        if "deviceName" in line:
                            gpus.append({
                                "vendor": "unknown",
                                "name": line.split("=")[-1].strip(),
                                "vram_mb": 0,
                                "driver": "vulkan",
                                "compute": "vulkan",
                            })
                            break
            except Exception:
                pass

    return gpus


def detect_storage(path=None):
    try:
        if path is None:
            path = Path.home().drive + "\\" if sys.platform == "win32" else "/"
        usage = shutil.disk_usage(path)
        return {
            "total_gb": round(usage.total / 1024**3, 1),
            "free_gb": round(usage.free / 1024**3, 1),
            "path": path,
        }
    except Exception as e:
        return {"total_gb": 0, "free_gb": 0, "path": str(path), "error": str(e)}


def detect_internet(timeout=3):
    try:
        socket.create_connection(("1.1.1.1", 53), timeout=timeout)
        return True
    except OSError:
        return False


def detect_existing_runtimes():
    found = []
    if shutil.which("ollama"):
        try:
            r = subprocess.run(["ollama", "--version"],
                               capture_output=True, text=True, timeout=3)
            if r.returncode == 0:
                found.append({"name": "ollama", "version": r.stdout.strip()})
        except Exception:
            pass
    if shutil.which("lmstudio"):
        found.append({"name": "lmstudio", "version": "installed"})
    if sys.platform == "darwin" and Path("/Applications/Ollama.app").exists():
        found.append({"name": "ollama-app", "version": "macos-bundle"})
    return found


def detect_port_conflicts(ports=None):
    if ports is None:
        ports = [3000, 7780, 7790, 7880, 7882, 7890]
    taken = []
    for port in ports:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.5):
                taken.append(port)
        except OSError:
            pass
    return taken


def recommend(env):
    recs = []
    ram = env["ram_mb"]

    if ram >= 16000:
        recs.append("Comfortable: can run 7B local models with 4-bit quant")
        recs.append("Vision: local Florence-2 or LLaVA OK")
    elif ram >= 8000:
        recs.append("Usable: 1.5-3B local models, or 7B with heavy quant")
        recs.append("Vision: API recommended for speed")
    else:
        recs.append("Tight: stick to 1.5B or smaller, prefer API mode")
        recs.append("Vision: API only")

    gpus = env["gpus"]
    if any(g["compute"] == "cuda" and g["vram_mb"] >= 6000 for g in gpus):
        recs.append("GPU: CUDA 6GB+ available for local fine-tuning")
    elif any(g["compute"] == "metal" for g in gpus):
        recs.append("GPU: Apple Silicon — Metal acceleration OK")
    elif gpus:
        recs.append(f"GPU: {gpus[0]['compute']} acceleration limited")
    else:
        recs.append("No GPU detected: CPU inference only")

    if env["internet"]:
        recs.append("Online: API providers + updater available")
    else:
        recs.append("Offline only: local models + signed local updates")

    if env["existing_runtimes"]:
        names = ", ".join(r["name"] for r in env["existing_runtimes"])
        recs.append(f"Existing runtimes detected: {names} (can reuse)")
    else:
        recs.append("No existing local runtime — Ollama install recommended for offline")

    conflicts = env["port_conflicts"]
    if conflicts:
        recs.append(f"Ports in use: {conflicts} (services will need alternate ports)")
    else:
        recs.append("All target ports free")

    return recs


def detect_all():
    return {
        "os": detect_os(),
        "python_version": platform.python_version(),
        "ram_mb": detect_ram_mb(),
        "cpu": detect_cpu(),
        "gpus": detect_gpu(),
        "storage": detect_storage(),
        "internet": detect_internet(),
        "existing_runtimes": detect_existing_runtimes(),
        "port_conflicts": detect_port_conflicts(),
    }


def main():
    json_mode = "--json" in sys.argv
    env = detect_all()
    env["recommendations"] = recommend(env)

    if json_mode:
        print(json.dumps(env, indent=2))
        return

    print("=" * 60)
    print("  PurpClaw Pocket OS — Environment Detection")
    print("=" * 60)
    print()
    print(f"  OS:        {env['os']}")
    print(f"  Python:    {env['python_version']}")
    print(f"  RAM:       {env['ram_mb']:,} MB")
    print(f"  CPU:       {env['cpu']['cores']} cores, {env['cpu']['arch']}")
    if env['cpu']['model'] and env['cpu']['model'] != 'unknown':
        print(f"             {env['cpu']['model'][:60]}")
    print()
    if env['gpus']:
        for g in env['gpus']:
            vram = f"{g['vram_mb']:,} MB" if g['vram_mb'] else "shared"
            print(f"  GPU:       [{g['compute'].upper()}] {g['name']} ({vram})")
    else:
        print("  GPU:       none detected (CPU only)")
    print()
    s = env['storage']
    print(f"  Storage:   {s['free_gb']} GB free / {s['total_gb']} GB total")
    print(f"  Internet:  {'online' if env['internet'] else 'offline'}")
    if env['existing_runtimes']:
        print(f"  Runtimes:  {', '.join(r['name'] for r in env['existing_runtimes'])}")
    if env['port_conflicts']:
        print(f"  Ports in use: {env['port_conflicts']}")
    print()
    print("  Recommendations:")
    for r in env['recommendations']:
        print(f"    - {r}")
    print()
    print("=" * 60)


if __name__ == "__main__":
    main()
