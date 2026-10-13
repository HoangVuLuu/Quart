import { useTranslation } from 'react-i18next';
import { ApiError } from '../../lib/api/client';
import { Card } from '../../ui/Card';
import type { LabScenario } from './useLab';

// What the server found wrong with the scenario on Generate (M1-06): each problem's code translated
// (FR-263) next to where it is. A path into a person says their name, so "members[3].maxWeeklyHours"
// reads "Léa B. · maxWeeklyHours". Other errors fall back to the generic notice.
export function ValidationErrors({ error, scenario }: { error: unknown; scenario: LabScenario }) {
  const { t, i18n } = useTranslation();
  if (!(error instanceof ApiError) || error.errors.length === 0) return null;

  const problem = (code: string) => {
    const key = `lab.validation.codes.${code}`;
    return i18n.exists(key) ? t(key as 'lab.validation.unknown') : t('lab.validation.unknown', { code });
  };

  return (
    <Card role="alert" className="flex flex-col gap-2">
      <h2 className="text-lg font-bold text-danger">{t('lab.validation.title')}</h2>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
        {error.errors.map((item, index) => (
          <li key={index}>
            {t('lab.validation.item', {
              where: describePath(item.path, scenario),
              problem: problem(item.code),
            })}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function describePath(path: string, scenario: LabScenario): string {
  const match = /^members\[(\d+)\]\.?(.*)$/.exec(path);
  const member = match ? scenario.input.members[Number(match[1])] : undefined;
  if (!match || !member) return path;
  const name = scenario.people.find((person) => person.id === member.id)?.name || member.id;
  return match[2] ? `${name} · ${match[2]}` : name;
}
