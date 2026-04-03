---
name: tui-textual
description: Build shiny Python TUI apps with Textual — terminal user interfaces that look like modern web UIs. Covers layout, styling, the six gotchas that always bite, and headless SVG testing.
version: 0.1.0
category: software-development
tags: [python, tui, textual, rich, terminal-ui, hermes-pocket-tool, shine]
---

# Textual TUI Development

Build beautiful, interactive terminal apps with [Textual](https://textual.textualize.io/) — Python TUI framework with CSS-like styling, mouse support, animations, and a headless test mode that exports SVG snapshots.

## When to use this

- Ted asks for a "shiny new app" and the deliverable is terminal-based
- Building a `hermes run <name>` pocket-tool that needs to be more than a basic CLI
- Interactive menus, dashboards, multi-screen workflows that run from a TTY
- Live status displays, agent consoles, feature browsers, file pickers, REPLs
- The next PURPCLAW/agent-platform sub-app that should run from inside Hermes

**Don't use Textual for**: pure CLI scripts (use `rich` alone), web apps (use Next.js), desktop GUI (use Electron/Tauri).

## Setup

```bash
pip install textual rich
```

Python 3.8+ supported, 3.11+ recommended. Textual 0.80+ uses the new `textual.app`, `textual.containers`, `textual.widgets`, `textual.screen` API.

## Project layout (recommended)

```
myapp/
  __init__.py
  __main__.py     # python -m myapp
  run.py          # direct entry: python myapp/run.py
  app.py          # App + Screen classes
  data.py         # domain data (one source of truth)
  myapp.tcss      # stylesheet
  README.md
  _smoke.py       # headless render test (highly recommended)
```

Keep `data.py` separate from `app.py` so you can re-render the UI for any dataset without rewriting presentation code. This is the same separation a web app's `models.py` and `views/` would have.

## Minimal app skeleton

```python
# app.py
from textual.app import App, ComposeResult
from textual.containers import Container, Horizontal, Vertical
from textual.binding import Binding
from textual.screen import Screen
from textual.widgets import Static


class HomeScreen(Screen):
    BINDINGS = [
        Binding("q", "app.quit", "Quit"),
        Binding("enter", "open_focused", "Open"),
    ]

    def compose(self) -> ComposeResult:
        yield Static("My App", id="title")
        # ... widgets ...

    def on_mount(self) -> None:
        first = self.query_one("#first-tile")
        first.focus()


class MyApp(App):
    CSS_PATH = "myapp.tcss"
    SCREENS = {"home": HomeScreen}

    def on_mount(self) -> None:
        self.push_screen("home")


if __name__ == "__main__":
    MyApp().run()
```

## The six gotchas that always bite

### 1. CSS grid requires `layout: grid` explicitly

`Container` defaults to vertical layout. Setting only `grid-size` does nothing — children still stack vertically. Need BOTH `layout: grid` AND `grid-columns`:

```css
#grid {
    layout: grid;
    grid-size: 3;                 /* number of columns */
    grid-columns: 1fr 1fr 1fr;    /* required, not optional */
    grid-gutter: 1 1;
}
```

If the grid renders as 1×6 instead of 3×2, you forgot `layout: grid`.

### 2. `height: 1` clips text inside bordered widgets

A widget with `border: round` or `border: tall` needs at least `height: 3` for the border to leave room for text. With `height: 1`, the border takes the row and the text gets clipped to zero (or hidden entirely).

```css
/* WRONG — renders as empty box */
.chip { height: 1; border: round cyan; padding: 0 1; }

/* RIGHT — text shows */
.chip { height: 3; border: tall cyan; padding: 0 2; content-align: center middle; }
```

This is the #1 reason a freshly-styled chip comes out as a hollow rectangle.

### 3. `Static` text needs `markup=False` to render literally

`Static` content is parsed as Rich markup by default. If the content contains brackets or looks like a tag, it gets eaten silently. Always pass `markup=False` for user-facing literal text:

```python
yield Static("LAUNCH", classes="action-btn", markup=False)
yield Static(ch, classes="channel-chip", markup=False)        # ch is a string
yield Static(self.feature.title, id="detail-title", markup=False)
```

Markup IS desired for brand headers, status pills, command bars — those should keep the default `markup=True` and use `[#67e8f9]cyan[/]` style.

### 4. `width: 100%` on a child of `Horizontal` stretches it to fill

If a child of a `Horizontal` has `width: 100%`, it takes the full row width and pushes siblings off-screen or causes layout glitches. For inline-sized children (chips, buttons), use `width: auto` + `min-width`:

```css
.btn { width: auto; min-width: 14; padding: 0 2; }
```

The `width: 100%` should only be used for full-width children inside a `Vertical` (block) layout, not inside a `Horizontal`.

### 5. `text-style: bold large` is invalid

Textual's `text-style` accepts `b`, `bold`, `dim`, `i`, `italic`, `u`, `underline`, `strike`, `reverse`, `blink`, `none` — separated by spaces. It does NOT accept `large` or `huge`. For visual size, use a taller `height` or different markup, not `text-style`.

```css
/* WRONG — parse error */
.detail-title { text-style: bold large; }

/* RIGHT */
.detail-title { text-style: bold; height: 1; }
```

A parse error in the stylesheet kills the whole app at startup with `StylesheetParseError`. Run a smoke test before assuming a layout bug.

### 6. Built-in `Header` widget looks generic — write a custom brand bar

`from textual.widgets import Header` gives you a stock header that doesn't match any custom design system. Most "shiny" apps write a 3-line custom header using a `Static` with markup:

```python
class BrandHeader(Static):
    def compose(self) -> ComposeResult:
        yield Static(
            "[b #67e8f9]PURP[/b #67e8f9][b #e4e4e7]CLAW[/b #e4e4e7]"
            "  [#34d399 on #052e1f] v2.0 [/]"
            "  · the agent that grows with you",
            id="brand-row",
        )
```

Then style the parent in TCSS with `height: 3; background: #0d0d11; border-bottom: tall #1f1f23; padding: 0 2;`.

## Headless testing — export SVG snapshots

Textual's `run_test()` lets you drive the app in a virtual terminal and export SVG snapshots for visual verification. This is the right way to verify a TUI without a real TTY, and it slots directly into a smoke test.

```python
# _smoke.py
import asyncio
from pathlib import Path
from myapp.app import MyApp


async def smoke() -> None:
    out = Path(__file__).parent / "_screens"
    out.mkdir(exist_ok=True)

    app = MyApp()
    async with app.run_test(size=(140, 40)) as pilot:
        await pilot.pause(0.2)
        svg = app.export_screenshot(title="My App — Home")
        (out / "01_home.svg").write_text(svg, encoding="utf-8")

        # Drive keyboard nav to verify bindings
        await pilot.press("2")
        await pilot.pause(0.2)
        svg = app.export_screenshot(title="My App — Item 2")
        (out / "02_item.svg").write_text(svg, encoding="utf-8")

    print(f"screenshots → {out}")


if __name__ == "__main__":
    asyncio.run(smoke())
```

View the SVG by opening it in any browser — `file:///E:/path/to/_screens/01_home.svg` works in Chrome/Firefox/Edge. The SVG renders the actual terminal cells with colors, borders, and text — visual verification beats reading the source.

The size argument `(140, 40)` is `(columns, rows)`. 140×40 fits a wide TUI nicely. Smaller sizes make text wrap and reveal layout issues faster.

## Keyboard binding pattern

Bind keys at the `Screen` level for screen-specific actions, at the `App` level for global ones. `show=True` puts the binding in the footer hints; `show=False` keeps it hidden but bound.

```python
class HomeScreen(Screen):
    BINDINGS = [
        Binding("q", "app.quit", "Quit", show=True),
        Binding("escape", "app.quit", "Quit", show=False),
        Binding("enter", "open_focused", "Open", show=True),
        Binding("1", "open('01')", "01", show=False),  # hidden
        Binding("2", "open('02')", "02", show=False),
    ]

    def action_open_focused(self) -> None:
        focused = self.focused
        if isinstance(focused, Tile):
            self.app.push_screen(Detail(focused.item))

    def action_open(self, n: str) -> None:
        for item in ITEMS:
            if item.n == n:
                self.app.push_screen(Detail(item))
                return
```

## Invoking from Hermes

To make a Textual TUI invokable from inside Hermes, expose it as a Python entry point and call it from the terminal tool. The terminal MUST run with `pty=True` — Textual needs a real TTY, not a pipe.

```python
# From a Hermes session:
terminal(
    command="python E:/path/to/myapp/run.py",
    background=True,  # long-lived TUI process
    pty=True,          # REQUIRED for TUI — no PTY means no TTY, no colors
)
```

For one-shot invocation: `python -m myapp` works. For persistent monitoring, use `background=True` and `pilot`-style updates.

## Verification checklist

Before shipping a Textual TUI:

1. `python -c "import myapp"` — clean imports, no missing dependencies
2. `python myapp/_smoke.py` — exports SVG snapshots, catches stylesheet parse errors
3. Open the SVGs in a browser — visually verify grid layout, chip text, button text, no clipped content, no missing colors
4. Test with `app.run_test()` and drive every keybinding via `pilot.press()` — proves the action handlers are wired
5. Manual run in a real terminal — colors, mouse, animation actually work (PTY mode matters)
6. `app.exit()` cleanly — no orphaned processes

If the smoke test fails, the SVG is the fastest debug surface — colors and borders render exactly as they will in a real terminal.

## Pitfalls

### Animation delay pattern

`motion/react` style staggered entrance animations don't exist in Textual. Use a simple `set_interval` or `on_mount` to add a CSS class with a transition. For one-time entrance, set initial state in CSS and let `on_mount` flip a flag class.

### `id` must be unique across the whole app

Every `Static(..., id="foo")` id is global. If you have a `tile` and a `chip` and they both get id `feature-01`, you get a runtime error. Use a class for shared styling, reserve `id` for one-of-a-kind targets.

### `query_one("#foo", WidgetClass)` raises on miss

`self.query_one("#foo")` raises `NoMatches` if the widget isn't mounted yet. Call it from `on_mount` of the parent, not from `compose` (children aren't mounted when `compose` returns).

### `Static` with markup string can crash

If you pass markup like `"[#cyan]Title[/]"` and the closing tag is missing, the parser raises at render time. When the markup is user-derived or contains brackets, `markup=False` is safer.

## Worked example

See `E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/purpconsole/` — a full Textual TUI built in one session:
- 3×2 feature grid with accent-colored borders per tile
- Detail screen with channel chips and action buttons
- Brand header, hero section, command bar at bottom
- `_smoke.py` exporting three SVG snapshots
- Keyboard nav: `1-6` jump, `enter` open, `esc` back, `q` quit

Use it as a template — copy `purpconsole/`, rename, swap `data.py`, adjust `app.py` compose methods and the TCSS color palette.
