# PURPCLAW ONE-CLICK DISTRIBUTION + INSTALLER SPEC

> **§28 step 1 DONE:** Runtime layout frozen in `CANONICAL_RUNTIME_LAYOUT.md` (v1.0) — packaging (§2, §7, §14) consumes that file.

Version: 0.1 — CANONICAL COMPLETE 2026-08-26
Status: APPROVED (Eddie) — COMPLETE MIRROR
Pairs with: `PURPCLAW_ONBOARDING_BORN_ADOPTED_SPEC.md` (v0.3)

**Division of authority:** the installer NEVER births PurpClaw. It gets the machine ready. Birth/adoption certificates are created only after onboarding + TVG pass. Product path:

> **Install → Configure → Verify → Birth → Adopt → Chat.**

## 1. GOAL

Ship PurpClaw so a normal user can go from nothing to a working installation with one command or one installer, then immediately enter onboarding and chat.

Primary delivery targets:

- Windows portable EXE / desktop package
- PurpClaw CLI
- PurpClaw Web UI / local cockpit
- Android APK
- Optional local models / extras
- One-click PowerShell bootstrap from the GitHub repository / release channel

The install experience should be:

```
DOWNLOAD / ONE-LINER
→ VERIFY RELEASE
→ SHOW TEXT INSTALL MENU
→ INSTALL SELECTED COMPONENTS
→ CREATE SHORTCUTS
→ PLACE OPTIONAL APK ON DESKTOP
→ LAUNCH PURPCLAW
→ ONBOARDING
→ CHAT
```

No manual Node install.
No manual Python install for normal users.
No npm commands.
No cloning repos.
No editing .env files.
No hunting for APKs.
No separate setup guides for the normal path.

---

## 2. RELEASE SHAPE

Every tagged GitHub Release should contain a versioned release bundle.

Example:

```
PurpClaw-v1.0.0/
  purpclaw-win-x64.exe
  purpclaw-cli-win-x64.exe
  purpclaw-web-runtime-win-x64.zip
  purpclaw-mobile-v1.0.0.apk
  purpclaw-portable-v1.0.0.zip
  install.ps1
  uninstall.ps1
  checksums.sha256
  release-manifest.json
  signatures/
  RELEASE_NOTES.md
```

The installer must consume release-manifest.json rather than hard-coded asset URLs.

---

## 3. SINGLE CANONICAL RELEASE MANIFEST

Example fields:

```json
{
  "version": "1.0.0",
  "channel": "stable",
  "publishedAt": "...",
  "minWindowsVersion": "...",
  "components": [
    {
      "id": "desktop",
      "label": "PurpClaw Desktop",
      "default": true,
      "required": true,
      "asset": "purpclaw-win-x64.exe",
      "sha256": "...",
      "size": 123456789
    },
    {
      "id": "cli",
      "label": "PurpClaw CLI",
      "default": true,
      "required": false,
      "asset": "purpclaw-cli-win-x64.exe",
      "sha256": "..."
    },
    {
      "id": "web",
      "label": "PurpClaw Web Cockpit",
      "default": true,
      "required": false,
      "asset": "purpclaw-web-runtime-win-x64.zip",
      "sha256": "..."
    },
    {
      "id": "android",
      "label": "PurpClaw Mobile APK",
      "default": true,
      "required": false,
      "asset": "purpclaw-mobile-v1.0.0.apk",
      "sha256": "..."
    }
  ]
}
```

The bootstrapper reads this manifest and presents only components that actually exist in the release.

---

## 4. ONE-LINE INSTALL

Public install command should be short.

Example concept:

```powershell
irm https://raw.githubusercontent.com/<owner>/<repo>/main/install.ps1 | iex
```

But production should prefer a versioned / release-backed installer URL, and the script itself must verify every downloaded release artifact before execution.

