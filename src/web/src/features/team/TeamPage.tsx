import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import facebookLogo from '../../assets/brand/facebook.png';
import instagramLogo from '../../assets/brand/instagram.png';
import { SubPage } from '../../app/SubPage';
import { messageKeyFor } from '../../i18n/errors';
import { formatDateRange, formatShortDate } from '../../i18n/format';
import { api, unwrap, type Schemas } from '../../lib/api/client';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { cx } from '../../ui/cx';
import { Dialog } from '../../ui/Dialog';
import { Sheet } from '../../ui/Sheet';
import { Loading, RowsSkeleton } from '../../ui/Skeleton';
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
// else (FR-040), plus Instagram and Facebook for those who chose to share them (M2-18).
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
      {!members.data && (
        <Loading>
          <RowsSkeleton />
        </Loading>
      )}
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
                  {/* Levels only for managers (3.1, 2026-11-18). */}
                  {member.level == null
                    ? t(`roles.${member.role as 'owner' | 'admin' | 'employee'}`)
                    : member.role === 'employee'
                      ? t('team.barista', { level: member.level })
                      : `${t(`roles.${member.role as 'owner' | 'admin'}`)} · ${t('scheduling.level', { level: member.level })}`}
                </p>
                {member.timeOff && <TimeOffChip timeOff={member.timeOff} />}
                {/* Beside an Edit button there is no room at 390 px, in French above all: under the name. */}
                {can('ManageLevels') && <SocialLinks member={member} className="mt-2" />}
              </div>
              {!can('ManageLevels') && <SocialLinks member={member} />}
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

/** Accepted time off that has not ended, for the people who manage levels (BL-01, 2026-11-25). */
function TimeOffChip({ timeOff }: { timeOff: NonNullable<Member['timeOff']> }) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  // "Dec 20", without the weekday, so the tag stays on one line at 390 px.
  const day = (date: string) => formatDateRange(date, date, language);
  const text = timeOff.now
    ? timeOff.lastDay
      ? t('team.timeOff.until', { day: day(timeOff.lastDay) })
      : t('team.timeOff.open')
    : timeOff.lastDay
      ? t('team.timeOff.planned', { days: formatDateRange(timeOff.firstDay, timeOff.lastDay, language) })
      : t('team.timeOff.from', { day: day(timeOff.firstDay) });
  return (
    <span className="mt-1 inline-block rounded-pill bg-warning-soft px-2.5 py-0.5 text-xs font-bold text-warning">
      {text}
    </span>
  );
}

// Each link is built from a fixed host and a handle the server already checked (M2-18), so a teammate can
// only ever be sent to that person's profile. The logos are the official files from Meta's brand
// resources, only scaled down: their guidelines forbid recolouring or reshaping them.
const socialSites = [
  {
    key: 'instagram',
    logo: instagramLogo,
    url: (handle: string) => `https://www.instagram.com/${encodeURIComponent(handle)}/`,
  },
  {
    key: 'facebook',
    logo: facebookLogo,
    url: (handle: string) => `https://www.facebook.com/${encodeURIComponent(handle)}`,
  },
] as const;

function SocialLinks({ member, className }: { member: Member; className?: string }) {
  const { t } = useTranslation();
  const links = socialSites.flatMap((site) => {
    const handle = member[site.key];
    return handle ? [{ ...site, handle }] : [];
  });
  if (links.length === 0) return null;
  return (
    <div className={cx('flex shrink-0 gap-2', className)}>
      {links.map((link) => (
        <a
          key={link.key}
          href={link.url(link.handle)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t(`team.social.${link.key}`, { name: member.displayName })}
          className="flex size-11 items-center justify-center rounded-full bg-bg"
        >
          <img src={link.logo} alt="" className="size-6" />
        </a>
      ))}
    </div>
  );
}

/**
 * Mockup 1z, plus what the generator needs to know about each person: whether they work shifts, and the
 * most hours they may get in a week (M2-12). The hours they want come with their availability (1.1).
 */
function EditMember({ member, onClose }: { member: Member; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const { id, can } = useWorkplace();
  const refresh = useRefreshWorkplace();
  const [level, setLevel] = useState(member.level ?? 1);
  const [limited, setLimited] = useState(member.maxWeeklyHours != null);
  const [max, setMax] = useState(member.maxWeeklyHours ?? 40);
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
            worksShifts,
            maxWeeklyHours: limited ? max : null,
            clearMaxWeeklyHours: !limited,
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
        {/* BL-01 (Hoang, 2026-11-25): during a time off the switch reads off; turning it on ends the time off. */}
        {member.timeOff?.now && (
          <p className="rounded-field bg-warning-soft px-3 py-2 text-sm font-bold text-warning">
            {member.timeOff.lastDay
              ? t('team.timeOff.sheetUntil', { day: formatShortDate(member.timeOff.lastDay, i18n.language) })
              : t('team.timeOff.sheetOpen')}
          </p>
        )}
        {worksShifts && (
          <Switch
            label={t('team.sheet.limit')}
            description={t('team.sheet.limitText')}
            checked={limited}
            onCheckedChange={setLimited}
          />
        )}
        {worksShifts && limited && (
          <Stepper label={t('team.sheet.max')} value={max} min={0} max={80} onChange={setMax} />
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
