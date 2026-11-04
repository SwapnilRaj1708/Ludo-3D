'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ROOM_CODE_LENGTH, isValidRoomCode, normalizeRoomCode } from '@ludo3d/shared/protocol';
import { Alert, Button, Card, Field, TextInput } from '@/components/ui';
import { isOnlineConfigured } from '@/services/config';
import styles from './online.module.css';

export function JoinForm() {
  const t = useTranslations('online');
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);
  if (!isOnlineConfigured()) return <Alert>{t('serverNotConfigured')}</Alert>;
  const submit = () => {
    const normalized = normalizeRoomCode(code);
    if (!isValidRoomCode(normalized)) {
      setError(true);
      return;
    }
    router.push(`/room/${normalized}`);
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      style={{ display: 'contents' }}
    >
      <Card title={t('joinTitle')}>
        <Field label={t('codeLabel')} hint={t('joinHint')} htmlFor="room-code">
          <TextInput
            id="room-code"
            className={styles.codeInput}
            value={code}
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={ROOM_CODE_LENGTH + 2}
            data-testid="room-code-input"
            onChange={(e) => {
              setCode(e.currentTarget.value);
              setError(false);
            }}
          />
        </Field>
        {error ? <Alert>{t('invalidCode')}</Alert> : null}
        <Button type="submit" variant="primary" block data-testid="join-submit">
          {t('join')}
        </Button>
      </Card>
    </form>
  );
}