Recommended marketing form:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm '<trusted install URL>' | iex"
```

Security note:
The convenience one-liner is only the bootstrap. It must not blindly execute downloaded binaries without:
- SHA-256 verification
- optional signature verification
- HTTPS-only download
- release manifest validation

Also provide a safer manual alternative:
Download install.ps1 from Releases, inspect it, then run it.

---

## 5. TEXT-STYLE INSTALLER UI

The PowerShell installer should feel like a small terminal setup app.

Example:

```text
┌──────────────────────────────────────────────┐
│              PURPCLAW INSTALLER              │
│        AI Workstation OS • v1.0.0            │
├──────────────────────────────────────────────┤
│ [x] PurpClaw Desktop                         │
│ [x] CLI                                      │
│ [x] Web Cockpit                              │
│ [x] Android APK (copy to Desktop)            │
│ [ ] Optional local starter model             │
│ [ ] Developer tools                          │
├──────────────────────────────────────────────┤
│ ↑↓ Move   SPACE Toggle   ENTER Install       │
└──────────────────────────────────────────────┘
```

Everything useful is selected by default.

Required core component cannot be unchecked if other selected components depend on it.

The installer may use simple console key handling. Do not require an external TUI dependency.

---

## 6. INSTALL MODES

### STANDARD
Default for normal users.

Installs:
- Desktop runtime
- Web cockpit
- CLI
- shortcuts
- mobile APK copied to Desktop
- local config/data directories

### PORTABLE
Installs everything into a single selected directory / USB drive.

No global dependency required.
No registry dependency required except optional shortcuts / file associations.

Example:
`D:\PurpClaw\`

Must remain relocatable wherever technically possible.

### CLI ONLY
Installs:
- CLI executable
- minimal runtime/core
- config/vault/data directories

No desktop shell.
No APK unless user selects it.

### CUSTOM
Text-menu component selection.

---

## 7. INSTALL LOCATION

Default:

```
%LOCALAPPDATA%\PurpClaw\
```

Portable mode:
user-chosen path.

Suggested layout:

```
PurpClaw/
  app/
  bin/
    purpclaw.exe
    purpclaw-cli.exe
  web/
  mobile/
    purpclaw-mobile.apk
  config/
  data/
  memory/
  workspace/
  models/
  logs/
  certificates/
  uninstall.ps1
```

Keep mutable user data separate from app binaries where practical.

---

## 8. NO RUNTIME DEPENDENCY HUNT

The normal release should bundle whatever PurpClaw actually requires to run.

Users should not be asked to install:
- Node
- npm
- pnpm
- Python
- Git
- compilers

If a specialist addon requires something external:
- detect it
- explain it
- offer guided installation
- never silently install unrelated system software

Portable builds should favour embedded / packaged runtimes and lazy optional workers.

---

## 9. WINDOWS EXE PACKAGING

The final Windows build should expose one obvious launcher:

`purpclaw.exe`

It should:
1. locate bundled runtime
2. locate local data/config
3. start required core services lazily
4. confirm health
5. launch desktop shell or browser cockpit
6. start onboarding on first run
7. open normal chat on subsequent runs

CLI remains separately callable:

```
purpclaw
purpclaw ask
purpclaw doctor
purpclaw setup
purpclaw update
```

Do not make the CLI depend on the GUI process being open.

---

## 10. FIRST-RUN MARKER

Install success does NOT mean onboarding success.

Installer writes only installation metadata.

On first launch:

```
if !onboarding.completed:
    launch onboarding
else:
    launch normal PurpClaw
