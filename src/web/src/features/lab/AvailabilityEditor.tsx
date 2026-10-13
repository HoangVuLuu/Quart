import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Select } from '../../ui/Select';
import { Switch } from '../../ui/Switch';
import { ScheduleGrid } from '../scheduling/components/ScheduleGrid';
import { gridShifts, namesOf, periodOf } from './lab';
import { hasSubmitted, isAvailable, setAllAvailability, toggleAvailability, updatePerson } from './scenario';
import type { LabScenario } from './useLab';

type AvailabilityEditorProps = {
  scenario: LabScenario;
  onChange: (scenario: LabScenario) => void;
};

// One person's availability at a time (M1-06): choose them, then tap the shifts they can work, on the
// same grid the schedule uses, in its availability mode (1e, FR-093). Taps only, no dragging (NFR-002).
export function AvailabilityEditor({ scenario, onChange }: AvailabilityEditorProps) {
  const { t } = useTranslation();
  const names = namesOf(scenario);
  const members = scenario.input.members;
  const [chosen, setChosen] = useState(members[0]?.id);
  // The person chosen may have been removed in the people editor.
  const personId = members.some((member) => member.id === chosen) ? chosen : members[0]?.id;
  if (!personId) return null;

  const name = names.get(personId) ?? personId;
  const marked = scenario.input.shifts.filter((shift) => isAvailable(scenario, personId, shift.id)).length;
  const sent = hasSubmitted(scenario, personId);

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-bold">{t('lab.availability.title')}</h2>
        <p className="text-sm text-muted">{t('lab.availability.hint')}</p>
      </div>
      <Select
        label={t('lab.availability.person')}
        value={personId}
        onChange={(event) => setChosen(event.target.value)}
      >
        {members.map((member) => (
          <option key={member.id} value={member.id}>
            {names.get(member.id) ?? member.id}
          </option>
        ))}
      </Select>
      {!sent && (
        <div className="flex flex-col gap-2 rounded-field bg-warning-soft p-3 text-sm font-bold text-warning">
          <p>{t('lab.availability.notSent', { name })}</p>
          <Switch
            label={t('lab.team.submitted')}
            checked={sent}
            onCheckedChange={(submitted) => onChange(updatePerson(scenario, personId, { submitted }))}
          />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <p role="status" className="flex-1 text-sm text-muted">
          {t('lab.availability.count', { count: marked })}
        </p>
        <Button
          variant="white"
          className="min-h-11 px-4"
          onClick={() => onChange(setAllAvailability(scenario, personId, true))}
        >
          {t('lab.availability.all')}
        </Button>
        <Button
          variant="white"
          className="min-h-11 px-4"
          onClick={() => onChange(setAllAvailability(scenario, personId, false))}
        >
          {t('lab.availability.none')}
        </Button>
      </div>
      <ScheduleGrid
        shifts={gridShifts(scenario, undefined)}
        periodStart={periodOf(scenario)?.start}
        availability={{
          isAvailable: (shiftId) => isAvailable(scenario, personId, shiftId),
          onToggle: (shiftId) => onChange(toggleAvailability(scenario, personId, shiftId)),
        }}
      />
    </Card>
  );
}
