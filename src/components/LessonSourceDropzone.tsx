import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  FileText,
  FileUp,
  LoaderCircle,
  Presentation,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  importLessonSource,
  LESSON_SOURCE_LIMITS,
  LessonSourceImportError,
  type LessonSourceImportOptions,
  type LessonSourceOutline,
} from '../services/lessonSourceImport';

type LessonSourceParser = (
  file: File,
  options?: LessonSourceImportOptions,
) => Promise<LessonSourceOutline>;

interface LessonSourceDropzoneProps {
  onApply: (outline: LessonSourceOutline) => boolean | void;
  parseSource?: LessonSourceParser;
  disabled?: boolean;
}

const ACCEPTED_SOURCE_TYPES = [
  '.pdf',
  '.pptx',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
].join(',');

function readableError(error: unknown): string {
  if (error instanceof LessonSourceImportError) return error.message;
  return 'This document could not be read. Export a fresh PDF or PowerPoint copy and try again.';
}

const LessonSourceDropzone: React.FC<LessonSourceDropzoneProps> = ({
  onApply,
  parseSource = importLessonSource,
  disabled = false,
}) => {
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [outline, setOutline] = useState<LessonSourceOutline | null>(null);
  const [applied, setApplied] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [returnFocusToDropzone, setReturnFocusToDropzone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropzoneRef = useRef<HTMLDivElement>(null);
  const previewHeadingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  useEffect(() => {
    if (outline) {
      setAnnouncement(`${outline.format === 'pdf' ? 'PDF' : 'PowerPoint'} draft ready to review.`);
      previewHeadingRef.current?.focus();
    }
  }, [outline]);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  useEffect(() => {
    if (returnFocusToDropzone && !outline) {
      dropzoneRef.current?.focus();
      setReturnFocusToDropzone(false);
    }
  }, [outline, returnFocusToDropzone]);

  const reset = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setDragging(false);
    setError('');
    setOutline(null);
    setApplied(false);
    setAnnouncement('Document import cleared. Choose another file.');
    setReturnFocusToDropzone(true);
    if (inputRef.current) inputRef.current.value = '';
  };

  const readFiles = async (files: FileList | readonly File[]) => {
    if (disabled || busy) return;
    if (files.length !== 1) {
      setOutline(null);
      setApplied(false);
      setError('Choose exactly one PDF or PowerPoint file at a time.');
      return;
    }
    const file = files[0];
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    setBusy(true);
    setError('');
    setOutline(null);
    setApplied(false);
    setAnnouncement('Reading document text in this browser.');
    try {
      const nextOutline = await parseSource(file, { signal: controller.signal });
      if (!controller.signal.aborted) setOutline(nextOutline);
    } catch (nextError) {
      if (!controller.signal.aborted) setError(readableError(nextError));
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setBusy(false);
      }
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const openPicker = () => {
    if (!disabled && !busy) inputRef.current?.click();
  };

  const apply = () => {
    if (!outline || disabled || busy) return;
    if (onApply(outline) !== false) setApplied(true);
  };

  const FormatIcon = outline?.format === 'pptx' ? Presentation : FileText;

  return (
    <section className="lesson-source-import" aria-labelledby="lesson-source-heading">
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
      <div className="lesson-source-header">
        <div className="lesson-source-icon"><FileUp aria-hidden="true" /></div>
        <div>
          <p className="lesson-builder-eyebrow">Optional fast start</p>
          <h3 id="lesson-source-heading">Import PDF or PowerPoint</h3>
          <p>
            Source-file extraction is local. Applied text becomes editable lesson content and may later be sent
            to the configured model during tutoring; it is never marked clinically reviewed automatically.
          </p>
        </div>
        <span className="lesson-source-local"><ShieldCheck aria-hidden="true" /> Source file stays in this browser</span>
      </div>

      {!outline && (
        <>
          <input
            ref={inputRef}
            id="lesson-source-file"
            type="file"
            hidden
            tabIndex={-1}
            accept={ACCEPTED_SOURCE_TYPES}
            aria-label="Choose PDF or PowerPoint"
            disabled={disabled || busy}
            onChange={(event) => { if (event.target.files) void readFiles(event.target.files); }}
          />
          <div
            ref={dropzoneRef}
            className={`lesson-source-dropzone${dragging ? ' dragging' : ''}${busy ? ' busy' : ''}`}
            role="button"
            tabIndex={disabled || busy ? -1 : 0}
            aria-disabled={disabled || busy}
            aria-busy={busy}
            aria-describedby="lesson-source-limits"
            onClick={openPicker}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openPicker();
              }
            }}
            onDragEnter={(event) => {
              event.preventDefault();
              if (!disabled && !busy) setDragging(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              if (!disabled && !busy) {
                event.dataTransfer.dropEffect = 'copy';
                setDragging(true);
              }
            }}
            onDragLeave={(event) => {
              if (
                !(event.relatedTarget instanceof Node)
                || !event.currentTarget.contains(event.relatedTarget)
              ) setDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              void readFiles(event.dataTransfer.files);
            }}
          >
            {busy ? <LoaderCircle className="lesson-source-spinner" aria-hidden="true" /> : <FileUp aria-hidden="true" />}
            <strong>{busy ? 'Reading document text in this browser…' : 'Drop a PDF or .pptx here'}</strong>
            <span>{busy ? 'Large documents can take a moment.' : 'or choose a file'}</span>
            <small id="lesson-source-limits">
              One file · up to {LESSON_SOURCE_LIMITS.maxFileBytes / 1024 / 1024} MB · up to {LESSON_SOURCE_LIMITS.maxUnits} pages or slides
            </small>
          </div>
          {busy && (
            <button type="button" className="lesson-source-cancel" onClick={reset}>
              <X aria-hidden="true" /> Cancel import
            </button>
          )}
        </>
      )}

      {error && (
        <div className="lesson-source-error" role="alert" tabIndex={-1} ref={errorRef}>
          <FileText aria-hidden="true" />
          <div><strong>Could not make a draft</strong><p>{error}</p></div>
          <button type="button" onClick={reset}>Try another file</button>
        </div>
      )}

      {outline && (
        <div className="lesson-source-preview">
          <div className="lesson-source-preview-heading">
            <div className="lesson-source-format"><FormatIcon aria-hidden="true" /></div>
            <div>
              <p className="lesson-builder-eyebrow">Local preview</p>
              <h4 ref={previewHeadingRef} tabIndex={-1}>
                {outline.format === 'pdf' ? 'PDF draft' : 'PowerPoint draft'} ready to review
              </h4>
            </div>
            <dl>
              <div><dt>{outline.format === 'pdf' ? 'Pages' : 'Slides'}</dt><dd>{outline.unitCount}</dd></div>
              <div><dt>Readable text</dt><dd>{outline.extractedCharacters.toLocaleString()} characters</dd></div>
            </dl>
          </div>

          <div className="lesson-source-outline-grid">
            <section aria-labelledby="lesson-source-title-preview">
              <span id="lesson-source-title-preview">Suggested title</span>
              <strong>{outline.titleCandidate ?? 'Add a title manually'}</strong>
            </section>
            <section aria-labelledby="lesson-source-objectives-preview">
              <span id="lesson-source-objectives-preview">Possible objectives</span>
              {outline.objectiveCandidates.length > 0 ? (
                <ol>{outline.objectiveCandidates.map((objective) => <li key={objective}>{objective}</li>)}</ol>
              ) : <p>No clear objective lines were detected.</p>}
            </section>
          </div>

          {outline.detectedLinks.length > 0 && (
            <div className="lesson-source-links">
              <strong>Links found—not verified or added as sources</strong>
              <ul>{outline.detectedLinks.slice(0, 5).map((link) => <li key={link}>{link}</li>)}</ul>
            </div>
          )}

          {outline.warnings.length > 0 && (
            <ul className="lesson-source-warnings" aria-label="Import notes">
              {outline.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          )}

          <details className="lesson-source-text-preview">
            <summary>Preview extracted teaching notes</summary>
            <pre>{outline.teachingNoteDraft.slice(0, 2_000)}{outline.teachingNoteDraft.length > 2_000 ? '\n\n…preview shortened' : ''}</pre>
          </details>

          <div className="lesson-source-actions">
            <button type="button" className="lesson-builder-button secondary" onClick={reset}>Choose another file</button>
            <button type="button" className="lesson-builder-button primary" disabled={applied} onClick={apply}>
              {applied ? <CheckCircle2 aria-hidden="true" /> : <FileUp aria-hidden="true" />}
              {applied ? 'Imported draft applied' : 'Apply imported draft'}
            </button>
          </div>
          {applied && (
            <p className="lesson-source-applied" role="status">
              Draft applied. Review every field before marking the lesson clinically reviewed.
            </p>
          )}
        </div>
      )}
    </section>
  );
};

export type { LessonSourceParser };
export default LessonSourceDropzone;
