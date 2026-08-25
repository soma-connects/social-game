import { NextResponse } from 'next/server';
import { callerKey, consume } from '@/lib/server/rateLimit';

/** Speech synthesis is the most expensive call here, so it is held tighter. */
const MAX_TTS_CHARS = 400;

export async function POST(req: Request) {
  const limit = consume(`ai-tts:${callerKey(req)}`, 6, 4000);
  if (!limit.ok) {
    return NextResponse.json(
      { success: false, error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
    );
  }

  try {
    const { text } = await req.json();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey || typeof text !== 'string' || !text.trim()) {
      return NextResponse.json({ success: false, error: 'Missing API key or text' }, { status: 400 });
    }
    // Host lines are one or two sentences; anything longer is either a bug or
    // somebody using this as a free synthesis endpoint.
    if (text.length > MAX_TTS_CHARS) {
      return NextResponse.json(
        { success: false, error: `Text must be under ${MAX_TTS_CHARS} characters` },
        { status: 413 }
      );
    }

    // Call Gemini TTS API
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Say this in an energetic, charismatic party host voice: "${text}"`,
                },
              ],
            },
          ],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: 'Kore',
                },
              },
            },
          },
        }),
      }
    );

    if (!response.ok) {
      const errBody = await response.text();
      console.error('Gemini TTS HTTP error:', response.status, errBody);
      return NextResponse.json({ success: false, error: `TTS API error ${response.status}` }, { status: 500 });
    }

    const data = await response.json();
    const audioData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData;

    if (!audioData?.data) {
      return NextResponse.json({ success: false, error: 'No audio data in response' }, { status: 500 });
    }

    // Return the base64 PCM audio data
    return NextResponse.json({
      success: true,
      audio: audioData.data,
      mimeType: audioData.mimeType || 'audio/L16;rate=24000',
    });
  } catch (error) {
    console.error('Gemini TTS Error:', error);
    return NextResponse.json({ success: false, error: 'TTS generation failed' }, { status: 500 });
  }
}
