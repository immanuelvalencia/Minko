'use client';

import { memo } from 'react';
import { EFFECTS, type EffectState } from './config';
import Switch from './ui/Switch';

type Props = {
  state: Record<string, EffectState>;
  disabled: boolean;
  onChange: (id: string, next: Partial<EffectState>) => void;
};

function EffectsPanel({ state, disabled, onChange }: Props) {
  return (
    <div className="params params-fx" role="tabpanel">
      {EFFECTS.map((fx) => {
        const s = state[fx.id];
        return (
          <div key={fx.id} className={s.on ? 'param fx' : 'param fx is-off'}>
            <span className="param-head">
              <Switch
                id={`fx-${fx.id}`}
                checked={s.on}
                disabled={disabled}
                small
                ariaLabel={fx.label}
                onChange={(on) => onChange(fx.id, { on })}
              />
              <span className="param-name">{fx.label}</span>
              <span className="mono param-val">{s.amount.toFixed(2)}</span>
            </span>
            <input
              className="slider"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={s.amount}
              disabled={disabled}
              aria-label={`${fx.label} strength`}
              onChange={(e) => {
                const amount = Number(e.target.value);
                // Nudging a slider is a clear signal you want that effect on.
                onChange(fx.id, s.on || amount === 0 ? { amount } : { amount, on: true });
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

export default memo(EffectsPanel);
