import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

/**
 * /ui/[...path] — catch-all route for the static Agent Tower / Skyscraper UI.
 *
 * The static React app lives in app/public/ui/ (index.html + JSX modules).
 * Next.js's app router intercepts /ui/* requests before static serving can
 * fire, so we read the static file and serve it directly.
 *
 * The app loads skyscraper.jsx + panels.jsx + cinematic.jsx + ... as
 * Babel-transpiled JSX scripts via CDN-loaded babel-standalone. It is a
 * self-contained React SPA that talks to /api/* and shows the 3D agent
 * skyscraper with mochi, helipad, jobs arriving at the lobby, etc.
 *
 * URL → file mapping:
 *   /ui                  → /app/public/ui/index.html
 *   /ui/skyscraper.jsx   → /app/public/ui/skyscraper.jsx
 *   /ui/panels.jsx       → /app/public/ui/panels.jsx
 *   /ui/styles.css       → /app/public/ui/styles.css
 *   /ui/screens/foo.png  → /app/public/ui/screens/foo.png
 */

const UI_DIR = path.join(process.cwd(), 'app', 'public', 'ui');

function contentType(filename: string): string {
  if (filename.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filename.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filename.endsWith('.js') || filename.endsWith('.jsx')) return 'application/javascript; charset=utf-8';
  if (filename.endsWith('.json')) return 'application/json; charset=utf-8';
  if (filename.endsWith('.png')) return 'image/png';
  if (filename.endsWith('.svg')) return 'image/svg+xml';
  if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) return 'image/jpeg';
  if (filename.endsWith('.gif')) return 'image/gif';
  if (filename.endsWith('.woff') || filename.endsWith('.woff2')) return 'font/woff2';
  return 'application/octet-stream';
}

export async function GET(request: NextRequest, { params }: { params: { path?: string[] } }) {
  // The catch-all param is an array of path segments.
  const segments = params.path || [];
  let rel = segments.join('/');

  if (rel === '' || rel === '/') rel = 'index.html';

  // Prevent path traversal — no going up the tree.
  if (rel.includes('..') || rel.startsWith('/')) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  const filePath = path.join(UI_DIR, rel);

  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      return new NextResponse('Not Found', { status: 404 });
    }
    const body = fs.readFileSync(filePath);
    return new NextResponse(body, {
      status: 200,
      headers: {
        'content-type': contentType(rel),
        'cache-control': 'no-cache',
      },
    });
  } catch {
    return new NextResponse('Not Found', { status: 404 });
  }
}
