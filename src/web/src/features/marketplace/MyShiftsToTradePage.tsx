import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SubPage } from '../../app/SubPage';
import { formatDayHeading } from '../../i18n/format';
import { EmptyState } from '../../ui/EmptyState';
import { Skeleton } from '../../ui/Skeleton';
import { StatusChip } from '../../ui/StatusChip';
import { ShiftTradeSheet } from '../schedule/PublishedSchedule';
import { usePublishedSchedule } from '../scheduling/data';
import { useMarketplace, type MyShiftView } from './data';

/**
 * "My shifts to trade" (2.2, 2026-11-18): the person's upcoming shifts, from the Trade tab. Tapping one
 * starts the same give-away or trade flow as before (mockups 1h, 1i). Not in the mockups: it reuses the
 * card of "My shifts" (1c) on a page with a back arrow, like 1e.
 */
export function MyShiftsToTradePage() {
  const { t, i18n } = useTranslation();
  const board = useMarketplace();
  const [open, setOpen] = useState<MyShiftView | null>(null);
  if (board.error) throw board.error;

  return (
    <SubPage backTo="/trade" title={t('trade.mine.title')}>
      {!board.data ? (
        <Skeleton className="h-48" />
      ) : board.data.mine.length === 0 ? (
        <EmptyState title={t('trade.mine.empty')} />
      ) : (
        <ul className="flex flex-col gap-3">
          {board.data.mine.map((item) => (
            <li key={item.shift.id}>
              <button
                type="button"
                onClick={() => setOpen(item)}
                className="flex w-full items-center gap-3 rounded-card bg-surface p-5 text-left shadow-card"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold tracking-[0.06em] text-muted uppercase">
                    {formatDayHeading(item.shift.date, i18n.language)}
                  </p>
                  <p className="text-xl font-bold">
                    {item.shift.start}–{item.shift.end}
                  </p>
                  {item.offered && (
                    <StatusChip tone="danger" className="mt-2">
                      {t('trade.mine.offered')}
                    </StatusChip>
                  )}
                  {item.tradePending && (
                    <StatusChip tone="warning" className="mt-2">
                      {t('trade.mine.pending')}
                    </StatusChip>
                  )}
                </div>
                <span aria-hidden="true" className="text-xl text-muted">
                  ›
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && <TradeFlow item={open} onClose={() => setOpen(null)} />}
    </SubPage>
  );
}

/** Loads the shift's own schedule, which the trade sheet needs to list what it could be swapped for. */
function TradeFlow({ item, onClose }: { item: MyShiftView; onClose: () => void }) {
  const schedule = usePublishedSchedule(item.shift.periodId).data;
  const shift = schedule?.shifts.find((x) => x.id === item.shift.id);
  if (!schedule || !shift) return null;
  return <ShiftTradeSheet schedule={schedule} shift={shift} onClose={onClose} />;
}
