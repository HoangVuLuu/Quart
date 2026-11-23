import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../ui/Button';
import { cx } from '../../ui/cx';
import { Icon } from '../../ui/Icon';
import { Sheet } from '../../ui/Sheet';
import { TextArea } from '../../ui/TextField';
import { pressClassName } from '../../ui/button-styles';
import { maxShiftNoteLength } from './shift-note-rules';

// A short note on one shift of someone's availability, for the admins (FR-103a): "Can only stay until
// 21:00". It lives on a shift the person can work, as a strip on the right of its pill. It is sent with the
// availability, and locks with it.

/**
 * The strip on the right of a chosen shift: pale with no note, solid yellow with one. A button that opens the
 * note sheet when the person can still change their availability; only a mark once it is locked.
 */
export function NoteStrip({
  note,
  label,
  onOpen,
}: {
  note: string | undefined;
  label: string;
  onOpen?: () => void;
}) {
  const className = cx(
    // 36 px wide by the pill's 48 px: room for the shift's name beside it at 390 px (brief: about 34 px).
    'flex w-9 shrink-0 items-center justify-center',
    note ? 'bg-note text-on-note' : 'bg-warning-soft text-warning',
  );
  if (!onOpen) {
    return (
      <span className={className} aria-hidden="true">
        <Icon name="note" />
      </span>
    );
  }
  return (
    <button
      type="button"
      aria-label={label}
      aria-haspopup="dialog"
      onClick={onOpen}
      className={cx(className, pressClassName)}
    >
      <Icon name="note" />
    </button>
  );
}

/** Under a day, the notes of its chosen shifts, so they read without opening anything. Text only (FR-103a). */
export function DayNotes({ notes }: { notes: readonly { name: string; note: string }[] }) {
  if (notes.length === 0) return null;
  return (
    <ul className="ml-16 flex flex-col gap-1">
      {notes.map((item) => (
        <li
          key={item.name}
          className="flex items-center gap-1.5 rounded-field bg-warning-soft px-3 py-1.5 text-xs font-bold text-warning"
        >
          <Icon name="note" className="size-4" />
          <span className="min-w-0 break-words">
            {item.name}: {item.note}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * "Note for Mon 23 · Closing": write, change or remove the note of one chosen shift. Saving keeps it with the
 * taps; it reaches the manager when the availability is sent.
 */
export function ShiftNoteSheet({
  open,
  onOpenChange,
  title,
  note,
  selected,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  note: string | undefined;
  /** Whether the shift is still chosen: a note needs one. */
  selected: boolean;
  onSave: (note: string | undefined) => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(note ?? '');
  const [error, setError] = useState(false);

  function save(value: string | undefined) {
    if (value !== undefined && !selected) {
      setError(true);
      return;
    }
    onSave(value);
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title} description={t('shiftNote.hint')}>
      <div className="flex flex-col gap-3">
        <TextArea
          label={t('shiftNote.label')}
          hint={t('shiftNote.counter', { count: text.length, max: maxShiftNoteLength })}
          placeholder={t('shiftNote.placeholder')}
          maxLength={maxShiftNoteLength}
          rows={2}
          value={text}
          error={error ? t('shiftNote.selectFirst') : undefined}
          onChange={(event) => setText(event.target.value)}
        />
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="white"
            className="px-3"
            disabled={note === undefined && text.trim() === ''}
            onClick={() => save(undefined)}
          >
            {t('shiftNote.remove')}
          </Button>
          <Button className="px-3" disabled={text.trim() === ''} onClick={() => save(text.trim())}>
            {t('shiftNote.save')}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
