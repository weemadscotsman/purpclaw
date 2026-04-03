# PURPCLAW Unified Tool Schema v1.0

> Canonical reference for all agent-accessible tools in the PURPCLAW cognitive operating system.
> Organized by capability domain. Each tool maps to an OpenClaw agent intent.

---

## 1. INPUT — Keyboard & Mouse

### `keyboard_type`
Type text or press keyboard shortcuts.

```json
{
  "name": "keyboard_type",
  "description": "Type text or press shortcuts (ctrl+c, alt+f4, enter, etc).",
  "inputSchema": {
    "type": "object",
    "properties": {
      "text": { "type": "string", "description": "Text to type" },
      "shortcut": { "type": "string", "description": "Keyboard shortcut (e.g. ctrl+c, alt+f4, enter, escape)" }
    }
  }
}
```

### `mouse_click`
Click at screen coordinates. Supports left/right/middle, double, and drag.

```json
{
  "name": "mouse_click",
  "description": "Click at coordinates. Supports left/right/double/drag.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "x": { "type": "number", "description": "X coordinate (pixels from left)" },
      "y": { "type": "number", "description": "Y coordinate (pixels from top)" },
      "button": { "type": "string", "enum": ["left", "right", "middle"] },
      "double": { "type": "boolean", "description": "Double-click" },
      "drag_to_x": { "type": "number", "description": "Drag destination X" },
      "drag_to_y": { "type": "number", "description": "Drag destination Y" }
    },
    "required": ["x", "y"]
  }
}
```

### `mouse_scroll`
Scroll the mouse wheel.

```json
{
  "name": "mouse_scroll",
  "description": "Scroll mouse wheel.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "direction": { "type": "string", "enum": ["up", "down"] },
      "amount": { "type": "number", "description": "Scroll amount (default 3)" },
      "x": { "type": "number", "description": "X coordinate to scroll at" },
      "y": { "type": "number", "description": "Y coordinate to scroll at" }
    },
    "required": ["direction"]
  }
}
```

---

## 2. UI AUTOMATION — Element Discovery & Interaction

### `ui_list_elements`
List all interactive UI elements across all windows.

```json
{
  "name": "ui_list_elements",
  "description": "List all interactive UI elements across all windows. Shows name, type, location, window.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "filter": { "type": "string", "description": "Filter by element name/type" },
      "max_results": { "type": "number", "description": "Maximum results to return" }
    }
  }
}
```

### `ui_click_element`
Click a UI element by name pattern across all windows.

```json
{
  "name": "ui_click_element",
  "description": "Click a UI element by name pattern. Searches all windows and clicks the first match.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "name": { "type": "string", "description": "Element name pattern to search for" },
      "button": { "type": "string", "enum": ["left", "right", "double"] }
    },
    "required": ["name"]
  }
}
```

### `ui_get_screen_layout`
Get complete visual layout map of the screen.

```json
{
  "name": "ui_get_screen_layout",
  "description": "Get complete visual layout map of screen: all windows, elements, coordinates.",
  "inputSchema": { "type": "object", "properties": {} }
}
```

### `ui_get_element_at`
Get UI element at specific screen coordinates.

```json
{
  "name": "ui_get_element_at",
  "description": "Get UI element at specific screen coordinates.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "x": { "type": "number" },
      "y": { "type": "number" }
    },
    "required": ["x", "y"]
  }
}
```

### `find_and_click`
Find a UI element by text label and click it.

```json
{
  "name": "find_and_click",
  "description": "Find UI element by text label and click it.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "target": { "type": "string", "description": "Text label to find" },
      "click_type": { "type": "string", "enum": ["left", "right", "double"] }
    },
    "required": ["target"]
  }
}
```

---

## 3. WINDOW MANAGEMENT

### `window_list`
List open windows.

```json
{
  "name": "window_list",
  "description": "List open windows.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "filter": { "type": "string", "description": "Filter by window title" }
    }
  }
}
```

### `window_focus`
Focus a window by title.

```json
{
  "name": "window_focus",
  "description": "Focus a window by title.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "window_title": { "type": "string" }
    },
    "required": ["window_title"]
  }
}
```

### `window_close`
Close a window by title or the active window.

```json
{
  "name": "window_close",
  "description": "Close a window by title or active window.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "title": { "type": "string", "description": "Window title (omit for active window)" }
    }
  }
}
```

### `active_window`
Get info about the currently focused window.

```json
{
  "name": "active_window",
  "description": "Get info about the currently focused window.",
  "inputSchema": { "type": "object", "properties": {} }
}
```

---

## 4. FILE OPERATIONS

### `file_read`
Read file contents.

```json
{
  "name": "file_read",
  "description": "Read file contents.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "path": { "type": "string" },
      "max_lines": { "type": "number", "description": "Limit lines returned" }
    },
    "required": ["path"]
  }
}
```

### `file_write`
Write content to a file (overwrites by default).

