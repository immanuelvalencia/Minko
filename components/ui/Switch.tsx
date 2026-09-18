'use client';

type Props = {
  id: string;
  checked: boolean;
  disabled?: boolean;
  small?: boolean;
  ariaLabel?: string;
  onChange: (checked: boolean) => void;
};

export default function Switch({ id, checked, disabled, small, ariaLabel, onChange }: Props) {
  return (
    <span className={small ? 'switch switch-sm' : 'switch'}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="switch-track">
        <span className="switch-thumb" />
      </span>
    </span>
  );
}
