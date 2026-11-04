'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import {
  ANIMAL_KINGDOM_THEME,
  DEFAULT_RULE_PROFILE_ID,
  DEFAULT_SEAT_ARRANGEMENTS,
  SEAT_COLOR,
  speciesForSeat,
  type BotDifficulty,
  type PlayerCount,
  type SeatIndex,
  type Species,
} from '@ludo3d/shared';
import { sanitizeDisplayName } from '@ludo3d/shared/protocol';
import { AnimalIcon } from '@/components/game/AnimalIcon';
import { GameScreen } from '@/components/game/GameScreen';
import { Alert, Button, Card, Modal, Segmented, TextInput } from '@/components/ui';
import { getAudio } from '@/game/audio/AudioEngine';
import {
  captureScenario,
  choiceScenario,
  victoryScenario,
  type Scenario,
} from '@/game/session/scenarios';
import {
  LocalSession,
  clearStoredLocalMatch,
  loadStoredLocalMatch,
  type LocalGameConfig,
  type LocalSeatConfig,
} from '@/game/session/LocalSession';
import { publicConfig } from '@/services/config';
import { useSettingsStore } from '@/stores/settingsStore';
import styles from './local.module.css';

interface SeatDraft {
  controller: 'human' | 'bot';
  name: string;
  difficulty: BotDifficulty;
}

