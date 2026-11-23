import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { messageKeyFor } from '../../i18n/errors';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { TextArea } from '../../ui/TextField';
import { FormError } from '../identity/FormError';
import { useDraftActions } from '../scheduling/data';

// The manager's note on a shift, such as "Leaving at 5pm" (FR-145): written on Building or Editing Schedule,
// read by the whole team once published. Plain text, never HTML.

/** FR-145, checked by the server as well. */
const maxManagerNoteLength = 100;

/** The small mark on a shift card that has a note. */
export function NoteMark() {
  const { t } = useTranslation();
  return (
    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-note text-on-note">
      <Icon name="note" className="size-3.5" />
      <span className="sr-only">{t('managerNote.has')}</span>
    </span>
  );
}

/** The note as staff read it, in a shift's sheet or under the shift. */
export function ManagerNote({
  note,
  compact = false,
}: {
  note: string | null | undefined;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  if (!note) return null;
  return (
    <div className={compact ? 'mt-1' : 'mt-4'}>
      {!compact && <h3 className="mb-1.5 text-sm font-bold text-muted">{t('managerNote.title')}</h3>}
      <p className="flex items-start gap-1.5 rounded-field bg-warning-soft px-3 py-2 text-sm font-bold text-warning">
        <Icon name="note" className="size-4 shrink-0" />
        <span className="min-w-0 break-words">
          {compact && <span className="sr-only">{t('managerNote.title')}: </span>}
          {note}
        </span>
      </p>
    </div>
  );
}

/** On Building and Editing Schedule, in the shift sheet: write, change or remove the shift's note. */
export function ManagerNoteEditor({
  periodId,
  shiftId,
  note,
}: {
  periodId: string;
  shiftId: string;
  note: string | null | undefined;
}) {
  const { t } = useTranslation();
  const actions = useDraftActions(periodId);
  const [text, setText] = useState(note ?? '');
  const changed = text.trim() !== (note ?? '');
  return (
    <div className="mb-4 flex flex-col gap-2">
      <TextArea
        label={t('managerNote.label')}
        hint={t('managerNote.hint', { count: text.length, max: maxManagerNoteLength })}
        placeholder={t('managerNote.placeholder')}
        maxLength={maxManagerNoteLength}
        rows={2}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <FormError message={actions.note.error ? t(messageKeyFor(actions.note.error)) : undefined} />
      <Button
        variant="white"
        className="w-full"
        disabled={!changed}
        loading={actions.note.isPending}
        onClick={() => actions.note.mutate({ shiftId, note: text.trim() })}
      >
        {text.trim() === '' && note ? t('managerNote.remove') : t('managerNote.save')}
      </Button>
    </div>
  );
}
