import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDayHeading, formatNumber } from '../../i18n/format';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { Sheet } from '../../ui/Sheet';
import { PersonName } from '../schedule/PersonName';
import { StatusChip } from '../../ui/StatusChip';
import { usePublishedSchedule } from '../scheduling/data';
import { useShiftName } from '../scheduling/ShiftName';
import type { ShiftRef } from './data';

type ClaimSheetProps = {
  shift: ShiftRef;
  /** Who gives it away, for a give-away; they leave the shift once someone takes it. */
  fromName?: string | null;
  fromMembershipId?: string | null;
  requested: boolean;
  /** Approval on: claiming only asks the manager (FR-185). */
  needsApproval: boolean;
  wouldMissLevel: boolean;
  busy: boolean;
  onClaim: () => void;
  onClose: () => void;
};

/**
 * An open shift or a give-away on the Trade tab (2026-11-20): the same pop-up as one of my own shifts (who
 * works it, the empty spots), with a Claim button and an "Are you sure?". Not in the mockups; it reuses
 * the shift pop-up of 1c and the confirmation of Building Schedule.
 */
export function ClaimSheet({
  shift,
  fromName,
  fromMembershipId,
  requested,
  needsApproval,
  wouldMissLevel,
  busy,
  onClaim,
  onClose,
}: ClaimSheetProps) {
  const { t, i18n } = useTranslation();
  const shiftName = useShiftName();
  const schedule = usePublishedSchedule(shift.periodId).data;
  const full = schedule?.shifts.find((item) => item.id === shift.id);
  const [confirming, setConfirming] = useState(false);
  // The giver leaves when someone takes it, so they are not who you would work with.
  const others = (full?.people ?? []).filter(
    (person) => !person.isMe && person.membershipId !== fromMembershipId,
  );
  const open = full ? Math.max(0, full.headcount - full.people.length) : 0;

  return (
    <>
      <Sheet
        open={!confirming}
        onOpenChange={(isOpen) => !isOpen && onClose()}
        title={full ? shiftName(full) : `${shift.start}–${shift.end}`}
        description={`${formatDayHeading(shift.date, i18n.language)} · ${shift.start}–${shift.end}${
          full ? ` · ${formatNumber(full.hours, i18n.language)} h` : ''
        }`}
      >
        {fromName && <p className="mb-3 text-sm">{t('marketplace.offeredBy', { name: fromName })}</p>}
        <h3 className="text-sm font-bold text-muted">{t('marketplace.sheet.with')}</h3>
        <ul className="mt-2 flex flex-col gap-2">
          {others.map((person) => (
            <li key={person.membershipId} className="rounded-field bg-surface-3 px-4 py-3 font-bold">
              <PersonName person={person} />
            </li>
          ))}
          {full && others.length === 0 && (
            <li className="rounded-field bg-surface-3 px-4 py-3 text-sm text-muted">
              {t('marketplace.sheet.alone')}
            </li>
          )}
        </ul>
        {open > 0 && (
          <StatusChip tone="warning" className="mt-3">
            {t('schedule.sheet.openSpots', { count: open })}
          </StatusChip>
        )}
        {wouldMissLevel && (
          <StatusChip tone="warning" className="mt-3">
            {t('marketplace.wouldMissLevel')}
          </StatusChip>
        )}
        <div className="mt-5">
          {requested ? (
            <StatusChip tone="warning">{t('marketplace.waiting')}</StatusChip>
          ) : (
            <Button className="w-full" disabled={busy} onClick={() => setConfirming(true)}>
              {needsApproval ? t('marketplace.sheet.request') : t('marketplace.claim')}
            </Button>
          )}
        </div>
      </Sheet>
      <Dialog
        open={confirming}
        onOpenChange={(isOpen) => !isOpen && setConfirming(false)}
        title={needsApproval ? t('marketplace.sheet.askRequest') : t('marketplace.sheet.askClaim')}
        description={`${formatDayHeading(shift.date, i18n.language)} · ${shift.start}–${shift.end}`}
      >
        <div className="flex flex-col gap-2">
          <Button
            loading={busy}
            onClick={() => {
              onClaim();
              onClose();
            }}
          >
            {t('marketplace.sheet.yes')}
          </Button>
          <Button variant="white" onClick={() => setConfirming(false)}>
            {t('marketplace.sheet.no')}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
