"""Feature data for the PURPCLAW console."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Feature:
    n: str
    title: str
    blurb: str
    detail: str
    icon: str
    accent: str  # cyan | violet | emerald | amber | rose | sky
    channels: tuple[str, ...] = ()
    status: str = "partial"  # live | partial | gap


FEATURES: tuple[Feature, ...] = (
    Feature(
        n="01",
        title="Lives Where You Do",
        blurb="CLI, API, web, and voice-ready surfaces route through one runtime. Chat-platform adapters are the next gateway build.",
        detail=(
            "PurpClaw already has CLI, API, Mission Control, TUI, socket, and voice-facing "
            "runtime surfaces. The product target is Telegram, Discord, Slack, WhatsApp, "
            "Signal, and Email through the same supervisor and memory. Those adapters must "
            "be built as real inbound gateway routes."
        ),
        icon="01",
        accent="cyan",
        channels=("CLI", "API", "Web", "Voice", "Socket", "Chat adapters"),
        status="partial",
    ),
    Feature(
        n="02",
        title="Grows the Longer It Runs",
        blurb="Persistent memory, knowledge pool, skills, scoring, and consolidation make solved work reusable.",
        detail=(
            "The runtime keeps project memory, routes through the knowledge pool, tracks "
            "agent performance, and stores skills as reusable procedures. The remaining "
            "bar is governed promotion of learned procedures into durable skills."
        ),
        icon="02",
        accent="violet",
        channels=("Memory", "Skills", "Recall", "Scores", "Consolidation"),
        status="partial",
    ),
    Feature(
        n="03",
        title="Scheduled Automations",
        blurb="Maintenance loops exist; a governed natural-language scheduler lane is still required.",
        detail=(
            "The target is natural-language scheduling for reports, backups, briefings, "
            "and watchdogs. PurpClaw has autonomous maintenance and reasoning loops, but "
            "still needs a persisted schedule calendar and governance-aware scheduler route."
        ),
        icon="03",
        accent="emerald",
        channels=("Scheduler", "Calendar", "Approvals", "Briefings"),
        status="gap",
    ),
    Feature(
        n="04",
        title="Delegates & Parallelizes",
        blurb="Isolated agents, owned context packets, worker overflow, remote dispatch, validation, and synthesis are live.",
        detail=(
            "Agent Tower, Orchestrator, Worker Pool, Context Bus, context packets, and "
            "the harness engine already form the live delegation lane. Work is bounded "
            "by ownership, capacity, locks, governance, and validation."
        ),
        icon="04",
        accent="amber",
        channels=("Agents", "Workers", "Locks", "Context packets", "Validation"),
        status="live",
    ),
    Feature(
        n="05",
        title="Real Sandboxing",
        blurb="Local, HTTP worker, and SSH lanes exist. Docker, Singularity, Modal execution, and Daytona-style workspaces remain gaps.",
        detail=(
            "PurpClaw can run local work, route HTTP worker jobs, and dispatch over SSH. "
            "The parity target requires hardened Docker, Singularity, Modal execution, "
            "and Daytona-style remote workspace adapters with explicit execution contracts."
        ),
        icon="05",
        accent="sky",
        channels=("Local", "HTTP worker", "SSH", "Docker", "Singularity", "Modal", "Daytona"),
        status="partial",
    ),
    Feature(
        n="06",
        title="Full Web & Browser Control",
        blurb="Browser, screen look, vision/STT services, voice client, and multi-model routing exist; image and durable TTS adapters remain gaps.",
        detail=(
            "PurpClaw has a browser command, screen-look tooling, optional vision and STT "
            "services, a voice client, and multi-model provider routing. The remaining "
            "work is a governed image-generation adapter and durable TTS gateway contract."
        ),
        icon="06",
        accent="rose",
        channels=("Browser", "Screen", "Vision", "STT", "Image adapter", "TTS adapter"),
        status="partial",
    ),
)


def by_id(n: str) -> Feature | None:
    for f in FEATURES:
        if f.n == n:
            return f
    return None
