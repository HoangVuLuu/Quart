import { useTranslation } from 'react-i18next';
import type { components } from '../../lib/api/schema';
import { cx } from '../../ui/cx';

type Person = components['schemas']['SchedulePerson'];

/**
 * A person's name on a shift. Red when the manager marked them as starting earlier (Hoang, 2026-11-25); the
 * screen never says why, but a screen reader hears it, since colour alone reaches nobody who cannot see it.
 */
export function PersonName({ person, className }: { person: Person; className?: string }) {
  const { t } = useTranslation();
  return (
    <span className={cx(person.startsEarly && 'text-danger', className)}>
      {person.name ?? t('team.former')}
      {person.startsEarly && <span className="sr-only"> ({t('schedule.startsEarly')})</span>}
    </span>
  );
}

/** Everyone on the shift, the viewer included, "Tony, Selma" (Hoang, 2026-11-25: both names, not "With …"). */
export function ShiftNames({ people }: { people: Person[] }) {
  return (
    <>
      {people.map((person, index) => (
        <span key={person.membershipId}>
          {index > 0 && ', '}
          <PersonName person={person} />
        </span>
      ))}
    </>
  );
}
