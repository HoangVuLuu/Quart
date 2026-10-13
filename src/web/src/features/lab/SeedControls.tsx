import { useTranslation } from 'react-i18next';
import { Button } from '../../ui/Button';
import { TextField } from '../../ui/TextField';
import { newSeed, parseSeed } from './lab';

type SeedControlsProps = {
  seedText: string;
  onSeedTextChange: (text: string) => void;
  pending: boolean;
  onGenerate: (seed: number) => void;
};

// The seed decides every random choice, so the same seed gives the same schedule (FR-122). Generate
// uses the seed in the field; Generate again picks a new one, as the draft schedule does (1l).
export function SeedControls({ seedText, onSeedTextChange, pending, onGenerate }: SeedControlsProps) {
  const { t } = useTranslation();
  const seed = parseSeed(seedText);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-3">
        <TextField
          label={t('lab.seedLabel')}
          type="number"
          inputMode="numeric"
          step={1}
          value={seedText}
          onChange={(event) => onSeedTextChange(event.target.value)}
          error={seed === undefined ? t('lab.seedInvalid') : undefined}
          className="w-40"
        />
        <Button
          loading={pending}
          disabled={seed === undefined}
          onClick={() => seed !== undefined && onGenerate(seed)}
        >
          {pending ? t('lab.generating') : t('lab.generate')}
        </Button>
        <Button
          variant="white"
          disabled={pending}
          onClick={() => {
            const next = newSeed();
            onSeedTextChange(String(next));
            onGenerate(next);
          }}
        >
          {t('lab.generateAgain')}
        </Button>
      </div>
      <p className="text-sm text-muted">{t('lab.seedHint')}</p>
    </div>
  );
}
