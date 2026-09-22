import { useTranslation } from 'react-i18next';
import { errorKeyFor } from '../../i18n/errors';
import { formatDateTime } from '../../i18n/format';
import { useMeta } from './useMeta';

// The first screen in the app's own visual language (spec section 19): a hero card in the brand
// colour, soft cards below it, pill buttons on a hard 3px edge. Status is colour plus icon plus
// text, never colour alone (NFR-008).
export function HomePage() {
  const { t, i18n } = useTranslation();
  const meta = useMeta();

  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-4 px-5 pb-10">
      <div className="relative overflow-hidden rounded-hero bg-primary p-6 text-on-primary">
        <div aria-hidden="true" className="absolute -top-12 -right-10 size-48 rounded-full bg-white/20" />
        <p className="relative text-xs font-bold tracking-[0.06em] uppercase">{t('home.eyebrow')}</p>
        <h1 className="relative mt-1 text-3xl leading-tight">{t('home.title')}</h1>
        <p className="relative mt-2 max-w-sm text-sm">{t('home.subtitle')}</p>
      </div>

      <div className="rounded-card bg-surface p-5 shadow-card">
        {meta.isPending && (
          <p role="status" className="text-muted">
            {t('home.status.loading')}
          </p>
        )}

        {meta.isError && (
          <div role="alert">
            <p className="inline-flex items-center gap-2 rounded-pill bg-danger-soft px-3 py-1 font-bold text-danger">
              <span aria-hidden="true">✕</span>
              {t('home.status.error')}
            </p>
            <p className="mt-3 text-sm text-muted">{t(errorKeyFor(meta.error))}</p>
            <button
              type="button"
              onClick={() => void meta.refetch()}
              className="mt-4 min-h-11 rounded-pill bg-ink px-5 font-bold text-bg shadow-press"
            >
              {t('home.retry')}
            </button>
          </div>
        )}

        {meta.isSuccess && (
          <>
            <p className="inline-flex items-center gap-2 rounded-pill bg-success-soft px-3 py-1 font-bold text-success">
              <span aria-hidden="true">✓</span>
              {t('home.status.ok')}
            </p>
            <dl className="mt-4 flex flex-col gap-2 text-sm">
              <div className="flex items-center justify-between gap-4 rounded-field bg-surface-3 px-4 py-3">
                <dt className="text-muted">{t('home.version')}</dt>
                <dd className="font-bold">{meta.data.version}</dd>
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
      </div>
    </section>
  );
}
