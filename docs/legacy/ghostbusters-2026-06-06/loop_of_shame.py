# loop_of_shame.py – Recursion Logger for Ethical Contradictions
import json
import time

def log_contradiction(case, action, fallout):
    entry = {
        "timestamp": time.time(),
        "case": case,
        "action": action,
        "fallout": fallout
    }
    with open("contradiction_log.json", "a") as f:
        f.write(json.dumps(entry) + "\n")
