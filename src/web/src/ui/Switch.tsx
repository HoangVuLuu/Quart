import { Switch as RadixSwitch } from 'radix-ui';
import { useId } from 'react';
import { cx } from './cx';

type SwitchProps = {
  label: string;
  // Smaller text under the label.
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
};

// A row with a label and a pill track with a white knob, like the settings in the prototype. The
// whole row is the tap target (56 px tall), and the track colour is not the only signal: the knob
// also sits on the other side.
export function Switch({ label, description, checked, onCheckedChange, disabled, className }: SwitchProps) {
  const id = useId();

  return (
    <div
      className={cx(
        'flex min-h-14 items-center gap-3 rounded-field bg-surface-3 px-4 py-2',
        disabled && 'opacity-50',
        className,
      )}
    >
      <label htmlFor={id} className="min-w-0 flex-1 py-1">
        <span className="block text-[15px] font-bold">{label}</span>
        {description && <span className="block text-xs text-muted">{description}</span>}
      </label>
      <RadixSwitch.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className="relative h-7 w-12 shrink-0 rounded-pill bg-muted p-0.75 data-[state=checked]:bg-ink"
      >
        <RadixSwitch.Thumb className="block size-5.5 rounded-full bg-surface transition-transform duration-150 data-[state=checked]:translate-x-5" />
      </RadixSwitch.Root>
    </div>
  );
}
