import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { buttonClassName } from '../../ui/button-styles';
import { PageHeader } from '../../ui/PageHeader';
import { MarketplaceSections } from './MarketplaceSections';

// The Trade tab. The mockups show the tab but no screen for it (known conflict 1), so this reuses the
// open-shift and trade sections of Alerts (1f, 1n) rather than inventing a layout. Giving a shift away
// or asking for a trade starts from one of your shifts on the Schedule tab (1h, 1i).
export function TradePage() {
  const { t } = useTranslation();
  return (
    <section className="flex flex-col gap-4 px-5">
      <PageHeader title={t('trade.title')} subtitle={t('trade.context')} />
      <MarketplaceSections emptyText={t('trade.empty')} />
      <Link to="/schedule" className={buttonClassName('white', 'self-start')}>
        {t('trade.fromSchedule')}
      </Link>
    </section>
  );
}
