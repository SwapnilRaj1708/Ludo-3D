'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { DEFAULT_RULE_PROFILE_ID, type PlayerCount } from '@ludo3d/shared';
import { sanitizeDisplayName } from '@ludo3d/shared/protocol';
import { Alert, Button, Card, Field, Segmented, Spinner, TextInput } from '@/components/ui';
import { getAudio } from '@/game/audio/AudioEngine';
import { classifyJoinError, createPrivateRoom, quickMatch } from '@/services/online/gameServer';
import { isOnlineConfigured } from '@/services/config';
import { useSettingsStore } from '@/stores/settingsStore';

/** Quick match ("online") or private room creation ("friends"). */
export function OnlineEntry({ kind }: { kind: 'online' | 'friends' }) {
  const t = useTranslations('online');
  const tSetup = useTranslations('setup');
  const router = useRouter();
  const savedName = useSettingsStore((s) => s.displayName);
  const update = useSettingsStore((s) => s.update);
  const [name, setName] = useState(savedName);
  const [count, setCount] = useState<PlayerCount>(kind === 'online' ? 2 : 4);
  const [rules, setRules] = useState(DEFAULT_RULE_PROFILE_ID);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOnlineConfigured()) return <Alert>{t('serverNotConfigured')}</Alert>;

  const go = async () => {
    const displayName = sanitizeDisplayName(name || savedName);
    if (!displayName) {
      setError(t('enterName'));
      return;
    }
    update({ displayName });
    setBusy(true);
    setError(null);
    getAudio()?.unlock();
    try {
      const room =
        kind === 'online'
          ? await quickMatch({ displayName, playerCount: count })
          : await createPrivateRoom({ displayName, playerCount: count, ruleProfileId: rules });
      router.push(`/room/${room.roomId}`);
    } catch (e) {
      const failure = classifyJoinError(e);
      setError(
        failure === 'unavailable'
          ? t('serverUnavailable')
          : failure === 'rate-limited'
            ? t('rateLimited')
            : t('joinFailed'),
      );
      setBusy(false);
    }
  };

  return (
    <>
      <Card title={kind === 'online' ? t('quickMatchTitle') : t('friendsTitle')}>
        <p style={{ color: 'var(--color-text-muted)' }}>
          {kind === 'online' ? t('quickMatchHint') : t('friendsHint')}
        </p>
        <Field label={t('displayName')} hint={t('displayNameHint')} htmlFor="online-name">
          <TextInput
            id="online-name"
            value={name}
            maxLength={40}
            autoComplete="nickname"
            data-testid="online-name"
            onChange={(e) => setName(e.currentTarget.value)}
          />
        </Field>
        <Segmented
          label={tSetup('players')}
          value={count}
          onChange={setCount}
          options={[2, 3, 4].map((n) => ({
            value: n as PlayerCount,
            label: tSetup('playerCount', { count: n }),
            testId: `online-count-${n}`,
          }))}
        />
        {kind === 'friends' ? (
          <Segmented
            label={tSetup('rules')}
            value={rules}
            onChange={setRules}
            options={[
              { value: 'classic-indian-digital', label: tSetup('rulesClassic') },
              { value: 'open-track', label: tSetup('rulesOpen') },
              { value: 'quick-finish', label: tSetup('rulesQuick') },
            ]}
          />
        ) : null}
      </Card>
      {error ? <Alert>{error}</Alert> : null}
      {busy ? <Spinner label={kind === 'online' ? t('searching') : t('connecting')} /> : null}
      <Button variant="primary" block disabled={busy} onClick={go} data-testid="online-go">
        {kind === 'online' ? t('findMatch') : t('createRoom')}
      </Button>
    </>
  );
}
