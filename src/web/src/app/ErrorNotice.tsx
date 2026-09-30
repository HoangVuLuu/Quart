import { useTranslation } from 'react-i18next';
import { errorKeyFor, traceIdOf } from '../i18n/errors';

// A friendly, translated explanation of any error, plus the server's trace ID when there is one, so a
// screenshot from the person is enough to find the log line (M0-04). Never the raw error message.
export function ErrorNotice({ error }: { error: unknown }) {
  const { t } = useTranslation();
  const traceId = traceIdOf(error);

  return (
    <>
      <p className="text-sm text-muted">{t(errorKeyFor(error))}</p>
      {traceId && (
        <p className="mt-2 font-mono text-xs break-all text-muted select-all">
          {t('errors.reference', { traceId })}
        </p>
      )}
    </>
  );
}
