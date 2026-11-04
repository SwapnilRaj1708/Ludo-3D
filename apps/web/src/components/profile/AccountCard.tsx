'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { User } from 'firebase/auth';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Alert, Button, Card, Spinner } from '@/components/ui';
import { analytics } from '@/services/analytics';
import { onUserChanged, signInWithGoogle, signOutUser } from '@/services/firebase/auth';
import { fetchProfile, fetchRecentMatches } from '@/services/firebase/profile';
import { useToastStore } from '@/stores/toastStore';

/** Account status, statistics and history. Rendered only when Firebase is configured. */
export function AccountCard() {
  const t = useTranslations('profile');
  const tErrors = useTranslations('errors');
  const tResults = useTranslations('results');
  const push = useToastStore((s) => s.push);
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    let off: (() => void) | undefined;
    void onUserChanged(setUser).then((unsubscribe) => {
      off = unsubscribe;
    });
    return () => off?.();
  }, []);

  const uid = user?.uid;
  const profile = useQuery({
    queryKey: ['profile', uid],
    queryFn: () => fetchProfile(uid!),
    enabled: !!uid,
  });
  const matches = useQuery({
    queryKey: ['matches', uid],
    queryFn: () => fetchRecentMatches(uid!),
    enabled: !!uid,
  });

  if (user === undefined) return <Spinner />;
  const registered = user && !user.isAnonymous;

  return (
    <>
      <Card title={t('title')}>
        {registered ? (
          <p data-testid="signed-in">
            {t('signedInAs', { name: user.displayName ?? user.email ?? '' })}
          </p>
        ) : (
          <p>{t('guestHint')}</p>
        )}
        {registered ? (
          <Button
            onClick={async () => {
              await signOutUser();
              await queryClient.invalidateQueries();
            }}
          >
            {t('signOut')}
          </Button>
        ) : (
          <Button
            variant="primary"
            data-testid="google-sign-in"
            onClick={async () => {
              try {
                const signedIn = await signInWithGoogle();
                if (signedIn) analytics.track({ name: 'account_created', method: 'google' });
              } catch {
                push(tErrors('generic'), 'danger');
              }
            }}
          >
            {t('signInGoogle')}
          </Button>
        )}
      </Card>

      {uid ? (
        <Card title={t('stats')}>
          {profile.isError ? <Alert>{tErrors('generic')}</Alert> : null}
          <dl
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              gap: 'var(--space-2)',
              margin: 0,
            }}
          >
            <dt>{t('gamesPlayed')}</dt>
            <dd style={{ margin: 0 }}>{profile.data?.stats?.gamesPlayed ?? 0}</dd>
            <dt>{t('wins')}</dt>
            <dd style={{ margin: 0 }}>{profile.data?.stats?.wins ?? 0}</dd>
            <dt>{t('capturesStat')}</dt>
            <dd style={{ margin: 0 }}>{profile.data?.stats?.captures ?? 0}</dd>
          </dl>
        </Card>
      ) : null}

      {uid ? (
        <Card title={t('history')}>
          {matches.isLoading ? <Spinner /> : null}
          {matches.data && matches.data.length === 0 ? <p>{t('noHistory')}</p> : null}
          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
            }}
          >
            {matches.data?.map((m) => {
              const me = m.players.find((p) => p.uid === uid);
              return (
                <li
                  key={m.matchId}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 'var(--space-3)',
                  }}
                >
                  <span>{new Date(m.endedAt).toLocaleDateString()}</span>
                  <span>
                    {me ? (me.left ? tResults('left') : tResults('place', { rank: me.rank })) : ''}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
