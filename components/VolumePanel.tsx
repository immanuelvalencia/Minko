'use client';

import { memo } from 'react';
import { VOLUME_CONTROLS, depthFromPos, type VolumeControl } from './config';
import Slider from './ui/Slider';
import Switch from './ui/Switch';

type Props = {
  values: Record<VolumeControl['key'], number>;
  followCamera: boolean;
  disabled: boolean;
  onChange: (key: VolumeControl['key'], value: number) => void;
  onFollowChange: (value: boolean) => void;
};

function display(control: VolumeControl, value: number) {
  if (control.key === 'blockDepth') {
    const span = depthFromPos(value);
    return span < 10 ? span.toFixed(2) : span.toFixed(1);
  }
  return control.decimals === 0 ? String(Math.round(value)) : value.toFixed(control.decimals);
}

function VolumePanel({ values, followCamera, disabled, onChange, onFollowChange }: Props) {
  return (
    <div className="params" role="tabpanel">
      {VOLUME_CONTROLS.map((control) => (
        <Slider
          key={control.key}
          id={`vc-${control.key}`}
          label={control.label}
          value={values[control.key]}
          display={display(control, values[control.key])}
          min={control.min}
          max={control.max}
          step={control.step}
          disabled={disabled}
          onChange={(v) => onChange(control.key, v)}
        />
      ))}

      <div className="param param-toggle">
        <span className="param-head">
          <span className="param-name">Camera follows slice</span>
        </span>
        <Switch
          id="followCam"
          checked={followCamera}
          disabled={disabled}
          ariaLabel="Camera follows slice"
          onChange={onFollowChange}
        />
      </div>
    </div>
  );
}

export default memo(VolumePanel);
