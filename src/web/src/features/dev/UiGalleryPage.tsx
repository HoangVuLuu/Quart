import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Dialog } from '../../ui/Dialog';
import { EmptyState } from '../../ui/EmptyState';
import { HeroCard } from '../../ui/HeroCard';
import { PageHeader } from '../../ui/PageHeader';
import { Select } from '../../ui/Select';
import { Sheet } from '../../ui/Sheet';
import { Skeleton } from '../../ui/Skeleton';
import { StatusChip } from '../../ui/StatusChip';
import { Stepper } from '../../ui/Stepper';
import { Switch } from '../../ui/Switch';
import { PasswordField, TextField } from '../../ui/TextField';
import { useToast } from '../../ui/toast-context';

type Theme = 'device' | 'light' | 'dark';
const themes: Theme[] = ['device', 'light', 'dark'];

// Lets a reviewer see both themes without changing the device setting: the choice is written on the
// <html> element (data-theme), which the token file reads, and removed again when the page closes.
function useThemeOverride(theme: Theme) {
  useEffect(() => {
    if (theme === 'device') return;
    document.documentElement.dataset.theme = theme;
    return () => {
      delete document.documentElement.dataset.theme;
    };
  }, [theme]);
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-bold tracking-[0.08em] text-muted uppercase">{title}</h2>
      {children}
    </section>
  );
}

// Every component of the UI kit on one page (M0-11), so a screen is never built from a hand-rolled
// look-alike. Only reachable in development builds and on staging (VITE_SHOW_DEV_PAGES).
export function UiGalleryPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const [theme, setTheme] = useState<Theme>('device');
  const [claims, setClaims] = useState(true);
  const [days, setDays] = useState(5);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  useThemeOverride(theme);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 px-5 pb-10">
      <PageHeader context={t('gallery.context')} title={t('gallery.title')} />

      <div role="group" aria-label={t('gallery.theme.label')} className="flex gap-2">
        {themes.map((option) => (
          <Button
            key={option}
            variant={theme === option ? 'dark' : 'white'}
            aria-pressed={theme === option}
            onClick={() => setTheme(option)}
            className="flex-1 px-3"
          >
            {t(`gallery.theme.${option}`)}
          </Button>
        ))}
      </div>

      <Section title={t('gallery.buttons.title')}>
        <div className="flex flex-wrap gap-3">
          <Button>{t('gallery.buttons.save')}</Button>
          <Button variant="white">{t('gallery.buttons.cancel')}</Button>
          <Button variant="danger">{t('gallery.buttons.delete')}</Button>
          <Button loading>{t('gallery.buttons.saving')}</Button>
          <Button disabled>{t('gallery.buttons.unavailable')}</Button>
        </div>
      </Section>

      <Section title={t('gallery.fields.title')}>
        <Card className="flex flex-col gap-4">
          <TextField
            label={t('gallery.fields.name')}
            hint={t('gallery.fields.nameHint')}
            autoComplete="given-name"
          />
          <TextField
            label={t('gallery.fields.email')}
            type="email"
            defaultValue="sophie@"
            error={t('gallery.fields.emailError')}
            autoComplete="email"
          />
          <PasswordField label={t('gallery.fields.password')} />
          <Select label={t('gallery.fields.shift')} defaultValue="all">
            <option value="all">{t('gallery.fields.shiftAll')}</option>
            <option value="opening">{t('gallery.fields.shiftOpening')}</option>
            <option value="closing">{t('gallery.fields.shiftClosing')}</option>
          </Select>
        </Card>
      </Section>

      <Section title={t('gallery.controls.title')}>
        <Card className="flex flex-col gap-3">
          <Switch
            label={t('gallery.controls.claims')}
            description={t('gallery.controls.claimsHint')}
            checked={claims}
            onCheckedChange={setClaims}
          />
          <Stepper
            label={t('gallery.controls.days')}
            description={t('gallery.controls.daysHint')}
            value={days}
            min={1}
            max={7}
            onChange={setDays}
          />
        </Card>
      </Section>

      <Section title={t('gallery.cards.title')}>
        <Card>
          <p className="text-lg font-bold">{t('gallery.cards.card')}</p>
          <p className="mt-1 text-sm text-muted">{t('gallery.cards.cardText')}</p>
        </Card>
        <HeroCard eyebrow={t('gallery.cards.heroEyebrow')} title={t('gallery.cards.heroTitle')}>
          {t('gallery.cards.heroText')}
        </HeroCard>
        <Card role="status" className="flex flex-col gap-2">
          <span className="sr-only">{t('gallery.cards.loading')}</span>
          <Skeleton className="h-12" />
          <Skeleton className="h-12 w-2/3" />
        </Card>
        <EmptyState title={t('gallery.cards.emptyTitle')}>{t('gallery.cards.emptyText')}</EmptyState>
      </Section>

      <Section title={t('gallery.chips.title')}>
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip tone="success">{t('gallery.chips.sent')}</StatusChip>
          <StatusChip tone="danger">{t('gallery.chips.blocked')}</StatusChip>
          <StatusChip tone="warning">{t('gallery.chips.reopened')}</StatusChip>
          <StatusChip tone="neutral">{t('gallery.chips.noAnswer')}</StatusChip>
          <Badge count={3} label={t('nav.count', { count: 3 })} />
        </div>
      </Section>

      <Section title={t('gallery.overlays.title')}>
        <div className="flex flex-wrap gap-3">
          <Sheet
            trigger={<Button>{t('gallery.overlays.openSheet')}</Button>}
            open={sheetOpen}
            onOpenChange={setSheetOpen}
            title={t('gallery.overlays.sheetTitle')}
            description={t('gallery.overlays.sheetText')}
          >
            <Button onClick={() => setSheetOpen(false)} className="w-full">
              {t('gallery.buttons.save')}
            </Button>
          </Sheet>
          <Dialog
            trigger={<Button variant="white">{t('gallery.overlays.openDialog')}</Button>}
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            title={t('gallery.overlays.dialogTitle')}
            description={t('gallery.overlays.dialogText')}
          >
            <div className="flex gap-3">
              <Button variant="white" onClick={() => setDialogOpen(false)} className="flex-1">
                {t('gallery.buttons.cancel')}
              </Button>
              <Button variant="danger" onClick={() => setDialogOpen(false)} className="flex-1">
                {t('gallery.buttons.delete')}
              </Button>
            </div>
          </Dialog>
          <Button variant="white" onClick={() => toast(t('gallery.overlays.toastText'))}>
            {t('gallery.overlays.showToast')}
          </Button>
        </div>
      </Section>
    </div>
  );
}
