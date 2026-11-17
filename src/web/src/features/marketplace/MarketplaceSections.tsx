import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { messageKeyFor } from '../../i18n/errors';
import { formatShortDate } from '../../i18n/format';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { StatusChip } from '../../ui/StatusChip';
import { useToast } from '../../ui/toast-context';
import { FormError } from '../identity/FormError';
import { useMarketplace, useMarketplaceActions, type ShiftRef, type TradeView } from './data';

/** "Fri, Sep 25 · 10:00–16:00": a shift named inside a sentence. */
function useShiftText() {
  const { i18n } = useTranslation();
  return (shift: ShiftRef) => `${formatShortDate(shift.date, i18n.language)} · ${shift.start}–${shift.end}`;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl">{title}</h2>
      {children}
    </section>
  );
}

/**
 * Open shifts, offers and trades, as mockups 1f (staff) and 1n (admins) show them inside Alerts. The
 * Trade tab shows the same sections: the mockups have no separate Trade screen (known conflict 1).
 */
export function MarketplaceSections({ emptyText }: { emptyText?: string }) {
  const { t } = useTranslation();
  const toast = useToast();
  const board = useMarketplace();
  const actions = useMarketplaceActions();
  const shiftText = useShiftText();
  if (board.error) throw board.error;
  if (!board.data) return null;
  const data = board.data;
  const error =
    actions.claim.error ?? actions.decideClaim.error ?? actions.trade.error ?? actions.cancelOffer.error;
  const busy = actions.claim.isPending || actions.decideClaim.isPending || actions.trade.isPending;
  const nothing = data.openShifts.length + data.offers.length + data.claims.length + data.trades.length === 0;

  const claim = (shiftId: string, giveAwayId: string | null) =>
    actions.claim.mutate(
      { shiftId, giveAwayId },
      {
        onSuccess: (result) => toast(result.applied ? t('marketplace.claimed') : t('marketplace.requested')),
      },
    );

  return (
    <>
      <FormError message={error ? t(messageKeyFor(error)) : undefined} />
      {nothing && emptyText && (
        <Card>
          <p className="text-sm text-muted">{emptyText}</p>
        </Card>
      )}

      {data.claims.length > 0 && (
        <Section title={t('marketplace.claims')}>
          {data.claims.map((item) => (
            <Card key={item.id} className="flex flex-col gap-3 p-4">
              <div>
                <p className="font-bold">{shiftText(item.shift)}</p>
                <p className="text-sm text-muted">
                  {item.fromName
                    ? t('marketplace.claimFrom', { name: item.name, from: item.fromName })
                    : t('marketplace.claimOpen', { name: item.name })}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  className="min-h-11 px-4 text-sm"
                  disabled={busy}
                  onClick={() => actions.decideClaim.mutate({ claimId: item.id, approve: true })}
                >
                  {t('marketplace.giveTo', { name: item.name })}
                </Button>
                <Button
                  variant="white"
                  className="min-h-11 px-4 text-sm"
                  disabled={busy}
                  onClick={() => actions.decideClaim.mutate({ claimId: item.id, approve: false })}
                >
                  {t('marketplace.decline')}
                </Button>
              </div>
            </Card>
          ))}
        </Section>
      )}

      {data.openShifts.length + data.offers.length > 0 && (
        <Section title={t('marketplace.open')}>
          {data.openShifts.map((item) => (
            <Card key={item.shift.id} className="flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="font-bold">{shiftText(item.shift)}</p>
                <p className="text-sm text-muted">{t('marketplace.openSlots', { count: item.openSlots })}</p>
              </div>
              {item.requested ? (
                <StatusChip tone="warning">{t('marketplace.waiting')}</StatusChip>
              ) : (
                <Button
                  className="min-h-11 px-4 text-sm"
                  disabled={busy}
                  onClick={() => claim(item.shift.id, null)}
                >
                  {t('marketplace.claim')}
                </Button>
              )}
            </Card>
          ))}
          {data.offers.map((item) => (
            <Card key={item.id} className="flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="font-bold">{shiftText(item.shift)}</p>
                <p className="text-sm text-muted">
                  {item.mine
                    ? t('marketplace.offeredByMe')
                    : t('marketplace.offeredBy', { name: item.fromName })}
                </p>
                {item.onShift && !item.mine && (
                  <p className="text-sm text-muted">{t('marketplace.onShift')}</p>
                )}
                {item.wouldMissLevel && !item.onShift && (
                  <StatusChip tone="warning" className="mt-1">
                    {t('marketplace.wouldMissLevel')}
                  </StatusChip>
                )}
              </div>
              {item.mine ? (
                <Button
                  variant="white"
                  className="min-h-11 px-4 text-sm"
                  disabled={actions.cancelOffer.isPending}
                  onClick={() => actions.cancelOffer.mutate(item.id)}
                >
                  {t('marketplace.keep')}
                </Button>
              ) : item.requested ? (
                <StatusChip tone="warning">{t('marketplace.waiting')}</StatusChip>
              ) : item.onShift ? null : (
                <Button
                  className="min-h-11 px-4 text-sm"
                  disabled={busy}
                  onClick={() => claim(item.shift.id, item.id)}
                >
                  {t('marketplace.claim')}
                </Button>
              )}
            </Card>
          ))}
        </Section>
      )}

      {data.trades.length > 0 && (
        <Section title={t('marketplace.trades')}>
          {data.trades.map((trade) => (
            <TradeCard
              key={trade.id}
              trade={trade}
              busy={busy}
              onAct={(action) => actions.trade.mutate({ tradeId: trade.id, action })}
            />
          ))}
        </Section>
      )}
    </>
  );
}

