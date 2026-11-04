import type { AnalyticsEvent } from './events';

export type { AnalyticsEvent } from './events';

export interface TrackedEvent {
  event: AnalyticsEvent;
  /** Random per-page-load id; not linked to any account. */
  sessionId: string;
  timestamp: number;
}

/** Destination for analytics events (a vendor SDK adapter would implement this). */
export interface AnalyticsProvider {
  readonly name: string;
  send(batch: readonly TrackedEvent[]): void;
}

/** Development helper: prints events to the console. Never used in production builds. */
export class ConsoleAnalyticsProvider implements AnalyticsProvider {
  readonly name = 'console';
  send(batch: readonly TrackedEvent[]) {
    for (const e of batch) console.info('[analytics]', e.event.name, e.event);
  }
}

/**
 * Provider-independent analytics. Nothing is collected unless BOTH a provider
 * is configured AND the player has opted in; events produced before consent
 * are discarded, not queued. No vendor SDK is bundled in this build.
 */
export class Analytics {
  private provider: AnalyticsProvider | null = null;
  private consent = false;
  private readonly sessionId = Math.random().toString(36).slice(2, 12);
  private buffer: TrackedEvent[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  configure(provider: AnalyticsProvider | null) {
    this.provider = provider;
  }

  setConsent(granted: boolean) {
    this.consent = granted;
    if (!granted) this.buffer = [];
  }

  get active(): boolean {
    return this.consent && this.provider !== null;
  }

  track(event: AnalyticsEvent) {
    if (!this.active) return;
    this.buffer.push({ event, sessionId: this.sessionId, timestamp: Date.now() });
    this.flushTimer ??= setTimeout(() => this.flush(), 2000);
  }

  flush() {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    const batch = this.buffer;
    this.buffer = [];
    if (batch.length && this.active) {
      try {
        this.provider!.send(batch);
      } catch {
        /* analytics must never break the game */
      }
    }
  }
}

export const analytics = new Analytics();

if (process.env.NEXT_PUBLIC_ANALYTICS === 'console' && process.env.NODE_ENV !== 'production') {
  analytics.configure(new ConsoleAnalyticsProvider());
}
