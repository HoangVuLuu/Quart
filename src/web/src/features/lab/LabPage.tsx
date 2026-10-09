import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorNotice } from '../../app/ErrorNotice';
import { formatDateRange, formatNumber } from '../../i18n/format';
import { ApiError } from '../../lib/api/client';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { EmptyState } from '../../ui/EmptyState';
import { PageHeader } from '../../ui/PageHeader';
import { Skeleton } from '../../ui/Skeleton';
import { StatusChip } from '../../ui/StatusChip';
import type { ScheduleIssue } from '../scheduling/components/issues';
import { IssuesPanel } from '../scheduling/components/IssuesPanel';
import { ScheduleGrid, type GridShift } from '../scheduling/components/ScheduleGrid';
import { useGenerate, usePresoteaScenario, type GeneratorResult, type LabScenario } from './useLab';

// The generator lab (M1-01, spec 7.8): the sample scenario as a schedule grid, and a button that runs
// the generator on it. Not in the mockups; it borrows the draft schedule's pattern (1l): the actions
// on top, then the week tabs and the shift cards. For the team only, on development and staging.
export function LabPage() {
  const { t } = useTranslation();
  const scenario = usePresoteaScenario();
  const generate = useGenerate();
  const [picked, setPicked] = useState<ScheduleIssue>();
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

          <div className="flex flex-wrap items-center gap-3">
            <Button loading={generate.isPending} onClick={() => generate.mutate(scenario.data.input)}>
              {generate.isPending ? t('lab.generating') : t('lab.generate')}
            </Button>
            {/* M1-01's generator is naive on purpose; say so, so nobody judges the generator by it. */}
            <p className="text-sm text-muted">{t('lab.naiveHint')}</p>
          </div>

          {generate.isError && (
            <Card role="alert">
              <ErrorNotice error={generate.error} />
            </Card>
          )}

          <ScheduleGrid shifts={shifts} periodStart={periodOf(scenario.data)?.start} highlight={selected} />

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

function Summary({ scenario, result }: { scenario: LabScenario; result: GeneratorResult | undefined }) {
  const { t, i18n } = useTranslation();
  const { input } = scenario;
  const period = periodOf(scenario);
  const names = namesOf(scenario);
  const notSent = input.members
    .filter((member) => !input.availability.some((entry) => entry.memberId === member.id && entry.submitted))
    .map((member) => names.get(member.id) ?? member.id);
  const slots = input.shifts.reduce((total, shift) => total + shift.headcount, 0);

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
          <StatusChip tone={result.assignments.length < slots ? 'warning' : 'success'}>
            {t('lab.filled', { filled: result.assignments.length, slots })}
          </StatusChip>
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
