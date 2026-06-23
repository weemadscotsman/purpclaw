'use strict';

/**
 * lib/api-body-cap.ts — HTTP request body cap for Next.js API routes.
 *
 * A 64KB cap is enough for ~99% of API calls and stops 100MB POST bombs
 * from OOM-ing the Next.js process. The cap is enforced BEFORE JSON.parse,
 * so the rest of the route never sees a payload over 64KB.
 *
 * Usage in a route:
 *   import { readJsonBody, bodyTooLarge } from '@/lib/api-body-cap';
 *   if (req.method !== 'POST') return NextResponse.json({error:'method not allowed'}, {status:405});
 *   const body = await readJsonBody(req);
 *   if (body === bodyTooLarge) return NextResponse.json({error:'body_too_large', max:65536}, {status:413});
 *   // use body...
 */

const MAX_BODY = 64 * 1024; // 64KB
const bodyTooLarge = Symbol('BODY_TOO_LARGE');

function readJsonBody(req: import('http').IncomingMessage) {
  return new Promise((resolve) => {
    let size = 0;
    let raw = '';
    let tooBig = false;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        tooBig = true;
        req.destroy();
        return;
      }
      raw += chunk.toString('utf8');
    });
    req.on('end', () => {
      if (tooBig) return resolve(bodyTooLarge);
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

export { readJsonBody, bodyTooLarge, MAX_BODY };
