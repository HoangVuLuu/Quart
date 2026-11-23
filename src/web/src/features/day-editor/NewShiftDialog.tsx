import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../ui/Button';
import { cx } from '../../ui/cx';
import { FullScreenDialog } from '../../ui/FullScreenDialog';
import { Stepper } from '../../ui/Stepper';
import { TextField } from '../../ui/TextField';
import { FormError } from '../identity/FormError';
import { timeProblem, type DayInfo, type Pair, type Requirement } from './model';
import { LevelRuleField, PairsField } from './ShiftRuleFields';

export type NewShift = {
  name: string | null;
  start: string;
  end: string;
  headcount: number;
  requirements: Requirement[];
  pairs: Pair[];
};

type NewShiftDialogProps = {
  start: string;
  end: string;
  /** Every day of the page; locked days are left out of the picker. */
  days: DayInfo[];
  /** The day it was drawn on, picked already. */
  day: string;
  /** "Cannot work together": in Edit Generator, not on a period (2026-11-23). */
  withPairs: boolean;
  onSave: (shift: NewShift, days: string[]) => void;
  onClose: () => void;
};

/** M3-04: the same limit as the server. */
const nameMaxLength = 24;

// The pop-up after drawing a new shift (2026-11-23): X cancels, Save keeps. The times can be made exact, and the
// same shift can go on several days of the period at once.
export function NewShiftDialog({ start, end, days, day, withPairs, onSave, onClose }: NewShiftDialogProps) {
  const { t } = useTranslation();
  const [shift, setShift] = useState<NewShift>({
    name: null,
    start,
    end,
    headcount: 1,
    requirements: [],
    pairs: [],
  });
  const [picked, setPicked] = useState<string[]>([day]);
  const problem = timeProblem(shift.start, shift.end);
  const message = problem
    ? t(`errors.template.${problem}`)
    : picked.length === 0
      ? t('dayEditor.noDays')
      : undefined;
  const weeks = [...new Set(days.map((item) => item.week))];
  return (
    <FullScreenDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('dayEditor.newTitle')}
      action={
        <Button
          className="min-h-11 px-5 text-sm"
          disabled={message !== undefined}
          onClick={() => onSave({ ...shift, name: shift.name?.trim() || null }, picked)}
        >
          {t('dayEditor.save')}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField
          label={t('dayEditor.name')}
          value={shift.name ?? ''}
          maxLength={nameMaxLength}
          autoComplete="off"
          onChange={(event) => setShift({ ...shift, name: event.target.value })}
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label={t('generator.block.start')}
            type="time"
            step={900}
            value={shift.start}
            onChange={(event) => setShift({ ...shift, start: event.target.value })}
          />
          <TextField
            label={t('generator.block.end')}
            type="time"
            step={900}
            value={shift.end}
            onChange={(event) => setShift({ ...shift, end: event.target.value })}
          />
        </div>
        <Stepper
          label={t('generator.block.headcount')}
          value={shift.headcount}
          min={1}
          max={20}
          onChange={(headcount) =>
            setShift({
              ...shift,
              headcount,
              requirements: shift.requirements.map((rule) => ({
                ...rule,
                minCount: Math.min(rule.minCount, headcount),
              })),
            })
          }
        />
        <LevelRuleField
          headcount={shift.headcount}
          requirements={shift.requirements}
          onChange={(requirements) => setShift({ ...shift, requirements })}
        />
        {withPairs && <PairsField pairs={shift.pairs} onChange={(pairs) => setShift({ ...shift, pairs })} />}
        <div role="group" aria-label={t('dayEditor.days')}>
          <h3 className="text-[17px]">{t('dayEditor.days')}</h3>
          <p className="mb-2 text-sm text-muted">{t('dayEditor.daysHint')}</p>
          {weeks.map((week) => (
            <div key={week} className="mb-3">
              {weeks.length > 1 && (
                <p className="mb-1.5 text-xs font-bold text-muted">
                  {t('dayEditor.week', { week: week + 1 })}
                </p>
              )}
              <div className="grid grid-cols-7 gap-1.5">
                {days
                  .filter((item) => item.week === week)
                  .map((item) => {
                    const on = picked.includes(item.key);
                    return (
                      <button
                        key={item.key}
                        type="button"
                        aria-pressed={on}
                        aria-label={item.long}
                        disabled={item.locked}
                        onClick={() =>
                          setPicked(on ? picked.filter((key) => key !== item.key) : [...picked, item.key])
                        }
                        className={cx(
                          'min-h-11 rounded-pill text-sm font-bold disabled:opacity-40',
                          on ? 'bg-primary text-on-primary' : 'bg-surface-3 text-ink',
                        )}
                      >
                        {item.chip}
                      </button>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
        <FormError message={message} />
      </div>
    </FullScreenDialog>
  );
}
