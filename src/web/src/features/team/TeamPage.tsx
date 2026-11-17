import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SubPage } from '../../app/SubPage';
import { messageKeyFor } from '../../i18n/errors';
import { api, unwrap, type Schemas } from '../../lib/api/client';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { cx } from '../../ui/cx';
import { Dialog } from '../../ui/Dialog';
import { Sheet } from '../../ui/Sheet';
import { Skeleton } from '../../ui/Skeleton';
import { Stepper } from '../../ui/Stepper';
import { Switch } from '../../ui/Switch';
import { FormError } from '../identity/FormError';
import { useRefreshWorkplace } from '../scheduling/data';
import { useWorkplace } from '../workplaces/workplace';
import { useMembers } from './data';

type Member = Schemas['MemberView'];

// The same handful of colours as the mockups' avatars, picked from the name so a person keeps theirs.
const avatarColours = ['bg-primary', 'bg-opening', 'bg-accent', 'bg-closing', 'bg-milk-tea'];

export function Avatar({ name, className }: { name: string; className?: string }) {
  const colour =
    avatarColours[[...name].reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % avatarColours.length];
  return (
    <span
      aria-hidden="true"
      className={cx(
        'flex size-12 shrink-0 items-center justify-center rounded-full text-lg font-bold text-on-primary',
        colour,
        className,
      )}
    >
      {name[0]?.toUpperCase()}
    </span>
  );
}

// Mockups 1w (everyone) and 1x, 1z (admins get Edit). Coworkers see a name, a role and a level, nothing
// else (FR-040). The optional social links arrive with the rest of M2-18.
export function TeamPage() {
  const { t } = useTranslation();
  const { view, can } = useWorkplace();
  const members = useMembers();
  const [editing, setEditing] = useState<Member | null>(null);
  if (members.error) throw members.error;

  return (
    <SubPage
      backTo="/"
      title={t('team.title')}
      context={t('team.context', { count: view.memberCount, workplace: view.name })}
    >
      {!members.data && <Skeleton className="h-64" />}
      <ul className="flex flex-col gap-3">
        {members.data?.map((member) => (
          <li key={member.membershipId}>
            <Card className="flex items-center gap-3 p-4">
              <Avatar name={member.displayName} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[17px] font-bold">
                  {member.displayName}
                  {member.isMe && <span className="text-sm font-bold text-muted"> · {t('team.you')}</span>}
                </p>
                <p className="text-sm text-muted">
                  {member.role === 'employee'
                    ? t('team.barista', { level: member.level })
                    : `${t(`roles.${member.role as 'owner' | 'admin'}`)} · ${t('scheduling.level', { level: member.level })}`}
                </p>
              </div>
              {can('ManageLevels') && (
                <Button
                  className="min-h-11 px-4 text-sm"
                  aria-label={t('team.editNamed', { name: member.displayName })}
                  onClick={() => setEditing(member)}
                >
                  {t('team.edit')}
                </Button>
              )}
            </Card>
          </li>
        ))}
      </ul>
      {editing && <EditMember member={editing} onClose={() => setEditing(null)} />}
    </SubPage>
  );
}

/** Mockup 1z, plus what the generator needs to know about each person: hours wanted and whether they work shifts (M2-12). */
function EditMember({ member, onClose }: { member: Member; onClose: () => void }) {
  const { t } = useTranslation();
  const { id, can } = useWorkplace();
  const refresh = useRefreshWorkplace();
  const [level, setLevel] = useState(member.level);
  const [hours, setHours] = useState(member.desiredWeeklyHours ?? 0);
  const [worksShifts, setWorksShifts] = useState(member.worksShifts ?? true);
  const [removing, setRemoving] = useState(false);
  const path = { workplaceId: id, membershipId: member.membershipId };
  const save = useMutation({
    mutationFn: () =>
      unwrap(
        api.PATCH('/api/workplaces/{workplaceId}/members/{membershipId}', {
          params: { path },
          body: {
            level,
            desiredWeeklyHours: hours,
            worksShifts,
            maxWeeklyHours: null,
            clearMaxWeeklyHours: null,
          },
        }),
      ),
    onSuccess: async () => {
      await refresh();
      onClose();
    },
  });
  const remove = useMutation({
    mutationFn: () =>
      unwrap(api.DELETE('/api/workplaces/{workplaceId}/members/{membershipId}', { params: { path } })),
    onSuccess: async () => {
      await refresh();
      onClose();
    },
  });
  const error = save.error ?? remove.error;

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('team.sheet.title')}
      description={member.displayName}
    >
      <div role="radiogroup" aria-label={t('team.sheet.level')} className="flex flex-col gap-2">
        {[1, 2, 3].map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={level === value}
            onClick={() => setLevel(value)}
            className={cx(
              'flex min-h-12 items-center justify-between rounded-field px-4 text-left font-bold shadow-press',
              level === value ? 'bg-ink text-bg' : 'bg-surface text-ink',
            )}
          >
            {t('scheduling.level', { level: value })}
            {level === value && <span aria-hidden="true">✓</span>}
          </button>
        ))}
      </div>
      <div className="mt-4 flex flex-col gap-2">
        <Switch
          label={t('team.sheet.worksShifts')}
          description={t('team.sheet.worksShiftsText')}
          checked={worksShifts}
          onCheckedChange={setWorksShifts}
        />
        {worksShifts && (
          <Stepper
            label={t('team.sheet.hours')}
            description={t('team.sheet.hoursText')}
            value={hours}
            min={0}
            max={60}
            onChange={setHours}
          />
        )}
      </div>
      <FormError message={error ? t(messageKeyFor(error)) : undefined} />
      <Button className="mt-4 w-full" loading={save.isPending} onClick={() => save.mutate()}>
        {t('team.sheet.save')}
      </Button>
      {can('ManageMembers') && !member.isMe && member.role !== 'owner' && (
        <Button variant="danger" className="mt-3 w-full" onClick={() => setRemoving(true)}>
          {t('team.sheet.remove')}
        </Button>
      )}
      <Dialog
        open={removing}
        onOpenChange={setRemoving}
        title={t('team.remove.title', { name: member.displayName })}
        description={t('team.remove.text')}
      >
        <div className="flex flex-col gap-2">
          <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
            {t('team.remove.confirm')}
          </Button>
          <Button variant="white" onClick={() => setRemoving(false)}>
            {t('team.remove.cancel')}
          </Button>
        </div>
      </Dialog>
    </Sheet>
  );
}
