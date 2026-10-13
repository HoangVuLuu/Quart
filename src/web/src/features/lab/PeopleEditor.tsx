import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatNumber } from '../../i18n/format';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { cx } from '../../ui/cx';
import { Sheet } from '../../ui/Sheet';
import { Switch } from '../../ui/Switch';
import { TextField } from '../../ui/TextField';
import {
  addPerson,
  hasSubmitted,
  maxPeople,
  removePerson,
  updatePerson,
  type PersonChanges,
} from './scenario';
import type { LabScenario } from './useLab';

type PeopleEditorProps = {
  scenario: LabScenario;
  onChange: (scenario: LabScenario) => void;
};

// The people of the scenario (M1-06): a row each with an Edit button, as the admin's team list (1x),
// and a bottom sheet to change one person, as the edit-level sheet (1z) with the hours added.
export function PeopleEditor({ scenario, onChange }: PeopleEditorProps) {
  const { t, i18n } = useTranslation();
  const [editing, setEditing] = useState<string>();
  const names = new Map(scenario.people.map((person) => [person.id, person.name]));
  const full = scenario.input.members.length >= maxPeople;
  const number = (value: number) => formatNumber(value, i18n.language);

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-bold">{t('lab.team.title')}</h2>
        <p className="text-sm text-muted">{t('lab.team.hint')}</p>
      </div>
      <ul className="flex flex-col gap-2">
        {scenario.input.members.map((member) => {
          const name = names.get(member.id) || member.id;
          return (
            <li key={member.id} className="flex items-center gap-3 rounded-field bg-surface-3 py-2 pr-2 pl-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{name}</p>
                <p className="text-xs text-muted">
                  {member.maxWeeklyHours === null || member.maxWeeklyHours === undefined
                    ? t('lab.team.line', { level: member.level, desired: number(member.desiredWeeklyHours) })
                    : t('lab.team.lineMax', {
                        level: member.level,
                        desired: number(member.desiredWeeklyHours),
                        max: number(member.maxWeeklyHours),
                      })}
                  {!hasSubmitted(scenario, member.id) && (
                    <span className="font-bold text-warning"> · {t('lab.team.notSent')}</span>
                  )}
                </p>
              </div>
              <Sheet
                open={editing === member.id}
                onOpenChange={(open) => setEditing(open ? member.id : undefined)}
                title={t('lab.team.sheetTitle')}
                description={name}
                trigger={
                  <Button aria-label={t('lab.team.editLabel', { name })} className="min-h-11 px-4">
                    {t('lab.team.edit')}
                  </Button>
                }
              >
                <PersonForm
                  name={names.get(member.id) ?? ''}
                  level={member.level}
                  desired={member.desiredWeeklyHours}
                  max={member.maxWeeklyHours ?? undefined}
                  submitted={hasSubmitted(scenario, member.id)}
                  onSave={(changes) => {
                    onChange(updatePerson(scenario, member.id, changes));
                    setEditing(undefined);
                  }}
                  onRemove={() => {
                    onChange(removePerson(scenario, member.id));
                    setEditing(undefined);
                  }}
                />
              </Sheet>
            </li>
          );
        })}
      </ul>
      <Button
        variant="white"
        disabled={full}
        className="self-start"
        onClick={() => {
          const added = addPerson(scenario, t('lab.team.newName'));
          onChange(added.scenario);
          setEditing(added.id);
        }}
      >
        {t('lab.team.add')}
      </Button>
      {full && <p className="text-sm text-muted">{t('lab.team.full', { max: maxPeople })}</p>}
    </Card>
  );
}

type PersonFormProps = {
  name: string;
  level: number;
  desired: number;
  max: number | undefined;
  submitted: boolean;
  onSave: (changes: PersonChanges) => void;
  onRemove: () => void;
};

// The sheet's form. It mounts each time the sheet opens, so it always starts from the saved values.
function PersonForm({ name, level, desired, max, submitted, onSave, onRemove }: PersonFormProps) {
  const { t } = useTranslation();
  const [nameText, setNameText] = useState(name);
  const [levelValue, setLevelValue] = useState(level);
  const [desiredText, setDesiredText] = useState(String(desired));
  const [maxText, setMaxText] = useState(max === undefined ? '' : String(max));
  const [sent, setSent] = useState(submitted);
  const desiredHours = parseHours(desiredText);
  const maxHours = maxText.trim() === '' ? null : parseHours(maxText);
  const valid = nameText.trim() !== '' && desiredHours !== undefined && maxHours !== undefined;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return;
        onSave({
          name: nameText.trim(),
          level: levelValue,
          desiredWeeklyHours: desiredHours,
          maxWeeklyHours: maxHours,
          submitted: sent,
        });
      }}
    >
      <TextField
        label={t('lab.team.name')}
        value={nameText}
        onChange={(event) => setNameText(event.target.value)}
        error={nameText.trim() === '' ? t('lab.team.nameRequired') : undefined}
        autoComplete="off"
      />
      {/* Levels as full-width choices, as in 1z. Native radios, so arrow keys work (NFR-007). */}
      <fieldset>
        <legend className="mb-1.5 text-xs font-bold tracking-[0.06em] text-muted uppercase">
          {t('lab.team.levelGroup')}
        </legend>
        <div className="flex flex-col gap-2">
          {[1, 2, 3].map((value) => (
            <label
              key={value}
              className={cx(
                'flex min-h-12 cursor-pointer items-center justify-between rounded-pill px-5 font-bold shadow-press has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-link',
                levelValue === value ? 'bg-ink text-bg' : 'bg-surface text-ink',
              )}
            >
              <input
                type="radio"
                name="level"
                value={value}
                checked={levelValue === value}
                onChange={() => setLevelValue(value)}
                className="sr-only"
              />
              {t('scheduling.level', { level: value })}
              {levelValue === value && <span aria-hidden="true">✓</span>}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label={t('lab.team.desired')}
          type="number"
          inputMode="decimal"
          min={0}
          max={168}
          step="any"
          value={desiredText}
          onChange={(event) => setDesiredText(event.target.value)}
          error={desiredHours === undefined ? t('lab.team.hoursInvalid') : undefined}
        />
        <TextField
          label={t('lab.team.max')}
          type="number"
          inputMode="decimal"
          min={0}
          max={168}
          step="any"
          value={maxText}
          onChange={(event) => setMaxText(event.target.value)}
          error={maxHours === undefined ? t('lab.team.hoursInvalid') : undefined}
        />
      </div>
      <p className="-mt-2 text-xs text-muted">{t('lab.team.maxHint')}</p>
      <Switch
        label={t('lab.team.submitted')}
        description={t('lab.team.submittedHint')}
        checked={sent}
        onCheckedChange={setSent}
      />
      <Button type="submit" disabled={!valid} className="w-full">
        {t('lab.team.save')}
      </Button>
      <Button type="button" variant="danger" onClick={onRemove} className="w-full">
        {t('lab.team.remove')}
      </Button>
    </form>
  );
}

// Hours a week: a number from 0 to 168, or undefined when the text is not one.
function parseHours(text: string): number | undefined {
  if (text.trim() === '') return undefined;
  const hours = Number(text);
  return Number.isFinite(hours) && hours >= 0 && hours <= 168 ? hours : undefined;
}
