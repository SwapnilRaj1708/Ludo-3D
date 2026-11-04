'use client';

import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  ANIMAL_KINGDOM_THEME,
  FINISH_PROGRESS,
  SEAT_COLOR,
  YARD_PROGRESS,
  getCurrentLegalMoves,
  movesAreEquivalent,
  speciesForSeat,
  type GameEvent,
  type Move,
  type PieceId,
  type SeatIndex,
} from '@ludo3d/shared';
import { Button, Modal, Spinner } from '@/components/ui';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { analytics } from '@/services/analytics';
import { publicConfig } from '@/services/config';
import { useSettingsStore } from '@/stores/settingsStore';
import { useToastStore } from '@/stores/toastStore';
import { getAudio } from '@/game/audio/AudioEngine';
import {
  PresentationController,
  type PresentationNotice,
} from '@/game/animations/PresentationController';
import { clipDuration, type AnimalTemplate } from '@/game/characters/assetLibrary';
import { usesProxyAssets } from '@/game/assets/manifest';
import { seatAzimuth, spotWorld } from '@/game/rendering/coords';
import {
  detectQuality,
  resolveQuality,
  stepDown,
  type QualityLevel,
} from '@/game/rendering/quality';
import type { ConnectionStatus, GameSession, SessionSnapshot } from '@/game/session/types';
import { DieFace } from './AnimalIcon';
import { CanvasErrorBoundary } from './CanvasErrorBoundary';
import { PlayerPanel } from './PlayerPanel';
import { ResultsOverlay } from './ResultsOverlay';
import styles from './game.module.css';

const GameCanvas = dynamic(() => import('@/game/rendering/GameCanvas'), {
  ssr: false,
  loading: () => null,
});

export interface GameScreenProps {
  session: GameSession;
  /** Forces a quality profile regardless of settings (tests, troubleshooting). */
  forceQuality?: QualityLevel;
  /** Seat whose yard is placed nearest the camera (null = neutral view). */
  viewSeat: SeatIndex | null;
  speed?: number;
  connection?: ConnectionStatus;
  onExit: () => void;
  onPlayAgain: () => void;
  /** Extra HUD content (online: room code, timers). */
  extraHud?: React.ReactNode;
}

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

