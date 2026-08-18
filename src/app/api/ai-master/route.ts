import { NextResponse } from 'next/server';
import { callerKey, consume } from '@/lib/server/rateLimit';
import { askHost, coerceVibe } from '@/lib/server/aiHost';

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
    const { action, playerName, gameContext, roomVibe } = await req.json();
    const vibe = coerceVibe(roomVibe);

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

    const text = await askHost(vibe, promptText);
    if (!text) {
      // No key, or the model was unreachable — the room still gets a host line.
      return NextResponse.json({
        success: false,
        text: `🔥 Welcome ${playerName || 'everyone'}! Step up to the mic and show us what you've got!`,
      });
    }

    return NextResponse.json({ success: true, text });
  } catch (error) {
    console.error('AI Master route error:', error);
    return NextResponse.json({
      success: false,
      text: '🔥 Oya step up to the mic and show us your voice skills!',
    });
  }
}
