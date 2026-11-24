import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, Outlet, useNavigate, useParams, useSearchParams } from 'react-router';
import { SubPage } from '../../app/SubPage';
import { useGoBack } from '../../app/useGoBack';
import { messageKeyFor } from '../../i18n/errors';
import { formatDateRange } from '../../i18n/format';
import { api, unwrap, type Schemas } from '../../lib/api/client';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { Skeleton } from '../../ui/Skeleton';
import { useToast } from '../../ui/toast-context';
import { DayList } from '../day-editor/DayList';
import { DayView } from '../day-editor/DayView';
import { newKey, type DaysState } from '../day-editor/model';
import { periodDays, periodShifts, periodState, rulesOf } from '../day-editor/period-days';
import { FormError } from '../identity/FormError';
import { useWorkplace } from '../workplaces/workplace';
import { usePeriodShifts, type PeriodShiftsContext } from './period-shifts';

// One period's own shifts (FR-092, M4-01, 2026-11-23), from the pen next to a day on Building and Editing Schedule:
// Editing Shift with real dates, and Editing <date>. The same pages as "Edit a specific day" in Edit Generator,
// without Clear all or pairs. Days that started cannot change. On a published period, Save makes it live.
export function PeriodShiftsLayout() {
  const { t } = useTranslation();
  const { id } = useWorkplace();
  const [params] = useSearchParams();
  const periodId = params.get('period') ?? '';
  const view = useQuery({
    queryKey: ['workplace', id, 'period-shifts', periodId],
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/workplaces/{workplaceId}/periods/{periodId}/shifts', {
          params: { path: { workplaceId: id, periodId } },
          signal,
        }),
      ),
    enabled: periodId !== '',
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  if (periodId === '') return <Navigate to="/schedule" replace />;
  if (view.error) throw view.error;
  if (!view.data) {
    return (
      <SubPage backTo="/schedule" title={t('dayEditor.title')}>
        <Skeleton className="h-96" />
      </SubPage>
    );
  }
  return <Editor view={view.data} firstDay={params.get('day')} />;
}

function Editor({ view, firstDay }: { view: Schemas['PeriodShifts']; firstDay: string | null }) {
  const { t, i18n } = useTranslation();
  const { id } = useWorkplace();
  const client = useQueryClient();
  const toast = useToast();
  const goBack = useGoBack('/schedule');
  const days = useMemo(() => periodDays(view, i18n.language), [view, i18n.language]);
  const initial = useMemo(() => periodState(view), [view]);
  const [state, setState] = useState<DaysState>(initial);
  const [week, setWeek] = useState(() => days.find((day) => day.key === firstDay)?.week ?? 0);
  const changed = new Set(
    days
      .filter((day) => JSON.stringify(state[day.key]) !== JSON.stringify(initial[day.key]))
      .map((day) => day.key),
  );
  const save = useMutation({
    mutationFn: () =>
      unwrap(
        api.PUT('/api/workplaces/{workplaceId}/periods/{periodId}/shifts', {
          params: { path: { workplaceId: id, periodId: view.period.id } },
          body: { shifts: periodShifts(view, state) },
        }),
      ),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['workplace', id] });
      toast(t('dayEditor.saved'));
      goBack();
    },
  });
  const range = formatDateRange(view.period.startDate, view.period.endDate, i18n.language);
  const published = view.period.version > 0;

  const context: PeriodShiftsContext = {
    periodId: view.period.id,
    title: t('dayEditor.title'),
    context: published ? t('dayEditor.publishedContext', { range }) : t('dayEditor.periodContext', { range }),
    published,
    days,
    state,
    changed,
    dirty: changed.size > 0,
    week,
    setWeek,
    label: (shift, part) => shift.name || t(`scheduling.kind.${part}`),
    setDay: (day, shifts) => setState((current) => ({ ...current, [day]: shifts })),
    reopen: (day) => setState((current) => ({ ...current, [day]: rulesOf(view, day) })),
    add: (shift, picked) =>
      setState((current) => {
        const next = { ...current };
        for (const day of picked)
          next[day] = [...(next[day] ?? []), { ...shift, key: newKey(), blockId: null }];
        return next;
      }),
    save: () => save.mutate(),
    saving: save.isPending,
    saveError: save.error,
  };
  return <Outlet context={context} />;
}

