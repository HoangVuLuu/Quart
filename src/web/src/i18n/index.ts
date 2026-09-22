import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import fr from './locales/fr.json';

export const languages = ['fr', 'en'] as const;
export type Language = (typeof languages)[number];

// The language follows the device on first visit, then the person's choice (stored locally for now;
// M2 stores it on the account so emails and push notifications use it too, FR-261).
void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      fr: { translation: fr },
      en: { translation: en },
    },
    supportedLngs: [...languages],
    fallbackLng: 'fr',
    load: 'languageOnly',
    interpolation: { escapeValue: false }, // React already escapes everything it renders.
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'quart.language',
    },
  });

document.documentElement.lang = i18n.resolvedLanguage ?? 'fr';
i18n.on('languageChanged', (language) => {
  document.documentElement.lang = language;
});

export default i18n;
