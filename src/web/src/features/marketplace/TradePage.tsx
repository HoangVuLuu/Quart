import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { buttonClassName } from '../../ui/button-styles';
import { PageHeader } from '../../ui/PageHeader';
import { MarketplaceSections } from './MarketplaceSections';

// The Trade tab. The mockups show the tab but no screen for it (known conflict 1), so this reuses the
// open-shift and trade cards of Alerts (1f, 1n). Giving a shift away or asking for a trade starts from
// "My shifts to trade", reached by the button above the list (2.1, 2026-11-18).
export function TradePage() {
  const { t } = useTranslation();
  return (
    <section className="flex flex-col gap-4 px-5">
      <PageHeader title={t('trade.title')} subtitle={t('trade.context')} />
      <Link to="/trade/mine" className={buttonClassName('dark', 'self-start')}>
        {t('trade.fromSchedule')}
      </Link>
      <MarketplaceSections scope="trade" emptyText={t('trade.empty')} />
    </section>
  );
}
