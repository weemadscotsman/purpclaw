"""PURPCLAW Console — Textual TUI for the agent platform.

Run from inside Hermes (or any terminal) with:
    python -m purpconsole
or:
    python purpconsole/app.py
"""
from __future__ import annotations

import sys
from pathlib import Path

# Allow `python purpconsole/app.py` to find the package
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.containers import Container, Horizontal, Vertical
from textual.reactive import reactive
from textual.screen import Screen
from textual.widgets import Footer, Header, Static

from purpconsole.features import FEATURES, Feature


# ───────────────────────────── shared widgets ─────────────────────────────


class BrandHeader(Static):
    """Top-of-screen brand bar with live status."""

    def compose(self) -> ComposeResult:
        yield Static(
            "[b #67e8f9]PURP[/b #67e8f9][b #e4e4e7]CLAW[/b #e4e4e7]"
            "  [#34d399 on #052e1f] v2.0 [/]"
            "  · the agent that grows with you",
            id="brand-row",
        )


# ───────────────────────────── dashboard screen ───────────────────────────


class FeatureTile(Static):
    """Clickable / focusable tile for one feature."""

    DEFAULT_CSS = ""

    def __init__(self, feature: Feature) -> None:
        super().__init__(id=f"tile-{feature.n}")
        self.feature = feature
        self._channels_preview = ", ".join(feature.channels[:3])

    def compose(self) -> ComposeResult:
        yield Horizontal(
            Static(self.feature.icon, classes="tile-icon"),
            Static(self.feature.n, classes="tile-num"),
            Static(self.feature.status.upper(), classes=f"tile-status tile-status-{self.feature.status}"),
            classes="tile-head",
        )
        yield Static(self.feature.title, classes="tile-title")
        yield Static(self.feature.blurb, classes="tile-blurb")
        yield Static(f"▸ {self._channels_preview}", classes="tile-footer")

    def on_mount(self) -> None:
        self.add_class("tile")
        self.add_class(f"tile-accent-{self.feature.accent}")
        self.can_focus = True

    def on_click(self) -> None:
        self.app.push_screen(Detail(self.feature))


class Dashboard(Screen):
    """Main dashboard: hero + 6 feature tiles in a grid."""

    BINDINGS = [
        Binding("q", "quit", "Quit", show=True),
        Binding("escape", "quit", "Quit", show=False),
        Binding("enter", "open_focused", "Open", show=True),
        Binding("space", "open_focused", "Open", show=False),
        Binding("1", "open('01')", "01", show=False),
        Binding("2", "open('02')", "02", show=False),
        Binding("3", "open('03')", "03", show=False),
        Binding("4", "open('04')", "04", show=False),
        Binding("5", "open('05')", "05", show=False),
        Binding("6", "open('06')", "06", show=False),
    ]

    def compose(self) -> ComposeResult:
        yield BrandHeader(id="header")

        with Container(id="hero"):
            yield Static(
                "The Agent That\n[#67e8f9]Grows With You[/]",
                id="hero-title",
                markup=True,
            )
            yield Static(
                "Not a coding copilot tethered to an IDE or a chatbot wrapper around a single API.\n"
                "An autonomous agent that lives on your server, remembers what it learns, "
                "and gets more capable the longer it runs.",
                id="hero-sub",
                markup=False,
            )

        with Container(id="grid"):
            for f in FEATURES:
                yield FeatureTile(f)

        yield Static(
            "[#67e8f9]↑↓[/] navigate  "
            "[#67e8f9]⏎[/] open  "
            "[#67e8f9]1-6[/] jump  "
            "[#67e8f9]q[/] quit  "
            "  ·  [#52525b]shiny new app · runs from inside hermes[/]",
            id="command-bar",
            markup=True,
        )

    def on_mount(self) -> None:
        # Focus the first tile so keyboard nav works immediately
        first = self.query_one(f"#tile-{FEATURES[0].n}", FeatureTile)
        first.focus()

    # ── actions ──────────────────────────────────────────────

    def action_open_focused(self) -> None:
        focused = self.focused
        if isinstance(focused, FeatureTile):
            self.app.push_screen(Detail(focused.feature))

    def action_open(self, n: str) -> None:
        for f in FEATURES:
            if f.n == n:
                self.app.push_screen(Detail(f))
                return

# ───────────────────────────── detail screen ──────────────────────────────


class Detail(Screen):
    """Detail view for one feature."""

    BINDINGS = [
        Binding("escape", "app.pop_screen", "Back", show=True),
        Binding("backspace", "app.pop_screen", "Back", show=False),
        Binding("b", "app.pop_screen", "Back", show=False),
        Binding("q", "app.pop_screen", "Back", show=False),
    ]

    def __init__(self, feature: Feature) -> None:
        super().__init__()
        self.feature = feature

    def compose(self) -> ComposeResult:
        yield BrandHeader(id="header")

        with Container(id="detail"):
            yield Static("◂  esc to go back", id="detail-back", markup=False)

            with Vertical(id="detail-card"):
                with Horizontal(id="detail-head"):
                    yield Static(self.feature.icon, id="detail-icon", markup=False)
                    yield Static(self.feature.n, id="detail-num", markup=False)
                    yield Static(
                        f"[#34d399]●[/] {self.feature.status}",
                        id="detail-status",
                        markup=True,
                    )

                yield Static(self.feature.title, id="detail-title", markup=False)
                yield Static(
                    f'"{self.feature.blurb}"',
                    id="detail-blurb",
                    markup=False,
                )
                yield Static("─" * 60, id="detail-divider", markup=False)
                yield Static(self.feature.detail, id="detail-body", markup=False)

                yield Static("CHANNELS", id="detail-channels-label", markup=False)
                with Horizontal(id="detail-channels"):
                    for ch in self.feature.channels:
                        yield Static(ch, classes="channel-chip", markup=False)

                with Horizontal(id="detail-actions"):
                    yield Static("LAUNCH", classes="action-btn", markup=False)
                    yield Static("CONFIGURE", classes="action-btn-secondary", markup=False)
                    yield Static("DOCS", classes="action-btn-secondary", markup=False)

        yield Static(
            "[#67e8f9]esc / b[/] back  "
            "[#67e8f9]q[/] quit  "
            f"  ·  [#52525b]feature {self.feature.n} of {len(FEATURES)}[/]",
            id="command-bar",
            markup=True,
        )


# ───────────────────────────── app ───────────────────────────────────────


class PurpConsoleApp(App):
    """The shiny new app that runs from inside Hermes."""

    TITLE = "PURPCLAW Console"
    SUB_TITLE = "the agent that grows with you"

    CSS_PATH = str(Path(__file__).parent / "purpconsole.tcss")

    SCREENS = {"dashboard": Dashboard}

    def on_mount(self) -> None:
        self.push_screen("dashboard")


def main() -> int:
    app = PurpConsoleApp()
    app.run()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
