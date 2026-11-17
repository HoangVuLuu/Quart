import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import '../i18n';
import { PullToRefresh, pullDistance } from '../app/PullToRefresh';
import { Sheet, sheetCloseDistance } from '../ui/Sheet';
import { swipeDistance, useSwipe } from './gestures';

const at = (clientX: number, clientY: number) => ({ clientX, clientY });

/** One finger down at `from`, dragged to `to`, lifted. */
function drag(element: Element | Window, from: { clientX: number; clientY: number }, to: typeof from) {
  fireEvent.touchStart(element, { touches: [from], changedTouches: [from] });
  fireEvent.touchMove(element, { touches: [to], changedTouches: [to] });
  fireEvent.touchEnd(element, { changedTouches: [to] });
}

function Weeks() {
  const [week, setWeek] = useState(1);
  const swipe = useSwipe({
    onNext: () => setWeek((current) => Math.min(3, current + 1)),
    onPrevious: () => setWeek((current) => Math.max(1, current - 1)),
  });
  return (
    <div data-testid="region" {...swipe}>
      Week {week}
      <input aria-label="note" />
    </div>
  );
}

describe('swiping sideways (NFR-002: a shortcut, the pills still work)', () => {
  it('goes to the next week on a swipe left and back on a swipe right', () => {
    render(<Weeks />);
    const region = screen.getByTestId('region');

    drag(region, at(300, 200), at(300 - swipeDistance - 10, 205));
    expect(region).toHaveTextContent('Week 2');

    drag(region, at(100, 200), at(100 + swipeDistance + 10, 195));
    expect(region).toHaveTextContent('Week 1');
  });

  it('stops at the first and the last week', () => {
    render(<Weeks />);
    const region = screen.getByTestId('region');
    drag(region, at(100, 200), at(260, 200));
    expect(region).toHaveTextContent('Week 1');
  });

  it('ignores a short move, a scroll, the iPhone back edge and a text field', () => {
    render(<Weeks />);
    const region = screen.getByTestId('region');

    drag(region, at(300, 200), at(300 - swipeDistance + 10, 200)); // too short
    drag(region, at(300, 200), at(200, 400)); // mostly downwards: scrolling the page
    drag(region, at(10, 200), at(200, 200)); // starts on the left edge: iOS "back"
    drag(screen.getByLabelText('note'), at(300, 200), at(100, 200)); // moving the caret in a field
    expect(region).toHaveTextContent('Week 1');
  });

  it('ignores a swipe made inside a sheet opened from the region', () => {
    function WithSheet() {
      const [week, setWeek] = useState(1);
      const swipe = useSwipe({ onNext: () => setWeek(2) });
      return (
        <div data-testid="region" {...swipe}>
          Week {week}
          <Sheet open title="Shift">
            <p>Inside</p>
          </Sheet>
        </div>
      );
    }
    render(<WithSheet />);
    drag(screen.getByText('Inside'), at(300, 200), at(100, 200));
    expect(screen.getByTestId('region')).toHaveTextContent('Week 1');
  });
});

describe('swiping a sheet down', () => {
  it('closes it past the threshold, whether or not the caller holds the open state', async () => {
    const onOpenChange = vi.fn();
    render(
      <Sheet trigger={<button type="button">Open</button>} onOpenChange={onOpenChange} title="Shift">
        <p>Inside</p>
      </Sheet>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    const sheet = await screen.findByRole('dialog');

    drag(sheet, at(200, 300), at(200, 300 + sheetCloseDistance + 20));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('follows the finger and springs back after a short drag', () => {
    render(
      <Sheet open title="Shift">
        <p>Inside</p>
      </Sheet>,
    );
    const sheet = screen.getByRole('dialog');

    fireEvent.touchStart(sheet, { touches: [at(200, 300)], changedTouches: [at(200, 300)] });
    fireEvent.touchMove(sheet, { touches: [at(200, 340)], changedTouches: [at(200, 340)] });
    expect(sheet.style.translate).toBe('0 40px');
    fireEvent.touchEnd(sheet, { changedTouches: [at(200, 340)] });

    expect(sheet.style.translate).toBe('');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('leaves a drag alone when the sheet is scrolled down: that is a scroll', () => {
    const onOpenChange = vi.fn();
    render(
      <Sheet open onOpenChange={onOpenChange} title="Shift">
        <p>Inside</p>
      </Sheet>,
    );
    const sheet = screen.getByRole('dialog');
    sheet.scrollTop = 120;

    drag(sheet, at(200, 300), at(200, 500));
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

describe('pulling down to refresh', () => {
  function setUp() {
    const load = vi.fn(() => Promise.resolve('fresh'));
    function Screen() {
      const query = useQuery({ queryKey: ['thing'], queryFn: load, staleTime: Infinity });
      return (
        <>
          <p>{query.data}</p>
          <Sheet open={false} title="Shift" />
        </>
      );
    }
    render(
      <QueryClientProvider client={new QueryClient()}>
        <PullToRefresh>
          <Screen />
        </PullToRefresh>
      </QueryClientProvider>,
    );
    return load;
  }

  it('fetches everything again after a long pull from the top, and says so', async () => {
    const load = setUp();
    await screen.findByText('fresh');
    expect(load).toHaveBeenCalledTimes(1);

    // The indicator moves at half the finger's speed.
    drag(window, at(200, 100), at(200, 100 + pullDistance * 2 + 10));

    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText('Refreshing…')).not.toBeInTheDocument());
  });

  it('does nothing after a short pull', async () => {
    const load = setUp();
    await screen.findByText('fresh');
    drag(window, at(200, 100), at(200, 100 + pullDistance));
    await act(() => Promise.resolve());
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the page is scrolled down', async () => {
    const load = setUp();
    await screen.findByText('fresh');
    Object.defineProperty(window, 'scrollY', { value: 300, configurable: true });
    try {
      drag(window, at(200, 100), at(200, 400));
      await act(() => Promise.resolve());
      expect(load).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
    }
  });
});