```

The onboarding state is stored locally and resumable.

The installer must never generate birth/adoption certificates.
Those are created only after the actual onboarding and TVG verification succeeds.

---

## 11. APK DELIVERY

If Android APK is selected:

1. download APK from same release
2. verify SHA-256/signature
3. copy it to:
   `Desktop\PurpClaw-Mobile-vX.Y.Z.apk`
4. optionally also retain:
   `PurpClaw\mobile\PurpClaw-Mobile-vX.Y.Z.apk`
5. show:
   "PurpClaw Mobile APK is on your Desktop."

Do not auto-install APK to a phone from Windows by default.

Optional future ADB mode may exist under Advanced / Developer setup.

The onboarding should later guide mobile pairing securely.

---

## 12. SHORTCUTS

Default shortcuts:

Desktop:
- PurpClaw

Start Menu:
- PurpClaw
- PurpClaw CLI
- PurpClaw Uninstall
- PurpClaw Update

Optional:
- PurpClaw Web Cockpit

Do not create a desktop graveyard of six icons.

---

## 13. CLI PATH

If CLI selected:

Add PurpClaw bin directory to the user's PATH.

Do this at USER scope, not machine scope, unless explicitly elevated by user choice.

Verify after modification.

Installer reports:

```
✓ purpclaw command available
```

If current shell cannot see updated PATH yet, explain that a new terminal will.

---

## 14. AUTO UPDATE

PurpClaw should have its own update command:

`purpclaw update`

Updater flow:

```
CHECK RELEASE MANIFEST
→ compare version
→ download selected installed components only
→ verify checksums/signatures
→ snapshot current install
→ stop required processes
→ atomic replace
→ health check
→ rollback if failed
```

Do not reinstall user:
- vault
- memory
- workspace
- certificates
- profiles
- provider credentials

---

## 15. RELEASE CHANNELS

Support:

- stable
- beta
- nightly/dev

Default = stable.

CLI:

```
purpclaw update --channel beta
```

Installer may expose:
Advanced → Release Channel

Normal users should not accidentally install nightly.

---

## 16. SIGNING + RELEASE TRUST

Required release protections:

- SHA-256 checksum for every artifact
- release manifest checksum
- GitHub Release tag
- Windows code signing when available
- Android APK signing
- optional manifest signature using a PurpClaw release signing key

Bootstrap trust chain:

```
bootstrap script
→ release manifest
→ signed / checksummed assets
→ installed binaries
```

Never execute an asset that failed verification.

---

## 17. INSTALLER NETWORK BOUNDARY

The installer may contact only:

- GitHub / configured official release host
- optional official dependency host for an explicitly selected add-on

No analytics.
No installer telemetry.
No device fingerprint upload.
No silent install metrics.

Local install logs may be written.

---

## 18. OFFLINE INSTALL PACKAGE

GitHub Releases should also provide:

`PurpClaw-Offline-Installer-vX.Y.Z.zip`

Containing all default components.

This supports:
- USB installs
- classroom/workshop installs
- machines with poor internet
- archival releases

Offline installer uses the exact same manifest/checksum flow.

---

## 19. INSTALLER RESUME / FAILURE HANDLING

Downloads go to a temporary staging directory.

Each component state:

```
NOT_SELECTED
PENDING
DOWNLOADING
VERIFIED
INSTALLED
FAILED
```

If download fails:
- retry with bounded backoff
- preserve already verified assets
- allow resume

If installation fails:
- retain previous working installation
- display exact component failure
- do not pretend success

---

## 20. HANDS-OFF FLOW

Ideal normal-user journey:

1. User copies one command from GitHub / website.
2. Pastes into PowerShell.
3. PurpClaw installer opens.
4. Defaults are already:
   [x] Desktop
   [x] CLI
   [x] Web
   [x] Android APK
5. User presses ENTER.
6. Installer downloads release.
7. Checksums/signatures verify.
8. Files install.
9. Shortcuts/PATH configured.
10. APK appears on Desktop.
11. PurpClaw launches automatically.
12. First-run onboarding starts.
13. User creates profile.
14. User names PurpClaw.
15. Guided API/provider setup.
16. Vault sealed.
17. Auto-router configured.
18. Memory/tools/privacy checked.
19. TVG passes.
20. Birth certificate generated.
21. Adoption papers generated.
22. Welcome pack saved.
23. Chat opens.

That is the target.

---

## 21. INSTALLER COMPLETION SCREEN

Example:

```text
PURPCLAW INSTALLED ✓

