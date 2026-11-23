import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, Outlet, useNavigate, useParams } from 'react-router';
import { SubPage } from '../../app/SubPage';
import { useGoBack } from '../../app/useGoBack';
import { messageKeyFor } from '../../i18n/errors';
import { api, unwrap, type Schemas } from '../../lib/api/client';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { Skeleton } from '../../ui/Skeleton';
import { useToast } from '../../ui/toast-context';
import { DayList } from '../day-editor/DayList';
import { DayView } from '../day-editor/DayView';
import { newKey, type DaysState } from '../day-editor/model';
import { changesOfDay, templateChanges, templateDays, templateState } from '../day-editor/template-days';
import { FormError } from '../identity/FormError';
import { useWorkplace } from '../workplaces/workplace';
import { useSpecificDays, type SpecificDays } from './specific-days';

// "Edit a specific day" in Edit Generator (M4-01, 2026-11-23). Editing Shift lists the days of weeks 1 to N without
// dates; its pen opens Editing <day>, a day view. The edits live here, above both pages, and are saved together
// from Editing Shift. They are generator rules: every period opened afterwards uses them, never one already open.
export function SpecificDaysLayout() {
  const { t } = useTranslation();
  const { id } = useWorkplace();
  const setup = useQuery({
    queryKey: ['workplace', id, 'generator'],
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/workplaces/{workplaceId}/generator', { params: { path: { workplaceId: id } }, signal }),
      ),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const changes = useQuery({
    queryKey: ['workplace', id, 'generator', 'days'],
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/workplaces/{workplaceId}/generator/days', {
          params: { path: { workplaceId: id } },
          signal,
        }),
      ),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  if (setup.error) throw setup.error;
  if (changes.error) throw changes.error;
  if (!setup.data || !changes.data) {
    return (
      <SubPage backTo="/generator" title={t('dayEditor.title')}>
        <Skeleton className="h-96" />
      </SubPage>
    );
  }
  return <Editor setup={setup.data} saved={changes.data.changes ?? []} />;
}

function Editor({ setup, saved }: { setup: Schemas['GeneratorSetup']; saved: Schemas['DayChangeSetup'][] }) {
  const { t, i18n } = useTranslation();
  const { id } = useWorkplace();
  const client = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const blocks = useMemo(() => setup.blocks ?? [], [setup.blocks]);
  const weeks = setup.periodWeeks;
  const days = useMemo(
    () => templateDays(weeks, i18n.language, (week) => t('dayEditor.weekShort', { week })),
    [weeks, i18n.language, t],
  );
  const initial = useMemo(() => templateState(blocks, saved, weeks), [blocks, saved, weeks]);
  const [state, setState] = useState<DaysState>(initial);
  const [cleared, setCleared] = useState(false);
  const [week, setWeek] = useState(0);
  // Changes for weeks the period no longer has are kept, unless cleared: the length may come back (FR-090).
  const hidden = cleared ? [] : saved.filter((change) => change.week > weeks);
  const changes = [...templateChanges(blocks, state), ...hidden];
  const dirty =
    JSON.stringify(templateChanges(blocks, state)) !== JSON.stringify(templateChanges(blocks, initial)) ||
    (cleared && saved.some((change) => change.week > weeks));
  const changed = new Set(
    days
      .filter((day) => {
        const [w, d] = day.key.split('-').map(Number);
        return changesOfDay(blocks, w ?? 1, d ?? 1, state[day.key] ?? []).length > 0;
      })
      .map((day) => day.key),
  );
  const save = useMutation({
    mutationFn: () =>
      unwrap(
        api.PUT('/api/workplaces/{workplaceId}/generator/days', {
          params: { path: { workplaceId: id } },
          body: { changes },
        }),
      ),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['workplace', id, 'generator', 'days'] });
      toast(t('dayEditor.saved'));
      void navigate('/generator', { replace: true });
    },
  });

  const context: SpecificDays = {
    days,
    state,
    changed,
    dirty,
    week,
    setWeek,
    label: (shift, part) => shift.name || t(`scheduling.kind.${part}`),
    setDay: (day, shifts) => setState((current) => ({ ...current, [day]: shifts })),
    add: (shift, picked) =>
      setState((current) => {
        const next = { ...current };
        for (const day of picked) {
          next[day] = [...(next[day] ?? []), { ...shift, key: newKey(), blockId: null }];
        }
        return next;
      }),
    clearAll: () => {
      setState(templateState(blocks, [], weeks));
      setCleared(true);
    },
    save: () => save.mutate(),
    saving: save.isPending,
    saveError: save.error,
  };
  return <Outlet context={context} />;
}

/** Editing Shift: every day of weeks 1 to N, a pen on each, Clear all and Save. */
export function SpecificDaysPage() {
  const { t } = useTranslation();
  const days = useSpecificDays();
  const navigate = useNavigate();
  const goBack = useGoBack('/generator');
  const [clearing, setClearing] = useState(false);
  const [leaving, setLeaving] = useState(false);
  return (
    <SubPage
      backTo="/generator"
      title={t('dayEditor.title')}
      context={t('dayEditor.templateContext')}
      onBack={() => (days.dirty ? setLeaving(true) : goBack())}
      action={
        <Button
          variant="white"
          className="min-h-10 px-4 text-sm text-danger!"
          onClick={() => setClearing(true)}
        >
          {t('dayEditor.clearAll')}
        </Button>
      }
    >
      <DayList
        days={days.days}
        state={days.state}
        changed={days.changed}
        label={days.label}
        week={days.week}
        onWeek={days.setWeek}
        onEdit={(day) => void navigate(`/generator/days/${day}`)}
      />
      <FormError message={days.saveError ? t(messageKeyFor(days.saveError)) : undefined} />
      <Button className="mt-4 w-full" loading={days.saving} disabled={!days.dirty} onClick={days.save}>
        {t('dayEditor.save')}
      </Button>
      <Dialog
        open={clearing}
        onOpenChange={setClearing}
        title={t('dayEditor.clearTitle')}
        description={t('dayEditor.clearText')}
      >
        <p className="mb-4 text-sm text-muted">{t('dayEditor.clearNote')}</p>
        <div className="flex flex-col gap-2">
          <Button variant="white" onClick={() => setClearing(false)}>
            {t('ui.cancel')}
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              days.clearAll();
              setClearing(false);
            }}
          >
            {t('dayEditor.clearAll')}
          </Button>
        </div>
      </Dialog>
      <Dialog
        open={leaving}
        onOpenChange={setLeaving}
        title={t('generator.leave.title')}
        description={t('generator.leave.text')}
      >
        <div className="flex flex-col gap-2">
          <Button onClick={() => setLeaving(false)}>{t('generator.leave.stay')}</Button>
          <Button variant="danger" onClick={goBack}>
            {t('generator.leave.leave')}
          </Button>
        </div>
      </Dialog>
    </SubPage>
  );
}

/** Editing <day>: the day view of one day of the week in one week. */
export function SpecificDayPage() {
  const { t } = useTranslation();
  const days = useSpecificDays();
  const { day: key } = useParams();
  const day = days.days.find((item) => item.key === key);
  if (!day) return <Navigate to="/generator/days" replace />;
  return (
    <SubPage backTo="/generator/days" title={t('dayEditor.dayTitle', { day: day.long })}>
      <DayView
        day={day}
        shifts={days.state[day.key] ?? []}
        days={days.days}
        withPairs
        label={days.label}
        onChange={(shifts) => days.setDay(day.key, shifts)}
        onAdd={days.add}
      />
    </SubPage>
  );
}
