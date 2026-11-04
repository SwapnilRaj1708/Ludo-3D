/**
 * Provider-independent advertising hooks. This build ships NO ad SDK and no
 * placeholder ads: the default provider reports every placement unavailable.
 * A future vendor adapter implements `AdProvider`; `AdPolicy` guarantees ads
 * never appear during live play and are frequency-capped. Ads can never
 * influence dice or outcomes — they have no access to game state.
 */
export type AdPlacement =
  'menu-banner' | 'lobby-banner' | 'post-match-interstitial' | 'rewarded-cosmetic';

export interface AdProvider {
  readonly name: string;
  isAvailable(placement: AdPlacement): boolean;
  showInterstitial(placement: AdPlacement): Promise<'shown' | 'not-shown'>;
  showRewarded(placement: AdPlacement): Promise<{ rewarded: boolean }>;
}

export class NoAdsProvider implements AdProvider {
  readonly name = 'none';
  isAvailable() {
    return false;
  }
  async showInterstitial() {
    return 'not-shown' as const;
  }
  async showRewarded() {
    return { rewarded: false };
  }
}

export interface AdContext {
  /** True during a turn, dice roll, movement, capture or finishing animation. */
  inLiveGameplay: boolean;
  /** Completed matches since an interstitial was last shown. */
  matchesSinceLastInterstitial: number;
  msSinceLastInterstitial: number;
  /** Completed matches in this session. */
  matchesThisSession: number;
}

export const AD_LIMITS = {
  minMatchesBetweenInterstitials: 3,
  minMsBetweenInterstitials: 5 * 60_000,
  freeMatchesPerSession: 2,
} as const;

export const AdPolicy = {
  /** Interstitials only between completed matches, never mid-play, and rarely. */
  canShowInterstitial(ctx: AdContext): boolean {
    if (ctx.inLiveGameplay) return false;
    if (ctx.matchesThisSession < AD_LIMITS.freeMatchesPerSession) return false;
    if (ctx.matchesSinceLastInterstitial < AD_LIMITS.minMatchesBetweenInterstitials) return false;
    return ctx.msSinceLastInterstitial >= AD_LIMITS.minMsBetweenInterstitials;
  },
  /** Rewarded ads are always player-initiated and never offered during play. */
  canOfferRewarded(ctx: Pick<AdContext, 'inLiveGameplay'>): boolean {
    return !ctx.inLiveGameplay;
  },
} as const;

let provider: AdProvider = new NoAdsProvider();

export function adProvider(): AdProvider {
  return provider;
}

export function setAdProvider(next: AdProvider) {
  provider = next;
}
