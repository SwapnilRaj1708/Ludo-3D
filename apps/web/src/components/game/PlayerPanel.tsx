'use client';

import { useTranslations } from 'next-intl';
import { SEAT_COLOR, type PlayerStatus, type SeatIndex, type Species } from '@ludo3d/shared';
import type { SeatController } from '@/game/session/types';
import { AnimalIcon, DieFace } from './AnimalIcon';
import styles from './game.module.css';

export function PlayerPanel(props: {
  slot: 'bl' | 'tl' | 'tr' | 'br';
  seat: SeatIndex;
  name: string;
  controller: SeatController;
  isLocal: boolean;
  connected: boolean;
  species: Species;
  active: boolean;
  status: PlayerStatus;
  rank: number | null;
  inYard: number;
  home: number;
  dice: number | null;
}) {
  const t = useTranslations('game');
  const tCommon = useTranslations('common');
  const tSpecies = useTranslations('species');
  const tSetup = useTranslations('setup');
  const tResults = useTranslations('results');
  const color = SEAT_COLOR[props.seat];
  return (
    <section
      className={styles.panel}
      data-slot={props.slot}
      data-color={color}
      data-active={props.active ? '1' : '0'}
      data-status={props.status}
      data-testid={`panel-${color}`}
      aria-label={`${props.name}, ${tSpecies(props.species)}`}
    >
      <div className={styles.panelAvatar}>
        <AnimalIcon species={props.species} size={24} />
      </div>
      <div className={styles.panelBody}>
        <div className={styles.panelName}>
          <span className={styles.panelNameText}>{props.name}</span>
          {props.isLocal ? <span className={styles.tag}>{tCommon('you')}</span> : null}
          {props.controller === 'bot' ? <span className={styles.tag}>{tSetup('bot')}</span> : null}
          {!props.connected ? <span className={styles.offlineDot} aria-label="offline" /> : null}
        </div>
        <div className={styles.panelStats}>
          {props.status === 'left' ? (
            <span>{tResults('left')}</span>
          ) : props.rank ? (
            <span className={styles.rank}>{tResults('place', { rank: props.rank })}</span>
          ) : (
            <>
              <span title={t('inYard')}>{t('yardCount', { count: props.inYard })}</span>
              <span
                className={styles.homePips}
                title={t('homeCount', { count: props.home })}
                aria-label={t('homeCount', { count: props.home })}
              >
                {[0, 1, 2, 3].map((i) => (
                  <span key={i} data-filled={i < props.home ? '1' : '0'} />
                ))}
              </span>
            </>
          )}
        </div>
      </div>
      {props.dice ? (
        <div className={styles.panelDice}>
          <DieFace value={props.dice} size={26} />
        </div>
      ) : null}
    </section>
  );
}
