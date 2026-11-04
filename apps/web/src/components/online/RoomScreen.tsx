'use client';

import type { Room } from '@colyseus/sdk';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  CLIENT_MESSAGES,
  CLOSE_CODES,
  sanitizeDisplayName,
  type NoticeMessage,
} from '@ludo3d/shared/protocol';
import { GameScreen } from '@/components/game/GameScreen';
import { Alert, Button, Card, Field, Spinner, TextInput } from '@/components/ui';
import { OnlineSession, playersOf, roomState } from '@/game/session/OnlineSession';
import type { ConnectionStatus } from '@/game/session/types';
import {
  classifyJoinError,
  connectToRoom,
  forgetRoom,
  type JoinFailure,
} from '@/services/online/gameServer';
import type { QualityLevel } from '@/game/rendering/quality';
import { analytics } from '@/services/analytics';
import { publicConfig } from '@/services/config';
import { useSettingsStore } from '@/stores/settingsStore';
import { useToastStore } from '@/stores/toastStore';
import { Lobby } from './Lobby';
import styles from './online.module.css';

export function RoomScreen({ code }: { code: string }) {
  const t = useTranslations('online');
  const tErrors = useTranslations('errors');
  const router = useRouter();
  const push = useToastStore((s) => s.push);
  const hydrated = useSettingsStore((s) => s.hydrated);
  const savedName = useSettingsStore((s) => s.displayName);
  const update = useSettingsStore((s) => s.update);
  const [room, setRoom] = useState<Room | null>(null);
  const [failure, setFailure] = useState<JoinFailure | 'replaced' | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connected');
  const [nameDraft, setNameDraft] = useState('');
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  const phaseRef = useRef<string | undefined>(undefined);

  // Connect once we know the player's name (persisted settings are hydrated after mount).
  useEffect(() => {
    if (!hydrated || !savedName || room) return;
    let cancelled = false;
    connectToRoom(code, savedName)
      .then((r) => {
        if (!cancelled) setRoom(r);
      })
      .catch((e) => {
        if (!cancelled) setFailure(classifyJoinError(e));
      });
    return () => {
      cancelled = true;
    };
  }, [code, hydrated, savedName, room]);

  // Lobby renders straight from room state; during a match the session drives the UI,
  // so only phase changes re-render this component.
  useEffect(() => {
    if (!room) return;
    const nameOf = (seat?: number) => playersOf(room).find((p) => p.seat === seat)?.name ?? '';
    const onState = () => {
      const phase = roomState(room)?.phase;
      if (phase === 'lobby' || phase !== phaseRef.current) rerender();
      phaseRef.current = phase;
    };
    room.onStateChange(onState);
    const offNotice = room.onMessage('notice', (n: NoticeMessage) => {
      const name = n.displayName ?? nameOf(n.seat);
      if (n.kind === 'player-dropped') push(t('playerDisconnected', { name }), 'warning');
      if (n.kind === 'player-reconnected') push(t('playerReconnected', { name }), 'success');
      if (n.kind === 'player-abandoned') push(t('playerAbandoned', { name }), 'warning');
      if (n.kind === 'turn-timeout') push(t('turnTimeout', { name }), 'neutral');
    });
    let droppedAt = 0;
    const onDrop = () => {
      droppedAt = Date.now();
      setStatus('reconnecting');
      analytics.track({ name: 'player_disconnected' });
    };
    const onReconnect = () => {
      setStatus('connected');
      push(t('reconnected'), 'success', 1500);
      analytics.track({
        name: 'player_reconnected',
        afterSeconds: Math.round((Date.now() - droppedAt) / 1000),
      });
    };
    const onLeave = (closeCode: number) => {
      setStatus('disconnected');
      if (closeCode === CLOSE_CODES.sessionReplaced) setFailure('replaced');
    };
    room.onDrop(onDrop);
    room.onReconnect(onReconnect);
    room.onLeave(onLeave);
    onState();
    return () => {
      room.onStateChange.remove(onState);
      offNotice();
      room.onDrop.remove(onDrop);
      room.onReconnect.remove(onReconnect);
      room.onLeave.remove(onLeave);
    };
  }, [room, push, t]);

  const leave = () => {
    forgetRoom(code);
    void room?.leave(true).catch(() => undefined);
    router.push('/');
  };

  const state = room ? roomState(room) : undefined;

  if (failure) {
    const message =
      failure === 'replaced'
        ? t('sessionReplaced')
        : failure === 'not-found'
          ? t('roomNotFound')
          : failure === 'full'
            ? t('roomFull')
            : failure === 'unavailable'
              ? t('serverUnavailable')
              : t('joinFailed');
    return (
      <Shell>
        <Alert>{message}</Alert>
        <Link href="/">{tErrors('goHome')}</Link>
      </Shell>
    );
  }

  if (hydrated && !savedName) {
    return (
      <Shell>
        <Card title={t('enterName')}>
          <Field label={t('displayName')} hint={t('displayNameHint')} htmlFor="room-name">
            <TextInput
              id="room-name"
              value={nameDraft}
              maxLength={40}
              onChange={(e) => setNameDraft(e.currentTarget.value)}
            />
          </Field>
          <Button
            variant="primary"
            disabled={!sanitizeDisplayName(nameDraft)}
            onClick={() => update({ displayName: sanitizeDisplayName(nameDraft) })}
          >
            {t('join')}
          </Button>
        </Card>
      </Shell>
    );
  }

  if (!room || !state?.phase) {
    return (
      <Shell>
        <Spinner label={t('connecting')} />
      </Shell>
    );
  }

  if (state.phase === 'lobby') {
    return (
      <Shell>
        <Lobby room={room} onLeave={leave} />
      </Shell>
    );
  }

  return <OnlineMatch room={room} status={status} onExit={leave} />;
}

