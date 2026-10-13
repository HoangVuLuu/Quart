import { useTranslation } from 'react-i18next';
import { formatNumber } from '../../i18n/format';
import { Card } from '../../ui/Card';
import { cx } from '../../ui/cx';
import type { GeneratorInput, MemberSummary } from './useLab';

type HoursTableProps = {
  members: GeneratorInput['members'];
  /** The evaluator's totals per member, from the result (one rulebook, AD-002). */
  summaries: MemberSummary[];
  /** Short names by member id. */
  names: Map<string, string>;
};

// Hours per person as assigned/desired (M1-04): one column per week, as the shift panel's counter will
// show them (FR-141), then the period against its target. Off target by more than 2 hours (BR-033) is
// written in bold with a word, not only a colour (NFR-008). Then openings and closings worked against
// each person's fair share (M1-05, BR-022), which the evaluator works out. A wide period scrolls inside
// the card, so the page itself never scrolls sideways at 390 px.
export function HoursTable({ members, summaries, names }: HoursTableProps) {
  const { t, i18n } = useTranslation();
  const number = (value: number) => formatNumber(value, i18n.language);
  const byId = new Map(summaries.map((summary) => [summary.memberId, summary]));
  const weeks = summaries[0]?.weeklyHours.length ?? 0;

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-bold">{t('lab.hours.title')}</h2>
        <p className="text-sm text-muted">{t('lab.hours.hint')}</p>
      </div>
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full border-separate border-spacing-y-1 text-left text-sm">
          <thead>
            <tr className="text-xs text-muted">
              <th scope="col" className="sticky left-0 bg-surface py-1 pr-3 font-bold">
                {t('lab.hours.person')}
              </th>
              {Array.from({ length: weeks }, (_, week) => (
                <th key={week} scope="col" className="px-2 py-1 text-right font-bold whitespace-nowrap">
                  {t('scheduling.grid.week', { number: week + 1 })}
                </th>
              ))}
              <th scope="col" className="py-1 pl-2 text-right font-bold whitespace-nowrap">
                {t('lab.hours.period')}
              </th>
              <th scope="col" className="px-2 py-1 text-right font-bold whitespace-nowrap">
                {t('lab.hours.openings')}
              </th>
              <th scope="col" className="py-1 pr-3 pl-2 text-right font-bold whitespace-nowrap">
                {t('lab.hours.closings')}
              </th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => {
              const summary = byId.get(member.id);
              if (!summary) return null;
              const gap = summary.hours - summary.targetHours;
              const off = Math.abs(gap) > 2;
              return (
                <tr key={member.id} className="bg-surface-3">
                  <th
                    scope="row"
                    className="sticky left-0 max-w-36 truncate rounded-l-field bg-surface-3 py-2 pr-3 pl-3 font-bold"
                  >
                    {names.get(member.id) ?? member.id}
                  </th>
                  {summary.weeklyHours.map((hours, week) => (
                    <td key={week} className="px-2 py-2 text-right whitespace-nowrap tabular-nums">
                      {t('lab.hours.cell', {
                        hours: number(hours),
                        desired: number(member.desiredWeeklyHours),
                      })}
                    </td>
                  ))}
                  <td
                    className={cx(
                      'py-2 pl-2 text-right whitespace-nowrap tabular-nums',
                      off && 'font-bold text-warning',
                    )}
                  >
                    {t('lab.hours.cell', {
                      hours: number(summary.hours),
                      desired: number(summary.targetHours),
                    })}
                    {off && (
                      <span className="block text-xs">
                        {gap < 0 ? t('lab.hours.under') : t('lab.hours.over')}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right whitespace-nowrap tabular-nums">
                    {t('lab.hours.fairCell', {
                      actual: number(summary.openings),
                      expected: number(summary.expectedOpenings),
                    })}
                  </td>
                  <td className="rounded-r-field py-2 pr-3 pl-2 text-right whitespace-nowrap tabular-nums">
                    {t('lab.hours.fairCell', {
                      actual: number(summary.closings),
                      expected: number(summary.expectedClosings),
                    })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
