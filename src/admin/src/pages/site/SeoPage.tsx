/**
 * Site SEO defaults (Phase 10D2, docs/08 §18, docs/10 §10–§11).
 *
 * Edits the site-wide title, description, default social image and robots
 * default through `PATCH /api/v1/admin/seo`. Content-level SEO stays in each
 * content editor; this screen owns only the fallback layer. `seo.read` without
 * `seo.update` renders the form read-only.
 */
import { useEffect, useState } from 'react';
import { getSiteSeo, updateSiteSeo } from '../../lib/admin-api';
import {
  buildSiteSeoPatch,
  seoPagePermissions,
  SITE_SEO_MAX_DESCRIPTION,
  SITE_SEO_MAX_TITLE,
  siteSeoToForm,
  validateSiteSeoForm,
  type SiteSeoForm,
  type SiteSeoFormErrors,
} from '../../lib/admin-ui';
import { useAuth } from '../../lib/auth';
import { describeError } from '../../lib/errors';
import { ErrorPanel, LoadingPanel } from '../../components/content/States';
import { FieldError, Notice } from '../../components/admin/Notice';

interface NoticeState {
  tone: 'success' | 'error' | 'info' | 'warning';
  text: string;
}

export function SeoPage() {
  const { hasPermission } = useAuth();
  const permissions = seoPagePermissions(hasPermission);
  const readOnly = !permissions.update;

  const [form, setForm] = useState<SiteSeoForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [errors, setErrors] = useState<SiteSeoFormErrors>({});

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    getSiteSeo(controller.signal)
      .then((settings) => {
        if (controller.signal.aborted) return;
        setForm(siteSeoToForm(settings));
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setError(describeError(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [reloadKey]);

  function patch(next: Partial<SiteSeoForm>) {
    setForm((current) => (current ? { ...current, ...next } : current));
  }

  async function submit() {
    if (!form || saving || readOnly) return;
    const nextErrors = validateSiteSeoForm(form);
    setErrors(nextErrors);
    setNotice(null);
    if (Object.keys(nextErrors).length > 0) {
      setNotice({
        tone: 'error',
        text: 'Revisá los campos marcados antes de guardar.',
      });
      return;
    }

    setSaving(true);
    try {
      const updated = await updateSiteSeo(buildSiteSeoPatch(form));
      setForm(siteSeoToForm(updated));
      setNotice({
        tone: 'success',
        text: 'Los valores SEO predeterminados se guardaron y quedaron auditados.',
      });
    } catch (reason) {
      setNotice({ tone: 'error', text: describeError(reason) });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="page">
        <LoadingPanel label="Cargando SEO del sitio…" />
      </section>
    );
  }

  if (error || !form) {
    return (
      <section className="page">
        <ErrorPanel
          message={error ?? 'No pudimos cargar la configuración SEO.'}
          onRetry={() => setReloadKey((key) => key + 1)}
        />
      </section>
    );
  }

  return (
    <section className="page">
      <header className="page__heading">
        <p className="page__eyebrow">Sitio</p>
        <h1 className="page__title">SEO del sitio</h1>
        <p className="page__lede">
          Valores predeterminados que usa el sitio cuando una página o un sermón
          no define su propio título, descripción o imagen social.
        </p>
      </header>

      {readOnly ? (
        <Notice tone="info">
          Tu rol incluye <code>seo.read</code> pero no <code>seo.update</code>:
          el formulario es de solo lectura.
        </Notice>
      ) : null}

      {notice ? (
        <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.text}
        </Notice>
      ) : null}

      <form
        className="form-sections"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <fieldset className="settings-fieldset" disabled={readOnly}>
          <section className="form-section" aria-labelledby="seo-defaults">
            <div className="form-section__head">
              <h2 className="form-section__title" id="seo-defaults">
                Metadatos predeterminados
              </h2>
              <p className="form-section__hint">
                Título y descripción son obligatorios. La imagen debe ser una
                URL http(s) pública.
              </p>
            </div>

            <div className="field">
              <label className="field__label" htmlFor="seo-title">
                Título predeterminado
              </label>
              <input
                id="seo-title"
                className="field__input"
                type="text"
                value={form.title}
                maxLength={SITE_SEO_MAX_TITLE}
                onChange={(event) => patch({ title: event.target.value })}
                aria-invalid={errors.title ? true : undefined}
              />
              <p className="field__help">
                {form.title.trim().length}/{SITE_SEO_MAX_TITLE} caracteres
              </p>
              {errors.title ? <FieldError>{errors.title}</FieldError> : null}
            </div>

            <div className="field">
              <label className="field__label" htmlFor="seo-description">
                Descripción predeterminada
              </label>
              <textarea
                id="seo-description"
                className="field__input field__textarea"
                value={form.description}
                maxLength={SITE_SEO_MAX_DESCRIPTION}
                onChange={(event) =>
                  patch({ description: event.target.value })
                }
                aria-invalid={errors.description ? true : undefined}
              />
              <p className="field__help">
                {form.description.trim().length}/{SITE_SEO_MAX_DESCRIPTION}{' '}
                caracteres
              </p>
              {errors.description ? (
                <FieldError>{errors.description}</FieldError>
              ) : null}
            </div>

            <div className="field">
              <label className="field__label" htmlFor="seo-og-image">
                Imagen social predeterminada (Open Graph)
              </label>
              <input
                id="seo-og-image"
                className="field__input"
                type="url"
                value={form.defaultOgImage}
                onChange={(event) =>
                  patch({ defaultOgImage: event.target.value })
                }
                placeholder="https://…"
                aria-invalid={errors.defaultOgImage ? true : undefined}
              />
              {errors.defaultOgImage ? (
                <FieldError>{errors.defaultOgImage}</FieldError>
              ) : (
                <p className="field__help">
                  Dejala vacía si todavía no hay una imagen aprobada.
                </p>
              )}
            </div>

            <div className="field">
              <label className="checkbox" htmlFor="seo-robots">
                <input
                  id="seo-robots"
                  type="checkbox"
                  checked={form.robotsDefault}
                  onChange={(event) =>
                    patch({ robotsDefault: event.target.checked })
                  }
                />
                <span className="checkbox__label">
                  Permitir indexación por defecto (robots)
                </span>
              </label>
              <p className="field__help">
                Si se desactiva, el sitio público responde con `noindex` para
                todos los contenidos que no lo sobrescriban.
              </p>
            </div>
          </section>

          <section className="form-section" aria-labelledby="seo-preview">
            <div className="form-section__head">
              <h2 className="form-section__title" id="seo-preview">
                Vista previa
              </h2>
              <p className="form-section__hint">
                Aproximación del resultado en buscadores con los valores
                actuales del formulario.
              </p>
            </div>
            <div className="seo-preview">
              <p className="seo-preview__url">Iglesia UCI · Resultado</p>
              <p className="seo-preview__title">{form.title || 'Sin título'}</p>
              <p className="seo-preview__description">
                {form.description || 'Sin descripción'}
              </p>
              <p className="seo-preview__robots">
                {form.robotsDefault
                  ? 'Indexación permitida'
                  : 'Indexación bloqueada (noindex)'}
              </p>
            </div>
          </section>
        </fieldset>

        <div className="form-actions">
          <button
            type="button"
            className="button button--quiet"
            onClick={() => setReloadKey((key) => key + 1)}
            disabled={saving}
          >
            Descartar cambios
          </button>
          {permissions.update ? (
            <button
              type="submit"
              className="button button--primary"
              disabled={saving}
            >
              {saving ? 'Guardando…' : 'Guardar SEO'}
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
