/**
 * Sermon editor form (docs/09 §22–§27, §30).
 *
 * The form is a set of sections, not a wizard: every field is visible and
 * reachable with the keyboard, errors are tied to their input, and the media
 * fields store asset ids. Saving is the page's responsibility; this component
 * only renders values and reports edits.
 */
import type { PersonDto, SermonSeriesDto, TopicDto } from '@shared/cms';
import type { SermonFormErrors, SermonFormValues } from '../../../lib/sermons-form';
import { normalizeSlugInput } from '../../../lib/sermons-form';
import { MediaPicker } from '../../../components/content/MediaPicker';

export interface SermonTaxonomy {
  people: PersonDto[];
  series: SermonSeriesDto[];
  topics: TopicDto[];
  loading: boolean;
  error: string | null;
}

interface SermonFormProps {
  values: SermonFormValues;
  errors: SermonFormErrors;
  taxonomy: SermonTaxonomy;
  disabled: boolean;
  onChange: <K extends keyof SermonFormValues>(
    field: K,
    value: SermonFormValues[K],
  ) => void;
  onRetryTaxonomy?: () => void;
}

interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  required?: boolean;
  disabled?: boolean;
  type?: 'text' | 'url' | 'date' | 'number' | 'search';
  placeholder?: string;
  mono?: boolean;
  onBlur?: () => void;
}

