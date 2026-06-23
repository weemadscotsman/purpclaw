import fs from 'fs';
import path from 'path';

function canonicalWorktreeRoot(candidate: string): string {
  if (process.env.PURP_DIR) return path.resolve(process.env.PURP_DIR);

  const root = path.resolve(candidate);
  const gitMarker = path.join(root, '.git');
  try {
    if (!fs.statSync(gitMarker).isFile()) return root;
    const marker = fs.readFileSync(gitMarker, 'utf8').trim();
    const match = marker.match(/^gitdir:\s*(.+)$/i);
    if (!match) return root;

    const gitDir = path.resolve(root, match[1]);
    const normalized = gitDir.replace(/\\/g, '/');
    const worktreesIndex = normalized.toLowerCase().lastIndexOf('/.git/worktrees/');
    if (worktreesIndex === -1) return root;
    return path.resolve(normalized.slice(0, worktreesIndex));
  } catch {
    return root;
  }
}

export const PROJECT_ROOT = canonicalWorktreeRoot(process.cwd());

export function projectPath(...parts: string[]): string {
  return path.join(PROJECT_ROOT, ...parts);
}
