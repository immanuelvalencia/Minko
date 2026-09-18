'use client';

import { useMemo, useState } from 'react';
import { CAMERA_MOVES, ASPECTS, outputSize, pickMimeType, extensionFor } from '@/lib/export.js';

export type ExportOptions = {
  move: string;
  seconds: number;
  fps: number;
  height: number;
  aspectRatio: number | null;
};

type Props = {
  sourceAspect: number;
  busy: boolean;
  progress: { done: number; total: number } | null;
  statusText: string;
  onStart: (options: ExportOptions) => void;
  onStop: () => void;
  onClose: () => void;
};

export default function ExportDialog({
  sourceAspect,
  busy,
  progress,
  statusText,
  onStart,
  onStop,
  onClose,
}: Props) {
  const [moveId, setMoveId] = useState<string>(CAMERA_MOVES[0].id);
  const [seconds, setSeconds] = useState(15);
  const [fps, setFps] = useState(24);
  const [height, setHeight] = useState(1080);
  const [aspectId, setAspectId] = useState('wide');

  const mimeType = useMemo(() => pickMimeType(), []);
  const aspect = ASPECTS.find((a: { id: string }) => a.id === aspectId) ?? ASPECTS[0];
  const size = outputSize(height, aspect.ratio, sourceAspect);
  const frames = Math.round(seconds * fps);
  const hint = CAMERA_MOVES.find((m: { id: string }) => m.id === moveId)?.hint ?? '';

  return (
    <div className="overlay export-pane">
      <div className="ex-card" role="dialog" aria-modal="true" aria-labelledby="exTitle">
        <h2 id="exTitle">Export a cinematic pass</h2>
        <p className="ex-sub">
          Renders frame by frame, so the result is smooth however fast this machine is.
        </p>

        {busy ? (
          <div className="ex-progress">
            <p className="pp-detail">
              {progress
                ? `Rendering frame ${progress.done.toLocaleString()} of ${progress.total.toLocaleString()}`
                : statusText || 'Starting…'}
            </p>
            <div className="bar">
              <div
                className="bar-fill"
                style={{ width: progress ? `${(progress.done / progress.total) * 100}%` : '0%' }}
              />
            </div>
            <p className="ex-note">Keep this tab in front — a background tab throttles rendering.</p>
          </div>
        ) : (
          <div className="ex-form">
            <label className="ex-field">
              <span>Camera move</span>
              <select value={moveId} onChange={(e) => setMoveId(e.target.value)}>
                {CAMERA_MOVES.map((m: { id: string; label: string }) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="ex-hint">{hint}</p>

            <div className="ex-row">
              <label className="ex-field">
                <span>Length</span>
                <select value={seconds} onChange={(e) => setSeconds(Number(e.target.value))}>
                  {[6, 10, 15, 24, 40].map((s) => (
                    <option key={s} value={s}>{`${s} seconds`}</option>
                  ))}
                </select>
              </label>
              <label className="ex-field">
                <span>Frame rate</span>
                <select value={fps} onChange={(e) => setFps(Number(e.target.value))}>
                  {[24, 30, 60].map((f) => (
                    <option key={f} value={f}>{`${f} fps`}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="ex-row">
              <label className="ex-field">
                <span>Resolution</span>
                <select value={height} onChange={(e) => setHeight(Number(e.target.value))}>
                  {[720, 1080, 1440].map((h) => (
                    <option key={h} value={h}>{`${h}p`}</option>
                  ))}
                </select>
              </label>
              <label className="ex-field">
                <span>Aspect</span>
                <select value={aspectId} onChange={(e) => setAspectId(e.target.value)}>
                  {ASPECTS.map((a: { id: string; label: string }) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <p className="ex-summary mono">
              {mimeType
                ? `${size.width}×${size.height} · ${frames.toLocaleString()} frames · .${extensionFor(mimeType)}`
                : 'This browser cannot encode video.'}
            </p>
          </div>
        )}

        <div className="ex-actions">
          <button className="btn btn-ghost" type="button" onClick={busy ? onStop : onClose}>
            {busy ? 'Stop' : 'Cancel'}
          </button>
          {!busy && (
            <button
              className="btn btn-primary"
              type="button"
              disabled={!mimeType}
              onClick={() =>
                onStart({ move: moveId, seconds, fps, height, aspectRatio: aspect.ratio })
              }
            >
              Export
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
