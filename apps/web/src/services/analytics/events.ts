/**
 * Product analytics event catalogue. Only what is needed to measure the
 * questions in docs/PRD.md (completion, retention, reliability) — no personal
 * data, no free text, no device fingerprints.
 */
export type GameModeName = 'online' | 'friends' | 'join' | 'bots' | 'local';

export type AnalyticsEvent =
  | { name: 'app_opened' }
  | { name: 'guest_session_started'; provider: 'firebase-anonymous' | 'server-guest' }
  | { name: 'account_created'; method: 'google' }
  | { name: 'game_mode_selected'; mode: GameModeName }
  | { name: 'room_created'; playerCount: number; private: boolean }
  | { name: 'room_joined'; via: 'code' | 'link' | 'quick-match' }
  | { name: 'match_started'; mode: 'local' | 'online'; players: number; ruleProfile: string }
  | { name: 'dice_rolled'; value: number }
  | { name: 'piece_moved'; kind: 'enter' | 'advance' | 'finish' }
  | { name: 'animal_captured'; encounter: string }
  | {
      name: 'match_completed';
      mode: 'local' | 'online';
      durationSeconds: number;
      rank: number | null;
    }
  | { name: 'match_abandoned'; mode: 'local' | 'online' }
  | { name: 'player_disconnected' }
  | { name: 'player_reconnected'; afterSeconds: number }
  | { name: 'rewarded_ad_completed'; placement: string };

export type AnalyticsEventName = AnalyticsEvent['name'];

export const ANALYTICS_EVENT_NAMES: readonly AnalyticsEventName[] = [
  'app_opened',
  'guest_session_started',
  'account_created',
  'game_mode_selected',
  'room_created',
  'room_joined',
  'match_started',
  'dice_rolled',
  'piece_moved',
  'animal_captured',
  'match_completed',
  'match_abandoned',
  'player_disconnected',
  'player_reconnected',
  'rewarded_ad_completed',
];
