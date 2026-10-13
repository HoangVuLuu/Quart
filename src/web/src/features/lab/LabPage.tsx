import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorNotice } from '../../app/ErrorNotice';
import { formatDateRange, formatNumber } from '../../i18n/format';
import { ApiError } from '../../lib/api/client';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { EmptyState } from '../../ui/EmptyState';
import { PageHeader } from '../../ui/PageHeader';
import { TextField } from '../../ui/TextField';
import { Skeleton } from '../../ui/Skeleton';
import { StatusChip } from '../../ui/StatusChip';
import { countHardRuleBreaks, type ScheduleIssue } from '../scheduling/components/issues';
import { IssuesPanel } from '../scheduling/components/IssuesPanel';
import { ScheduleGrid, type GridShift } from '../scheduling/components/ScheduleGrid';
import { HoursTable } from './HoursTable';
import { useGenerate, usePresoteaScenario, type GeneratorResult, type LabScenario } from './useLab';

// The generator lab (M1-01, spec 7.8): the sample scenario as a schedule grid, and a button that runs
// the generator on it. Not in the mockups; it borrows the draft schedule's pattern (1l): the actions
// on top, then the week tabs and the shift cards. For the team only, on development and staging.
export function LabPage() {
  const { t } = useTranslation();
  const scenario = usePresoteaScenario();
  const generate = useGenerate();
  const [picked, setPicked] = useState<ScheduleIssue>();
  // The seed as typed; undefined until someone types, so the sample's own seed shows first.
  const [seedText, setSeedText] = useState<string>();
  // An issue from an earlier generation is not one of the current result's.
  const selected = picked && generate.data?.issues.includes(picked) ? picked : undefined;
  const shifts = scenario.data ? gridShifts(scenario.data, generate.data) : [];

  return (
    <section className="flex flex-col gap-4 px-5 pb-10 md:px-0">
      <PageHeader context={t('lab.context')} title={t('lab.title')} />

      {scenario.isPending && (
        <Card>
          <p role="status" className="mb-3 text-muted">
            {t('lab.loading')}
          </p>
          <Skeleton className="h-24" />
        </Card>
      )}

      {scenario.isError &&
        (scenario.error instanceof ApiError && scenario.error.status === 404 ? (
          // The server maps the lab only where Features:Lab is on.
          <EmptyState title={t('lab.offTitle')} mood="sleepy">
            {t('lab.offText')}
          </EmptyState>
        ) : (
          <Card role="alert">
            <ErrorNotice error={scenario.error} />
            <Button onClick={() => void scenario.refetch()} className="mt-4">
              {t('lab.retry')}
            </Button>
          </Card>
        ))}

      {scenario.isSuccess && (
        <>
          <Summary scenario={scenario.data} result={generate.data} />

          <SeedControls
            seedText={seedText ?? String(scenario.data.input.seed)}
            onSeedTextChange={setSeedText}
            pending={generate.isPending}
            onGenerate={(seed) => generate.mutate({ ...scenario.data.input, seed })}
          />

          {generate.isError && (
            <Card role="alert">
              <ErrorNotice error={generate.error} />
            </Card>
          )}

          <ScheduleGrid shifts={shifts} periodStart={periodOf(scenario.data)?.start} highlight={selected} />

          {generate.data && (
            <HoursTable
              members={scenario.data.input.members}
              summaries={generate.data.members}
              names={namesOf(scenario.data)}
            />
          )}

          {generate.data && (
            <IssuesPanel
              issues={generate.data.issues}
              shifts={shifts}
              names={namesOf(scenario.data)}
              selected={selected}
              onSelect={setPicked}
            />
          )}
        </>
      )}
    </section>
  );
}

// The seed decides every random choice, so the same seed gives the same schedule (FR-122). Generate
// uses the seed in the field; Generate again picks a new one, as the draft schedule does (1l).
function SeedControls({
  seedText,
  onSeedTextChange,
  pending,
  onGenerate,
}: {
  seedText: string;
  onSeedTextChange: (text: string) => void;
  pending: boolean;
  onGenerate: (seed: number) => void;
}) {
  const { t } = useTranslation();
  const seed = parseSeed(seedText);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-3">
        <TextField
          label={t('lab.seedLabel')}
          type="number"
          inputMode="numeric"
          step={1}
          value={seedText}
          onChange={(event) => onSeedTextChange(event.target.value)}
          error={seed === undefined ? t('lab.seedInvalid') : undefined}
          className="w-40"
        />
        <Button
          loading={pending}
          disabled={seed === undefined}
          onClick={() => seed !== undefined && onGenerate(seed)}
        >
          {pending ? t('lab.generating') : t('lab.generate')}
        </Button>
        <Button
          variant="white"
          disabled={pending}
          onClick={() => {
            const next = newSeed();
            onSeedTextChange(String(next));
            onGenerate(next);
          }}
        >
          {t('lab.generateAgain')}
        </Button>
      </div>
      <p className="text-sm text-muted">{t('lab.seedHint')}</p>
    </div>
  );
}

