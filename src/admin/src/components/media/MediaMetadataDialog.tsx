/**
 * Media metadata editor (Phase 10C, docs/09 §49).
 *
 * PATCHes only the editorial fields documented by the API. Blank fields are
 * sent as `null` so clearing them actually removes the stored text, and the
 * dialog stays open while the request is in flight to prevent double submits.
 */
import { useEffect, useId, useState } from 'react';
import type { MediaDto } from '@shared/media';
import {
  describeMediaError,
  mediaDisplayName,
  mediaToMetadataForm,
  validateMediaMetadata,
  type MediaMetadataErrors,
  type MediaMetadataForm,
} from '../../lib/media';
import { updateMediaMetadata } from '../../lib/media-api';
import { Dialog } from '../content/Dialog';

interface MediaMetadataDialogProps {
  asset: MediaDto | null;
  onClose: () => void;
  onSaved: (media: MediaDto) => void;
}

export function MediaMetadataDialog({
  asset,
  onClose,
  onSaved,
}: MediaMetadataDialogProps) {
  const ids = {
    alt: useId(),
    title: useId(),
    description: useId(),
    caption: useId(),
  };
  const [form, setForm] = useState<MediaMetadataForm>({
    alt: '',
    title: '',
    description: '',
    caption: '',
  });
  const [errors, setErrors] = useState<MediaMetadataErrors>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!asset) return;
    setForm(mediaToMetadataForm(asset));
    setErrors({});
    setError(null);
    setSaving(false);
  }, [asset]);

  function updateField(field: keyof MediaMetadataForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit() {
    if (!asset || saving) return;
    const validation = validateMediaMetadata(form);
    setErrors(validation.errors);
    if (validation.input === null) return;

    setSaving(true);
    setError(null);
    try {
      const updated = await updateMediaMetadata(asset.id, validation.input);
      onSaved(updated);
    } catch (reason) {
      setError(describeMediaError(reason));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={asset !== null}
      onClose={saving ? () => undefined : onClose}
      title="Editar metadata"
      description={
        asset
          ? `Los cambios se guardan sobre «${mediaDisplayName(asset)}»; el archivo binario no cambia.`
          : undefined
      }
      footer={
        <>
          <button
            type="button"
            className="button button--quiet"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="button button--primary"
            onClick={() => {
              void handleSubmit();
            }}
            disabled={saving}
          >
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </>
      }
    >
      <form
        className="media-metadata"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
      >
        <div className="field">
          <label className="field__label" htmlFor={ids.title}>
            Título
          </label>
          <input
            id={ids.title}
            className="field__input"
            type="text"
            value={form.title}
            maxLength={200}
            onChange={(event) => updateField('title', event.target.value)}
            disabled={saving}
          />
          {errors.title ? <p className="field__error">{errors.title}</p> : null}
        </div>

        <div className="field">
          <label className="field__label" htmlFor={ids.alt}>
            Texto alternativo
          </label>
          <input
            id={ids.alt}
            className="field__input"
            type="text"
            value={form.alt}
            maxLength={500}
            onChange={(event) => updateField('alt', event.target.value)}
            disabled={saving}
          />
          <p className="field__help">
            Obligatorio en la práctica para imágenes con contenido informativo.
          </p>
          {errors.alt ? <p className="field__error">{errors.alt}</p> : null}
        </div>

        <div className="field">
          <label className="field__label" htmlFor={ids.caption}>
            Epígrafe
          </label>
          <input
            id={ids.caption}
            className="field__input"
            type="text"
            value={form.caption}
            maxLength={500}
            onChange={(event) => updateField('caption', event.target.value)}
            disabled={saving}
          />
          {errors.caption ? (
            <p className="field__error">{errors.caption}</p>
          ) : null}
        </div>

        <div className="field">
          <label className="field__label" htmlFor={ids.description}>
            Descripción
          </label>
          <textarea
            id={ids.description}
            className="field__input field__textarea"
            value={form.description}
            maxLength={5000}
            onChange={(event) => updateField('description', event.target.value)}
            disabled={saving}
          />
          {errors.description ? (
            <p className="field__error">{errors.description}</p>
          ) : null}
        </div>

        {error ? (
          <p className="form__error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