function TradeCard({
  trade,
  busy,
  onAct,
}: {
  trade: TradeView;
  busy: boolean;
  onAct: (action: 'accept' | 'decline' | 'cancel' | 'approve' | 'reject') => void;
}) {
  const { t } = useTranslation();
  const shiftText = useShiftText();
  // "You give / you get" is from the reader's side: the coworker gives what the requester asked for.
  const mineFirst = trade.role !== 'coworker';
  const gives = mineFirst ? trade.gives : trade.gets;
  const gets = mineFirst ? trade.gets : trade.gives;
  const waiting = trade.status === 'awaiting_approval';

  return (
    <Card className="flex flex-col gap-3 p-4">
      <p className="font-bold">
        {trade.role === 'requester'
          ? t('marketplace.trade.youAsked', { name: trade.coworkerName })
          : trade.role === 'coworker'
            ? t('marketplace.trade.wants', { name: trade.requesterName })
            : t('marketplace.trade.between', { first: trade.requesterName, second: trade.coworkerName })}
      </p>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-field bg-surface-3 px-3 py-2">
          <dt className="text-[11px] font-bold tracking-[0.06em] text-muted uppercase">
            {trade.role === 'approver'
              ? t('marketplace.trade.gives', { name: trade.requesterName })
              : t('marketplace.trade.youGive')}
          </dt>
          <dd className="font-bold">{shiftText(gives)}</dd>
        </div>
        <div className="rounded-field bg-surface-3 px-3 py-2">
          <dt className="text-[11px] font-bold tracking-[0.06em] text-muted uppercase">
            {trade.role === 'approver'
              ? t('marketplace.trade.gives', { name: trade.coworkerName })
              : t('marketplace.trade.youGet')}
          </dt>
          <dd className="font-bold">{shiftText(gets)}</dd>
        </div>
      </dl>
      {trade.role === 'approver' && (
        <p className="text-sm text-muted">
          {trade.wouldMissLevel ? t('marketplace.trade.missesLevel') : t('marketplace.trade.levelsOk')}
        </p>
      )}
      {trade.role !== 'approver' && waiting && (
        <StatusChip tone="warning">{t('marketplace.trade.waitingApproval')}</StatusChip>
      )}
      <div className="grid grid-cols-2 gap-2">
        {trade.role === 'coworker' && !waiting && (
          <>
            <Button className="min-h-11 px-4 text-sm" disabled={busy} onClick={() => onAct('accept')}>
              {t('marketplace.trade.accept')}
            </Button>
            <Button
              variant="white"
              className="min-h-11 px-4 text-sm"
              disabled={busy}
              onClick={() => onAct('decline')}
            >
              {t('marketplace.decline')}
            </Button>
          </>
        )}
        {trade.role === 'requester' && (
          <Button
            variant="white"
            className="min-h-11 px-4 text-sm"
            disabled={busy}
            onClick={() => onAct('cancel')}
          >
            {t('marketplace.trade.cancel')}
          </Button>
        )}
        {trade.role === 'approver' && (
          <>
            <Button className="min-h-11 px-4 text-sm" disabled={busy} onClick={() => onAct('approve')}>
              {t('marketplace.trade.approve')}
            </Button>
            <Button
              variant="white"
              className="min-h-11 px-4 text-sm"
              disabled={busy}
              onClick={() => onAct('reject')}
            >
              {t('marketplace.decline')}
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}