// A whole number the server's int can hold, or undefined.
function parseSeed(text: string): number | undefined {
  if (!/^-?\d+$/.test(text.trim())) return undefined;
  const seed = Number(text);
  return seed >= -2147483648 && seed <= 2147483647 ? seed : undefined;
}

function newSeed(): number {
  return Math.floor(Math.random() * 2147483647) + 1;
}

function Summary({ scenario, result }: { scenario: LabScenario; result: GeneratorResult | undefined }) {
  const { t, i18n } = useTranslation();
  const { input } = scenario;
  const period = periodOf(scenario);
  const names = namesOf(scenario);
  const notSent = input.members
    .filter((member) => !input.availability.some((entry) => entry.memberId === member.id && entry.submitted))
    .map((member) => names.get(member.id) ?? member.id);
  const slots = input.shifts.reduce((total, shift) => total + shift.headcount, 0);
  const hardRuleBreaks = result ? countHardRuleBreaks(result.issues) : 0;

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-bold">{scenario.name}</h2>
        <p className="text-sm text-muted">
          {[
            t('lab.people', { count: input.members.length }),
            t('lab.shifts', { count: input.shifts.length }),
            period && formatDateRange(period.start, period.end, i18n.language),
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
      {notSent.length > 0 && (
        <div className="rounded-field bg-surface-3 px-4 py-3 text-sm">
          <p className="text-muted">{t('lab.notSent')}</p>
          <p className="font-bold">{notSent.join(' · ')}</p>
        </div>
      )}
      {result && (
        <div role="status">
          <div className="flex flex-wrap gap-2">
            <StatusChip tone={result.assignments.length < slots ? 'warning' : 'success'}>
              {t('lab.filled', { filled: result.assignments.length, slots })}
            </StatusChip>
            {/* M1-03: the generator never breaks a hard rule; only a lock can (BR-004). */}
            <StatusChip tone={hardRuleBreaks === 0 ? 'success' : 'danger'}>
              {t('lab.hardRules', { count: hardRuleBreaks })}
            </StatusChip>
          </div>
          <p className="mt-2 text-sm text-muted">{t('lab.hardRulesHint')}</p>
          <p className="mt-2 font-bold">
            {t('lab.score', { score: formatNumber(result.score, i18n.language) })}
          </p>
          <p className="text-sm text-muted">{t('lab.scoreHint')}</p>
          <p className="mt-2 text-sm text-muted">{t('lab.seed', { seed: result.seed })}</p>
        </div>
      )}
    </Card>
  );
}

// From the first shift's date to the last one's; none for a scenario without shifts.
function periodOf(scenario: LabScenario): { start: string; end: string } | undefined {
  const dates = scenario.input.shifts.map((shift) => shift.date).sort();
  const [start, end] = [dates[0], dates.at(-1)];
  return start && end ? { start, end } : undefined;
}

// "Marc-Olivier Roy" -> "Marc-Olivier R.", as on the shift cards in the mockups.
function shortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return parts[0] ?? '';
  return `${parts[0]} ${parts.at(-1)?.charAt(0)}.`;
}

// Short names by member id.
function namesOf(scenario: LabScenario): Map<string, string> {
  return new Map(scenario.people.map((person) => [person.id, shortName(person.name)]));
}

function gridShifts(scenario: LabScenario, result: GeneratorResult | undefined): GridShift[] {
  const names = namesOf(scenario);
  const levels = new Map(scenario.input.members.map((member) => [member.id, member.level]));
  const assignments = result?.assignments ?? [];

  return scenario.input.shifts.map((shift) => ({
    id: shift.id,
    date: shift.date,
    start: shift.start,
    end: shift.end,
    headcount: shift.headcount,
    people: assignments
      .filter((assignment) => assignment.shiftId === shift.id)
      .map((assignment) => ({
        id: assignment.memberId,
        name: names.get(assignment.memberId) ?? assignment.memberId,
        level: levels.get(assignment.memberId) ?? 0,
      })),
  }));
}
