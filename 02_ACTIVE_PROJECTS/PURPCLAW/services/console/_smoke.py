"""Smoke test the TUI headlessly and dump SVG snapshots to verify rendering."""
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from .app import consoleApp


async def smoke() -> None:
    out_dir = ROOT / "purpconsole" / "_screens"
    out_dir.mkdir(exist_ok=True)

    app = PurpConsoleApp()
    async with app.run_test(size=(140, 40)) as pilot:
        await pilot.pause(0.2)
        # Snapshot dashboard
        svg = app.export_screenshot(title="PURPCLAW Console — Dashboard")
        (out_dir / "01_dashboard.svg").write_text(svg, encoding="utf-8")
        print("✓ dashboard rendered")

        # Open feature 02 via number key
        await pilot.press("2")
        await pilot.pause(0.2)
        svg = app.export_screenshot(title="PURPCLAW Console — Feature 02")
        (out_dir / "02_feature_grows.svg").write_text(svg, encoding="utf-8")
        print("✓ feature 02 (Grows the Longer It Runs) opened")

        # Back, then open feature 05
        await pilot.press("escape")
        await pilot.pause(0.2)
        await pilot.press("5")
        await pilot.pause(0.2)
        svg = app.export_screenshot(title="PURPCLAW Console — Feature 05")
        (out_dir / "03_feature_sandbox.svg").write_text(svg, encoding="utf-8")
        print("✓ feature 05 (Real Sandboxing) opened")

        # Back to dashboard
        await pilot.press("escape")
        await pilot.pause(0.2)

    print(f"\nscreenshots → {out_dir}")


if __name__ == "__main__":
    asyncio.run(smoke())
