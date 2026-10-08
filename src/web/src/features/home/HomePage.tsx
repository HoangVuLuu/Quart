import { useTranslation } from 'react-i18next';
import { ErrorNotice } from '../../app/ErrorNotice';
import { formatDateTime } from '../../i18n/format';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { HeroCard } from '../../ui/HeroCard';
import { StatusChip } from '../../ui/StatusChip';
import { useMeta } from './useMeta';

// The first screen in the app's own visual language (spec section 19): a hero card in the brand
// colour, soft cards below it, pill buttons on a hard 3px edge. Status is colour plus icon plus
// text, never colour alone (NFR-008).
export function HomePage() {
  const { t, i18n } = useTranslation();
  const meta = useMeta();

  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-4 px-5 pb-10">
      <HeroCard eyebrow={t('home.eyebrow')} title={t('home.title')} headingLevel={1}>
        {t('home.subtitle')}
      </HeroCard>

      <Card>
        {meta.isPending && (
          <p role="status" className="text-muted">
            {t('home.status.loading')}
          </p>
        )}

        {meta.isError && (
          <div role="alert">
            <StatusChip tone="danger">{t('home.status.error')}</StatusChip>
            <div className="mt-3">
              <ErrorNotice error={meta.error} />
            </div>
            <Button onClick={() => void meta.refetch()} className="mt-4">
              {t('home.retry')}
            </Button>
          </div>
        )}

        {meta.isSuccess && (
          <>
            <StatusChip tone="success">{t('home.status.ok')}</StatusChip>
            <div className="mt-2">
              {meta.data.database === 'ok' ? (
                <StatusChip tone="success">{t('home.database.ok')}</StatusChip>
              ) : (
                <div role="alert">
                  <StatusChip tone="danger">{t('home.database.unavailable')}</StatusChip>
                </div>
              )}
            </div>
            <dl className="mt-4 flex flex-col gap-2 text-sm">
              <div className="flex items-center justify-between gap-4 rounded-field bg-surface-3 px-4 py-3">
                <dt className="text-muted">{t('home.version')}</dt>
                <dd className="min-w-0 font-bold break-all">{meta.data.version}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-field bg-surface-3 px-4 py-3">
                <dt className="text-muted">{t('home.environment')}</dt>
                <dd className="font-bold">{meta.data.environment}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-field bg-surface-3 px-4 py-3">
                <dt className="text-muted">{t('home.serverTime')}</dt>
                <dd className="font-bold">{formatDateTime(meta.data.serverTimeUtc, i18n.language)}</dd>
              </div>
            </dl>
          </>
        )}
      </Card>
    </section>
  );
}