```json
{
  "name": "file_write",
  "description": "Write content to a file.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "path": { "type": "string" },
      "content": { "type": "string" },
      "append": { "type": "boolean", "description": "Append instead of overwrite" }
    },
    "required": ["path", "content"]
  }
}
```

### `file_list`
List directory contents.

```json
{
  "name": "file_list",
  "description": "List directory contents.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "path": { "type": "string" },
      "recursive": { "type": "boolean", "description": "Recursive listing" }
    },
    "required": ["path"]
  }
}
```

### `file_search`
Search files by name or content.

```json
{
  "name": "file_search",
  "description": "Search files by name or content.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "path": { "type": "string" },
      "query": { "type": "string" },
      "in_content": { "type": "boolean", "description": "Search inside files" }
    },
    "required": ["path", "query"]
  }
}
```

### `file_copy`
Copy a file or directory.

```json
{
  "name": "file_copy",
  "description": "Copy a file or directory.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "source": { "type": "string" },
      "destination": { "type": "string" }
    },
    "required": ["source", "destination"]
  }
}
```

### `file_move`
Move or rename a file/directory.

```json
{
  "name": "file_move",
  "description": "Move or rename a file/directory.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "source": { "type": "string" },
      "destination": { "type": "string" }
    },
    "required": ["source", "destination"]
  }
}
```

### `file_delete`
Delete a file or empty directory.

```json
{
  "name": "file_delete",
  "description": "Delete a file or empty directory.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "path": { "type": "string" }
    },
    "required": ["path"]
  }
}
```

### `dir_create`
Create a directory and any parent directories.

```json
{
  "name": "dir_create",
  "description": "Create a directory (and parents).",
  "inputSchema": {
    "type": "object",
    "properties": {
      "path": { "type": "string" }
    },
    "required": ["path"]
  }
}
```

---

## 5. BROWSER (Playwright)

### `browser_open`
Open a URL in the browser.

```json
{
  "name": "browser_open",
  "description": "Open URL in browser via Playwright.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "url": { "type": "string" }
    },
    "required": ["url"]
  }
}
```

### `browser_click`
Click a link, button, or element on the current page.

```json
{
  "name": "browser_click",
  "description": "Click a link, button, or element on the current page.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "target": { "type": "string", "description": "Target text or selector" },
      "index": { "type": "number", "description": "Match index if multiple matches" }
    },
    "required": ["target"]
  }
}
```

---

## 6. SYSTEM

### `system_status`
PC health check — CPU, RAM, disk, processes.

```json
{
  "name": "system_status",
  "description": "PC health check (CPU, RAM, disk, processes).",
  "inputSchema": { "type": "object", "properties": {} }
}
```

### `system_paths`
Returns all standard Windows filesystem paths.

```json
{
  "name": "system_paths",
  "description": "Returns all standard Windows filesystem paths.",
  "inputSchema": { "type": "object", "properties": {} }
}
```

---

## 7. PROCESS

### `process_kill`
Kill a process by name or PID.

```json
{
  "name": "process_kill",
  "description": "Kill a process by name or PID.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "name": { "type": "string", "description": "Process name or PID" }
    },
    "required": ["name"]
  }
}
```

### `process_list`
List running processes.

```json
{
  "name": "process_list",
  "description": "List running processes.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "filter": { "type": "string" }
    }
  }
}
```

---

## Tool Capability Map

| Domain | Tools |
|--------|-------|
| **Input** | `keyboard_type`, `mouse_click`, `mouse_scroll` |
| **UI Automation** | `ui_list_elements`, `ui_click_element`, `ui_get_screen_layout`, `ui_get_element_at`, `find_and_click` |
| **Window** | `window_list`, `window_focus`, `window_close`, `active_window` |
| **File** | `file_read`, `file_write`, `file_list`, `file_search`, `file_copy`, `file_move`, `file_delete`, `dir_create` |
| **Browser** | `browser_open`, `browser_click`, `browser_navigate` |
| **System** | `system_status`, `system_paths`, `download_file` |
| **Process** | `process_kill`, `process_list` |

---

## Access Tiers (per locked_interfaces.js)

| Tier | Agents | Allowed Tools |
|------|--------|---------------|
| **Tier 3 — Strategic** | dragon, wolf, snake, guardian, scientist | `process_kill`, `git_push`, `execute_command`, `file_delete` |
| **Tier 2 — Operations** | owl, ghost, spider, phantom, panther, fox, jaguar, mantis, shark, gorilla, goose, parrot, bunny, rabbit, crow, panda, elephant | `file_write`, `git_commit`, `window_close` |
| **Tier 1 — Foundation** | robot, bee, turtle, hamster, squirrel, duck, koala, axolotl, chonk, mushroom, octopus, karen, lemur, phoenix, hawk, void | Read-only and basic tools |

---

## Rate Limits

| Tool | Limit |
|------|-------|
| `execute_command` | 10/min |
| `process_kill` | 5/min |
| `file_delete` | 10/min |
| `git_push` | 3/min |