function TextField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  required,
  disabled,
  type = 'text',
  placeholder,
  mono,
  onBlur,
}: TextFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
        {required ? <span className="field__required"> *</span> : null}
      </label>
      <input
        id={id}
        className={`field__input${mono ? ' field__input--mono' : ''}`}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />
      {hint ? (
        <p className="field__help" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="field__error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function TextAreaField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  rows = 4,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  rows?: number;
  disabled?: boolean;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        className="field__input field__textarea"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
      />
      {hint ? (
        <p className="field__help" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="field__error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function SermonForm({
  values,
  errors,
  taxonomy,
  disabled,
  onChange,
  onRetryTaxonomy,
}: SermonFormProps) {
  const selectedPreacherExists = taxonomy.people.some(
    (person) => person.id === values.preacherId,
  );

  return (
    <div className="form-sections">
      <section className="form-section" aria-labelledby="sermon-basic">
        <div className="form-section__head">
          <h2 className="form-section__title" id="sermon-basic">
            Información básica
          </h2>
          <p className="form-section__hint">
            Título, ubicación editorial y datos del mensaje.
          </p>
        </div>
        <div className="form-grid">
          <TextField
            id="sermon-title"
            label="Título"
            value={values.title}
            onChange={(value) => onChange('title', value)}
            error={errors.title}
            required
            disabled={disabled}
          />
          <div className="field">
            <label className="field__label" htmlFor="sermon-slug">
              Slug
            </label>
            <div className="field__inline">
              <input
                id="sermon-slug"
                className="field__input field__input--mono"
                type="text"
                value={values.slug}
                onChange={(event) => onChange('slug', event.target.value)}
                onBlur={() => onChange('slug', normalizeSlugInput(values.slug))}
                placeholder="obediencia-y-fe"
                disabled={disabled}
                aria-invalid={errors.slug ? true : undefined}
                aria-describedby={
                  errors.slug
                    ? 'sermon-slug-error'
                    : values.title.trim().length > 0
                      ? 'sermon-slug-hint'
                      : undefined
                }
              />
              <button
                type="button"
                className="button button--quiet button--small"
                onClick={() => onChange('slug', normalizeSlugInput(values.title))}
                disabled={disabled || values.title.trim().length === 0}
              >
                Generar desde el título
              </button>
            </div>
            <p className="field__help" id="sermon-slug-hint">
              Se genera solo si lo dejás vacío. Al salir del campo se normaliza a
              minúsculas con guiones.
            </p>
            {errors.slug ? (
              <p className="field__error" id="sermon-slug-error" role="alert">
                {errors.slug}
              </p>
            ) : null}
          </div>

          <div className="field">
            <label className="field__label" htmlFor="sermon-preacher">
              Predicador
            </label>
            <select
              id="sermon-preacher"
              className="field__input"
              value={values.preacherId}
              onChange={(event) => onChange('preacherId', event.target.value)}
              disabled={disabled || taxonomy.loading}
            >
              <option value="">Sin predicador vinculado</option>
              {!selectedPreacherExists && values.preacherId ? (
                <option value={values.preacherId}>
                  Predicador actual (no está en la lista)
                </option>
              ) : null}
              {taxonomy.people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.displayName}
                  {person.active ? '' : ' (inactivo)'}
                </option>
              ))}
            </select>
            {taxonomy.loading ? (
              <p className="field__help">Cargando predicadores…</p>
            ) : null}
            {taxonomy.error ? (
              <p className="field__error" role="alert">
                {taxonomy.error}{' '}
                {onRetryTaxonomy ? (
                  <button
                    type="button"
                    className="link-button"
                    onClick={onRetryTaxonomy}
                  >
                    Reintentar
                  </button>
                ) : null}
              </p>
            ) : null}
          </div>

          <TextField
            id="sermon-preacher-name"
            label="Predicador (texto libre)"
            value={values.preacherName}
            onChange={(value) => onChange('preacherName', value)}
            hint="Se conserva para sermones antiguos sin persona vinculada."
            disabled={disabled}
          />

          <div className="field">
            <label className="field__label" htmlFor="sermon-series">
              Serie
            </label>
            <select
              id="sermon-series"
              className="field__input"
              value={values.seriesId}
              onChange={(event) => onChange('seriesId', event.target.value)}
              disabled={disabled || taxonomy.loading}
            >
              <option value="">Sin serie</option>
              {taxonomy.series.map((series) => (
                <option key={series.id} value={series.id}>
                  {series.name}
                </option>
              ))}
            </select>
          </div>

          <TextField
            id="sermon-date"
            label="Fecha del sermón"
            type="date"
            value={values.sermonDate}
            onChange={(value) => onChange('sermonDate', value)}
            error={errors.sermonDate}
            disabled={disabled}
          />

          <TextField
            id="sermon-duration"
            label="Duración (minutos)"
            type="number"
            value={values.durationMinutes}
            onChange={(value) => onChange('durationMinutes', value)}
            error={errors.durationMinutes}
            disabled={disabled}
            placeholder="45"
          />

          <div className="field field--checkbox">
            <label className="checkbox" htmlFor="sermon-featured">
              <input
                id="sermon-featured"
                type="checkbox"
                checked={values.featured}
                onChange={(event) => onChange('featured', event.target.checked)}
                disabled={disabled}
              />
              <span>
                <span className="checkbox__label">Destacado</span>
                <span className="field__help">
                  Se usa para priorizar el sermón en la portada del sitio.
                </span>
              </span>
            </label>
          </div>
        </div>

        <div className="field">
          <span className="field__label">Temas</span>
          {taxonomy.loading ? (
            <p className="field__help">Cargando temas…</p>
          ) : taxonomy.error ? (
            <p className="field__error" role="alert">
              No pudimos cargar los temas. Los temas ya guardados no se modifican
              hasta que elijas otros.
            </p>
          ) : taxonomy.topics.length === 0 ? (
            <p className="field__help">
              Todavía no hay temas cargados. Se pueden crear desde la API de
              taxonomía; esta pantalla no los inventa.
            </p>
          ) : (
            <div className="checkbox-grid">
              {taxonomy.topics.map((topic) => {
                const checked = values.topicIds.includes(topic.id);
                return (
                  <label className="checkbox" key={topic.id}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={(event) => {
                        const next = event.target.checked
                          ? [...values.topicIds, topic.id]
                          : values.topicIds.filter((id) => id !== topic.id);
                        onChange('topicIds', next);
                      }}
                    />
                    <span className="checkbox__label">{topic.name}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="form-section" aria-labelledby="sermon-scripture">
        <div className="form-section__head">
          <h2 className="form-section__title" id="sermon-scripture">
            Escritura
          </h2>
          <p className="form-section__hint">
            Referencia principal y texto bíblico citado.
          </p>
        </div>
        <div className="form-grid">
          <TextField
            id="sermon-scripture-reference"
            label="Referencia"
            value={values.scriptureReference}
            onChange={(value) => onChange('scriptureReference', value)}
            placeholder="Juan 14:15"
            disabled={disabled}
          />
        </div>
        <TextAreaField
          id="sermon-scripture-text"
          label="Texto de la escritura"
          value={values.scriptureText}
          onChange={(value) => onChange('scriptureText', value)}
          rows={4}
          disabled={disabled}
        />
      </section>

      <section className="form-section" aria-labelledby="sermon-content">
        <div className="form-section__head">
          <h2 className="form-section__title" id="sermon-content">
            Descripción y notas
          </h2>
          <p className="form-section__hint">
            Texto de presentación y notas editables. Los archivos adjuntos se
            guardan como media.
          </p>
        </div>
        <TextAreaField
          id="sermon-description"
          label="Descripción"
          value={values.description}
          onChange={(value) => onChange('description', value)}
          rows={3}
          hint="Resumen que aparece en el archivo de sermones."
          disabled={disabled}
        />
        <TextAreaField
          id="sermon-notes-content"
          label="Notas del sermón"
          value={values.notesContent}
          onChange={(value) => onChange('notesContent', value)}
          rows={6}
          hint="Texto plano. El editor enriquecido es una fase posterior."
          disabled={disabled}
        />
        <MediaPicker
          id="sermon-notes-media"
          label="Archivo de notas"
          accept="DOCUMENT"
          value={values.notesMediaId}
          onChange={(value) => onChange('notesMediaId', value)}
          description="PDF descargable asociado al sermón."
          disabled={disabled}
        />
      </section>

      <section className="form-section" aria-labelledby="sermon-media">
        <div className="form-section__head">
          <h2 className="form-section__title" id="sermon-media">
            Multimedia
          </h2>
          <p className="form-section__hint">
            Portada, video externo y audio. Los binarios viven en la biblioteca
            multimedia, nunca en PostgreSQL.
          </p>
        </div>
        <MediaPicker
          id="sermon-cover"
          label="Imagen principal"
          accept="IMAGE"
          value={values.coverMediaId}
          onChange={(value) => onChange('coverMediaId', value)}
          description="Se usa como portada y como imagen Open Graph cuando no definís una propia."
          disabled={disabled}
        />
        <div className="form-grid">
          <TextField
            id="sermon-video-provider"
            label="Proveedor de video"
            value={values.videoProvider}
            onChange={(value) => onChange('videoProvider', value)}
            placeholder="YOUTUBE"
            hint="Por ejemplo YOUTUBE. El video no se sube al servidor."
            disabled={disabled}
          />
          <TextField
            id="sermon-video-external-id"
            label="ID externo del video"
            value={values.videoExternalId}
            onChange={(value) => onChange('videoExternalId', value)}
            mono
            placeholder="abc123DEF45"
            disabled={disabled}
          />
        </div>
        <TextField
          id="sermon-video-url"
          label="URL del video"
          type="url"
          value={values.videoUrl}
          onChange={(value) => onChange('videoUrl', value)}
          error={errors.videoUrl}
          placeholder="https://www.youtube.com/watch?v=…"
          disabled={disabled}
        />
        <TextField
          id="sermon-audio-url"
          label="URL del audio"
          type="url"
          value={values.audioUrl}
          onChange={(value) => onChange('audioUrl', value)}
          error={errors.audioUrl}
          placeholder="https://…"
          disabled={disabled}
        />
      </section>

      <section className="form-section" aria-labelledby="sermon-seo">
        <div className="form-section__head">
          <h2 className="form-section__title" id="sermon-seo">
            SEO
          </h2>
          <p className="form-section__hint">
            Si se dejan vacíos, el sitio usa el título, la descripción y la ruta
            canónica del sermón.
          </p>
        </div>
        <div className="form-grid">
          <TextField
            id="sermon-seo-title"
            label="Título SEO"
            value={values.seoTitle}
            onChange={(value) => onChange('seoTitle', value)}
            disabled={disabled}
          />
          <TextField
            id="sermon-seo-description"
            label="Descripción SEO"
            value={values.seoDescription}
            onChange={(value) => onChange('seoDescription', value)}
            disabled={disabled}
          />
        </div>
        <TextField
          id="sermon-seo-canonical"
          label="URL canónica"
          type="url"
          value={values.seoCanonicalUrl}
          onChange={(value) => onChange('seoCanonicalUrl', value)}
          error={errors.seoCanonicalUrl}
          placeholder="https://uci.example.org/sermones/…"
          disabled={disabled}
        />
        <TextField
          id="sermon-seo-og-image"
          label="Imagen Open Graph (URL)"
          type="url"
          value={values.seoOgImageUrl}
          onChange={(value) => onChange('seoOgImageUrl', value)}
          error={errors.seoOgImageUrl}
          placeholder="https://…"
          disabled={disabled}
        />
      </section>
    </div>
  );
}
