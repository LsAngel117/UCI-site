/**
 * Media upload dialog (Phase 10C, docs/09 §47–§48).
 *
 * Validates the file before sending it, uploads through the admin multipart
 * endpoint with real progress, and reports every phase honestly: uploading,
 * server processing, success and error. Client validation is only a courtesy;
 * the API remains authoritative for type, signature and size.
 */
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from 'react';
import type { MediaDto } from '@shared/media';
import { MEDIA_ALLOWED_MIME_TYPES } from '@shared/media';
import {
  canCancelUpload,
  describeMediaError,
  emptyUploadMetadata,
  formatBytes,
  MEDIA_FOLDER_OPTIONS,
  MEDIA_UPLOAD_MAX_BYTES,
  mediaTypeLabel,
  UPLOAD_INTERRUPTED_MESSAGE,
  UPLOAD_PROCESSING_CANCEL_HINT,
  validateMediaMetadata,
  validateUploadFile,
  type MediaMetadataErrors,
  type UploadMetadataForm,
  type UploadPhase,
} from '../../lib/media';
import { uploadMedia } from '../../lib/media-api';
import { Dialog } from '../content/Dialog';

interface MediaUploadDialogProps {
  open: boolean;
  onClose: () => void;
  onUploaded: (media: MediaDto) => void;
  maxBytes?: number;
}

function isAbort(error: unknown): boolean {
  return (
    error instanceof DOMException
      ? error.name === 'AbortError'
      : error instanceof Error && error.name === 'AbortError'
  );
}

