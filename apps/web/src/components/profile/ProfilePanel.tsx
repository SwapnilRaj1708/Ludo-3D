'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { MAX_DISPLAY_NAME_LENGTH, sanitizeDisplayName } from '@ludo3d/shared/protocol';
import { Alert, Button, Card, Field, TextInput } from '@/components/ui';
import { publicConfig } from '@/services/config';
import { useSettingsStore } from '@/stores/settingsStore';
import { useToastStore } from '@/stores/toastStore';
import { AccountCard } from './AccountCard';

/** Local identity (display name) plus the optional account section. */
export function ProfilePanel() {
  const t = useTranslations('profile');
  const tOnline = useTranslations('online');
  const displayName = useSettingsStore((s) => s.displayName);
  const update = useSettingsStore((s) => s.update);
  const push = useToastStore((s) => s.push);
  const [draft, setDraft] = useState(displayName);
  useEffect(() => setDraft(displayName), [displayName]);

  return (
    <>
      <Card title={tOnline('displayName')}>
        <Field
          label={tOnline('displayName')}
          hint={tOnline('displayNameHint')}
          htmlFor="display-name"
        >
          <TextInput
            id="display-name"
            value={draft}
            maxLength={MAX_DISPLAY_NAME_LENGTH * 2}
            data-testid="display-name-input"
            onChange={(e) => setDraft(e.currentTarget.value)}
          />
        </Field>
        <Button
          variant="primary"
          data-testid="save-name"
          onClick={() => {
            const clean = sanitizeDisplayName(draft);
            update({ displayName: clean });
            setDraft(clean);
            push(t('nameSaved'), 'success');
          }}
        >
          {t('saveName')}
        </Button>
      </Card>
      {publicConfig.firebase ? (
        <AccountCard />
      ) : (
        <Alert tone="info">{t('accountsUnavailable')}</Alert>
      )}
    </>
  );
}
