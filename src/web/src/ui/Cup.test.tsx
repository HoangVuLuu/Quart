import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Cup } from './Cup';
import { EmptyState } from './EmptyState';

describe('Cup', () => {
  it('is decoration: hidden from screen readers, with no name and no role', () => {
    const { container } = render(<Cup />);

    const cup = container.firstElementChild as HTMLElement;
    expect(cup).toHaveAttribute('aria-hidden', 'true');
    expect(cup).not.toHaveAttribute('aria-label');
    expect(cup).not.toHaveAttribute('role');
    expect(cup).toHaveTextContent('');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('is sized by its width alone, so the height can only follow the 3:4 shape', () => {
    // Layout is not computed in jsdom; what can be checked here is that nothing sets a height or
    // a width of its own, which is the only way a cup could come out stretched. The real drawing was
    // measured in a browser at 24, 40, 64 and 92 px (see the pull request).
    for (const width of ['w-6', 'w-10', 'w-16', 'w-24']) {
      const { container, unmount } = render(<Cup className={width} />);
      const cup = container.firstElementChild as HTMLElement;
      expect(cup).toHaveClass('quart-cup', width);
      expect(cup.getAttribute('style')).toBeNull();
      expect(cup.querySelectorAll('[style]')).toHaveLength(0);
      unmount();
    }
  });

  it('wears the flavour and mood it was given', () => {
    const { container } = render(<Cup flavour="closing" mood="sleepy" />);

    const cup = container.firstElementChild as HTMLElement;
    expect(cup).toHaveAttribute('data-flavour', 'closing');
    expect(cup).toHaveAttribute('data-mood', 'sleepy');
    expect(cup.querySelectorAll('.quart-cup-lid')).toHaveLength(2);
    expect(cup.querySelectorAll('.quart-cup-eye')).toHaveLength(0);
  });

  it('has open eyes and a smile by default, and an open mouth when surprised', () => {
    const happy = render(<Cup />);
    expect(happy.container.querySelectorAll('.quart-cup-eye')).toHaveLength(2);
    expect(happy.container.querySelectorAll('.quart-cup-smile')).toHaveLength(1);
    expect(happy.container.querySelectorAll('.quart-cup-gasp')).toHaveLength(0);
    happy.unmount();

    const wow = render(<Cup mood="wow" />);
    expect(wow.container.querySelectorAll('.quart-cup-eye')).toHaveLength(2);
    expect(wow.container.querySelectorAll('.quart-cup-gasp')).toHaveLength(1);
    expect(wow.container.querySelectorAll('.quart-cup-smile')).toHaveLength(0);
  });

  it('draws five pearls', () => {
    const { container } = render(<Cup />);
    expect(container.querySelectorAll('.quart-cup-pearls i')).toHaveLength(5);
  });

  it('does not animate', () => {
    const { container } = render(<Cup mood="wow" />);
    expect(container.innerHTML).not.toMatch(/animate|transition/);
  });
});

describe('EmptyState', () => {
  it('puts the sentence in words next to the cup, and the cup stays out of the accessibility tree', () => {
    const { container } = render(
      <EmptyState title="No schedule yet" flavour="closing" mood="sleepy">
        Your shifts show up here.
      </EmptyState>,
    );

    expect(screen.getByText('No schedule yet')).toBeInTheDocument();
    expect(screen.getByText('Your shifts show up here.')).toBeInTheDocument();
    expect(container.querySelector('.quart-cup')).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows its action when it has one', () => {
    render(
      <EmptyState title="Nothing yet" action={<button>Fill in</button>}>
        Text
      </EmptyState>,
    );
    expect(screen.getByRole('button', { name: 'Fill in' })).toBeInTheDocument();
  });
});
