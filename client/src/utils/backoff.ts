export interface BackoffOptions {
  baseMs: number;
  maxMs: number;

  jitter: number;
}

export class Backoff {
  private attempt = 0;

  constructor(
    private readonly options: BackoffOptions,
    private readonly random: () => number = Math.random,
  ) {}

  get attempts(): number {
    return this.attempt;
  }

  next(): number {
    const { baseMs, maxMs, jitter } = this.options;
    const exp = Math.min(maxMs, baseMs * 2 ** this.attempt);
    this.attempt++;
    const spread = exp * jitter;
    return Math.round(exp - spread + this.random() * spread);
  }

  reset(): void {
    this.attempt = 0;
  }
}