export function MediaUploadDialog({
  open,
  onClose,
  onUploaded,
  maxBytes = MEDIA_UPLOAD_MAX_BYTES,
}: MediaUploadDialogProps) {
  const fileId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileMessage, setFileMessage] = useState<string | null>(null);
  const [form, setForm] = useState<UploadMetadataForm>(emptyUploadMetadata);
  const [fieldErrors, setFieldErrors] = useState<MediaMetadataErrors>({});
  const [phase, setPhase] = useState<UploadPhase>('idle');
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Abort an in-flight upload if the dialog unmounts.
  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setFileMessage(null);
    setForm(emptyUploadMetadata());
    setFieldErrors({});
    setPhase('idle');
    setPercent(0);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  }, [open]);

  const busy = phase !== 'idle';

  function updateField(field: keyof UploadMetadataForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function acceptFile(next: File | null) {
    setError(null);
    setFileMessage(null);
    if (!next) {
      setFile(null);
      return;
    }
    const validation = validateUploadFile(next, maxBytes);
    if (!validation.ok) {
      setFile(null);
      setFileMessage(validation.message);
      return;
    }
    setFile(next);
    // A PDF uploaded through the generic flow belongs in `documents` unless the
    // operator already chose another folder.
    if (next.type === 'application/pdf' && form.folder === 'uploads') {
      setForm((current) => ({ ...current, folder: 'documents' }));
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    acceptFile(event.target.files?.[0] ?? null);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    if (busy) return;
    acceptFile(event.dataTransfer.files?.[0] ?? null);
  }

  // Once the body is fully sent the server may persist the asset regardless of
  // the client, so closing the dialog then lets the request finish instead of
  // aborting it (C1). Aborting is only offered while the body is still sending.
  function handleClose() {
    if (phase === 'uploading') {
      abortRef.current?.abort();
    }
    onClose();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || busy) return;

    const validation = validateMediaMetadata(form);
    setFieldErrors(validation.errors);
    if (validation.input === null) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setPhase('uploading');
    setPercent(0);
    setError(null);

    try {
      const media = await uploadMedia(file, form, {
        signal: controller.signal,
        onProgress: (progress) => {
          setPercent(progress.percent);
          if (progress.percent >= 100) setPhase('processing');
        },
        onProcessing: () => setPhase('processing'),
      });
      onUploaded(media);
    } catch (reason) {
      setPhase('idle');
      setPercent(0);
      // Aborting only ends the client wait; the server may still finish the
      // upload, so the copy must not promise that nothing was stored (C1).
      setError(
        isAbort(reason)
          ? UPLOAD_INTERRUPTED_MESSAGE
          : describeMediaError(reason, maxBytes),
      );
    } finally {
      abortRef.current = null;
    }
  }

  const fileTypeLabel =
    file && file.type
      ? (MEDIA_ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)
        ? mediaTypeLabel(file.type === 'application/pdf' ? 'DOCUMENT' : 'IMAGE')
        : file.type
      : null;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      wide
      title="Subir archivo"
      description="Imágenes JPG, PNG, WebP o GIF y documentos PDF. El servidor valida el contenido real."
    >
      <form className="media-upload" onSubmit={handleSubmit}>
        <div className="field">
          <span className="field__label">Archivo</span>
          <label
            className={`upload-drop${file ? ' upload-drop--ready' : ''}`}
            htmlFor={fileId}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
          >
            <span className="upload-drop__title">
              Arrastrá un archivo o elegí uno
            </span>
            <span className="upload-drop__hint">
              JPG, PNG, WebP, GIF o PDF · máximo {formatBytes(maxBytes)}
            </span>
            <input
              id={fileId}
              ref={inputRef}
              className="upload-drop__input"
              type="file"
              accept={MEDIA_ALLOWED_MIME_TYPES.join(',')}
              onChange={handleFileChange}
              disabled={busy}
            />
          </label>
          {file ? (
            <p className="upload-file">
              <span className="upload-file__name">{file.name}</span>
              <span className="upload-file__meta">
                {fileTypeLabel} · {formatBytes(file.size)}
              </span>
            </p>
          ) : null}
          {fileMessage ? (
            <p className="field__error" role="alert">
              {fileMessage}
            </p>
          ) : null}
        </div>

        <div className="form-grid">
          <div className="field">
            <label className="field__label" htmlFor="upload-folder">
              Carpeta
            </label>
            <select
              id="upload-folder"
              className="field__input"
              value={form.folder}
              onChange={(event) => updateField('folder', event.target.value)}
              disabled={busy}
            >
              {MEDIA_FOLDER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="field__help">
              Organiza el archivo en el almacenamiento documentado.
            </p>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="upload-title">
              Título
            </label>
            <input
              id="upload-title"
              className="field__input"
              type="text"
              value={form.title}
              maxLength={200}
              onChange={(event) => updateField('title', event.target.value)}
              disabled={busy}
            />
            {fieldErrors.title ? (
              <p className="field__error">{fieldErrors.title}</p>
            ) : null}
          </div>
          <div className="field">
            <label className="field__label" htmlFor="upload-alt">
              Texto alternativo
            </label>
            <input
              id="upload-alt"
              className="field__input"
              type="text"
              value={form.alt}
              maxLength={500}
              onChange={(event) => updateField('alt', event.target.value)}
              disabled={busy}
            />
            <p className="field__help">
              Describí la imagen para lectores de pantalla.
            </p>
            {fieldErrors.alt ? (
              <p className="field__error">{fieldErrors.alt}</p>
            ) : null}
          </div>
          <div className="field">
            <label className="field__label" htmlFor="upload-caption">
              Epígrafe
            </label>
            <input
              id="upload-caption"
              className="field__input"
              type="text"
              value={form.caption}
              maxLength={500}
              onChange={(event) => updateField('caption', event.target.value)}
              disabled={busy}
            />
            {fieldErrors.caption ? (
              <p className="field__error">{fieldErrors.caption}</p>
            ) : null}
          </div>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="upload-description">
            Descripción
          </label>
          <textarea
            id="upload-description"
            className="field__input field__textarea"
            value={form.description}
            maxLength={5000}
            onChange={(event) => updateField('description', event.target.value)}
            disabled={busy}
          />
          {fieldErrors.description ? (
            <p className="field__error">{fieldErrors.description}</p>
          ) : null}
        </div>

        {busy || percent > 0 ? (
          <div className="upload-progress" aria-live="polite">
            <div className="upload-progress__head">
              <span>
                {phase === 'processing' ? 'Procesando…' : 'Subiendo…'}
              </span>
              <span>{percent}%</span>
            </div>
            <progress
              className="upload-progress__bar"
              value={percent}
              max={100}
              aria-label="Progreso de la carga"
            >
              {percent}%
            </progress>
            {phase === 'processing' ? (
              <p className="field__help">
                El servidor está validando y generando las variantes del archivo.
              </p>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <p className="form__error" role="alert">
            {error}
          </p>
        ) : null}

        {phase === 'processing' ? (
          <p className="field__help" role="status">
            {UPLOAD_PROCESSING_CANCEL_HINT}
          </p>
        ) : null}

        <div className="media-upload__actions">
          {busy ? (
            <button
              type="button"
              className="button button--quiet"
              onClick={() => abortRef.current?.abort()}
              disabled={!canCancelUpload(phase)}
            >
              Cancelar carga
            </button>
          ) : (
            <button type="button" className="button button--quiet" onClick={handleClose}>
              Cancelar
            </button>
          )}
          <button
            type="submit"
            className="button button--primary"
            disabled={!file || busy || fileMessage !== null}
          >
            {phase === 'uploading'
              ? 'Subiendo…'
              : phase === 'processing'
                ? 'Procesando…'
                : 'Subir archivo'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
