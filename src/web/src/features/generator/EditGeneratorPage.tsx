import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useGoBack } from '../../app/useGoBack';
import { SubPage } from '../../app/SubPage';
import { messageKeyFor } from '../../i18n/errors';
import { api, unwrap, type Schemas } from '../../lib/api/client';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Icon } from '../../ui/Icon';
import { cx } from '../../ui/cx';
import { Dialog } from '../../ui/Dialog';
import { Sheet } from '../../ui/Sheet';
import { CardSkeleton, Loading, Skeleton } from '../../ui/Skeleton';
import { Stepper } from '../../ui/Stepper';
import { Switch } from '../../ui/Switch';
import { TextField } from '../../ui/TextField';
import { LevelRuleField, PairsField } from '../day-editor/ShiftRuleFields';
import { useToast } from '../../ui/toast-context';
import { FormError } from '../identity/FormError';
import { Pill } from '../schedule/Pill';
import { useWorkplace } from '../workplaces/workplace';

type Setup = Schemas['GeneratorSetup'];
type Block = Schemas['BlockSetup'];

const weekdays = [1, 2, 3, 4, 5, 6, 7];
const newBlock: Block = {
  id: null,
  days: weekdays,
  start: '10:00',
  end: '16:00',
  headcount: 2,
  requirements: [],
  conflicts: [],
  name: null,
};

/** M3-04: the same limit as the server. */
const nameMaxLength = 24;

/** "Mon", "lun.": a weekday's short name, from its ISO number (1 is Monday). */
function weekdayName(day: number, language: string): string {
  // 5 January 2026 is a Monday.
  return new Intl.DateTimeFormat(language, { weekday: 'short', timeZone: 'UTC' }).format(
    new Date(Date.UTC(2026, 0, 4 + day)),
  );
}

