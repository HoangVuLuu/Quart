import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import en from '../i18n/locales/en.json';
import { Badge } from './Badge';
import { Button } from './Button';
import { Select } from './Select';
import { StatusChip } from './StatusChip';
import { Stepper } from './Stepper';
import { Switch } from './Switch';
import { PasswordField, TextField } from './TextField';

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

describe('Button', () => {
  it('is a button that does not submit a form by accident', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'button');
  });

  it('while loading it is disabled and busy, and keeps its own words', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Saving
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Saving' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('TextField', () => {
  it('ties its label, hint and error to the input', () => {
    render(<TextField label="Email" hint="Work address" error="Not valid" />);

    const input = screen.getByLabelText('Email');
    expect(input).toHaveAccessibleDescription('Work address Not valid');
    expect(input).toBeInvalid();
  });

  it('is valid, and described by its hint only, when there is no error', () => {
    render(<TextField label="Email" hint="Work address" />);

    const input = screen.getByLabelText('Email');
    expect(input).toBeValid();
    expect(input).toHaveAccessibleDescription('Work address');
  });

  it('shows and hides a password on request', async () => {
    render(<PasswordField label="Password" />);
    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('type', 'password');

    await userEvent.click(screen.getByRole('button', { name: en.ui.showPassword }));
    expect(input).toHaveAttribute('type', 'text');

    await userEvent.click(screen.getByRole('button', { name: en.ui.hidePassword }));
    expect(input).toHaveAttribute('type', 'password');
  });
});

describe('Select', () => {
  it('is a labelled native list', async () => {
    render(
      <Select label="Shift" error="Pick one" defaultValue="a">
        <option value="a">Openings</option>
        <option value="b">Closings</option>
      </Select>,
    );

    const select = screen.getByRole('combobox', { name: 'Shift' });
    expect(select).toHaveAccessibleDescription('Pick one');
    await userEvent.selectOptions(select, 'Closings');
    expect(select).toHaveValue('b');
  });
});

describe('Switch', () => {
  function Harness() {
    const [on, setOn] = useState(false);
    return <Switch label="Approve claims" checked={on} onCheckedChange={setOn} />;
  }

  it('toggles from the switch and from its label, and from the keyboard', async () => {
    render(<Harness />);
    const toggle = screen.getByRole('switch', { name: 'Approve claims' });
    expect(toggle).not.toBeChecked();

    await userEvent.click(toggle);
    expect(toggle).toBeChecked();

    await userEvent.click(screen.getByText('Approve claims'));
    expect(toggle).not.toBeChecked();

    toggle.focus();
    await userEvent.keyboard(' ');
    expect(toggle).toBeChecked();
  });
});

describe('Stepper', () => {
  function Harness() {
    const [value, setValue] = useState(2);
    return <Stepper label="Most days" value={value} min={1} max={3} onChange={setValue} />;
  }

  it('steps within its limits and disables the end it has reached', async () => {
    render(<Harness />);
    const less = screen.getByRole('button', { name: en.ui.decrease });
    const more = screen.getByRole('button', { name: en.ui.increase });
    expect(screen.getByRole('group', { name: 'Most days' })).toBeInTheDocument();

    await userEvent.click(more);
    expect(screen.getByRole('status')).toHaveTextContent('3');
    expect(more).toBeDisabled();

    await userEvent.click(less);
    await userEvent.click(less);
    expect(screen.getByRole('status')).toHaveTextContent('1');
    expect(less).toBeDisabled();
  });
});

describe('Badge and StatusChip', () => {
  it('a badge reads out words, not a bare number', () => {
    render(<Badge count={2} label="2 waiting" />);
    expect(screen.getByText('2 waiting')).toHaveClass('sr-only');
  });

  it('a chip always carries its word, and the symbol is hidden from screen readers', () => {
    render(<StatusChip tone="danger">Needs a level 3</StatusChip>);

    const chip = screen.getByText('Needs a level 3');
    expect(chip).toHaveTextContent('✕');
    expect(chip.querySelector('[aria-hidden="true"]')).toHaveTextContent('✕');
  });
});
