import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { messageKeyFor } from '../../i18n/errors';
import { formatShortDate } from '../../i18n/format';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Icon, iconButtonClassName } from '../../ui/Icon';
import { StatusChip } from '../../ui/StatusChip';
import { useToast } from '../../ui/toast-context';
import { FormError } from '../identity/FormError';
import { ClaimSheet } from './ClaimSheet';
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

/** A small accent dot on a Trade tab item the person has not opened yet (2.4). */
function NewDot() {
  const { t } = useTranslation();
  return (
    <span className="size-2.5 shrink-0 rounded-full bg-accent">
      <span className="sr-only">{t('trade.new')}</span>
    </span>
  );
}

/**
 * The cards of mockups 1f (staff) and 1n (admins). Since 2026-11-18 (2.5) they are split: the Trade tab
 * holds open shifts, give-aways and the person's own trades ("trade"); Alerts holds what a manager must
 * decide ("decisions"). Opening a Trade item, by tapping its card, takes it off the tab's count (2.4).
 */
export function MarketplaceSections({
  emptyText,
  scope,
}: {
  emptyText?: string;
  scope: 'trade' | 'decisions';
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const board = useMarketplace();
  const actions = useMarketplaceActions();
  const shiftText = useShiftText();
  const [claiming, setClaiming] = useState<{
    shift: ShiftRef;
    giveAwayId: string | null;
    fromName?: string;
    fromMembershipId?: string;
    requested: boolean;
    wouldMissLevel: boolean;
  } | null>(null);
  if (board.error) throw board.error;
  if (!board.data) return null;
  const all = board.data;
  const trading = scope === 'trade';
  const data = {
    openShifts: trading ? all.openShifts : [],
    offers: trading ? all.offers : [],
    claims: trading ? [] : all.claims,
    trades: all.trades.filter((trade) => (trade.role === 'approver') !== trading),
  };
  const open = (key: string, seen: boolean) => {
    if (!seen) actions.seen.mutate(key);
  };
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
                {/* 3.3: a warning the approver may override, never a refusal. */}
                {item.wouldMissLevel && (
                  <StatusChip tone="warning" className="mt-1">
                    {t('marketplace.wouldMissLevel')}
                  </StatusChip>
                )}
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

      {/* Trades come first on the Trade tab (2026-11-18). */}
      {data.trades.length > 0 && (
        <Section title={t('marketplace.trades')}>
          {data.trades.map((trade) => (
            <TradeCard
              key={trade.id}
              trade={trade}
              busy={busy}
              onOpen={() => open(`trade:${trade.id}`, trade.seen || trade.role !== 'coworker')}
              onAct={(action) => actions.trade.mutate({ tradeId: trade.id, action })}
            />
          ))}
        </Section>
      )}

      {data.openShifts.length + data.offers.length > 0 && (
        <Section title={t('marketplace.open')}>
          {/* 2026-11-20: tapping a card opens the shift with a Claim button; the eye only marks it seen. */}
          {data.openShifts.map((item) => (
            <Card key={item.shift.id} className="flex items-center gap-3 p-4">
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                aria-label={t('marketplace.sheet.open', { shift: shiftText(item.shift) })}
                onClick={() => {
                  open(`slot:${item.shift.id}`, item.seen);
                  setClaiming({
                    shift: item.shift,
                    giveAwayId: null,
                    requested: item.requested,
                    wouldMissLevel: false,
                  });
                }}
              >
                <p className="font-bold">{shiftText(item.shift)}</p>
                <p className="text-sm text-muted">{t('marketplace.openSlots', { count: item.openSlots })}</p>
              </button>
              {item.requested ? (
                <StatusChip tone="warning">{t('marketplace.waiting')}</StatusChip>
              ) : (
                !item.seen && (
                  <SeenEye
                    shift={shiftText(item.shift)}
                    onClick={() => open(`slot:${item.shift.id}`, false)}
                  />
                )
              )}
            </Card>
          ))}
          {data.offers.map((item) => {
            const claimable = !item.mine && !item.onShift;
            const text = (
              <>
                <p className="font-bold">{shiftText(item.shift)}</p>
                <p className="text-sm text-muted">
                  {item.mine
                    ? t('marketplace.offeredByMe')
                    : t('marketplace.offeredBy', { name: item.fromName })}
                </p>
                {item.onShift && !item.mine && (
                  <p className="text-sm text-muted">{t('marketplace.onShift')}</p>
                )}
              </>
            );
            return (
              <Card key={item.id} className="flex items-center gap-3 p-4">
                {claimable ? (
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    aria-label={t('marketplace.sheet.open', { shift: shiftText(item.shift) })}
                    onClick={() => {
                      open(`offer:${item.id}`, item.seen);
                      setClaiming({
                        shift: item.shift,
                        giveAwayId: item.id,
                        fromName: item.fromName,
                        fromMembershipId: item.fromMembershipId,
                        requested: item.requested,
                        wouldMissLevel: item.wouldMissLevel,
                      });
                    }}
                  >
                    {text}
                  </button>
                ) : (
                  <div className="min-w-0 flex-1">{text}</div>
                )}
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
                ) : (
                  claimable &&
                  !item.seen && (
                    <SeenEye shift={shiftText(item.shift)} onClick={() => open(`offer:${item.id}`, false)} />
                  )
                )}
              </Card>
            );
          })}
        </Section>
      )}
      {claiming && (
        <ClaimSheet
          shift={claiming.shift}
          fromName={claiming.fromName}
          fromMembershipId={claiming.fromMembershipId}
          requested={claiming.requested}
          needsApproval={all.claimsNeedApproval}
          wouldMissLevel={claiming.wouldMissLevel}
          busy={busy}
          onClaim={() => claim(claiming.shift.id, claiming.giveAwayId)}
          onClose={() => setClaiming(null)}
        />
      )}
    </>
  );
}

/** The eye on a Trade tab item not opened yet: marks it seen without opening it (2026-11-20). */
function SeenEye({ shift, onClick }: { shift: string; onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      aria-label={t('alerts.markOneRead', { text: shift })}
      className={`${iconButtonClassName} text-ink`}
      onClick={onClick}
    >
      <Icon name="eye" />
      <span className="sr-only">{t('trade.new')}</span>
    </button>
  );
}

function TradeCard({
  trade,
  busy,
  onOpen,
  onAct,
}: {
  trade: TradeView;
  busy: boolean;
  onOpen: () => void;
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
    <Card className="flex flex-col gap-3 p-4" onClick={onOpen}>
      <p className="flex items-center gap-2 font-bold">
        {!trade.seen && trade.role === 'coworker' && trade.status === 'requested' && <NewDot />}
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
