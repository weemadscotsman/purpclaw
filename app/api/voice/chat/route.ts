import { NextRequest, NextResponse } from 'next/server';
// v2.1: /api/voice/chat — Full voice round-trip
// POST { text?, audio_path?, voice?, provider?, model? }
// Returns: { ok, text, reply, model, audio (base64 WAV), audioSize }
//
// Flow:  STT (faster-whisper :7896) → unified_api /api/chat (:7780) → TTS (Kokoro :7799)

const STT_URL  = process.env.STT_URL        || 'http://127.0.0.1:7896';
const TTS_URL  = process.env.TTS_URL        || 'http://127.0.0.1:7799';
const API_URL  = process.env.UNIFIED_API_URL || 'http://127.0.0.1:7780';

async function sttTranscribe(audioPath: string): Promise<string> {
  const res = await fetch(STT_URL + '/transcribe_path', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audio_path: audioPath }),
  });
  if (!res.ok) throw new Error('STT ' + res.status + ': ' + (await res.text()).slice(0, 200));
  const j = await res.json();
  return j.text || j.transcript || '';
}

async function chatOnce(text: string, provider: string | undefined, model: string | undefined): Promise<any> {
  const res = await fetch(API_URL + '/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: text, provider, model }),
  });
  if (!res.ok) throw new Error('CHAT ' + res.status);
  return res.json();
}

async function ttsSynthesize(text: string, voice: string): Promise<ArrayBuffer> {
  const res = await fetch(TTS_URL + '/speak', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice }),
  });
  if (!res.ok) throw new Error('TTS ' + res.status + ': ' + (await res.text()).slice(0, 200));
  return res.arrayBuffer();
}

// Voice route: same auth pattern as mochi (which works).
// The TS narrowing issue was a build cache problem — the pattern compiles fine in mochi.
const auth = require('../../_lib/operator-auth');
const rate = require('../../_lib/rate-limit');

export async function POST(request: NextRequest) {
  const a = auth.checkOperator(request);
  if (!a.ok) return a.response;
  const r = rate.checkRateLimit(request, 'voice-chat', 10);
  if (r) return r;

  const body: any = await request.json().catch(() => ({}));
  const { audio_path, text, voice = 'af_heart', provider, model } = body;
  if (!audio_path && !text) {
    return NextResponse.json({ ok: false, error: 'audio_path or text required' }, { status: 400 });
  }

  try {
    // 1. STT: transcribe audio if provided
    let inputText: string = text || '';
    if (audio_path) {
      inputText = await sttTranscribe(audio_path);
      if (!inputText.trim()) {
        return NextResponse.json({ ok: false, error: 'STT returned empty text' }, { status: 400 });
      }
    }

    // 2. Chat: send through the main agent loop
    const chatResult: any = await chatOnce(inputText, provider, model);
    const replyText: string = chatResult.reply || chatResult.text || '';

    // 3. TTS: synthesize the reply
    const audioBuf = await ttsSynthesize(replyText, voice);
    const audioB64 = Buffer.from(audioBuf).toString('base64');

    return NextResponse.json({
      ok: true,
      source: 'voice:stt+chat+tts',
      text: inputText,
      reply: replyText,
      model: chatResult.model,
      voice,
      audio: audioB64,
      audioSize: audioBuf.byteLength,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'voice_chat',
    description: 'POST { audio_path?, text?, voice?, provider?, model? } → STT → chat → TTS → audio (base64)',
    endpoints: { stt: STT_URL, chat: API_URL, tts: TTS_URL },
  });
}
