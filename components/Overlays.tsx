'use client';

type DropzoneProps = { dragging: boolean; onChoose: () => void };

export function Dropzone({ dragging, onChoose }: DropzoneProps) {
  return (
    <div className={dragging ? 'overlay dropzone dragover' : 'overlay dropzone'}>
      <div className="dz-card">
        <svg className="dz-art" viewBox="0 0 120 78" aria-hidden="true">
          <g fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2" y="20" width="62" height="38" rx="3" opacity=".14" />
            <rect x="15" y="16" width="62" height="38" rx="3" opacity=".26" />
            <rect x="28" y="12" width="62" height="38" rx="3" opacity=".45" />
            <rect x="41" y="8" width="62" height="38" rx="3" opacity=".9" />
          </g>
        </svg>
        <h2>Drop a video here</h2>
        <p>
          The clip becomes one solid block — width and height are the picture, depth is time.
          <br />
          Nothing is uploaded; decoding happens in your browser.
        </p>
        <button className="btn btn-primary" type="button" onClick={onChoose}>
          Choose a file
        </button>
        <p className="dz-hint">MP4, WebM, MOV · whatever your browser can decode</p>
      </div>
    </div>
  );
}

type ProgressProps = {
  title: string;
  detail: string;
  ratio: number | null;
  count: string;
  onCancel: () => void;
};

export function ProgressPane({ title, detail, ratio, count, onCancel }: ProgressProps) {
  return (
    <div className="overlay progress-pane">
      <div className="pp-card">
        <h2>{title}</h2>
        <p className="pp-detail">{detail}</p>
        <div className="bar">
          <div
            className={ratio === null ? 'bar-fill indeterminate' : 'bar-fill'}
            style={ratio === null ? undefined : { width: `${Math.min(1, Math.max(0, ratio)) * 100}%` }}
          />
        </div>
        <div className="pp-foot">
          <span className="mono">{count}</span>
          <button className="btn btn-ghost btn-sm" type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

type ErrorProps = { title: string; detail: string; onDismiss: () => void };

export function ErrorPane({ title, detail, onDismiss }: ErrorProps) {
  return (
    <div className="overlay error-pane">
      <div className="err-card">
        <svg className="err-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 8v5m0 3h.01M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20.2h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div className="err-body">
          <h3>{title}</h3>
          <p>{detail}</p>
        </div>
        <button className="btn btn-ghost btn-sm" type="button" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  );
}

type NoticeProps = { text: string; onClose: () => void };

export function Notice({ text, onClose }: NoticeProps) {
  return (
    <div className="notice">
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="6.4" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <path d="M8 7.2v4M8 4.9v.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <span>{text}</span>
      <button className="notice-x" type="button" aria-label="Dismiss" onClick={onClose}>
        ×
      </button>
    </div>
  );
}
