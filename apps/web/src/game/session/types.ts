import type { BotDifficulty, GameEvent, GameState, PieceId, SeatIndex } from '@ludo3d/shared';

export type SeatController = 'human' | 'bot' | 'remote';

export interface SeatInfo {
  seat: SeatIndex;
  name: string;
  controller: SeatController;
  /** True when this device may act for the seat. */
  isLocal: boolean;
  difficulty?: BotDifficulty;
  connected: boolean;
}

export interface SessionSnapshot {
  state: GameState;
  seats: SeatInfo[];
}

export interface SessionUpdate {
  snapshot: SessionSnapshot;
  /** Events that produced this snapshot, oldest first (empty for resyncs). */
  events: readonly GameEvent[];
  /** True when the display must jump to the new state without animation. */
  resync?: boolean;
}

export type ConnectionStatus = 'local' | 'connected' | 'reconnecting' | 'disconnected';

/**
 * The UI talks to a match only through this interface, so local
 * (pass-and-play / bots) and online (server-authoritative) play share the
 * same screens, 3D scene and animation code.
 */
export interface GameSession {
  readonly kind: 'local' | 'online';
  getSnapshot(): SessionSnapshot;
  subscribe(listener: (update: SessionUpdate) => void): () => void;
  roll(seat: SeatIndex): void;
  move(seat: SeatIndex, pieceId: PieceId): void;
  /** Called by the UI when the animation queue has drained. */
  notifyPresentationIdle(): void;
  dispose(): void;
}