function OnlineMatch({
  room,
  status,
  onExit,
}: {
  room: Room;
  status: ConnectionStatus;
  onExit: () => void;
}) {
  const t = useTranslations('online');
  const push = useToastStore((s) => s.push);
  const session = useMemo(() => {
    try {
      return new OnlineSession(room);
    } catch {
      return null;
    }
  }, [room]);
  useEffect(() => () => session?.dispose(), [session]);
  // Test builds only: accelerate local animation and force a render profile.
  const testOverrides = useMemo((): { speed?: number; forceQuality?: QualityLevel } => {
    if (!publicConfig.e2e || typeof window === 'undefined') return {};
    const params = new URLSearchParams(window.location.search);
    const speed = Number(params.get('speed') ?? '1');
    const quality = params.get('quality');
    return {
      speed: Number.isFinite(speed) ? Math.min(20, Math.max(0.5, speed)) : 1,
      forceQuality:
        quality === 'low' || quality === 'medium' || quality === 'high' ? quality : undefined,
    };
  }, []);
  if (!session) return <Spinner label={t('connecting')} />;
  const isHost = playersOf(room).find((p) => p.sessionId === room.sessionId)?.isHost ?? false;
  return (
    <GameScreen
      session={session}
      speed={testOverrides.speed}
      forceQuality={testOverrides.forceQuality}
      viewSeat={session.localSeat}
      connection={status}
      onExit={() => {
        session.dispose();
        onExit();
      }}
      onPlayAgain={() => {
        if (isHost) room.send(CLIENT_MESSAGES.rematch);
        else push(t('onlyHostRematch'), 'neutral');
      }}
      extraHud={
        <>
          <TurnTimer room={room} />
          <span className={styles.badge} data-status={status} data-testid="connection-status">
            {status === 'connected'
              ? t('connected')
              : status === 'reconnecting'
                ? t('reconnecting')
                : t('disconnected')}
          </span>
        </>
      }
    />
  );
}

function TurnTimer({ room }: { room: Room }) {
  const t = useTranslations('online');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  const deadline = roomState(room)?.game?.turnDeadline ?? 0;
  if (!deadline || deadline <= now) return null;
  const seconds = Math.ceil((deadline - now) / 1000);
  return (
    <span
      className={styles.timer}
      data-urgent={seconds <= 5 ? '1' : '0'}
      aria-label={t('yourTurnTimer', { seconds })}
    >
      {t('timeLeft', { seconds })}
    </span>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" className="page">
      <div className="page__inner">{children}</div>
    </main>
  );
}
