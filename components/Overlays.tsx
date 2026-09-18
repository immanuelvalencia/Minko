'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRef, useState } from 'react';

type Demo = { id: string; title: string; description: string };
type DropzoneProps = { dragging: boolean; onChoose: () => void; demos: Demo[]; onDemo: (id: string) => void };

export function Dropzone({ dragging, onChoose, demos, onDemo }: DropzoneProps) {
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
          The clip becomes a navigable frame stack — width and height are the picture, depth is time.
          <br />
          Nothing is uploaded; decoding happens in your browser.
        </p>
        <button className="btn btn-primary" type="button" onClick={onChoose}>
          Choose a file
        </button>
        <div className="demo-area">
          <span className="demo-label">OR TRY A DEMO</span>
          <div className="demo-list">
            {demos.map((demo) => (
              <button className="demo-card" type="button" key={demo.id} onClick={() => onDemo(demo.id)}>
                <strong>{demo.title}</strong>
                <span>{demo.description}</span>
              </button>
            ))}
          </div>
        </div>
        <p className="dz-hint">MP4, WebM, MOV · whatever your browser can decode</p>
      </div>
    </div>
  );
}

type UploadDialogProps = {
  file: File | null;
  demo: Demo | null;
  detail: number;
  longVideoApproved: boolean;
  warning: string | null;
  onFile: (file: File) => void;
  onDetail: (detail: number) => void;
  onLongVideoApproved: (approved: boolean) => void;
  onStart: () => void;
  onClose: () => void;
};

export function UploadDialog({ file, demo, detail, longVideoApproved, warning, onFile, onDetail, onLongVideoApproved, onStart, onClose }: UploadDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [longNoticeOpen, setLongNoticeOpen] = useState(false);
  const source = file?.name ?? demo?.title;

  return (
    <div className="overlay upload-pane" role="presentation" onMouseDown={onClose}>
      <section className="upload-card" role="dialog" aria-modal="true" aria-labelledby="uploadTitle" onMouseDown={(event) => event.stopPropagation()}>
        <button className="about-close" type="button" aria-label="Close upload settings" onClick={onClose}>×</button>
        <p className="upload-kicker">OPEN VIDEO</p>
        <h2 id="uploadTitle">Prepare your frame stack</h2>
        <p className="upload-intro">Choose the detail before processing. Every option covers the video&apos;s full duration.</p>

        <div className="upload-source">
          <span className="upload-label">VIDEO</span>
          <div className="upload-source-row">
            <span className="upload-filename">{source ?? 'No video selected'}</span>
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => inputRef.current?.click()}>{source ? 'Change file' : 'Choose file'}</button>
          </div>
          <input ref={inputRef} type="file" accept="video/*" hidden onChange={(event) => {
            const next = event.target.files?.[0];
            event.target.value = '';
            if (next) onFile(next);
          }} />
        </div>

        <fieldset className="upload-detail">
          <legend className="upload-label">FRAME DETAIL <span>lightest → fullest</span></legend>
          {[
            { value: 512, title: 'Light', description: 'Up to 512 slices · fastest, lowest memory' },
            { value: 1024, title: 'Balanced', description: 'Up to 1,024 slices · more motion detail' },
            { value: 0, title: 'Full detail', description: 'As many frames as your GPU can hold · slowest' },
          ].map((option) => (
            <label className={detail === option.value ? 'upload-option selected' : 'upload-option'} key={option.value}>
              <input type="radio" name="frame-detail" value={option.value} checked={detail === option.value} onChange={() => onDetail(option.value)} />
              <span><strong>{option.title}</strong><small>{option.description}</small></span>
            </label>
          ))}
        </fieldset>

        <p className="upload-notice">Processing stays in this browser. Long or high-resolution videos may take several minutes, use significant memory, or fail on limited devices. The app may reduce slice resolution to fit your GPU.</p>
        <button className="upload-long-button" type="button" aria-expanded={longNoticeOpen} onClick={() => setLongNoticeOpen((open) => !open)}>
          <span>{longVideoApproved ? 'Longer videos enabled' : 'Enable longer videos'}</span>
          <span aria-hidden="true">{longNoticeOpen ? '−' : '+'}</span>
        </button>
        {longNoticeOpen && (
          <div className="upload-long-disclaimer">
            <p>Clips over 2 minutes are processed frame by frame on your device. This can take a long time, use substantial memory, and may fail if your browser or GPU runs out of resources. Light detail is recommended.</p>
            <label className="upload-long">
              <input type="checkbox" checked={longVideoApproved} onChange={(event) => onLongVideoApproved(event.target.checked)} />
              <span><strong>I understand — allow longer videos</strong></span>
            </label>
          </div>
        )}
        {warning && <p className="upload-warning" role="alert">{warning}</p>}
        <div className="upload-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" type="button" disabled={!source} onClick={onStart}>Process video</button>
        </div>
      </section>
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

type AboutProps = { onClose: () => void };

export function AboutPane({ onClose }: AboutProps) {
  return (
    <div className="overlay about-pane" role="presentation" onMouseDown={onClose}>
      <section className="about-card" role="dialog" aria-modal="true" aria-labelledby="aboutTitle" onMouseDown={(event) => event.stopPropagation()}>
        <button className="about-close" type="button" aria-label="Close about panel" onClick={onClose}>×</button>
        <p className="about-kicker">ABOUT MINKO</p>
        <h2 id="aboutTitle">Explore motion as it unfolds through time.</h2>
        <p>
          Minko turns video into a navigable frame stack, making motion and change visible across time. Its name is inspired by Hermann Minkowski and the idea of seeing space and time together.
        </p>
        <div className="about-minkowski">
          <Image src="/images/hermann-minkowski.jpg" alt="Portrait of Hermann Minkowski" width={813} height={1093} sizes="68px" />
          <div>
            <strong>INSPIRED BY HERMANN MINKOWSKI</strong>
            <p>His space-time diagram shows an event and a moving point&apos;s worldline. Minko applies the visual idea to video, not the physics.</p>
            <Link href="/about#minkowski">See his story and diagram <span aria-hidden="true">→</span></Link>
          </div>
        </div>
        <div className="about-credit" aria-label="Project attribution">
          <span className="about-label">DEVELOPED BY</span>
          <strong>Immanuel Valencia</strong>
          <span className="about-label about-label-space">AFFILIATION</span>
          <span>De La Salle University</span>
          <span>Department of Biomedical, Manufacturing, and Robotics Engineering</span>
        </div>
        <a className="about-site" href="https://immanuelvalencia.dev" target="_blank" rel="noreferrer">
          <span><small>WEBSITE</small>immanuelvalencia.dev</span>
          <span aria-hidden="true">↗</span>
        </a>
        <Link className="about-more" href="/about">More about the creator <span aria-hidden="true">→</span></Link>
      </section>
    </div>
  );
}
