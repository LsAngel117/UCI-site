/**
 * Site settings (Phase 10D2, docs/08 §17, docs/05 §46).
 *
 * Edits the stored church identity/contact block, weekly schedule, social links
 * and giving call-to-action through `PATCH /api/v1/admin/settings`. The API
 * validates every section and audits the change; `settings.update` is required
 * to save, while `settings.read` alone renders the form read-only.
 */
import { useEffect, useState } from 'react';
import { getAdminSettings, updateAdminSettings } from '../../lib/admin-api';
import {
  adminSettingsToForm,
  buildSettingsPatch,
  DAY_OF_WEEK_OPTIONS,
  emptySettingsForm,
  settingsPagePermissions,
  validateSettingsForm,
  type SettingsForm,
} from '../../lib/admin-ui';
import { useAuth } from '../../lib/auth';
import { describeError } from '../../lib/errors';
import { ErrorPanel, LoadingPanel } from '../../components/content/States';
import { FieldError, Notice } from '../../components/admin/Notice';

interface NoticeState {
  tone: 'success' | 'error' | 'info' | 'warning';
  text: string;
}

export function SettingsPage() {
  const { hasPermission } = useAuth();
  const permissions = settingsPagePermissions(hasPermission);
  const readOnly = !permissions.update;

  const [form, setForm] = useState<SettingsForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    getAdminSettings(controller.signal)
      .then((settings) => {
        if (controller.signal.aborted) return;
        setForm(adminSettingsToForm(settings));
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

  function updateChurch(
    key: keyof SettingsForm['church'],
    value: string,
  ) {
    setForm((current) =>
      current
        ? { ...current, church: { ...current.church, [key]: value } }
        : current,
    );
  }

  function updateSchedule(
    index: number,
    patch: Partial<SettingsForm['schedule'][number]>,
  ) {
    setForm((current) =>
      current
        ? {
            ...current,
            schedule: current.schedule.map((row, rowIndex) =>
              rowIndex === index ? { ...row, ...patch } : row,
            ),
          }
        : current,
    );
  }

  function addScheduleRow() {
    setForm((current) =>
      current
        ? {
            ...current,
            schedule: [
              ...current.schedule,
              {
                name: '',
                dayOfWeek: 0,
                startTime: '10:00',
                endTime: '',
                active: true,
              },
            ],
          }
        : current,
    );
  }

  function removeScheduleRow(index: number) {
    setForm((current) =>
      current
        ? {
            ...current,
            schedule: current.schedule.filter(
              (_row, rowIndex) => rowIndex !== index,
            ),
          }
        : current,
    );
  }

  function updateSocial(
    index: number,
    patch: Partial<SettingsForm['socials'][number]>,
  ) {
    setForm((current) =>
      current
        ? {
            ...current,
            socials: current.socials.map((row, rowIndex) =>
              rowIndex === index ? { ...row, ...patch } : row,
            ),
          }
        : current,
    );
  }

  function addSocialRow() {
    setForm((current) =>
      current
        ? {
            ...current,
            socials: [
              ...current.socials,
              { platform: '', label: '', url: '' },
            ],
          }
        : current,
    );
  }

  function removeSocialRow(index: number) {
    setForm((current) =>
      current
        ? {
            ...current,
            socials: current.socials.filter(
              (_row, rowIndex) => rowIndex !== index,
            ),
          }
        : current,
    );
  }

  function updateGiving(key: keyof SettingsForm['giving'], value: string) {
    setForm((current) =>
      current
        ? { ...current, giving: { ...current.giving, [key]: value } }
        : current,
    );
  }

  async function submit() {
    if (!form || saving || readOnly) return;
    const nextErrors = validateSettingsForm(form);
    setFieldErrors(nextErrors);
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
      const updated = await updateAdminSettings(buildSettingsPatch(form));
      setForm(adminSettingsToForm(updated));
      setNotice({
        tone: 'success',
        text: 'La configuración del sitio se guardó y quedó registrada en la auditoría.',
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
        <LoadingPanel label="Cargando configuración…" />
      </section>
    );
  }

  if (error || !form) {
    return (
      <section className="page">
        <ErrorPanel
          message={error ?? 'No pudimos cargar la configuración.'}
          onRetry={() => setReloadKey((key) => key + 1)}
        />
      </section>
    );
  }

  return (
    <section className="page">
      <header className="page__heading">
        <p className="page__eyebrow">Administración</p>
        <h1 className="page__title">Configuración del sitio</h1>
        <p className="page__lede">
          Identidad y contacto de la iglesia, horarios de reunión, redes
          sociales y llamado a ofrendas. Los cambios se publican en el sitio
          público y quedan auditados.
        </p>
      </header>

      {readOnly ? (
        <Notice tone="info">
          Tu rol incluye <code>settings.read</code> pero no{' '}
          <code>settings.update</code>: el formulario es de solo lectura.
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
          <section className="form-section" aria-labelledby="settings-church">
            <div className="form-section__head">
              <h2 className="form-section__title" id="settings-church">
                Iglesia y contacto
              </h2>
              <p className="form-section__hint">
                Nombre y descripción son obligatorios. Los campos vacíos se
                guardan como «sin configurar» y el sitio no los inventa.
              </p>
            </div>
            <div className="form-grid">
              <div className="field">
                <label className="field__label" htmlFor="church-name">
                  Nombre de la iglesia
                </label>
                <input
                  id="church-name"
                  className="field__input"
                  type="text"
                  value={form.church.name}
                  onChange={(event) =>
                    updateChurch('name', event.target.value)
                  }
                  aria-invalid={fieldErrors['church.name'] ? true : undefined}
                />
                {fieldErrors['church.name'] ? (
                  <FieldError>{fieldErrors['church.name']}</FieldError>
                ) : null}
              </div>
              <div className="field">
                <label className="field__label" htmlFor="church-phone">
                  Teléfono
                </label>
                <input
                  id="church-phone"
                  className="field__input"
                  type="tel"
                  value={form.church.phone}
                  onChange={(event) =>
                    updateChurch('phone', event.target.value)
                  }
                />
              </div>
              <div className="field form-grid__full">
                <label className="field__label" htmlFor="church-description">
                  Descripción breve
                </label>
                <textarea
                  id="church-description"
                  className="field__input field__textarea"
                  value={form.church.shortDescription}
                  onChange={(event) =>
                    updateChurch('shortDescription', event.target.value)
                  }
                  aria-invalid={
                    fieldErrors['church.shortDescription'] ? true : undefined
                  }
                />
                {fieldErrors['church.shortDescription'] ? (
                  <FieldError>
                    {fieldErrors['church.shortDescription']}
                  </FieldError>
                ) : null}
              </div>
              <div className="field">
                <label className="field__label" htmlFor="church-address">
                  Dirección
                </label>
                <input
                  id="church-address"
                  className="field__input"
                  type="text"
                  value={form.church.address}
                  onChange={(event) =>
                    updateChurch('address', event.target.value)
                  }
                />
              </div>
              <div className="field">
                <label className="field__label" htmlFor="church-city">
                  Ciudad
                </label>
                <input
                  id="church-city"
                  className="field__input"
                  type="text"
                  value={form.church.city}
                  onChange={(event) =>
                    updateChurch('city', event.target.value)
                  }
                />
              </div>
              <div className="field">
                <label className="field__label" htmlFor="church-state">
                  Provincia / estado
                </label>
                <input
                  id="church-state"
                  className="field__input"
                  type="text"
                  value={form.church.state}
                  onChange={(event) =>
                    updateChurch('state', event.target.value)
                  }
                />
              </div>
              <div className="field">
                <label className="field__label" htmlFor="church-email">
                  Correo de contacto
                </label>
                <input
                  id="church-email"
                  className="field__input"
                  type="email"
                  value={form.church.email}
                  onChange={(event) =>
                    updateChurch('email', event.target.value)
                  }
                />
              </div>
              <div className="field">
                <label className="field__label" htmlFor="church-whatsapp">
                  WhatsApp
                </label>
                <input
                  id="church-whatsapp"
                  className="field__input"
                  type="text"
                  value={form.church.whatsapp}
                  onChange={(event) =>
                    updateChurch('whatsapp', event.target.value)
                  }
                />
              </div>
            </div>
          </section>

          <section className="form-section" aria-labelledby="settings-schedule">
            <div className="form-section__head">
              <h2 className="form-section__title" id="settings-schedule">
                Horarios de reunión
              </h2>
              <p className="form-section__hint">
                Se publican ordenados por día. El horario de fin es opcional.
              </p>
            </div>

            {form.schedule.length === 0 ? (
              <p className="field__help">
                No hay horarios configurados. El sitio no muestra horarios
                inventados.
              </p>
            ) : (
              <div className="settings-rows">
                {form.schedule.map((row, index) => (
                  <div className="settings-row" key={`schedule-${index}`}>
                    <div className="field">
                      <label
                        className="field__label"
                        htmlFor={`schedule-${index}-name`}
                      >
                        Nombre
                      </label>
                      <input
                        id={`schedule-${index}-name`}
                        className="field__input"
                        type="text"
                        value={row.name}
                        onChange={(event) =>
                          updateSchedule(index, { name: event.target.value })
                        }
                        aria-invalid={
                          fieldErrors[`schedule[${index}].name`]
                            ? true
                            : undefined
                        }
                      />
                      {fieldErrors[`schedule[${index}].name`] ? (
                        <FieldError>
                          {fieldErrors[`schedule[${index}].name`]}
                        </FieldError>
                      ) : null}
                    </div>
                    <div className="field">
                      <label
                        className="field__label"
                        htmlFor={`schedule-${index}-day`}
                      >
                        Día
                      </label>
                      <select
                        id={`schedule-${index}-day`}
                        className="field__input"
                        value={row.dayOfWeek}
                        onChange={(event) =>
                          updateSchedule(index, {
                            dayOfWeek: Number(event.target.value),
                          })
                        }
                      >
                        {DAY_OF_WEEK_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label
                        className="field__label"
                        htmlFor={`schedule-${index}-start`}
                      >
                        Inicio
                      </label>
                      <input
                        id={`schedule-${index}-start`}
                        className="field__input"
                        type="time"
                        value={row.startTime}
                        onChange={(event) =>
                          updateSchedule(index, {
                            startTime: event.target.value,
                          })
                        }
                        aria-invalid={
                          fieldErrors[`schedule[${index}].startTime`]
                            ? true
                            : undefined
                        }
                      />
                      {fieldErrors[`schedule[${index}].startTime`] ? (
                        <FieldError>
                          {fieldErrors[`schedule[${index}].startTime`]}
                        </FieldError>
                      ) : null}
                    </div>
                    <div className="field">
                      <label
                        className="field__label"
                        htmlFor={`schedule-${index}-end`}
                      >
                        Fin (opcional)
                      </label>
                      <input
                        id={`schedule-${index}-end`}
                        className="field__input"
                        type="time"
                        value={row.endTime}
                        onChange={(event) =>
                          updateSchedule(index, { endTime: event.target.value })
                        }
                        aria-invalid={
                          fieldErrors[`schedule[${index}].endTime`]
                            ? true
                            : undefined
                        }
                      />
                      {fieldErrors[`schedule[${index}].endTime`] ? (
                        <FieldError>
                          {fieldErrors[`schedule[${index}].endTime`]}
                        </FieldError>
                      ) : null}
                    </div>
                    <div className="field settings-row__check">
                      <label
                        className="checkbox"
                        htmlFor={`schedule-${index}-active`}
                      >
                        <input
                          id={`schedule-${index}-active`}
                          type="checkbox"
                          checked={row.active}
                          onChange={(event) =>
                            updateSchedule(index, {
                              active: event.target.checked,
                            })
                          }
                        />
                        <span className="checkbox__label">Visible</span>
                      </label>
                    </div>
                    <div className="settings-row__actions">
                      <button
                        type="button"
                        className="button button--quiet button--small"
                        onClick={() => removeScheduleRow(index)}
                      >
                        Quitar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="form-actions form-actions--start">
              <button
                type="button"
                className="button button--quiet button--small"
                onClick={addScheduleRow}
              >
                Agregar horario
              </button>
            </div>
          </section>

          <section className="form-section" aria-labelledby="settings-socials">
            <div className="form-section__head">
              <h2 className="form-section__title" id="settings-socials">
                Redes sociales
              </h2>
              <p className="form-section__hint">
                Un enlace sin URL oficial queda como «sin configurar» y el sitio
                no lo publica.
              </p>
            </div>

            {form.socials.length === 0 ? (
              <p className="field__help">No hay redes sociales configuradas.</p>
            ) : (
              <div className="settings-rows">
                {form.socials.map((row, index) => (
                  <div className="settings-row" key={`social-${index}`}>
                    <div className="field">
                      <label
                        className="field__label"
                        htmlFor={`social-${index}-platform`}
                      >
                        Plataforma
                      </label>
                      <input
                        id={`social-${index}-platform`}
                        className="field__input"
                        type="text"
                        value={row.platform}
                        onChange={(event) =>
                          updateSocial(index, { platform: event.target.value })
                        }
                        aria-invalid={
                          fieldErrors[`socials[${index}].platform`]
                            ? true
                            : undefined
                        }
                      />
                      {fieldErrors[`socials[${index}].platform`] ? (
                        <FieldError>
                          {fieldErrors[`socials[${index}].platform`]}
                        </FieldError>
                      ) : null}
                    </div>
                    <div className="field">
                      <label
                        className="field__label"
                        htmlFor={`social-${index}-label`}
                      >
                        Etiqueta
                      </label>
                      <input
                        id={`social-${index}-label`}
                        className="field__input"
                        type="text"
                        value={row.label}
                        onChange={(event) =>
                          updateSocial(index, { label: event.target.value })
                        }
                        aria-invalid={
                          fieldErrors[`socials[${index}].label`]
                            ? true
                            : undefined
                        }
                      />
                      {fieldErrors[`socials[${index}].label`] ? (
                        <FieldError>
                          {fieldErrors[`socials[${index}].label`]}
                        </FieldError>
                      ) : null}
                    </div>
                    <div className="field">
                      <label
                        className="field__label"
                        htmlFor={`social-${index}-url`}
                      >
                        URL
                      </label>
                      <input
                        id={`social-${index}-url`}
                        className="field__input"
                        type="url"
                        value={row.url}
                        onChange={(event) =>
                          updateSocial(index, { url: event.target.value })
                        }
                        placeholder="https://…"
                        aria-invalid={
                          fieldErrors[`socials[${index}].url`]
                            ? true
                            : undefined
                        }
                      />
                      {fieldErrors[`socials[${index}].url`] ? (
                        <FieldError>
                          {fieldErrors[`socials[${index}].url`]}
                        </FieldError>
                      ) : null}
                    </div>
                    <div className="settings-row__actions">
                      <button
                        type="button"
                        className="button button--quiet button--small"
                        onClick={() => removeSocialRow(index)}
                      >
                        Quitar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="form-actions form-actions--start">
              <button
                type="button"
                className="button button--quiet button--small"
                onClick={addSocialRow}
              >
                Agregar red social
              </button>
            </div>
          </section>

          <section className="form-section" aria-labelledby="settings-giving">
            <div className="form-section__head">
              <h2 className="form-section__title" id="settings-giving">
                Ofrendas
              </h2>
              <p className="form-section__hint">
                El llamado a dar. La URL es opcional y nunca se inventan datos
                financieros.
              </p>
            </div>
            <div className="form-grid">
              <div className="field">
                <label className="field__label" htmlFor="giving-title">
                  Título
                </label>
                <input
                  id="giving-title"
                  className="field__input"
                  type="text"
                  value={form.giving.title}
                  onChange={(event) =>
                    updateGiving('title', event.target.value)
                  }
                  aria-invalid={fieldErrors['giving.title'] ? true : undefined}
                />
                {fieldErrors['giving.title'] ? (
                  <FieldError>{fieldErrors['giving.title']}</FieldError>
                ) : null}
              </div>
              <div className="field">
                <label className="field__label" htmlFor="giving-cta">
                  Texto del botón
                </label>
                <input
                  id="giving-cta"
                  className="field__input"
                  type="text"
                  value={form.giving.ctaLabel}
                  onChange={(event) =>
                    updateGiving('ctaLabel', event.target.value)
                  }
                  aria-invalid={
                    fieldErrors['giving.ctaLabel'] ? true : undefined
                  }
                />
                {fieldErrors['giving.ctaLabel'] ? (
                  <FieldError>{fieldErrors['giving.ctaLabel']}</FieldError>
                ) : null}
              </div>
              <div className="field form-grid__full">
                <label className="field__label" htmlFor="giving-message">
                  Mensaje
                </label>
                <textarea
                  id="giving-message"
                  className="field__input field__textarea"
                  value={form.giving.message}
                  onChange={(event) =>
                    updateGiving('message', event.target.value)
                  }
                  aria-invalid={
                    fieldErrors['giving.message'] ? true : undefined
                  }
                />
                {fieldErrors['giving.message'] ? (
                  <FieldError>{fieldErrors['giving.message']}</FieldError>
                ) : null}
              </div>
              <div className="field form-grid__full">
                <label className="field__label" htmlFor="giving-url">
                  URL para dar (opcional)
                </label>
                <input
                  id="giving-url"
                  className="field__input"
                  type="url"
                  value={form.giving.url}
                  onChange={(event) => updateGiving('url', event.target.value)}
                  placeholder="https://…"
                  aria-invalid={fieldErrors['giving.url'] ? true : undefined}
                />
                {fieldErrors['giving.url'] ? (
                  <FieldError>{fieldErrors['giving.url']}</FieldError>
                ) : null}
              </div>
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
              {saving ? 'Guardando…' : 'Guardar configuración'}
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
