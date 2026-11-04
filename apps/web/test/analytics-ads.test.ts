import { describe, expect, it, vi } from 'vitest';
import { AD_LIMITS, AdPolicy, NoAdsProvider } from '../src/services/ads';
import { Analytics, type AnalyticsProvider } from '../src/services/analytics';
import { ANALYTICS_EVENT_NAMES } from '../src/services/analytics/events';

describe('analytics', () => {
  it('collects nothing without consent or without a provider', () => {
    const send = vi.fn();
    const provider: AnalyticsProvider = { name: 'test', send };
    const a = new Analytics();
    a.track({ name: 'app_opened' });
    a.configure(provider);
    a.track({ name: 'app_opened' });
    a.flush();
    expect(send).not.toHaveBeenCalled();
    a.setConsent(true);
    a.track({ name: 'dice_rolled', value: 6 });
    a.flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0][0].event).toEqual({ name: 'dice_rolled', value: 6 });
  });

  it('discards buffered events when consent is withdrawn', () => {
    const send = vi.fn();
    const a = new Analytics();
    a.configure({ name: 'test', send });
    a.setConsent(true);
    a.track({ name: 'player_disconnected' });
    a.setConsent(false);
    a.flush();
    expect(send).not.toHaveBeenCalled();
  });

  it('defines every event required by the product brief', () => {
    expect(ANALYTICS_EVENT_NAMES).toHaveLength(15);
  });
});

describe('advertising policy', () => {
  const ok = {
    inLiveGameplay: false,
    matchesSinceLastInterstitial: AD_LIMITS.minMatchesBetweenInterstitials,
    msSinceLastInterstitial: AD_LIMITS.minMsBetweenInterstitials,
    matchesThisSession: 5,
  };

  it('never shows ads during live gameplay', () => {
    expect(AdPolicy.canShowInterstitial({ ...ok, inLiveGameplay: true })).toBe(false);
    expect(AdPolicy.canOfferRewarded({ inLiveGameplay: true })).toBe(false);
  });

  it('caps interstitial frequency', () => {
    expect(AdPolicy.canShowInterstitial(ok)).toBe(true);
    expect(AdPolicy.canShowInterstitial({ ...ok, matchesSinceLastInterstitial: 1 })).toBe(false);
    expect(AdPolicy.canShowInterstitial({ ...ok, msSinceLastInterstitial: 60_000 })).toBe(false);
    expect(AdPolicy.canShowInterstitial({ ...ok, matchesThisSession: 1 })).toBe(false);
  });

  it('ships without any ad provider', async () => {
    const none = new NoAdsProvider();
    expect(none.isAvailable()).toBe(false);
    await expect(none.showInterstitial()).resolves.toBe('not-shown');
    await expect(none.showRewarded()).resolves.toEqual({ rewarded: false });
  });
});