export function LocalPlay() {
  const t = useTranslations('setup');
  const tCommon = useTranslations('common');
  const tColors = useTranslations('colors');
  const tSpecies = useTranslations('species');
  const router = useRouter();
  const params = useSearchParams();
  const mode = params.get('mode') === 'local' ? 'local' : 'bots';
  const speed = clampSpeed(Number(params.get('speed') ?? '1'));
  const seedParam = params.get('seed');
  const seed =
    seedParam !== null && Number.isFinite(Number(seedParam)) ? Number(seedParam) : undefined;
  const displayName = useSettingsStore((s) => s.displayName);
  const qualityParam = params.get('quality');
  const forceQuality =
    qualityParam === 'low' || qualityParam === 'medium' || qualityParam === 'high'
      ? qualityParam
      : undefined;

  const [count, setCount] = useState<PlayerCount>(mode === 'bots' ? 2 : 2);
  const [ruleProfileId, setRuleProfileId] = useState(DEFAULT_RULE_PROFILE_ID);
  const [drafts, setDrafts] = useState<Record<SeatIndex, SeatDraft>>(() => defaultDrafts(mode));
  const [session, setSession] = useState<LocalSession | null>(null);
  const [resume, setResume] = useState<ReturnType<typeof loadStoredLocalMatch>>(null);
  const [error, setError] = useState<string | null>(null);

  const seats = DEFAULT_SEAT_ARRANGEMENTS[count];

  useEffect(() => {
    setResume(loadStoredLocalMatch());
  }, []);

  useEffect(() => {
    // Deterministic scenarios for automated tests and visual QA.
    const scenarioName = params.get('scenario');
    if (publicConfig.e2e && scenarioName && !session) {
      let scenario: Scenario | null = null;
      if (scenarioName === 'victory') scenario = victoryScenario();
      if (scenarioName === 'choice') scenario = choiceScenario();
      if (scenarioName === 'capture') {
        scenario = captureScenario(
          (params.get('attacker') ?? 'lion') as Species,
          (params.get('defender') ?? 'peacock') as Species,
        );
      }
      if (scenario) {
        const config: LocalGameConfig = {
          mode: 'bots',
          ruleProfileId: DEFAULT_RULE_PROFILE_ID,
          seats: scenario.seats.map((seat, i) => ({
            seat,
            controller: seat === scenario.human ? 'human' : 'bot',
            name:
              seat === scenario.human
                ? t('defaultName', { number: i + 1 })
                : t('botName', { animal: tSpecies(speciesForSeat(ANIMAL_KINGDOM_THEME, seat)) }),
            difficulty: 'medium',
          })),
        };
        clearStoredLocalMatch();
        const s = new LocalSession(config, {
          scenario: { state: scenario.state, dice: scenario.dice },
        });
        s.setSpeed(speed);
        setSession(s);
        return;
      }
    }
    // Autostart is used by automated tests and shared demo links.
    if (params.get('autostart') === '1' && !session) {
      const players = Number(params.get('players') ?? '2');
      const n = (players === 3 || players === 4 ? players : 2) as PlayerCount;
      const allBots = params.get('spectate') === '1' && publicConfig.e2e;
      const config: LocalGameConfig = {
        mode,
        ruleProfileId: params.get('rules') ?? DEFAULT_RULE_PROFILE_ID,
        seed,
        seats: DEFAULT_SEAT_ARRANGEMENTS[n].map((seat, i) => ({
          seat,
          controller: allBots || (mode === 'bots' && i > 0) ? 'bot' : 'human',
          name:
            allBots || (mode === 'bots' && i > 0)
              ? t('botName', { animal: tSpecies(speciesForSeat(ANIMAL_KINGDOM_THEME, seat)) })
              : t('defaultName', { number: i + 1 }),
          difficulty: 'medium',
        })),
      };
      start(config);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => session?.dispose(), [session]);

  const start = (config: LocalGameConfig) => {
    clearStoredLocalMatch();
    const s = new LocalSession(config);
    s.setSpeed(speed);
    getAudio()?.unlock();
    setSession(s);
  };

  const buildConfig = (): LocalGameConfig | null => {
    const seatConfigs: LocalSeatConfig[] = seats.map((seat, i) => {
      const d = drafts[seat];
      const species = tSpecies(speciesForSeat(ANIMAL_KINGDOM_THEME, seat));
      const fallback =
        d.controller === 'bot'
          ? t('botName', { animal: species })
          : i === 0 && displayName
            ? displayName
            : t('defaultName', { number: i + 1 });
      return {
        seat,
        controller: d.controller,
        name: sanitizeDisplayName(d.name) || fallback,
        difficulty: d.controller === 'bot' ? d.difficulty : undefined,
      };
    });
    if (!seatConfigs.some((s) => s.controller === 'human')) {
      setError(t('needHuman'));
      return null;
    }
    return { mode, seats: seatConfigs, ruleProfileId, seed };
  };

  const viewSeat = useMemo<SeatIndex | null>(() => {
    if (!session) return null;
    const humans = session.config.seats.filter((s) => s.controller === 'human');
    return humans.length === 1 ? humans[0]!.seat : null;
  }, [session]);

  if (session) {
    return (
      <GameScreen
        key={session.startedAt}
        session={session}
        forceQuality={forceQuality}
        viewSeat={viewSeat}
        speed={speed}
        onExit={() => {
          clearStoredLocalMatch();
          session.dispose();
          router.push('/');
        }}
        onPlayAgain={() => {
          session.dispose();
          start({ ...session.config });
        }}
      />
    );
  }

  return (
    <main id="main" className="page">
      <div className="page__inner">
        <div className="page__header">
          <Link href="/" className={styles.back} aria-label={tCommon('back')}>
            ←
          </Link>
          <h1 className="page__title">{mode === 'bots' ? t('titleBots') : t('titleLocal')}</h1>
        </div>

        <Card title={t('players')}>
          <Segmented
            label={t('players')}
            value={count}
            onChange={(v) => setCount(v)}
            options={[2, 3, 4].map((n) => ({
              value: n as PlayerCount,
              label: t('playerCount', { count: n }),
              testId: `count-${n}`,
            }))}
          />
          <ul className={styles.seatList}>
            {seats.map((seat, i) => {
              const d = drafts[seat];
              const species = speciesForSeat(ANIMAL_KINGDOM_THEME, seat);
              return (
                <li key={seat} className={styles.seatRow} data-color={SEAT_COLOR[seat]}>
                  <div className={styles.seatHeader}>
                    <span className={styles.seatBadge}>
                      <AnimalIcon species={species} size={20} />
                    </span>
                    <span className={styles.seatTitle}>
                      {tColors(SEAT_COLOR[seat])} · {tSpecies(species)}
                    </span>
                  </div>
                  <Segmented
                    label={`${t('seat')} ${i + 1}`}
                    value={d.controller}
                    onChange={(controller) =>
                      setDrafts((all) => ({ ...all, [seat]: { ...all[seat], controller } }))
                    }
                    options={[
                      { value: 'human', label: t('human'), testId: `seat-${seat}-human` },
                      { value: 'bot', label: t('bot'), testId: `seat-${seat}-bot` },
                    ]}
                  />
                  {d.controller === 'human' ? (
                    <TextInput
                      aria-label={t('namePlaceholder')}
                      placeholder={
                        i === 0 && displayName ? displayName : t('defaultName', { number: i + 1 })
                      }
                      value={d.name}
                      maxLength={40}
                      onChange={(e) => {
                        const name = e.currentTarget.value;
                        setDrafts((all) => ({ ...all, [seat]: { ...all[seat], name } }));
                      }}
                    />
                  ) : (
                    <Segmented
                      label={t('difficulty')}
                      value={d.difficulty}
                      onChange={(difficulty) =>
                        setDrafts((all) => ({ ...all, [seat]: { ...all[seat], difficulty } }))
                      }
                      options={[
                        { value: 'easy', label: t('difficultyEasy') },
                        { value: 'medium', label: t('difficultyMedium') },
                        { value: 'hard', label: t('difficultyHard') },
                      ]}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </Card>

        <Card title={t('rules')}>
          <Segmented
            label={t('rules')}
            value={ruleProfileId}
            onChange={setRuleProfileId}
            options={[
              { value: 'classic-indian-digital', label: t('rulesClassic') },
              { value: 'open-track', label: t('rulesOpen') },
              { value: 'quick-finish', label: t('rulesQuick') },
            ]}
          />
        </Card>

        {error ? <Alert>{error}</Alert> : null}

        <Button
          variant="primary"
          block
          data-testid="start-match"
          onClick={() => {
            setError(null);
            const config = buildConfig();
            if (config) start(config);
          }}
        >
          {t('start')}
        </Button>
      </div>

      {resume ? (
        <Modal
          title={t('resumeTitle')}
          onClose={() => setResume(null)}
          testId="resume-dialog"
          actions={
            <>
              <Button
                onClick={() => {
                  clearStoredLocalMatch();
                  setResume(null);
                }}
              >
                {t('discard')}
              </Button>
              <Button
                variant="primary"
                data-testid="resume-match"
                onClick={() => {
                  const s = new LocalSession(resume.config, {
                    resume: { state: resume.state, startedAt: resume.startedAt },
                  });
                  s.setSpeed(speed);
                  setResume(null);
                  setSession(s);
                }}
              >
                {t('resume')}
              </Button>
            </>
          }
        >
          <p>{t('resumeBody')}</p>
        </Modal>
      ) : null}
    </main>
  );
}

function clampSpeed(value: number): number {
  return Number.isFinite(value) ? Math.min(20, Math.max(0.5, value)) : 1;
}

function defaultDrafts(mode: 'bots' | 'local'): Record<SeatIndex, SeatDraft> {
  const make = (i: number): SeatDraft => ({
    controller: mode === 'bots' && i > 0 ? 'bot' : 'human',
    name: '',
    difficulty: 'medium',
  });
  return { 0: make(0), 1: make(1), 2: make(2), 3: make(3) };
}
