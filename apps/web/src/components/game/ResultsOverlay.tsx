'use client';

import { useTranslations } from 'next-intl';
import { SEAT_COLOR, speciesForSeat, type AnimalTheme, type GameState } from '@ludo3d/shared';
import { Button } from '@/components/ui';
import type { ConnectionStatus, SeatInfo } from '@/game/session/types';
import { AnimalIcon } from './AnimalIcon';
import styles from './game.module.css';

export function ResultsOverlay({
  state,
  seats,
  theme,
  onPlayAgain,
  onMainMenu,
  connection,
}: {
  state: GameState;
  seats: SeatInfo[];
  theme: AnimalTheme;
  onPlayAgain: () => void;
  onMainMenu: () => void;
  connection: ConnectionStatus;
}) {
  const t = useTranslations('results');
  const tSpecies = useTranslations('species');
  const tOnline = useTranslations('online');
  const name = (seat: number) => seats.find((s) => s.seat === seat)?.name ?? SEAT_COLOR[seat as 0];
  const winnerInfo = state.winner !== null ? seats.find((s) => s.seat === state.winner) : undefined;
  const localWinner = winnerInfo?.isLocal && seats.filter((s) => s.isLocal).length === 1;

  return (
    <div className={styles.resultsBackdrop} data-testid="results">
      <div
        className={styles.results}
        role="dialog"
        aria-modal="true"
        aria-labelledby="results-title"
      >
        <p className={styles.resultsKicker}>{t('title')}</p>
        <h2 id="results-title" className={styles.resultsTitle} data-testid="winner-title">
          {localWinner
            ? t('youWin')
            : winnerInfo
              ? t('winner', { name: winnerInfo.name })
              : t('title')}
        </h2>
        <h3 className={styles.resultsSub}>{t('rankings')}</h3>
        <ol className={styles.rankList}>
          {state.rankings.map((seat, i) => {
            const player = state.players.find((p) => p.seat === seat)!;
            const species = speciesForSeat(theme, seat);
            return (
              <li
                key={seat}
                className={styles.rankRow}
                data-color={SEAT_COLOR[seat]}
                data-testid={`rank-${i + 1}`}
              >
                <span className={styles.rankPlace}>{t('place', { rank: i + 1 })}</span>
                <span className={styles.rankAvatar}>
                  <AnimalIcon species={species} size={20} />
                </span>
                <span className={styles.rankName}>
                  {name(seat)}
                  <small>{tSpecies(species)}</small>
                </span>
                <span className={styles.rankMeta}>
                  {player.status === 'left'
                    ? t('left')
                    : t('finishedPieces', { count: player.finishedPieces })}
                  <small>{t('captures', { count: player.captures })}</small>
                </span>
              </li>
            );
          })}
        </ol>
        <div className={styles.resultsActions}>
          <Button variant="primary" onClick={onPlayAgain} data-testid="play-again">
            {connection === 'local' ? t('playAgain') : tOnline('rematch')}
          </Button>
          <Button onClick={onMainMenu} data-testid="main-menu">
            {t('mainMenu')}
          </Button>
        </div>
      </div>
    </div>
  );
}
