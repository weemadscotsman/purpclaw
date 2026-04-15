/**
 * NAVIGATOR - Explicit OS Navigation Tools for PURPCLAW
 *
 * Provides explicit drive/folder navigation so SAMANTHA never gets lost.
 * All paths are explicit, no guessing.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// KNOWN PATHS - SAMANTHA'S MAP OF TED'S SYSTEM
const KNOWN_PATHS = {
  desktop: 'C:\\Users\\Admin\\Desktop',
  home: 'C:\\Users\\Admin\\Desktop',
  god_folder: 'E:\\god folder',
  worldview: 'E:\\god folder\\02_ACTIVE_PROJECTS\\GOTHAM_3077',
  worldview_frontend: 'E:\\god folder\\02_ACTIVE_PROJECTS\\GOTHAM_3077\\frontend\\src',
  zamp: 'E:\\god folder\\ZAMP',
  purpclaw: 'C:\\Users\\Admin\\Desktop\\PURPCLAW',
  documents: 'C:\\Users\\Admin\\Documents',
  downloads: 'C:\\Users\\Admin\\Downloads',
  pictures: 'C:\\Users\\Admin\\Pictures',
  drive_c: 'C:\\',
  drive_d: 'D:\\',
  drive_e: 'E:\\',
  drive_g: 'G:\\',
  drive_k: 'K:\\',
  program_files: 'C:\\Program Files',
  program_files_x86: 'C:\\Program Files (x86)',
  appdata_local: 'C:\\Users\\Admin\\AppData\\Local',
  appdata_roaming: 'C:\\Users\\Admin\\AppData\\Roaming',
};

/**
 * tool: list_drives
 * Lists all available drives on the system
 */
