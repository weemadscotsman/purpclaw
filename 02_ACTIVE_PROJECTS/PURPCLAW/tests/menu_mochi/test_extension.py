"""MenuMochi extension structure cert — verifies the rewrite is intact.

Cert scope: the Chrome/Edge extension manifest, all referenced files exist,
icons are present in the four required sizes, content script + popup are
coherent, marketing toolkit landed in the right place.

Run from project root:
  python tests/menu_mochi/test_extension.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EXT  = ROOT / "apps" / "extensions" / "menu-mochi"
MKT  = EXT / "marketing"


def fail(msg: str) -> None:
    print(f"  FAIL  {msg}")


def test_manifest_present_and_valid():
    p = EXT / "manifest.json"
    if not p.exists():
        fail(f"manifest.json missing at {p}")
        return None
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        fail(f"manifest.json not valid JSON: {e}")
        return None
    if data.get("manifest_version") != 3:
        fail(f"manifest_version expected 3, got {data.get('manifest_version')}")
    if not data.get("name"):
        fail("manifest.name missing")
    if not data.get("version"):
        fail("manifest.version missing")
    return data


def test_manifest_referenced_files_exist(data):
    if not data:
        return
    action = data.get("action", {})
    for key in ("default_popup",):
        p = EXT / action.get(key, "")
        if not p.exists():
            fail(f"action.{key} file missing: {p}")

    bg = data.get("background", {})
    sw = bg.get("service_worker")
    if sw and not (EXT / sw).exists():
        fail(f"background.service_worker missing: {EXT / sw}")

    for cs in data.get("content_scripts", []):
        for js in cs.get("js", []):
            p = EXT / js
            if not p.exists():
                fail(f"content_scripts js missing: {p}")

    icons = data.get("icons", {}) or {}
    for size, relpath in icons.items():
        p = EXT / relpath
        if not p.exists():
            fail(f"icons[{size}] file missing: {p}")

    action_icons = (action.get("default_icon") or {})
    for size, relpath in action_icons.items():
        p = EXT / relpath
        if not p.exists():
            fail(f"action.default_icon[{size}] missing: {p}")


def test_icons_all_sizes():
    required = {16, 32, 48, 128}
    for size in required:
        p = EXT / "icons" / f"icon{size}.png"
        if not p.exists():
            fail(f"icon size {size} missing at {p}")
        elif p.stat().st_size < 100:
            fail(f"icon size {size} too small ({p.stat().st_size} bytes)")
        else:
            print(f"  PASS  icon{size}.png ({p.stat().st_size} bytes)")


def test_popup_html_wires_popup_js():
    p = EXT / "popup.html"
    if not p.exists():
        fail("popup.html missing")
        return
    html = p.read_text(encoding="utf-8")
    if "popup.css" not in html:
        fail("popup.html does not reference popup.css")
    if "popup.js" not in html:
        fail("popup.html does not reference popup.js")


def test_background_has_state_machine():
    p = EXT / "background.js"
    if not p.exists():
        fail("background.js missing")
        return
    src = p.read_text(encoding="utf-8")
    must = [
        "chrome.runtime.onInstalled",
        "chrome.alarms",
        "chrome.tabs.onActivated",
        "applyDecay",
        "calculateMood",
        "DEFAULT_STATE",
    ]
    for m in must:
        if m not in src:
            fail(f"background.js missing: {m}")


def test_content_script_present():
    p = EXT / "content.js"
    if not p.exists():
        fail("content.js missing")
        return
    src = p.read_text(encoding="utf-8")
    if "MENU_MOCHI" not in src and "mochi" not in src.lower():
        fail("content.js does not appear to be a MenuMochi content script")


def test_marketing_toolkit_landed():
    if not MKT.is_dir():
        fail(f"marketing/ dir missing at {MKT}")
        return
    required = [
        "hook_bank.csv",
        "strategy.json",
        "config.template.json",
        "campaign_posts.md",
        "posts_6_slide_scripts.json",
        "competitor-research.template.json",
    ]
    for f in required:
        if not (MKT / f).exists():
            fail(f"marketing/{f} missing")


def test_strategy_json_is_valid():
    p = MKT / "strategy.json"
    if not p.exists():
        fail("marketing/strategy.json missing")
        return
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        fail(f"strategy.json not valid JSON: {e}")
        return
    for key in ("product", "category", "tone", "hookCategories"):
        if key not in data:
            fail(f"strategy.json missing key: {key}")


def test_hook_bank_csv_well_formed():
    p = MKT / "hook_bank.csv"
    if not p.exists():
        fail("hook_bank.csv missing")
        return
    text = p.read_text(encoding="utf-8")
    lines = [l for l in text.split("\n") if l.strip()]
    if len(lines) < 5:
        fail(f"hook_bank.csv has only {len(lines)} lines")
        return
    if not lines[0].startswith("hook,"):
        fail(f"hook_bank.csv header doesn't start with 'hook,': {lines[0][:30]}")
    else:
        print(f"  PASS  hook_bank.csv ({len(lines)} lines)")


def test_legacy_dir_cleaned():
    # The pet sprites/JS at legacy/reintegrate-2026-08-17/mochi/ may remain
    # (duplicates of packages/studio/presence/mochi/, harmless to keep as ref).
    # The menu_mochi* subdirs SHOULD be empty after the move (content went
    # to apps/extensions/menu-mochi/). Empty subdirs are acceptable; non-empty
    # ones mean a file was missed.
    legacy = ROOT / "legacy" / "reintegrate-2026-08-17" / "mochi"
    for name in ("menu_mochi", "menu_mochi_extension"):
        p = legacy / name
        if not p.exists():
            continue
        # Only flag if there's a REAL file (not just an empty subdir)
        for f in p.rglob("*"):
            if f.is_file() and f.stat().st_size > 0:
                fail(f"legacy menu_mochi dir still has content: {f.relative_to(legacy)}")
                return
        # Empty dir is fine — leave the marker
        print(f"  PASS  legacy/{name} is empty (marker dir, harmless)")


if __name__ == "__main__":
    print("[menu-mochi cert] running structure checks...")
    tests = [
        ("manifest present + valid", lambda: test_manifest_present_and_valid()),
        ("manifest refs resolve",    lambda: test_manifest_referenced_files_exist(manifest_data)),
        ("all icon sizes",           test_icons_all_sizes),
        ("popup.html wires js+css",  test_popup_html_wires_popup_js),
        ("background.js has state machine", test_background_has_state_machine),
        ("content.js present",       test_content_script_present),
        ("marketing toolkit landed", test_marketing_toolkit_landed),
        ("strategy.json valid",      test_strategy_json_is_valid),
        ("hook_bank.csv well-formed", test_hook_bank_csv_well_formed),
        ("legacy dir cleaned",       test_legacy_dir_cleaned),
    ]
    manifest_data = test_manifest_present_and_valid()
    failures = 0
    for name, t in tests:
        if name == "manifest refs resolve":
            t()
        else:
            t()
    # Count actual failures by re-running with capture (simplest: parse printed output)
    # Since we use side-effect prints, count FAIL lines
    import io, contextlib
    buf = io.StringIO()
    failures = 0
    fns = [test_manifest_present_and_valid, test_manifest_referenced_files_exist,
           test_icons_all_sizes, test_popup_html_wires_popup_js,
           test_background_has_state_machine, test_content_script_present,
           test_marketing_toolkit_landed, test_strategy_json_is_valid,
           test_hook_bank_csv_well_formed, test_legacy_dir_cleaned]
    manifest_data = test_manifest_present_and_valid()
    for fn in fns:
        if fn is test_manifest_referenced_files_exist:
            fn(manifest_data)
        else:
            fn()
    # Re-run with output capture to count
    print("\n[menu-mochi cert] second pass for counting...")
    failures = 0
    manifest_data = test_manifest_present_and_valid()
    for fn in fns:
        with contextlib.redirect_stdout(buf):
            if fn is test_manifest_referenced_files_exist:
                fn(manifest_data)
            else:
                fn()
        out = buf.getvalue()
        failures += out.count("FAIL")
        if out.strip():
            print(out, end="")
        buf.seek(0); buf.truncate(0)
    print(f"\n[menu-mochi cert] failures: {failures}")
    sys.exit(0 if failures == 0 else 1)
