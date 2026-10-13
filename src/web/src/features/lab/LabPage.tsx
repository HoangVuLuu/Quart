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
import { Switch } from '../../ui/Switch';
import { countHardRuleBreaks, type ScheduleIssue } from '../scheduling/components/issues';
import { IssuesPanel } from '../scheduling/components/IssuesPanel';
import { ScheduleGrid } from '../scheduling/components/ScheduleGrid';
import { HoursTable } from './HoursTable';
import { gridShifts, namesOf, periodOf } from './lab';
import { SeedControls } from './SeedControls';
import { useGenerate, usePresoteaScenario, type GeneratorResult, type LabScenario } from './useLab';

// The generator lab (M1-01, spec 7.8): the sample scenario as a schedule grid, and a button that runs
// the generator on it. Not in the mockups; it borrows the draft schedule's pattern (1l): the actions
// on top, then the week tabs and the shift cards. For the team only, on development and staging.
export function LabPage() {
  const { t } = useTranslation();
  const scenario = usePresoteaScenario();

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

      {scenario.isSuccess && <Lab sample={scenario.data} />}
    </section>
  );
}

// The lab once the sample is here. `scenario` is the lab's own copy, which the rule switches (and the
// scenario editor) change; `ran` is the scenario as it was when Generate last ran, so the grid, the
// tables and the issues always describe the same people and shifts as the result.
function Lab({ sample }: { sample: LabScenario }) {
  const { t } = useTranslation();
  const generate = useGenerate();
  const [scenario, setScenario] = useState(sample);
  const [ran, setRan] = useState<LabScenario>();
  const [picked, setPicked] = useState<ScheduleIssue>();
  const [seedText, setSeedText] = useState(String(sample.input.seed));
  const result = generate.data;
  const shown = (result && ran) ?? scenario;
  // An issue from an earlier generation is not one of the current result's.
  const selected = picked && result?.issues.includes(picked) ? picked : undefined;
  const shifts = gridShifts(shown, result);
  const names = namesOf(shown);

  const run = (seed: number) => {
    const next = { ...scenario, input: { ...scenario.input, seed } };
    setRan(next);
    generate.mutate(next.input);
  };
  const setRules = (rules: Partial<LabScenario['input']['rules']>) =>
    setScenario((current) => ({
      ...current,
      input: { ...current.input, rules: { ...current.input.rules, ...rules } },
    }));

  return (
    <>
      <Summary scenario={scenario} ran={ran} result={result} />

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">{t('lab.rules.title')}</h2>
        {/* BR-020: two independent switches. */}
        <Switch
          label={t('lab.rules.openingFairness')}
          description={t('lab.rules.fairnessHint')}
          checked={scenario.input.rules.openingFairness}
          onCheckedChange={(openingFairness) => setRules({ openingFairness })}
        />
        <Switch
          label={t('lab.rules.closingFairness')}
          description={t('lab.rules.fairnessHint')}
          checked={scenario.input.rules.closingFairness}
          onCheckedChange={(closingFairness) => setRules({ closingFairness })}
        />
      </Card>

      <SeedControls
        seedText={seedText}
        onSeedTextChange={setSeedText}
        pending={generate.isPending}
        onGenerate={run}
      />

      {generate.isError && (
        <Card role="alert">
          <ErrorNotice error={generate.error} />
        </Card>
      )}

      <ScheduleGrid shifts={shifts} periodStart={periodOf(shown)?.start} highlight={selected} />

      {result && <HoursTable members={shown.input.members} summaries={result.members} names={names} />}

      {result && (
        <IssuesPanel
          issues={result.issues}
          shifts={shifts}
          names={names}
          selected={selected}
          onSelect={setPicked}
        />
      )}
    </>
  );
}

function Summary({
  scenario,
  ran,
  result,
}: {
  scenario: LabScenario;
  ran: LabScenario | undefined;
  result: GeneratorResult | undefined;
}) {
  const { t, i18n } = useTranslation();
  const { input } = scenario;
  const period = periodOf(scenario);
  const names = namesOf(scenario);
  const notSent = input.members
    .filter((member) => !input.availability.some((entry) => entry.memberId === member.id && entry.submitted))
    .map((member) => names.get(member.id) ?? member.id);
  const slots = (ran ?? scenario).input.shifts.reduce((total, shift) => total + shift.headcount, 0);
  const hardRuleBreaks = result ? countHardRuleBreaks(result.issues) : 0;
  const changed = result !== undefined && ran !== undefined && !sameInput(ran, scenario);
  const number = (value: number) => formatNumber(value, i18n.language);

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
          <p className="mt-2 font-bold">{t('lab.score', { score: number(result.score) })}</p>
          {/* M1-05: what local search added to the greedy schedule. */}
          <p className="text-sm text-muted">
            {t('lab.scoreBefore', { score: number(result.constructionScore) })}
          </p>
          <p className="text-sm text-muted">{t('lab.scoreHint')}</p>
          <p className="mt-2 text-sm text-muted">{t('lab.seed', { seed: result.seed })}</p>
          {changed && <p className="mt-2 text-sm font-bold text-warning">{t('lab.changedSinceRun')}</p>}
        </div>
      )}
    </Card>
  );
}

// The seed is not part of the scenario: a new seed alone does not make the result stale.
function sameInput(a: LabScenario, b: LabScenario): boolean {
  return (
    JSON.stringify({ ...a, input: { ...a.input, seed: 0 } }) ===
    JSON.stringify({ ...b, input: { ...b.input, seed: 0 } })
  );
}
