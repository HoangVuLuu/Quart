import { useTranslation } from 'react-i18next';

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const next = i18n.resolvedLanguage === 'fr' ? 'en' : 'fr';

  return (
    <button
      type="button"
      onClick={() => void i18n.changeLanguage(next)}
      aria-label={t('language.label')}
      lang={next}
      className="min-h-11 rounded-pill bg-surface px-4 text-sm font-bold shadow-press"
    >
      {t('language.switchTo')}
    </button>
  );
}
