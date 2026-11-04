'use client';

import type { Room } from '@colyseus/sdk';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { ANIMAL_KINGDOM_THEME, SEAT_COLOR, isSeatIndex, speciesForSeat } from '@ludo3d/shared';
import { CLIENT_MESSAGES } from '@ludo3d/shared/protocol';
import { AnimalIcon } from '@/components/game/AnimalIcon';
import { Button, Card } from '@/components/ui';
import { playersOf, roomState } from '@/game/session/OnlineSession';
import { useToastStore } from '@/stores/toastStore';
import styles from './online.module.css';

export function Lobby({ room, onLeave }: { room: Room; onLeave: () => void }) {
  const t = useTranslations('online');
  const tCommon = useTranslations('common');
  const tColors = useTranslations('colors');
  const tSpecies = useTranslations('species');
  const push = useToastStore((s) => s.push);
  const [now, setNow] = useState(() => Date.now());
  const state = roomState(room)!;
  const players = playersOf(room).sort((a, b) => a.seat - b.seat);
  const me = players.find((p) => p.sessionId === room.sessionId);
  const allReady = players.length >= 2 && players.every((p) => p.ready);
  const inviteUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/join/${state.code}` : '';

  useEffect(() => {
    if (!state.startsAt) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [state.startsAt]);

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      push(tCommon('copied'), 'success', 1500);
    } catch {
      push(inviteUrl, 'neutral', 6000);
    }
  };

  const share = async () => {
    if (navigator.share) {
      await navigator
        .share({ title: 'Ludo 3D', text: t('shareInvite', { code: state.code }), url: inviteUrl })
        .catch(() => undefined);
    } else {
      await copyInvite();
    }
  };

  let status: string;
  if (state.startsAt && state.startsAt > now) {
    status = t('startingIn', { seconds: Math.ceil((state.startsAt - now) / 1000) });
  } else if (players.length < state.playerCount) {
    status = t('waitingPlayers', { count: players.length, total: state.playerCount });
  } else if (state.mode === 'quick') {
    status = t('autoStart');
  } else if (me?.isHost) {
    status = allReady ? t('startMatch') : t('startNeedsPlayers');
  } else {
    status = t('waitingHost');
  }

  return (
    <>
      <Card title={t('lobbyTitle')}>
        <p className={styles.status}>{t('roomCode')}</p>
        <p className={styles.code} data-testid="room-code">
          {state.code}
        </p>
        {state.mode === 'private' ? (
          <div className={styles.row}>
            <Button onClick={copyInvite} data-testid="copy-invite">
              {t('copyLink')}
            </Button>
            <Button onClick={share}>{tCommon('share')}</Button>
          </div>
        ) : null}
      </Card>

      <Card>
        <ul className={styles.seats} data-testid="lobby-seats">
          {players.map((p) => {
            const seat = isSeatIndex(p.seat) ? p.seat : 0;
            const species = speciesForSeat(ANIMAL_KINGDOM_THEME, seat);
            return (
              <li
                key={p.sessionId}
                className={styles.seat}
                data-color={SEAT_COLOR[seat]}
                data-testid="lobby-seat"
              >
                <span className={styles.avatar}>
                  <AnimalIcon species={species} size={22} />
                </span>
                <span className={styles.seatBody}>
                  <span className={styles.seatName}>
                    {p.name}
                    {p.sessionId === room.sessionId ? ` (${tCommon('you')})` : ''}
                  </span>
                  <span className={styles.seatMeta}>
                    <span>
                      {t('seatColor', {
                        color: tColors(SEAT_COLOR[seat]),
                        animal: tSpecies(species),
                      })}
                    </span>
                    {p.isHost ? <span>{t('host')}</span> : null}
                    {state.mode === 'private' ? (
                      <span className={p.ready ? styles.ready : undefined}>
                        {p.ready ? t('ready') : t('notReady')}
                      </span>
                    ) : null}
                    {!p.connected ? <span>{t('reconnecting')}</span> : null}
                  </span>
                </span>
              </li>
            );
          })}
          {Array.from({ length: Math.max(0, state.playerCount - players.length) }, (_, i) => (
            <li key={`empty-${i}`} className={styles.seat} data-empty="1">
              <span className={styles.seatBody}>
                <span className={styles.seatName}>{t('emptySeat')}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className={styles.status} data-testid="lobby-status" aria-live="polite">
          {status}
        </p>
      </Card>

      {state.mode === 'private' && me ? (
        <div className={styles.row}>
          <Button
            data-testid="ready-toggle"
            onClick={() => room.send(CLIENT_MESSAGES.ready, { ready: !me.ready })}
          >
            {me.ready ? t('markNotReady') : t('markReady')}
          </Button>
          {me.isHost ? (
            <Button
              variant="primary"
              disabled={!allReady}
              data-testid="start-online"
              onClick={() => room.send(CLIENT_MESSAGES.start)}
            >
              {t('startMatch')}
            </Button>
          ) : null}
        </div>
      ) : null}
      <Button variant="ghost" onClick={onLeave} data-testid="leave-room">
        {t('leaveRoom')}
      </Button>
    </>
  );
}
