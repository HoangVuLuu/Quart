import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useBlocker, useNavigate, useSearchParams } from 'react-router';
import { SubPage } from '../../app/SubPage';
import { messageKeyFor } from '../../i18n/errors';
import { formatDateRange } from '../../i18n/format';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { Skeleton } from '../../ui/Skeleton';
import { useToast } from '../../ui/toast-context';
import { FormError } from '../identity/FormError';
import {
  hasStarted,
  leaveBuilding,
  sendHeartbeat,
  useCurrentPeriods,
  useDraft,
  useDraftActions,
} from '../scheduling/data';
import { useWorkplace } from '../workplaces/workplace';
import { CancelPeriodButton } from './CancelPeriod';
import { DraftEditor } from './DraftEditor';

/** How often the open page says it is still there; the server ends a visit after two minutes of silence. */
const heartbeatMs = 30_000;

/**
 * "Building Schedule" (mode build, the next period) and "Editing Schedule" (mode edit, a published one),
 * full pages with a back arrow and no tab bar (4.3, 4.4, 2026-11-18). Not in the mockups: they hold the
 * draft editor of 1l unchanged, under the page pattern of 1e, with Save draft and Clear above it.
 */
export function BuildingPage({ mode }: { mode: 'build' | 'edit' }) {
  const { t } = useTranslation();
  const periods = useCurrentPeriods();
  const [params] = useSearchParams();
  if (periods.error) throw periods.error;
  if (!periods.data) {
    return (
      <SubPage backTo="/schedule" title={mode === 'build' ? t('building.title') : t('building.editTitle')}>
        <Skeleton className="h-48" />
      </SubPage>
    );
  }
  const published = [periods.data.live, ...(periods.data.upcoming ?? [])].filter((period) => period !== null);
  const periodId =
    mode === 'build'
      ? periods.data.next?.period.id
      : (published.find((period) => period?.id === params.get('period')) ?? published[0])?.id;
  if (!periodId) return <Navigate to="/schedule" replace />;
  return <BuildingVisit key={periodId} periodId={periodId} mode={mode} />;
}

function BuildingVisit({ periodId, mode }: { periodId: string; mode: 'build' | 'edit' }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const { id: workplaceId } = useWorkplace();
  const actions = useDraftActions(periodId);
  const draft = useDraft(periodId);
  const [clearing, setClearing] = useState(false);
  const [publishedNow, setPublishedNow] = useState(false);
  const entered = useRef(false);
  const { mutate: enter } = actions.start;
  // Read by the timers below without restarting them, which would count as leaving.
  const latest = useRef({ enter, toast, t });
  useEffect(() => {
    latest.current = { enter, toast, t };
  });

  // Entering locks availability and remembers the draft as it is (4.3). Once, even in development's double mount.
  useEffect(() => {
    if (entered.current) return;
    entered.current = true;
    enter();
  }, [enter]);

  // Signs of life while the page is open; the visit ends on the server if they stop (closing the app).
  useEffect(() => {
    const timer = window.setInterval(() => {
      void sendHeartbeat(workplaceId, periodId).then(({ response }) => {
        if (response.status === 409) {
          latest.current.toast(latest.current.t('building.ended'));
          latest.current.enter();
        }
      });
    }, heartbeatMs);
    // Leaving the page by any way at all drops unsaved changes and, while building, unlocks availability.
    const onHide = () => void leaveBuilding(workplaceId, periodId);
    window.addEventListener('pagehide', onHide);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('pagehide', onHide);
      void leaveBuilding(workplaceId, periodId);
    };
  }, [workplaceId, periodId]);

  const unsaved = (draft.data?.hasUnsavedChanges ?? false) && !publishedNow;
  const unsavedNow = useRef(unsaved);
  useEffect(() => {
    unsavedNow.current = unsaved;
  }, [unsaved]);
  // The back arrow, the browser's back and any link out ask first when there is something unsaved.
  const blocker = useBlocker(() => unsavedNow.current);
  const error = actions.save.error ?? actions.clear.error ?? actions.start.error;
  const range = draft.data
    ? formatDateRange(draft.data.period.startDate, draft.data.period.endDate, i18n.language)
    : undefined;

  return (
    <SubPage
      backTo="/schedule"
      title={mode === 'build' ? t('building.title') : t('building.editTitle')}
      context={range}
    >
      {!actions.start.isSuccess && !actions.start.isError ? (
        <Skeleton className="h-48" />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="white"
              className="min-h-11 px-4 text-sm"
              loading={actions.save.isPending}
              disabled={!unsaved}
              onClick={() => actions.save.mutate(undefined, { onSuccess: () => toast(t('building.saved')) })}
            >
              {t('building.save')}
            </Button>
            {mode === 'build' && (
              <Button variant="white" className="min-h-11 px-4 text-sm" onClick={() => setClearing(true)}>
                {t('building.clear')}
              </Button>
            )}
            {/* Not on Building Schedule (2026-11-21): there, the next-period box cancels. Editing Schedule
                keeps it until the period starts, since a published period has no other place for it. */}
            {draft.data && mode === 'edit' && !hasStarted(draft.data.period) && (
              <CancelPeriodButton
                period={draft.data.period}
                onCancelling={() => {
                  unsavedNow.current = false;
                }}
              />
            )}
          </div>
          <FormError message={error ? t(messageKeyFor(error)) : undefined} />
          <DraftEditor
            periodId={periodId}
            onPublished={() => {
              // Publishing ends the visit on the server; nothing is left unsaved (4.3: back to Schedule).
              setPublishedNow(true);
              unsavedNow.current = false;
              void navigate('/schedule', { replace: true });
            }}
          />
        </div>
      )}

      <Dialog
        open={clearing}
        onOpenChange={setClearing}
        title={t('building.clearTitle')}
        description={t('building.clearText')}
      >
        <div className="flex flex-col gap-2">
          <Button
            variant="danger"
            loading={actions.clear.isPending}
            onClick={() => actions.clear.mutate(undefined, { onSuccess: () => setClearing(false) })}
          >
            {t('building.clearConfirm')}
          </Button>
          <Button variant="white" onClick={() => setClearing(false)}>
            {t('building.cancel')}
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={blocker.state === 'blocked'}
        onOpenChange={(open) => !open && blocker.reset?.()}
        title={t('building.leaveTitle')}
        description={t('building.leaveText')}
      >
        <div className="flex flex-col gap-2">
          <Button
            loading={actions.save.isPending}
            onClick={() => actions.save.mutate(undefined, { onSuccess: () => blocker.proceed?.() })}
          >
            {t('building.save')}
          </Button>
          <Button variant="danger" onClick={() => blocker.proceed?.()}>
            {t('building.leave')}
          </Button>
          <Button variant="white" onClick={() => blocker.reset?.()}>
            {t('building.cancel')}
          </Button>
        </div>
      </Dialog>
    </SubPage>
  );
}
