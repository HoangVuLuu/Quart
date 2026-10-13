import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { cx } from '../../ui/cx';
import { Select } from '../../ui/Select';
import { Switch } from '../../ui/Switch';
import { kindsById, shortTime } from '../scheduling/components/schedule-grid';
import { gridShifts, namesOf } from './lab';
import { addPair, blocksOf, removePair, setFairness, setMaxConsecutive } from './scenario';
import type { LabScenario } from './useLab';

type RulesEditorProps = {
  scenario: LabScenario;
  onChange: (scenario: LabScenario) => void;
};

const limits = [1, 2, 3, 4, null] as const;
const everyBlock = '*';

// The workplace's scheduling rules for the scenario: shifts in a row as pills (1k3, BR-005), the two
// fairness switches (BR-020), and "cannot work together" pairs per shift block with an every-block
// choice, as "Apply to all" does in 1k5 (BR-036).
export function RulesEditor({ scenario, onChange }: RulesEditorProps) {
  const { t } = useTranslation();
  const { rules } = scenario.input;

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-lg font-bold">{t('lab.rules.title')}</h2>

      <fieldset>
        <legend className="font-bold">{t('lab.rules.maxInARow')}</legend>
        <p className="mb-2 text-sm text-muted">{t('lab.rules.maxHint')}</p>
        <div className="flex flex-wrap gap-2">
          {limits.map((limit) => {
            const checked = rules.maxConsecutiveShifts === limit;
            return (
              <label
                key={limit ?? 'none'}
                className={cx(
                  'flex min-h-11 min-w-12 cursor-pointer items-center justify-center rounded-pill px-4 font-bold shadow-press has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-link',
                  checked ? 'bg-ink text-bg' : 'bg-surface-3 text-ink',
                )}
              >
                <input
                  type="radio"
                  name="max-in-a-row"
                  checked={checked}
                  onChange={() => onChange(setMaxConsecutive(scenario, limit))}
                  className="sr-only"
                />
                {limit ?? t('lab.rules.noLimit')}
              </label>
            );
          })}
        </div>
      </fieldset>

      <Switch
        label={t('lab.rules.openingFairness')}
        description={t('lab.rules.fairnessHint')}
        checked={rules.openingFairness}
        onCheckedChange={(openingFairness) => onChange(setFairness(scenario, { openingFairness }))}
      />
      <Switch
        label={t('lab.rules.closingFairness')}
        description={t('lab.rules.fairnessHint')}
        checked={rules.closingFairness}
        onCheckedChange={(closingFairness) => onChange(setFairness(scenario, { closingFairness }))}
      />

      <Pairs scenario={scenario} onChange={onChange} />
    </Card>
  );
}

function Pairs({ scenario, onChange }: RulesEditorProps) {
  const { t } = useTranslation();
  const names = namesOf(scenario);
  const members = scenario.input.members;
  const blocks = blocksOf(scenario);
  const kinds = kindsById(gridShifts(scenario, undefined));
  const blockName = (blockId: string) => {
    const block = blocks.find((b) => b.id === blockId);
    if (!block) return blockId;
    return `${t(`scheduling.kind.${kinds.get(block.shiftId) ?? 'mid'}`)} ${shortTime(block.start)}–${shortTime(block.end)}`;
  };
  const name = (id: string) => names.get(id) ?? id;
  const [first, setFirst] = useState(members[0]?.id ?? '');
  const [second, setSecond] = useState(members[1]?.id ?? '');
  const [block, setBlock] = useState(everyBlock);
  // Choices may point at someone removed since; fall back to the first people left.
  const a = members.some((m) => m.id === first) ? first : (members[0]?.id ?? '');
  const b = members.some((m) => m.id === second) ? second : (members.find((m) => m.id !== a)?.id ?? '');

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="font-bold">{t('lab.rules.pairs')}</h3>
        <p className="text-sm text-muted">{t('lab.rules.pairsHint')}</p>
      </div>
      {scenario.input.conflictPairs.length === 0 ? (
        <p className="text-sm text-muted">{t('lab.rules.noPairs')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {scenario.input.conflictPairs.map((pair) => (
            <li
              key={`${pair.blockId}|${pair.memberA}|${pair.memberB}`}
              className="flex items-center gap-3 rounded-field bg-surface-3 py-2 pr-2 pl-4 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="font-bold">
                  {t('lab.rules.pairLine', { first: name(pair.memberA), second: name(pair.memberB) })}
                </p>
                <p className="text-xs text-muted">{blockName(pair.blockId)}</p>
              </div>
              <button
                type="button"
                aria-label={t('lab.rules.removePair', {
                  first: name(pair.memberA),
                  second: name(pair.memberB),
                })}
                onClick={() => onChange(removePair(scenario, pair))}
                className="flex size-11 flex-none items-center justify-center rounded-full bg-danger-soft font-bold text-danger"
              >
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <Select label={t('lab.rules.first')} value={a} onChange={(event) => setFirst(event.target.value)}>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {name(member.id)}
            </option>
          ))}
        </Select>
        <Select label={t('lab.rules.second')} value={b} onChange={(event) => setSecond(event.target.value)}>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {name(member.id)}
            </option>
          ))}
        </Select>
        <Select label={t('lab.rules.block')} value={block} onChange={(event) => setBlock(event.target.value)}>
          <option value={everyBlock}>{t('lab.rules.allBlocks')}</option>
          {blocks.map((option) => (
            <option key={option.id} value={option.id}>
              {blockName(option.id)}
            </option>
          ))}
        </Select>
      </div>
      <Button
        variant="white"
        className="self-start"
        disabled={a === '' || b === '' || a === b}
        onClick={() =>
          onChange(
            addPair(scenario, block === everyBlock ? blocks.map((option) => option.id) : [block], a, b),
          )
        }
      >
        {t('lab.rules.addPair')}
      </Button>
    </div>
  );
}