function list_drives() {
  try {
    const psScript = `Get-CimInstance Win32_LogicalDisk | Select-Object DeviceID, DriveType, FreeSpace, Size | ConvertTo-Json`;
    const result = execSync(`powershell -Command "${psScript}"`, { encoding: 'utf8', stdio: 'pipe' });
    const drives = JSON.parse(result);
    const normalized = Array.isArray(drives) ? drives : [drives];

    return {
      success: true,
      drives: normalized.map(d => ({
        letter: d.DeviceID,
        type: getDriveType(d.DriveType),
        freeSpace: d.FreeSpace || 0,
        size: d.Size || 0
      }))
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function getDriveType(type) {
  const types = { 0: 'Unknown', 1: 'No Root', 2: 'Removable', 3: 'Local', 4: 'Network', 5: 'CD', 6: 'RAM' };
  return types[type] || 'Unknown';
}

/**
 * tool: list_directory
 * Lists contents of a directory with FULL paths
 * @param {string} dirPath - The directory to list
 */
function list_directory(dirPath) {
  try {
    // Resolve known path aliases
    const resolvedPath = resolvePath(dirPath);

    if (!fs.existsSync(resolvedPath)) {
      return { success: false, error: `Path does not exist: ${resolvedPath}` };
    }

    const stats = fs.statSync(resolvedPath);
    if (!stats.isDirectory()) {
      return { success: false, error: `Not a directory: ${resolvedPath}` };
    }

    const items = fs.readdirSync(resolvedPath).map(name => {
      const fullPath = path.join(resolvedPath, name);
      try {
        const s = fs.statSync(fullPath);
        return {
          name,
          fullPath,
          type: s.isDirectory() ? 'folder' : 'file',
          size: s.size,
          modified: s.mtime
        };
      } catch {
        return { name, fullPath, type: 'unknown' };
      }
    });

    return { success: true, path: resolvedPath, items };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * tool: get_current_location
 * Returns current working directory
 */
function get_current_location() {
  return { success: true, path: process.cwd(), known_paths: KNOWN_PATHS };
}

/**
 * tool: change_directory
 * Navigate to a directory (changes process cwd)
 * @param {string} dirPath - Directory to navigate to
 */
function change_directory(dirPath) {
  try {
    const resolvedPath = resolvePath(dirPath);

    if (!fs.existsSync(resolvedPath)) {
      return { success: false, error: `Path does not exist: ${resolvedPath}` };
    }

    const stats = fs.statSync(resolvedPath);
    if (!stats.isDirectory()) {
      return { success: false, error: `Not a directory: ${resolvedPath}` };
    }

    process.chdir(resolvedPath);
    return { success: true, new_path: resolvedPath };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * tool: path_exists
 * Check if a path exists
 * @param {string} dirPath - Path to check
 */
function path_exists(dirPath) {
  const resolvedPath = resolvePath(dirPath);
  const exists = fs.existsSync(resolvedPath);
  return { success: true, path: resolvedPath, exists };
}

/**
 * tool: get_path_type
 * Get the type of a path (file, folder, drive, or doesn't exist)
 * @param {string} dirPath - Path to check
 */
function get_path_type(dirPath) {
  const resolvedPath = resolvePath(dirPath);

  if (!fs.existsSync(resolvedPath)) {
    return { success: true, path: resolvedPath, type: 'does_not_exist' };
  }

  try {
    const stats = fs.statSync(resolvedPath);
    if (stats.isDirectory()) return { success: true, path: resolvedPath, type: 'folder' };
    if (stats.isFile()) return { success: true, path: resolvedPath, type: 'file', size: stats.size };
    if (stats.isBlockDevice()) return { success: true, path: resolvedPath, type: 'drive' };
    return { success: true, path: resolvedPath, type: 'unknown' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * tool: find_in_directory
 * Search for files/folders matching a pattern in a directory
 * @param {string} dirPath - Directory to search
 * @param {string} pattern - Search pattern
 */
function find_in_directory(dirPath, pattern = '*') {
  try {
    const resolvedPath = resolvePath(dirPath);

    if (!fs.existsSync(resolvedPath)) {
      return { success: false, error: `Path does not exist: ${resolvedPath}` };
    }

    const results = [];

    function searchRecursive(dir, pat, depth = 0) {
      if (depth > 5) return; // Limit recursion

      try {
        const items = fs.readdirSync(dir);
        for (const item of items) {
          const fullPath = path.join(dir, item);

          if (item.toLowerCase().includes(pat.toLowerCase())) {
            try {
              const stats = fs.statSync(fullPath);
              results.push({
                name: item,
                fullPath,
                type: stats.isDirectory() ? 'folder' : 'file'
              });
            } catch {}
          }

          try {
            if (fs.statSync(fullPath).isDirectory()) {
              searchRecursive(fullPath, pat, depth + 1);
            }
          } catch {}
        }
      } catch {}
    }

    searchRecursive(resolvedPath, pattern);
    return { success: true, path: resolvedPath, pattern, results };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * tool: get_known_locations
 * Returns all known paths for Ted's system
 */
function get_known_locations() {
  return { success: true, known_paths: KNOWN_PATHS };
}

/**
 * tool: get_folder_structure
 * Get a tree view of a folder up to N levels deep
 * @param {string} dirPath - Root folder
 * @param {number} maxDepth - Max depth (default 3)
 */
function get_folder_structure(dirPath, maxDepth = 3) {
  try {
    const resolvedPath = resolvePath(dirPath);

    function buildTree(dir, depth = 0) {
      if (depth > maxDepth) return null;

      try {
        const items = fs.readdirSync(dir);
        const node = { path: dir, folders: [], files: [] };

        for (const item of items) {
          const fullPath = path.join(dir, item);
          try {
            if (fs.statSync(fullPath).isDirectory()) {
              node.folders.push(buildTree(fullPath, depth + 1));
            } else {
              node.files.push(item);
            }
          } catch {}
        }

        return node;
      } catch {
        return { path: dir, error: 'Cannot read' };
      }
    }

    return { success: true, structure: buildTree(resolvedPath) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// Helper: Resolve known path aliases
function resolvePath(inputPath) {
  // Normalize path separators
  const normalized = inputPath.replace(/\//g, '\\');
  const lower = normalized.toLowerCase().trim();

  // Check known aliases first
  for (const [alias, fullPath] of Object.entries(KNOWN_PATHS)) {
    if (lower === alias.toLowerCase() || lower === alias.replace('_', ' ').toLowerCase()) {
      return fullPath;
    }
  }

  // Expand ~ to home
  if (inputPath.startsWith('~')) {
    return inputPath.replace('~', 'C:\\Users\\Admin');
  }

  // If it looks like a drive letter path (C:\, D:\, etc) or unix path, use as-is
  if (/^[a-z]:\\/i.test(normalized) || normalized.startsWith('\\\\') || normalized.startsWith('/')) {
    return normalized;
  }

  // Try as relative to desktop
  return path.join('C:\\Users\\Admin\\Desktop', inputPath);
}

// Export all tools
module.exports = {
  list_drives,
  list_directory,
  get_current_location,
  change_directory,
  path_exists,
  get_path_type,
  find_in_directory,
  get_known_locations,
  get_folder_structure,
  KNOWN_PATHS,

  // QUICK SHORTCUTS - Dead simple one-liners
  // Use these when Ted says "go to desktop" or "list my desktop"

  /**
   * tool: go_to_desktop
   * Returns the desktop path. NO TOOL NEEDED - just use this path.
   * TED'S DESKTOP IS: C:\Users\Admin\Desktop
   */
  go_to_desktop() {
    return {
      success: true,
      path: 'C:\\Users\\Admin\\Desktop',
      desktop_path: 'C:\\Users\\Admin\\Desktop',
      message: "TED'S DESKTOP IS C:\\Users\\Admin\\Desktop - USE THIS EXACT PATH"
    };
  },

  /**
   * tool: read_desktop
   * Lists everything on Ted's desktop
   */
  read_desktop() {
    return list_directory('C:\\Users\\Admin\\Desktop');
  },

  /**
   * tool: desktop_files
   * Quick list of desktop files only (no folders)
   */
  desktop_files() {
    const result = list_directory('C:\\Users\\Admin\\Desktop');
    if (result.success) {
      result.files_only = result.items.filter(i => i.type === 'file');
      result.folders_only = result.items.filter(i => i.type === 'folder');
    }
    return result;
  },

  /**
   * tool: where_is_desktop
   * Tells you where the desktop is - for when you forget
   */
  where_is_desktop() {
    return {
      success: true,
      answer: "The desktop is at C:\\Users\\Admin\\Desktop",
      short: "C:\\Users\\Admin\\Desktop",
      also_known_as: ["desktop", "home", "~"]
    };
  }
};