/**
 * Save for one period's shifts, with the "goes live" question on a published period (2026-11-23), and the
 * leave question when going back with changes. Shared by Editing Shift and Editing <date>.
 */
function useSaveAndLeave() {
  const { t } = useTranslation();
  const shifts = usePeriodShifts();
  const goBack = useGoBack('/schedule');
  const [leaving, setLeaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const onBack = () => (shifts.dirty ? setLeaving(true) : goBack());
  const footer = (
    <>
      <FormError message={shifts.saveError ? t(messageKeyFor(shifts.saveError)) : undefined} />
      <Button
        className="mt-4 w-full"
        loading={shifts.saving}
        disabled={!shifts.dirty}
        // A published period changes for the team at once: say so first (2026-11-23).
        onClick={() => (shifts.published ? setConfirming(true) : shifts.save())}
      >
        {t('dayEditor.save')}
      </Button>
      <Dialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t('dayEditor.liveTitle')}
        description={t('dayEditor.liveText')}
      >
        <div className="flex flex-col gap-2">
          <Button
            loading={shifts.saving}
            onClick={() => {
              setConfirming(false);
              shifts.save();
            }}
          >
            {t('dayEditor.liveConfirm')}
          </Button>
          <Button variant="white" onClick={() => setConfirming(false)}>
            {t('ui.cancel')}
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
    </>
  );
  return { onBack, footer };
}

/** Editing Shift for one period: its days with real dates, a pen on each that has not started, Save. */
export function PeriodShiftsPage() {
  const { t } = useTranslation();
  const shifts = usePeriodShifts();
  const navigate = useNavigate();
  const { onBack, footer } = useSaveAndLeave();
  return (
    <SubPage backTo="/schedule" title={shifts.title} context={shifts.context} onBack={onBack}>
      <DayList
        days={shifts.days}
        state={shifts.state}
        changed={shifts.changed}
        label={shifts.label}
        week={shifts.week}
        onWeek={shifts.setWeek}
        onEdit={(day) => void navigate(`/schedule/shifts/${day}?period=${shifts.periodId}`)}
        closedAction={(day) =>
          !day.locked && (
            <button
              type="button"
              aria-label={t('dayEditor.reopenDay', { day: day.long })}
              onClick={() => shifts.reopen(day.key)}
              className="min-h-10 px-1 text-sm font-bold text-link"
            >
              {t('dayEditor.reopen')}
            </button>
          )
        }
      />
      {footer}
    </SubPage>
  );
}

/**
 * Editing <date>. The pen next to a day on Building and Editing Schedule opens it straight away (Hoang,
 * 2026-11-23), so it has its own Save; back returns to the schedule, asking first when something changed.
 */
export function PeriodShiftDayPage() {
  const { t } = useTranslation();
  const shifts = usePeriodShifts();
  const { day: key } = useParams();
  const { onBack, footer } = useSaveAndLeave();
  const day = shifts.days.find((item) => item.key === key);
  if (!day || day.locked) return <Navigate to={`/schedule/shifts?period=${shifts.periodId}`} replace />;
  return (
    <SubPage
      backTo="/schedule"
      title={t('dayEditor.dayTitle', { day: day.long })}
      context={shifts.context}
      onBack={onBack}
    >
      <DayView
        day={day}
        shifts={shifts.state[day.key] ?? []}
        days={shifts.days}
        withPairs={false}
        label={shifts.label}
        onChange={(list) => shifts.setDay(day.key, list)}
        onAdd={shifts.add}
      />
      {footer}
    </SubPage>
  );
}
