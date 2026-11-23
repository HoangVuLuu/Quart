import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../ui/Button';
import { Select } from '../../ui/Select';
import { Stepper } from '../../ui/Stepper';
import { useMembers } from '../team/data';
import type { Pair, Requirement } from './model';

// The rules of one shift, shared by the weekly shift sheet in Edit Generator and the new-shift pop-up of
// "Edit a specific day" (M3-02, M3-03, M4-01).

/** "Requires at least N of level L or above", counted inside the people needed (FR-065). */
export function LevelRuleField({
  headcount,
  requirements,
  onChange,
}: {
  headcount: number;
  requirements: Requirement[];
  onChange: (requirements: Requirement[]) => void;
}) {
  const { t } = useTranslation();
  const requirement = requirements[0];
  return (
    <div className="flex flex-col gap-2">
      <Stepper
        label={t('generator.block.atLeast')}
        description={t('generator.block.atLeastText')}
        value={requirement?.minCount ?? 0}
        min={0}
        max={headcount}
        onChange={(minCount) =>
          onChange(minCount === 0 ? [] : [{ level: requirement?.level ?? 3, minCount }])
        }
      />
      {requirement && (
        <Select
          label={t('generator.block.level')}
          value={requirement.level}
          onChange={(event) =>
            onChange([{ level: Number(event.target.value), minCount: requirement.minCount }])
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
  );
}

/** "Cannot work together": pairs the generator never puts on the shift together (BR-036). */
export function PairsField({ pairs, onChange }: { pairs: Pair[]; onChange: (pairs: Pair[]) => void }) {
  const { t } = useTranslation();
  const members = useMembers().data ?? [];
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const nameOf = (membershipId: string) =>
    members.find((member) => member.membershipId === membershipId)?.displayName ?? '?';
  const pairExists = pairs.some(
    (pair) =>
      (pair.membershipA === first && pair.membershipB === second) ||
      (pair.membershipA === second && pair.membershipB === first),
  );
  return (
    <div>
      <h3 className="text-[17px]">{t('generator.block.pairs')}</h3>
      <p className="mb-2 text-sm text-muted">{t('generator.block.pairsText')}</p>
      <ul className="mb-2 flex flex-col gap-2">
        {pairs.map((pair) => (
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
              onClick={() => onChange(pairs.filter((other) => other !== pair))}
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
          onChange([...pairs, { membershipA: first, membershipB: second }]);
          setFirst('');
          setSecond('');
        }}
      >
        {t('generator.block.addPair')}
      </Button>
    </div>
  );
}
