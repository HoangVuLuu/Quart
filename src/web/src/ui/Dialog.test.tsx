import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../i18n';
import en from '../i18n/locales/en.json';
import { Dialog } from './Dialog';
import { Sheet } from './Sheet';

// The same behaviour is promised by both overlays, so the same tests run against each.
const overlays = [
  ['Dialog', Dialog],
  ['Sheet', Sheet],
] as const;

describe.each(overlays)('%s', (_name, Overlay) => {
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button>Behind the overlay</button>
        <Overlay
          trigger={<button>Open</button>}
          open={open}
          onOpenChange={setOpen}
          title="Delete this post?"
          description="It goes for everyone."
        >
          <button>First</button>
          <button>Last</button>
        </Overlay>
      </>
    );
  }

  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('moves focus inside when it opens and keeps it there while tabbing', async () => {
    render(<Harness />);

    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete this post?' });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);

    // Far more presses than there are controls: the focus must go round inside, never out.
    for (let press = 0; press < 12; press++) {
      await userEvent.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
    await userEvent.tab({ shift: true });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
  });

  it('closes on Escape and gives the focus back to the button that opened it', async () => {
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open' });

    await userEvent.click(opener);
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('closes with its close button, which is named in words', async () => {
    render(<Harness />);

    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    await userEvent.click(await screen.findByRole('button', { name: en.ui.close }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('hides the page behind it from screen readers while open', async () => {
    render(<Harness />);

    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    await screen.findByRole('dialog');

    expect(screen.queryByRole('button', { name: 'Behind the overlay' })).not.toBeInTheDocument();
  });
});
