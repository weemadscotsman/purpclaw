import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function frame(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(_req: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const trace = require('../../../../lib/trace-store.js');
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const item of trace.recent(80)) {
        controller.enqueue(encoder.encode(frame('trace', item)));
      }
      const unsubscribe = trace.subscribe((item: unknown) => {
        try { controller.enqueue(encoder.encode(frame('trace', item))); } catch {}
      });
      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(': ping\n\n')); } catch {}
      }, 15000);
      return () => {
        clearInterval(heartbeat);
        unsubscribe();
      };
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
