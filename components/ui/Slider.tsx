'use client';

type Props = {
  id: string;
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  onChange: (value: number) => void;
};

export default function Slider({ id, label, value, display, min, max, step, disabled, onChange }: Props) {
  return (
    <label className="param" htmlFor={id}>
      <span className="param-head">
        <span className="param-name">{label}</span>
        <span className="mono param-val">{display}</span>
      </span>
      <input
        id={id}
        className="slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
