import { NextResponse } from 'next/server';
import { callerKey, consume } from '@/lib/server/rateLimit';

const SYSTEM_PROMPT = `You are the AI Game Master for "Voice Party", a high-energy multiplayer voice gaming platform.

YOUR ROLE & PERSONALITY:
- You are a witty, charismatic, energetic, and encouraging party host.
- Speak in smooth, natural, clever English with punchy humor.
- DO NOT force unnatural slang, awkward tropes, or fake accents (avoid forcing "yam", "Oya", or cliché slang unless completely natural).
- Keep ALL responses under 2 short sentences (5-8 seconds when spoken aloud).
- Never replace players, never insult players, and keep prompts fun, clever, and engaging.
`;

export async function POST(req: Request) {
  // A room legitimately fires a few host lines back to back when a round turns
  // over, so allow a burst and then hold to roughly one line every two seconds.
  const limit = consume(`ai-master:${callerKey(req)}`, 12, 2000);
  if (!limit.ok) {
    return NextResponse.json(
      { success: false, text: '' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
    );
  }

  try {
    const { action, playerName, gameContext } = await req.json();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({
        success: false,
        text: `🔥 Welcome ${playerName || 'everyone'}! Step up to the mic and show us what you've got!`,
      });
    }

    let promptText = '';
    if (action === 'welcome') {
      promptText = 'Generate a 1-sentence energetic welcome line for players starting a new Voice Party session!';
    } else if (action === 'announce_turn') {
      promptText = `Announce that it is ${playerName}'s turn to take the mic in 1 high-energy sentence!`;
    } else if (action === 'challenge') {
      promptText = `Generate a witty, creative 1-sentence voice challenge or dare for player ${playerName || 'the active player'}! (e.g. dramatic movie line, quick debate topic, or fun impression).`;
    } else if (action === 'roast') {
      promptText = `Deliver a lighthearted, clever 1-sentence funny commentary on ${playerName}'s mini-game score!`;
    } else if (action === 'truth_bluff_prompt') {
      promptText = `Generate a witty, creative 'Tell us two things about yourself — one true, one false' prompt for player ${playerName}. (e.g. "Tell us about a time you ruined something, or a weird hidden talent"). Keep it to 1 sentence!`;
    } else if (action === 'truth_bluff_react') {
      promptText = `Deliver a lighthearted, clever 1-sentence funny reaction to the results of a Truth or Bluff game for player ${playerName}. The game context is: ${gameContext}.`;
    } else {
      promptText = gameContext || `Give a short 1-sentence party host commentary for ${playerName || 'the group'}!`;
    }

    // Call Gemini REST API
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: `${SYSTEM_PROMPT}\n\nTask: ${promptText}` }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API HTTP ${response.status}`);
    }

    const data = await response.json();
    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || `🔥 Welcome ${playerName || 'everyone'}! Take the mic and show your skills!`;

    return NextResponse.json({ success: true, text: generatedText });
  } catch (error) {
    console.error('Gemini AI Master Error:', error);
    return NextResponse.json({
      success: false,
      text: '🔥 Oya step up to the mic and show us your voice skills!',
    });
  }
}