Desktop        ✓
CLI            ✓
Web Cockpit    ✓
Mobile APK     ✓  Desktop\PurpClaw-Mobile-v1.0.0.apk
PATH           ✓
Release        v1.0.0 stable

Launching PurpClaw...
```

No account creation.
No newsletter.
No telemetry checkbox hidden under "Improve PurpClaw".
Straight into onboarding.

---

## 22. GITHUB REPOSITORY SURFACE

README top section should expose:

```
## Install PurpClaw

### Windows one-click
<PowerShell command>

### Portable / Offline
GitHub Release download

### CLI only
<PowerShell command with -CliOnly or equivalent>

### Android
APK Release link
```

The normal install path should be visible before developer build instructions.

Developer clone/build instructions belong lower in the README.

---

## 23. BOOTSTRAP SCRIPT FLAGS

Suggested:

```
install.ps1
  -Standard
  -Portable
  -CliOnly
  -Custom
  -InstallDir
  -Channel stable|beta
  -NoLaunch
  -NoDesktopShortcut
  -NoMobile
  -Force
  -Repair
```

Examples:

```
irm .../install.ps1 | iex
```

or downloaded:

```
.\install.ps1 -Portable -InstallDir "E:\PurpClaw"
```

Avoid requiring flags for the normal path.

---

## 24. REPAIR MODE

The same installer should be capable of:

Repair PurpClaw

Checks:
- expected files
- checksums
- runtime health
- PATH
- shortcuts
- web assets
- CLI launcher
- mobile APK copy

Repair only app/runtime components.

Never wipe:
- user profile
- vault
- memory
- workspace
- certificates

---

## §25 UNINSTALLER

```
Remove PurpClaw application? [x]

Optional:
[ ] Remove workspace
[ ] Remove memory
[ ] Remove provider credentials
[ ] Remove certificates
[ ] Remove all user data
```

Default uninstall preserves user data. "Delete everything" requires explicit second confirmation.

---

## §26 TVG FOR RELEASE INSTALLS

No GitHub Release marked stable unless ALL gates pass.

**GATE 1 — PACKAGE:** EXE launches clean · CLI launches clean · web cockpit launches clean · APK hash/signature valid · manifest matches assets.

**GATE 2 — INSTALL:** clean Windows user · existing install upgrade · portable directory · CLI-only · interrupted download + resume · repair · uninstall.

**GATE 3 — FIRST RUN:** onboarding starts · vault setup works · provider setup works · privacy test passes · birth/adoption artifacts generate · chat opens.

---

## §27 CRITICAL PRODUCT RULES

1. ONE CORE, MULTIPLE SURFACES — Desktop/Web/CLI share canonical runtime/config.
2. NO DUPLICATE INSTALLS — Web UI must not secretly install a second core.
3. APK IS OPTIONAL SURFACE — offered by default, not required for desktop use.
4. USER DATA SURVIVES UPDATES — updater touches application/runtime, never ownership data.
5. PORTABLE MEANS PORTABLE — no dependency scatter.
6. INSTALLER DOES NOT PHONE HOME — downloads are not analytics.
7. FIRST RUN GOES TO ONBOARDING — not README, not settings, not terminal instructions.
8. ONBOARDING GOES TO CHAT — the reward is a functioning PurpClaw.

---

## §28 IMPLEMENTATION ORDER

1. Freeze canonical runtime layout
2. Reproducible Windows package
3. Reproducible CLI package
4. Signed APK
5. release-manifest schema
6. PowerShell bootstrapper
7. Interactive text installer
8. Checksum/signature verification
9. Standard/portable/CLI-only modes
10. PATH/shortcut logic
11. First-run launcher
12. Wire onboarding
13. Updater
14. Repair/uninstall
15. Offline bundle
16. Release TVG CI
17. Publish stable release only after certification

---

## §29 END STATE

A non-technical user needs exactly this much knowledge:

1. Copy command. 2. Paste command. 3. Press Enter. 4. Accept or deselect components. 5. Follow the friendly onboarding. 6. Chat.

**Everything else is PurpClaw's problem.**