// Mockups 1k3 to 1k6: the rules of the generator and the weekly template on one page, with a back arrow,
// Save at the bottom and no tab bar. The mockups draw a calendar to drag on; this is the tap path, which
// must be able to do everything (NFR-002): each shift is entered once and applied to the days it runs on.
export function EditGeneratorPage() {
  const { t } = useTranslation();
  const { id } = useWorkplace();
  const setup = useQuery({
    queryKey: ['workplace', id, 'generator'],
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/workplaces/{workplaceId}/generator', { params: { path: { workplaceId: id } }, signal }),
      ),
    // The form below owns the values while it is open; a refetch must not overwrite what is being typed.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  if (setup.error) throw setup.error;
  if (!setup.data) {
    return (
      <SubPage backTo="/schedule" title={t('generator.title')}>
        <Loading>
          <Skeleton className="h-12 rounded-pill" />
          <CardSkeleton lines={3} />
          <CardSkeleton lines={3} />
        </Loading>
      </SubPage>
    );
  }
  return <GeneratorForm initial={setup.data} />;
}

function GeneratorForm({ initial }: { initial: Setup }) {
  const { t, i18n } = useTranslation();
  const { id } = useWorkplace();
  const goBack = useGoBack('/schedule');
  const client = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<'general' | 'shifts'>('general');
  const [draft, setDraft] = useState<Setup>(initial);
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [leaving, setLeaving] = useState(false);
  const blocks = draft.blocks ?? [];
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const navigate = useNavigate();
  // Saving leads back, or on to "Edit a specific day", which saves unsaved changes first (2026-11-23).
  const save = useMutation({
    // The page to go to next rides along as the mutation's variable.
    mutationFn: (next: 'back' | 'days') =>
      next &&
      unwrap(
        api.PUT('/api/workplaces/{workplaceId}/generator', {
          params: { path: { workplaceId: id } },
          body: draft,
        }),
      ),
    onSuccess: async (_, next) => {
      await client.invalidateQueries({ queryKey: ['workplace', id] });
      toast(t('generator.saved'));
      if (next === 'days') void navigate('/generator/days');
      else goBack();
    },
  });
  const openDays = () => (dirty ? save.mutate('days') : void navigate('/generator/days'));

  function saveBlock(block: Block) {
    setDraft((current) => {
      const list = [...(current.blocks ?? [])];
      if (editing === 'new') list.push(block);
      else if (editing !== null) list[editing] = block;
      return {
        ...current,
        blocks: list.sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end)),
      };
    });
    setEditing(null);
  }

  return (
    <SubPage
      backTo="/schedule"
      title={t('generator.title')}
      context={tab === 'general' ? t('generator.general') : t('generator.shifts')}
      // Mockup 1k6: never lose edits by accident.
      onBack={() => (dirty ? setLeaving(true) : goBack())}
    >
      <div className="flex flex-col gap-4">
        <div role="group" aria-label={t('generator.tabs')} className="flex gap-2">
          <Pill selected={tab === 'general'} onClick={() => setTab('general')}>
            {t('generator.general')}
          </Pill>
          <Pill selected={tab === 'shifts'} onClick={() => setTab('shifts')}>
            {t('generator.shifts')}
          </Pill>
        </div>

        {tab === 'general' ? (
          <>
            <Card>
              <h2 className="text-[17px]">{t('generator.period.title')}</h2>
              <p className="mb-3 text-sm text-muted">{t('generator.period.text')}</p>
              <div
                role="radiogroup"
                aria-label={t('generator.period.title')}
                className="flex flex-wrap gap-2"
              >
                {[1, 2, 3, 4].map((weeks) => (
                  <Choice
                    key={weeks}
                    selected={draft.periodWeeks === weeks}
                    onSelect={() => setDraft({ ...draft, periodWeeks: weeks })}
                  >
                    {t('generator.period.weeks', { count: weeks })}
                  </Choice>
                ))}
              </div>
            </Card>
            <Card>
              <h2 className="text-[17px]">{t('generator.row.title')}</h2>
              <p className="mb-3 text-sm text-muted">{t('generator.row.text')}</p>
              <div role="radiogroup" aria-label={t('generator.row.title')} className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, null].map((max) => (
                  <Choice
                    key={max ?? 'none'}
                    selected={draft.maxConsecutiveShifts === max}
                    onSelect={() => setDraft({ ...draft, maxConsecutiveShifts: max })}
                  >
                    {max === null ? t('generator.row.noLimit') : String(max)}
                  </Choice>
                ))}
              </div>
            </Card>
            <Card className="flex flex-col gap-2">
              <h2 className="text-[17px]">{t('generator.fairness.title')}</h2>
              <Switch
                label={t('generator.fairness.opening')}
                description={t('generator.fairness.text')}
                checked={draft.openingFairness}
                onCheckedChange={(openingFairness) => setDraft({ ...draft, openingFairness })}
              />
              <Switch
                label={t('generator.fairness.closing')}
                description={t('generator.fairness.text')}
                checked={draft.closingFairness}
                onCheckedChange={(closingFairness) => setDraft({ ...draft, closingFairness })}
              />
            </Card>
          </>
        ) : (
          <>
            <p className="text-sm text-muted">{t('generator.blocks.text')}</p>
            {blocks.length === 0 && (
              <Card>
                <p className="text-sm text-muted">{t('generator.blocks.none')}</p>
              </Card>
            )}
            <ul className="flex flex-col gap-3">
              {blocks.map((block, index) => (
                <li key={block.id ?? `new-${index}`}>
                  <button
                    type="button"
                    onClick={() => setEditing(index)}
                    className="w-full rounded-card bg-surface p-4 text-left shadow-card"
                  >
                    <span className="block text-lg font-bold">
                      {block.name ? `${block.name} · ` : ''}
                      {block.start}–{block.end}
                    </span>
                    <span className="block text-sm text-muted">
                      {block.days.length === 7
                        ? t('generator.blocks.everyDay')
                        : block.days.map((day) => weekdayName(day, i18n.language)).join(' · ')}
                    </span>
                    <span className="mt-1 block text-sm font-bold">
                      {[
                        t('generator.blocks.people', { count: block.headcount }),
                        ...(block.requirements ?? []).map((rule) =>
                          t('generator.blocks.rule', { count: rule.minCount, level: rule.level }),
                        ),
                        ...((block.conflicts ?? []).length > 0
                          ? [t('generator.blocks.pairs', { count: (block.conflicts ?? []).length })]
                          : []),
                      ].join(' · ')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <Button variant="white" loading={save.isPending && save.variables === 'days'} onClick={openDays}>
              <Icon name="calendar" className="size-5" />
              {t('dayEditor.open')}
            </Button>
            <Button variant="white" onClick={() => setEditing('new')}>
              {t('generator.blocks.add')}
            </Button>
          </>
        )}

        <FormError message={save.error ? t(messageKeyFor(save.error)) : undefined} />
        <Button loading={save.isPending} disabled={!dirty} onClick={() => save.mutate('back')}>
          {t('generator.save')}
        </Button>
        <p className="text-center text-xs text-muted">{t('generator.saveHint')}</p>
      </div>

      {editing !== null && (
        <BlockSheet
          block={editing === 'new' ? newBlock : (blocks[editing] ?? newBlock)}
          isNew={editing === 'new'}
          onSave={saveBlock}
          onDelete={() => {
            setDraft({ ...draft, blocks: blocks.filter((_, index) => index !== editing) });
            setEditing(null);
          }}
          onApplyRulesToAll={(block) => {
            // "Apply to all": the same headcount, level rules and pairs on every shift (M3-02, M3-03).
            setDraft({
              ...draft,
              blocks: blocks.map((other, index) =>
                index === editing
                  ? block
                  : {
                      ...other,
                      headcount: block.headcount,
                      requirements: block.requirements,
                      conflicts: block.conflicts,
                    },
              ),
            });
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
      <Dialog
        open={leaving}
        onOpenChange={setLeaving}
        title={t('generator.leave.title')}
        description={t('generator.leave.text')}
      >
        <div className="flex flex-col gap-2">
          <Button onClick={() => setLeaving(false)}>{t('generator.leave.stay')}</Button>
          <Button variant="danger" onClick={goBack}>
            {t('generator.leave.leave')}
          </Button>
        </div>
      </Dialog>
    </SubPage>
  );
}

function Choice({
  selected,
  onSelect,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cx(
        'min-h-11 min-w-11 rounded-pill px-4 text-sm font-bold shadow-press',
        selected ? 'bg-ink text-bg' : 'bg-surface-3 text-ink',
      )}
    >
      {children}
    </button>
  );
}

type BlockSheetProps = {
  block: Block;
  isNew: boolean;
  onSave: (block: Block) => void;
  onDelete: () => void;
  onApplyRulesToAll: (block: Block) => void;
  onClose: () => void;
};

/** Mockup 1k5: one shift's times, days, people needed, "at least N of level L" and "cannot work together". */
function BlockSheet({ block, isNew, onSave, onDelete, onApplyRulesToAll, onClose }: BlockSheetProps) {
  const { t, i18n } = useTranslation();
  const [value, setValue] = useState<Block>(block);
  const conflicts = value.conflicts ?? [];
  // The same checks as the server, so the mistake shows before Save (FR-061, FR-062).
  const problem =
    !/^\d\d:\d\d$/.test(value.start) || !/^\d\d:\d\d$/.test(value.end)
      ? t('errors.template.time_invalid')
      : value.end <= value.start
        ? t('errors.template.crosses_midnight')
        : [value.start, value.end].some((time) => Number(time.slice(3)) % 15 !== 0)
          ? t('errors.template.off_grid')
          : value.days.length === 0
            ? t('errors.template.no_days')
            : undefined;

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={isNew ? t('generator.block.new') : t('generator.block.edit')}
    >
      <div className="flex flex-col gap-4">
        <TextField
          label={t('generator.block.name')}
          hint={t('generator.block.nameHint')}
          value={value.name ?? ''}
          maxLength={nameMaxLength}
          autoComplete="off"
          onChange={(event) => setValue({ ...value, name: event.target.value })}
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label={t('generator.block.start')}
            type="time"
            step={900}
            value={value.start}
            onChange={(event) => setValue({ ...value, start: event.target.value })}
          />
          <TextField
            label={t('generator.block.end')}
            type="time"
            step={900}
            value={value.end}
            onChange={(event) => setValue({ ...value, end: event.target.value })}
          />
        </div>
        <div role="group" aria-label={t('generator.block.days')}>
          <p className="mb-1.5 text-xs font-bold tracking-[0.06em] text-muted uppercase">
            {t('generator.block.days')}
          </p>
          <div className="flex flex-wrap gap-2">
            {weekdays.map((day) => {
              const on = value.days.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setValue({
                      ...value,
                      days: on ? value.days.filter((other) => other !== day) : [...value.days, day].sort(),
                    })
                  }
                  className={cx(
                    'min-h-11 min-w-12 rounded-pill px-3 text-sm font-bold shadow-press',
                    on ? 'bg-ink text-bg' : 'bg-surface-3 text-ink',
                  )}
                >
                  {weekdayName(day, i18n.language)}
                </button>
              );
            })}
          </div>
        </div>
        <Stepper
          label={t('generator.block.headcount')}
          value={value.headcount}
          min={1}
          max={20}
          onChange={(headcount) =>
            setValue({
              ...value,
              headcount,
              requirements: (value.requirements ?? []).map((rule) => ({
                ...rule,
                minCount: Math.min(rule.minCount, headcount),
              })),
            })
          }
        />
        {/* Counted inside the headcount, not on top of it (FR-065). */}
        <LevelRuleField
          headcount={value.headcount}
          requirements={value.requirements ?? []}
          onChange={(requirements) => setValue({ ...value, requirements })}
        />
        <PairsField pairs={conflicts} onChange={(pairs) => setValue({ ...value, conflicts: pairs })} />

        <FormError message={problem} />
        <Button disabled={problem !== undefined} onClick={() => onSave(value)}>
          {t('generator.block.done')}
        </Button>
        {!isNew && (
          <>
            <Button variant="white" disabled={problem !== undefined} onClick={() => onApplyRulesToAll(value)}>
              {t('generator.block.applyAll')}
            </Button>
            <Button variant="danger" onClick={onDelete}>
              {t('generator.block.delete')}
            </Button>
          </>
        )}
      </div>
    </Sheet>
  );
}
