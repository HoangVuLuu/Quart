import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../ui/Button';
import { Sheet } from '../../ui/Sheet';
import { TextField } from '../../ui/TextField';
import { FormError } from '../identity/FormError';
import { timeProblem, type DayShift } from './model';

type HoursSheetProps = {
  shift: DayShift;
  title: string;
  /** Under the title: the day, and how many people. */
  description: string;
  onSave: (start: string, end: string) => void;
  onDelete: () => void;
  onClose: () => void;
};

// Tapping a shift on the day view (2026-11-23): its hours that day, or delete it. Nothing else changes here.
export function HoursSheet({ shift, title, description, onSave, onDelete, onClose }: HoursSheetProps) {
  const { t } = useTranslation();
  const [start, setStart] = useState(shift.start);
  const [end, setEnd] = useState(shift.end);
  const problem = timeProblem(start, end);
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()} title={title} description={description}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label={t('generator.block.start')}
            type="time"
            step={900}
            value={start}
            onChange={(event) => setStart(event.target.value)}
          />
          <TextField
            label={t('generator.block.end')}
            type="time"
            step={900}
            value={end}
            onChange={(event) => setEnd(event.target.value)}
          />
        </div>
        <FormError message={problem ? t(`errors.template.${problem}`) : undefined} />
        <Button disabled={problem !== null} onClick={() => onSave(start, end)}>
          {t('generator.block.done')}
        </Button>
        <Button variant="danger" onClick={onDelete}>
          {t('dayEditor.delete')}
        </Button>
      </div>
    </Sheet>
  );
}