export function GameScreen({
  session,
  forceQuality,
  viewSeat,
  speed = 1,
  connection = 'local',
  onExit,
  onPlayAgain,
  extraHud,
}: GameScreenProps) {
  const t = useTranslations('game');
  const tSpecies = useTranslations('species');
  const tColors = useTranslations('colors');
  const pushToast = useToastStore((s) => s.push);
  const reducedMotion = useReducedMotion();
  const qualitySetting = useSettingsStore((s) => s.quality);
  const autoMove = useSettingsStore((s) => s.autoMove);
  const theme = ANIMAL_KINGDOM_THEME;

  const [snapshot, setSnapshot] = useState<SessionSnapshot>(() => session.getSnapshot());
  const [busy, setBusy] = useState(false);
  const [assetsReady, setAssetsReady] = useState(false);
  const [lastRoll, setLastRoll] = useState<{ seat: SeatIndex; value: number } | null>(null);
  const [showResults, setShowResults] = useState(snapshot.state.status === 'finished');
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirm, setConfirm] = useState<'leave' | 'restart' | null>(null);
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [detected, setDetected] = useState<QualityLevel>('medium');
  const [degraded, setDegraded] = useState<QualityLevel | null>(null);
  const [activeSeat, setActiveSeat] = useState<SeatIndex>(snapshot.state.turn.seat);
  const templatesRef = useRef<Record<string, AnimalTemplate> | null>(null);
  const selectableRef = useRef<ReadonlySet<PieceId>>(new Set());
  const targetRef = useRef<THREE.Vector3 | null>(null);
  const [selectable, setSelectable] = useState<Move[]>([]);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  useEffect(() => {
    setWebgl(hasWebGL());
    setDetected(detectQuality());
  }, []);

  const quality = useMemo(() => {
    if (forceQuality) return resolveQuality(forceQuality, forceQuality);
    const base = resolveQuality(qualitySetting, detected);
    return qualitySetting === 'auto' && degraded ? resolveQuality(degraded, degraded) : base;
  }, [forceQuality, qualitySetting, detected, degraded]);

  const nameOf = useCallback(
    (seat: SeatIndex) =>
      snapshotRef.current.seats.find((s) => s.seat === seat)?.name ?? tColors(SEAT_COLOR[seat]),
    [tColors],
  );

  const onNotice = useCallback(
    (notice: PresentationNotice) => {
      const audio = getAudio();
      switch (notice.kind) {
        case 'rolled':
          setLastRoll({ seat: notice.seat, value: notice.value });
          break;
        case 'turn':
          setActiveSeat(notice.seat);
          break;
        case 'no-moves':
          pushToast(t('noMoves', { value: notice.value }), 'neutral', 1600);
          break;
        case 'forfeit':
          pushToast(t('forfeitSixes'), 'warning');
          break;
        case 'bonus': {
          const key = notice.reasons.includes('capture')
            ? 'bonusCapture'
            : notice.reasons.includes('finish')
              ? 'bonusFinish'
              : 'bonusSix';
          pushToast(t(key), 'success', 1800);
          break;
        }
        case 'capture':
          pushToast(
            t('captured', {
              attacker: `${nameOf(notice.seat)} (${tSpecies(notice.attacker)})`,
              victim: tSpecies(notice.victim),
            }),
            'celebrate',
          );
          audio?.vocal(notice.attacker);
          break;
        case 'piece-home':
          pushToast(
            t('pieceHome', { name: nameOf(notice.seat), animal: tSpecies(notice.species) }),
            'success',
          );
          break;
        case 'player-finished':
          pushToast(
            t('playerFinished', { name: nameOf(notice.seat), rank: notice.rank }),
            'celebrate',
          );
          break;
        case 'player-left':
          pushToast(t('playerLeft', { name: nameOf(notice.seat) }), 'warning');
          break;
        case 'game-over':
          setShowResults(true);
          break;
      }
    },
    [pushToast, t, tSpecies, nameOf],
  );

  const [controller] = useState(
    () =>
      new PresentationController(snapshot.state, {
        theme,
        reducedMotion,
        speed,
        clipDuration: (species, state, clip) => {
          const template = templatesRef.current?.[species];
          return template ? clipDuration(template, state, clip) : 0.8;
        },
        onBusyChange: setBusy,
      }),
  );

  // Keep controller callbacks/options current without recreating it.
  useEffect(() => {
    controller.setOptions({
      reducedMotion,
      speed,
      onNotice,
      onSound: (id, at) => getAudio()?.play(id, at),
    });
  }, [controller, reducedMotion, speed, onNotice]);

  // Product analytics (consent-gated; a no-op unless enabled in Settings).
  const startedAtRef = useRef(Date.now());
  const trackGameEvents = useCallback(
    (events: readonly GameEvent[], snap: SessionSnapshot) => {
      const mode = session.kind;
      for (const e of events) {
        if (e.type === 'dice-rolled') analytics.track({ name: 'dice_rolled', value: e.value });
        else if (e.type === 'piece-moved') analytics.track({ name: 'piece_moved', kind: e.kind });
        else if (e.type === 'piece-captured') {
          analytics.track({
            name: 'animal_captured',
            encounter: `${speciesForSeat(theme, e.seat)}>${speciesForSeat(theme, e.victimSeat)}`,
          });
        } else if (e.type === 'game-over') {
          const locals = snap.seats.filter((x) => x.isLocal);
          const rank =
            locals.length === 1
              ? (snap.state.players.find((p) => p.seat === locals[0]!.seat)?.rank ?? null)
              : null;
          analytics.track({
            name: 'match_completed',
            mode,
            durationSeconds: Math.round((Date.now() - startedAtRef.current) / 1000),
            rank,
          });
        }
      }
    },
    [session.kind, theme],
  );

  useEffect(() => {
    analytics.track({
      name: 'match_started',
      mode: session.kind,
      players: session.getSnapshot().state.seats.length,
      ruleProfile: session.getSnapshot().state.rules.id,
    });
  }, [session]);

  // Session → presentation.
  useEffect(() => {
    return session.subscribe((update) => {
      if (publicConfig.e2e) {
        const hooks = (window as unknown as { __LUDO__?: { events: unknown[] } }).__LUDO__;
        hooks?.events.push(...update.events);
      }
      setSnapshot(update.snapshot);
      if (update.resync) controller.snapTo(update.snapshot.state);
      else controller.ingest(update.events, update.snapshot.state);
      trackGameEvents(update.events, update.snapshot);
    });
  }, [session, controller, trackGameEvents]);

  // Whenever the animation queue drains: let bots act and offer moves.
  const state = snapshot.state;
  const localSeats = useMemo(
    () => new Set(snapshot.seats.filter((s) => s.isLocal).map((s) => s.seat)),
    [snapshot.seats],
  );
  const myTurn = state.status === 'playing' && localSeats.has(state.turn.seat);

  useEffect(() => {
    if (busy || !assetsReady) return;
    session.notifyPresentationIdle();
    if (myTurn && state.turn.phase === 'awaiting-move') {
      const moves = getCurrentLegalMoves(state);
      selectableRef.current = new Set(moves.map((m) => m.pieceId));
      setSelectable(moves);
    } else {
      selectableRef.current = new Set();
      setSelectable([]);
    }
  }, [busy, assetsReady, session, state, myTurn]);

  const doMove = useCallback(
    (pieceId: PieceId) => {
      if (!selectableRef.current.has(pieceId)) return;
      selectableRef.current = new Set();
      setSelectable([]);
      targetRef.current = null;
      getAudio()?.play('select');
      session.move(state.turn.seat, pieceId);
    },
    [session, state.turn.seat],
  );

  const doRoll = useCallback(() => {
    if (!myTurn || busy || state.turn.phase !== 'awaiting-roll') return;
    getAudio()?.unlock();
    session.roll(state.turn.seat);
  }, [myTurn, busy, state.turn.phase, state.turn.seat, session]);

  // Auto-move when every option is equivalent (e.g. a single movable animal).
  useEffect(() => {
    if (!autoMove || selectable.length === 0 || !movesAreEquivalent(selectable)) return;
    const timer = setTimeout(() => doMove(selectable[0]!.pieceId), 320 / speed);
    return () => clearTimeout(timer);
  }, [autoMove, selectable, doMove, speed]);

  const hover = useCallback(
    (pieceId: PieceId | null) => {
      const move = pieceId ? selectable.find((m) => m.pieceId === pieceId) : undefined;
      if (!move) {
        targetRef.current = null;
        return;
      }
      const piece = state.pieces.find((p) => p.id === pieceId)!;
      const w = spotWorld(piece.seat, move.to, piece.index);
      targetRef.current = new THREE.Vector3(w.x, 0, w.z);
    },
    [selectable, state.pieces],
  );

  // Keyboard: Space/Enter/R rolls, 1–4 picks the n-th movable animal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (menuOpen || confirm || e.target instanceof HTMLInputElement) return;
      if ((e.key === ' ' || e.key === 'Enter' || e.key.toLowerCase() === 'r') && !e.repeat) {
        if (myTurn && state.turn.phase === 'awaiting-roll') {
          e.preventDefault();
          doRoll();
        }
      }
      const n = Number.parseInt(e.key, 10);
      if (n >= 1 && n <= selectable.length) doMove(selectable[n - 1]!.pieceId);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen, confirm, myTurn, state.turn.phase, doRoll, doMove, selectable]);

  // Read-only hooks for automated browser tests (enabled only in E2E builds).
  useEffect(() => {
    if (!publicConfig.e2e) return;
    (window as unknown as Record<string, unknown>).__LUDO__ = {
      events: [] as unknown[],
      getState: () => snapshotRef.current.state,
      localSeats: () => snapshotRef.current.seats.filter((x) => x.isLocal).map((x) => x.seat),
      isBusy: () => controller.isBusy(),
      selectable: () => [...selectableRef.current],
    };
  }, [controller]);

  const onAssetsReady = useCallback((templates: Record<string, AnimalTemplate>) => {
    templatesRef.current = templates;
    if (publicConfig.e2e) {
      (window as unknown as { __LUDO_ASSETS__?: unknown }).__LUDO_ASSETS__ = Object.values(
        templates,
      ).map((t) => ({
        species: t.species,
        source: t.source,
        loadMs: t.loadMs,
        missingClips: t.missingClips,
      }));
    }
    setAssetsReady(true);
  }, []);

  const azimuth = seatAzimuth(viewSeat);
  const activeInfo = snapshot.seats.find((s) => s.seat === activeSeat);
  const proxyBadge = usesProxyAssets();

  let prompt: string;
  if (state.status === 'finished') prompt = '';
  else if (myTurn && !busy && state.turn.phase === 'awaiting-roll') prompt = t('rollPrompt');
  else if (myTurn && !busy && selectable.length > 1)
    prompt = t('chooseManyPrompt', { count: selectable.length });
  else if (myTurn && !busy && selectable.length === 1) prompt = t('choosePrompt');
  else if (activeInfo?.controller === 'bot') prompt = t('botThinking', { name: activeInfo.name });
  else if (activeInfo && !activeInfo.isLocal) prompt = t('waitingFor', { name: activeInfo.name });
  else prompt = t('playerTurn', { name: activeInfo?.name ?? '' });

  // Screen corners in clockwise order starting bottom-left from the nearest yard.
  const nearest: SeatIndex = viewSeat ?? 3;
  const corner = (k: number) => ((nearest + k) % 4) as SeatIndex;
  const panelSlots: { seat: SeatIndex; slot: 'bl' | 'tl' | 'tr' | 'br' }[] = [
    { seat: corner(0), slot: 'bl' },
    { seat: corner(1), slot: 'tl' },
    { seat: corner(2), slot: 'tr' },
    { seat: corner(3), slot: 'br' },
  ];

  const pieceLabel = (pieceId: PieceId) => {
    const piece = state.pieces.find((p) => p.id === pieceId)!;
    return t('pieceLabel', {
      color: tColors(SEAT_COLOR[piece.seat]),
      animal: tSpecies(speciesForSeat(theme, piece.seat)),
      number: piece.index + 1,
    });
  };

  const canRoll = myTurn && !busy && state.turn.phase === 'awaiting-roll' && assetsReady;

  return (
    <div
      className={styles.screen}
      data-testid="game-screen"
      data-status={state.status}
      data-turn-seat={state.turn.seat}
      data-phase={state.turn.phase}
      data-busy={busy ? '1' : '0'}
      data-ready={assetsReady ? '1' : '0'}
      data-version={state.version}
    >
      <div
        className={styles.canvasLayer}
        aria-label={t('boardLabel', { status: prompt })}
        role="img"
      >
        {webgl === false ? (
          <div className={styles.webglFallback} role="alert">
            <p>{t('webglUnavailable')}</p>
            <p>{t('webglHelp')}</p>
          </div>
        ) : webgl ? (
          <CanvasErrorBoundary
            fallback={() => (
              <div className={styles.webglFallback} role="alert">
                <p>{t('webglUnavailable')}</p>
                <p>{t('webglHelp')}</p>
              </div>
            )}
          >
            <GameCanvas
              controller={controller}
              quality={quality}
              azimuth={azimuth}
              reducedMotion={reducedMotion}
              selectableRef={selectableRef}
              targetRef={targetRef}
              onSelect={doMove}
              onHover={hover}
              onAssetsReady={onAssetsReady}
              onPerformanceDecline={() => setDegraded((d) => stepDown(d ?? quality.level))}
            />
          </CanvasErrorBoundary>
        ) : null}
        {!assetsReady && webgl !== false ? (
          <div className={styles.loading}>
            <Spinner label={t('loadingBoard')} />
          </div>
        ) : null}
      </div>

      <header className={styles.topBar}>
        <Button
          variant="secondary"
          size="small"
          onClick={() => setMenuOpen(true)}
          data-testid="game-menu-button"
        >
          {t('menu')}
        </Button>
        <div className={styles.banner} aria-live="polite" data-testid="turn-banner">
          <span className={styles.bannerDot} data-color={SEAT_COLOR[activeSeat]} />
          <span>{prompt}</span>
        </div>
        <div className={styles.topRight}>
          {extraHud}
          {proxyBadge ? (
            <span className={styles.proxyBadge} title={t('devProxyBadge')}>
              {t('devProxyBadge')}
            </span>
          ) : null}
        </div>
      </header>

      {panelSlots.map(({ seat, slot }) => {
        const info = snapshot.seats.find((s) => s.seat === seat);
        const player = state.players.find((p) => p.seat === seat);
        if (!info || !player) return null;
        const pieces = state.pieces.filter((p) => p.seat === seat);
        return (
          <PlayerPanel
            key={seat}
            slot={slot}
            seat={seat}
            name={info.name}
            controller={info.controller}
            isLocal={info.isLocal && snapshot.seats.filter((s) => s.isLocal).length === 1}
            connected={info.connected}
            species={speciesForSeat(theme, seat)}
            active={state.status === 'playing' && activeSeat === seat}
            status={player.status}
            rank={player.rank}
            inYard={pieces.filter((p) => p.progress === YARD_PROGRESS).length}
            home={pieces.filter((p) => p.progress === FINISH_PROGRESS).length}
            dice={lastRoll?.seat === seat ? lastRoll.value : null}
          />
        );
      })}

      <div className={styles.actionBar}>
        {selectable.length > 1 ? (
          <div className={styles.choices} role="group" aria-label={t('choosePrompt')}>
            {selectable.map((m, i) => (
              <button
                key={m.pieceId}
                type="button"
                className={styles.choice}
                data-testid={`choose-${m.pieceId}`}
                onClick={() => doMove(m.pieceId)}
                onPointerEnter={() => hover(m.pieceId)}
                onPointerLeave={() => hover(null)}
                onFocus={() => hover(m.pieceId)}
                onBlur={() => hover(null)}
              >
                <kbd>{i + 1}</kbd> {pieceLabel(m.pieceId)}
              </button>
            ))}
          </div>
        ) : null}
        {state.status === 'playing' ? (
          <button
            type="button"
            className={styles.rollButton}
            disabled={!canRoll}
            onClick={doRoll}
            data-testid="roll-button"
            aria-label={t('rollPrompt')}
          >
            {lastRoll && lastRoll.seat === state.turn.seat && !canRoll ? (
              <DieFace value={lastRoll.value} size={30} />
            ) : (
              <DieFace value={canRoll ? 6 : (lastRoll?.value ?? 1)} size={30} />
            )}
            <span>
              {busy && myTurn && state.turn.phase === 'awaiting-roll'
                ? t('rolling')
                : t('rollButton')}
            </span>
          </button>
        ) : null}
      </div>

      <div className={styles.zoomControls}>
        <Button
          icon
          size="small"
          aria-label={t('zoomIn')}
          onClick={() => window.dispatchEvent(new CustomEvent('ludo3d:zoom', { detail: 0.92 }))}
        >
          +
        </Button>
        <Button
          icon
          size="small"
          aria-label={t('zoomOut')}
          onClick={() => window.dispatchEvent(new CustomEvent('ludo3d:zoom', { detail: 1.08 }))}
        >
          −
        </Button>
      </div>

      {menuOpen ? (
        <Modal title={t('paused')} onClose={() => setMenuOpen(false)} testId="pause-menu">
          <div className={styles.menuButtons}>
            <Button variant="primary" block onClick={() => setMenuOpen(false)}>
              {t('resume')}
            </Button>
            {session.kind === 'local' ? (
              <Button block onClick={() => setConfirm('restart')} data-testid="restart-button">
                {t('restart')}
              </Button>
            ) : null}
            <Button
              variant="danger"
              block
              onClick={() => setConfirm('leave')}
              data-testid="leave-button"
            >
              {t('leave')}
            </Button>
          </div>
        </Modal>
      ) : null}

      {confirm ? (
        <Modal
          title={confirm === 'leave' ? t('leaveConfirmTitle') : t('restart')}
          onClose={() => setConfirm(null)}
          testId="confirm-dialog"
          actions={
            <>
              <Button onClick={() => setConfirm(null)}>{t('resume')}</Button>
              <Button
                variant={confirm === 'leave' ? 'danger' : 'primary'}
                data-testid="confirm-yes"
                onClick={() => {
                  setConfirm(null);
                  setMenuOpen(false);
                  if (confirm === 'leave') {
                    if (snapshotRef.current.state.status === 'playing') {
                      analytics.track({ name: 'match_abandoned', mode: session.kind });
                    }
                    onExit();
                  } else onPlayAgain();
                }}
              >
                {confirm === 'leave' ? t('leave') : t('restart')}
              </Button>
            </>
          }
        >
          <p>
            {confirm === 'leave'
              ? session.kind === 'local'
                ? t('leaveConfirmLocal')
                : t('leaveConfirmOnline')
              : t('restartConfirm')}
          </p>
        </Modal>
      ) : null}

      {showResults && state.status === 'finished' ? (
        <ResultsOverlay
          state={state}
          seats={snapshot.seats}
          theme={theme}
          onPlayAgain={onPlayAgain}
          onMainMenu={onExit}
          connection={connection}
        />
      ) : null}
    </div>
  );
}
