'use client';

import { useTranslations } from 'next-intl';
import { Card, Segmented, Slider, Toggle } from '@/components/ui';
import { LanguageSelector } from '@/components/menu/LanguageSelector';
import { getAudio } from '@/game/audio/AudioEngine';
import {
  useSettingsStore,
  type QualitySetting,
  type ReducedMotionSetting,
} from '@/stores/settingsStore';

export function SettingsPanel() {
  const t = useTranslations('settings');
  const tCommon = useTranslations('common');
  const s = useSettingsStore();
  const preview = () => {
    const audio = getAudio();
    audio?.unlock();
    audio?.play('ui');
  };
  return (
    <>
      <Card title={t('audio')}>
        <Toggle
          label={t('masterMute')}
          checked={s.muted}
          testId="setting-mute"
          onChange={(muted) => s.update({ muted })}
        />
        <Slider
          label={t('music')}
          value={s.musicVolume}
          disabled={s.muted}
          testId="setting-music"
          onChange={(musicVolume) => s.update({ musicVolume })}
        />
        <Slider
          label={t('sfx')}
          value={s.sfxVolume}
          disabled={s.muted}
          testId="setting-sfx"
          onChange={(sfxVolume) => {
            s.update({ sfxVolume });
            preview();
          }}
        />
        <Slider
          label={t('animalSounds')}
          value={s.animalVolume}
          disabled={s.muted}
          testId="setting-animals"
          onChange={(animalVolume) => s.update({ animalVolume })}
        />
      </Card>

      <Card title={t('graphics')}>
        <Segmented<QualitySetting>
          label={t('quality')}
          value={s.quality}
          onChange={(quality) => s.update({ quality })}
          options={[
            { value: 'auto', label: t('qualityAuto'), testId: 'quality-auto' },
            { value: 'low', label: t('qualityLow'), testId: 'quality-low' },
            { value: 'medium', label: t('qualityMedium'), testId: 'quality-medium' },
            { value: 'high', label: t('qualityHigh'), testId: 'quality-high' },
          ]}
        />
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-subtle)' }}>
          {t('qualityHint')}
        </p>
      </Card>

      <Card title={t('motion')}>
        <Segmented<ReducedMotionSetting>
          label={t('reducedMotion')}
          value={s.reducedMotion}
          onChange={(reducedMotion) => s.update({ reducedMotion })}
          options={[
            { value: 'system', label: t('reducedMotionSystem'), testId: 'motion-system' },
            { value: 'on', label: tCommon('on'), testId: 'motion-on' },
            { value: 'off', label: tCommon('off'), testId: 'motion-off' },
          ]}
        />
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-subtle)' }}>
          {t('reducedMotionHint')}
        </p>
      </Card>

      <Card title={t('gameplay')}>
        <Toggle
          label={t('autoMove')}
          checked={s.autoMove}
          testId="setting-automove"
          onChange={(autoMove) => s.update({ autoMove })}
        />
      </Card>

      <Card title={t('privacy')}>
        <Toggle
          label={t('analyticsConsent')}
          checked={s.analyticsConsent}
          testId="setting-analytics"
          onChange={(analyticsConsent) => s.update({ analyticsConsent })}
        />
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-subtle)' }}>
          {t('analyticsHint')}
        </p>
      </Card>

      <Card title={t('language')}>
        <LanguageSelector />
      </Card>
      <p
        style={{
          textAlign: 'center',
          fontSize: 'var(--text-xs)',
          color: 'var(--color-text-subtle)',
        }}
      >
        {t('saved')}
      </p>
    </>
  );
}
