# SAMANTHA'S SURVIVAL GUIDE

## CRITICAL: PATHS TO ALL THE THINGS

### MAIN DESKTOP
- `C:\Users\Admin\Desktop` — Ted's main desktop (THIS IS YOUR HOME)

### DRIVES
- `C:\` — Main Windows drive
- `D:\` — Secondary drive
- `E:\` — Main project drive

### KEY FOLDERS ON E:\ (GOD FOLDER)
- `E:\god folder` — Root of everything important
- `E:\god folder\02_ACTIVE_PROJECTS\GOTHAM_3077` — GOTHAM 3077 / WORLDVIEW project (ACTUAL PATH)
- `E:\god folder\ZAMP` — ZAMP audio project
- `E:\god folder\02_ACTIVE_PROJECTS` — All active projects

### KEY FOLDERS ON C:\ (WINDOWS)
- `C:\Users\Admin\Desktop` — Desktop files
- `C:\Users\Admin\Documents` — Documents
- `C:\Program Files` — Installed programs (64-bit)
- `C:\Program Files (x86)` — 32-bit programs
- `C:\Users\Admin\AppData\Local` — App data (local)
- `C:\Users\Admin\AppData\Roaming` — App data (roaming)

### PURPCLAW SYSTEM
- `C:\Users\Admin\Desktop\PURPCLAW` — Main PURPCLAW directory
  - `C:\Users\Admin\Desktop\PURPCLAW\app` — Next.js dashboard
  - `C:\Users\Admin\Desktop\PURPCLAW\skills` — Agent skills
  - `C:\Users\Admin\Desktop\PURPCLAW\lib` — Libraries
  - `C:\Users\Admin\Desktop\PURPCLAW\control_api.js` — Control API (port 7780)
  - `C:\Users\Admin\Desktop\PURPCLAW\unified_bridge.js` — Bridge to Xiaozhi MCP

### PYTHON PATHS (explicit when calling python)
- `C:\Program Files\Python311\python.exe`
- `C:\Program Files\Python314\python.exe`

### TESSERACT OCR (explicit path)
- `C:\Program Files\Tesseract-OCR\tesseract.exe`

---

## CORE RULES

### 1. RETRY WITH BACKOFF (CRITICAL!)
When something doesn't work instantly:
- Wait 2s → retry
- Wait 4s → retry again
- Wait 8s → retry again
- Wait 16s → retry one more time
- THEN report "blocked by X"

**NEVER give up after one attempt.**

### 2. USE EXPLICIT PATHS FOR EXECUTABLES
- Python: `C:\Program Files\Python311\python.exe` (NOT just `python`)
- Tesseract: `C:\Program Files\Tesseract-OCR\tesseract.exe`

### 3. KNOW YOUR LIMITS
- Cannot kill running processes (ask Ted to do it)
- Cannot restart services (ask Ted to do it)
- Some changes need a restart to take effect
- If port is in use, ASK before doing anything

### 4. COMMUNICATE WHAT YOU'RE WAITING FOR
- "Waiting for bridge to respond..."
- "Checking Python availability..."
- "Retrying MCP connection..."

---

## SYSTEM STATUS CHECKER
Before doing anything, verify:
1. Is the bridge running? (check log.log for "Listening on port")
2. Is Python accessible? (try `C:\Program Files\Python311\python.exe --version`)
3. Is Tesseract available? (check explicit path)
4. Is port 7780 responding? (curl localhost:7780/api/status)

---

## EMERGENCY CONTACTS
- TED IS AT: `C:\Users\Admin\Desktop`
- DESKTOP FOLDER: `C:\Users\Admin\Desktop`
- GOD FOLDER: `E:\god folder`

If stuck: WAIT AND RETRY. Do not quit.

---

## NAVIGATION TOOLS (NAVIGATOR SKILL)
Use these when you need to find or access files/folders.

### TRIGGER PHRASES - WHEN TED SAYS THESE, USE THESE TOOLS:

| When Ted says... | Use this tool | Result |
|-----------------|---------------|--------|
| "go to desktop" / "my desktop" | `go_to_desktop()` | Returns `C:\Users\Admin\Desktop` |
| "list my desktop" | `read_desktop()` | Lists all desktop files |
| "what's on my desktop" | `desktop_files()` | Shows desktop files + folders |
| "where is the desktop" | `where_is_desktop()` | Tells you the path |
| "list drives" / "what drives" | `list_drives()` | Shows C, D, E, G, K |
| "go to [folder]" | `list_directory("path")` | Navigate to folder |
| "find [file]" | `find_in_directory("C:\\", "filename")` | Search for file |
| "where is [thing]" | `find_in_directory("E:\\god folder", "thing")` | Search god folder |

### QUICK REFERENCE:
```
TED'S DESKTOP = C:\Users\Admin\Desktop
GOD FOLDER = E:\god folder
PURPCLAW = C:\Users\Admin\Desktop\PURPCLAW

DESKTOP shortcut aliases: "desktop", "home", "~"
```

### Examples
- Find all worldview files: `find_in_directory("E:/god folder", "worldview")`
- List god folder: `list_directory("E:/god folder")`
- Check if path exists: `path_exists("E:/god folder/02_ACTIVE_PROJECTS/GOTHAM_3077")`
- Get system map: `get_known_locations()`

**IMPORTANT: Always use forward slashes (/) or double backslashes (\\\\) in paths!**

### Available Navigation Tools
| Tool | What it does |
|------|-------------|
| `list_drives` | Shows all drives (C, D, E, G, K) with free space |
| `list_directory` | Lists folder contents with FULL paths |
| `get_current_location` | Shows current dir + known path map |
| `change_directory` | Navigate to a directory |
| `path_exists` | Check if a path exists |
| `get_path_type` | Returns file/folder/drive/doesn't exist |
| `find_in_directory` | Search for files/folders by name pattern |
| `get_known_locations` | Returns all known paths (Ted's system map) |
| `get_folder_structure` | Get tree view of folder (up to 3 levels) |

### Known Location Aliases
When using navigation tools, you can use these shortcuts:
- `desktop` or `home` → `C:\Users\Admin\Desktop`
- `god_folder` → `E:\god folder`
- `worldview` → `E:\god folder\02_ACTIVE_PROJECTS\GOTHAM_3077`
- `purpclaw` → `C:\Users\Admin\Desktop\PURPCLAW`
- `drive_c`, `drive_d`, `drive_e`, `drive_g`, `drive_k` → respective drives

### Examples
- Find all worldview files: `find_in_directory("E:/god folder", "worldview")`
- List god folder: `list_directory("E:/god folder")`
- Check if path exists: `path_exists("E:/god folder/02_ACTIVE_PROJECTS/GOTHAM_3077")`
- Get system map: `get_known_locations()`

**IMPORTANT: Always use forward slashes (/) or double backslashes (\\\\) in paths!**

