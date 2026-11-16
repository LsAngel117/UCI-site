/**
 * Password reset screen (improvement B4, docs/09 §6, docs/11 §5).
 *
 * The token arrives in the query string of the email link
 * (`/panel/reset-password?token=…`). It is used once and never stored. Every
 * failure shows the same generic message, mirroring the server's
 * anti-enumeration contract.
 */
import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, confirmPasswordReset } from '../lib/api';

const MIN_PASSWORD_LENGTH = 8;
const GENERIC_ERROR =
  'No pudimos restablecer la contraseña. El enlace puede estar vencido o ya haberse usado. Pedí uno nuevo.';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = useMemo(() => searchParams.get('token')?.trim() ?? '', [searchParams]);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    if (password !== confirmation) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setSubmitting(true);
    try {
      await confirmPasswordReset(token, password);
      navigate('/login?reset=1', { replace: true });
    } catch (reason) {
      // The server returns the same generic 400 for every token problem.
      if (reason instanceof ApiError && reason.status === 429) {
        setError('Demasiados intentos. Esperá un minuto antes de reintentar.');
      } else if (reason instanceof ApiError && reason.status === 0) {
        setError(reason.message);
      } else {
        setError(GENERIC_ERROR);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login">
      <section className="login__brand" aria-label="Iglesia UCI">
        <div>
          <p className="login__brandmark">UCI</p>
          <div className="login__rule" aria-hidden="true" />
          <p className="login__brand-sub">Unidad Cristiana de Intercesión</p>
        </div>
        <p className="login__brand-note">
          Panel editorial para el equipo de comunicación de la iglesia.
        </p>
      </section>

      <section className="login__panel">
        <div className="login__card">
          <h1 className="login__title">Nueva contraseña</h1>
          <p className="login__lede">
            Elegí una contraseña nueva para tu cuenta. El enlace es de un solo
            uso y vence en una hora.
          </p>

          {!token ? (
            <div className="form__error" role="alert">
              <p>
                El enlace no incluye un token válido. Pedí un correo nuevo desde
                el inicio de sesión.
              </p>
              <Link className="button button--quiet button--small" to="/login">
                Volver al inicio de sesión
              </Link>
            </div>
          ) : (
            <form className="login__form" onSubmit={handleSubmit} noValidate>
              <div className="field">
                <label className="field__label" htmlFor="reset-password">
                  Contraseña nueva
                </label>
                <input
                  id="reset-password"
                  name="password"
                  className="field__input"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  autoFocus
                  aria-describedby="reset-password-hint"
                />
                <p className="field__help" id="reset-password-hint">
                  Al menos {MIN_PASSWORD_LENGTH} caracteres.
                </p>
              </div>

              <div className="field">
                <label className="field__label" htmlFor="reset-confirmation">
                  Repetí la contraseña
                </label>
                <input
                  id="reset-confirmation"
                  name="confirmation"
                  className="field__input"
                  type="password"
                  autoComplete="new-password"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                />
              </div>

              {error ? (
                <div className="form__error" role="alert">
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                className="button button--primary button--block"
                disabled={submitting}
              >
                {submitting ? 'Guardando…' : 'Cambiar contraseña'}
              </button>
            </form>
          )}

          <p className="login__footnote">
            Por seguridad, al cambiar la contraseña se cierran todas las
            sesiones abiertas.
          </p>
        </div>
      </section>
    </main>
  );
}
