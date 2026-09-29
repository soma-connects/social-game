/**
 * Holds audio that arrives before anywhere is ready to send it.
 *
 * Connecting to a speech provider takes two to three and a half seconds on a
 * phone (measured against Gemini Live: socket open, then setup, then ready), and
 * a player who taps to answer starts talking straight away. Everything said in
 * that gap used to be thrown away, so a one-word answer could be lost entirely
 * and the round marked wrong for a mic that was working. Holding the audio and
 * replaying it once the connection is up costs a short delay instead.
 *
 * Bounded: if the connection never comes, the oldest audio is dropped rather
 * than growing without limit, and the newest is what matters.
 */
export class AudioBacklog<T> {
  private held: T[] = [];

  constructor(private readonly max: number) {}

  hold(chunk: T): void {
    this.held.push(chunk);
    if (this.held.length > this.max) this.held.shift();
  }

  /** Everything held, oldest first, leaving the backlog empty. */
  drain(): T[] {
    const chunks = this.held;
    this.held = [];
    return chunks;
  }

  get size(): number {
    return this.held.length;
  }
}
