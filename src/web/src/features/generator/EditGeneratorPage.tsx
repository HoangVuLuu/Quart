import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useGoBack } from '../../app/useGoBack';
import { SubPage } from '../../app/SubPage';
import { messageKeyFor } from '../../i18n/errors';
import { api, unwrap, type Schemas } from '../../lib/api/client';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { cx } from '../../ui/cx';
import { Dialog } from '../../ui/Dialog';
import { Select } from '../../ui/Select';
import { Sheet } from '../../ui/Sheet';
import { Skeleton } from '../../ui/Skeleton';
import { Stepper } from '../../ui/Stepper';
import { Switch } from '../../ui/Switch';
import { TextField } from '../../ui/TextField';
import { useToast } from '../../ui/toast-context';
import { FormError } from '../identity/FormError';
import { Pill } from '../schedule/Pill';
import { useMembers } from '../team/data';
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
};

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
        <Skeleton className="h-64" />
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
  const save = useMutation({
    mutationFn: () =>
      unwrap(
        api.PUT('/api/workplaces/{workplaceId}/generator', {
          params: { path: { workplaceId: id } },
          body: draft,
        }),
      ),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['workplace', id] });
      toast(t('generator.saved'));
      goBack();
    },
  });

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
              <h2 className="text-[17px]">{t('generator.request.title')}</h2>
              <p className="mb-3 text-sm text-muted">{t('generator.request.text')}</p>
              <Stepper
                label={t('generator.request.label')}
                value={draft.requestDaysBefore}
                min={0}
                max={28}
                onChange={(requestDaysBefore) => setDraft({ ...draft, requestDaysBefore })}
              />
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
            <Button variant="white" onClick={() => setEditing('new')}>
              {t('generator.blocks.add')}
            </Button>
          </>
        )}

        <FormError message={save.error ? t(messageKeyFor(save.error)) : undefined} />
        <Button loading={save.isPending} disabled={!dirty} onClick={() => save.mutate()}>
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
  const members = useMembers().data ?? [];
  const [value, setValue] = useState<Block>(block);
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const requirement = value.requirements?.[0];
  const conflicts = value.conflicts ?? [];
  const nameOf = (membershipId: string) =>
    members.find((member) => member.membershipId === membershipId)?.displayName ?? '?';
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
  const pairExists = conflicts.some(
    (pair) =>
      (pair.membershipA === first && pair.membershipB === second) ||
      (pair.membershipA === second && pair.membershipB === first),
  );

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={isNew ? t('generator.block.new') : t('generator.block.edit')}
    >
      <div className="flex flex-col gap-4">
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
        <div className="flex flex-col gap-2">
          {/* Counted inside the headcount, not on top of it (FR-065). */}
          <Stepper
            label={t('generator.block.atLeast')}
            description={t('generator.block.atLeastText')}
            value={requirement?.minCount ?? 0}
            min={0}
            max={value.headcount}
            onChange={(minCount) =>
              setValue({
                ...value,
                requirements: minCount === 0 ? [] : [{ level: requirement?.level ?? 3, minCount }],
              })
            }
          />
          {requirement && (
            <Select
              label={t('generator.block.level')}
              value={requirement.level}
              onChange={(event) =>
                setValue({
                  ...value,
                  requirements: [{ level: Number(event.target.value), minCount: requirement.minCount }],
                })
              }
            >
              {[1, 2, 3].map((level) => (
                <option key={level} value={level}>
                  {t('scheduling.level', { level })}
                </option>
              ))}
            </Select>
          )}
        </div>

        <div>
          <h3 className="text-[17px]">{t('generator.block.pairs')}</h3>
          <p className="mb-2 text-sm text-muted">{t('generator.block.pairsText')}</p>
          <ul className="mb-2 flex flex-col gap-2">
            {conflicts.map((pair) => (
              <li
                key={`${pair.membershipA}-${pair.membershipB}`}
                className="flex items-center gap-2 rounded-field bg-surface-3 px-4 py-2"
              >
                <span className="min-w-0 flex-1 text-sm font-bold">
                  {nameOf(pair.membershipA)} · {nameOf(pair.membershipB)}
                </span>
                <Button
                  variant="white"
                  className="min-h-11 px-4 text-sm"
                  aria-label={t('generator.block.removePair', {
                    first: nameOf(pair.membershipA),
                    second: nameOf(pair.membershipB),
                  })}
                  onClick={() =>
                    setValue({ ...value, conflicts: conflicts.filter((other) => other !== pair) })
                  }
                >
                  {t('draft.editor.remove')}
                </Button>
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: t('generator.block.first'), chosen: first, choose: setFirst, other: second },
              { label: t('generator.block.second'), chosen: second, choose: setSecond, other: first },
            ].map((side) => (
              <Select
                key={side.label}
                label={side.label}
                value={side.chosen}
                onChange={(event) => side.choose(event.target.value)}
              >
                <option value="">{t('generator.block.pick')}</option>
                {members
                  .filter((member) => member.membershipId !== side.other)
                  .map((member) => (
                    <option key={member.membershipId} value={member.membershipId}>
                      {member.displayName}
                    </option>
                  ))}
              </Select>
            ))}
          </div>
          <Button
            variant="white"
            className="mt-2 w-full"
            disabled={first === '' || second === '' || pairExists}
            onClick={() => {
              setValue({ ...value, conflicts: [...conflicts, { membershipA: first, membershipB: second }] });
              setFirst('');
              setSecond('');
            }}
          >
            {t('generator.block.addPair')}
          </Button>
        </div>

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
