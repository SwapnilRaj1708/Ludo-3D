/** Token bucket: `capacity` burst, refilled at `perSecond`. */
export class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(
    private readonly capacity: number,
    private readonly perSecond: number,
    private readonly now: () => number = Date.now,
  ) {
    this.tokens = capacity;
    this.last = now();
  }

  take(cost = 1): boolean {
    const t = this.now();
    this.tokens = Math.min(this.capacity, this.tokens + ((t - this.last) / 1000) * this.perSecond);
    this.last = t;
    if (this.tokens < cost) return false;
    this.tokens -= cost;
    return true;
  }
}

/** Per-key buckets (e.g. per IP for HTTP endpoints), pruned when idle. */
export class KeyedRateLimiter {
  private readonly buckets = new Map<string, { bucket: TokenBucket; seen: number }>();

  constructor(
    private readonly capacity: number,
    private readonly perSecond: number,
  ) {}

  take(key: string): boolean {
    const now = Date.now();
    let entry = this.buckets.get(key);
    if (!entry) {
      entry = { bucket: new TokenBucket(this.capacity, this.perSecond), seen: now };
      this.buckets.set(key, entry);
    }
    entry.seen = now;
    if (this.buckets.size > 10_000) {
      for (const [k, v] of this.buckets) if (now - v.seen > 10 * 60_000) this.buckets.delete(k);
    }
    return entry.bucket.take();
  }
}
