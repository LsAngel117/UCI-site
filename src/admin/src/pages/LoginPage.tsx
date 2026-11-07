/**
 * Login screen (docs/09 §6).
 *
 * One simple form: email + password. Failure messaging is deliberately
 * generic so it can never be used to enumerate accounts (docs/09 §6,
 * docs/11 §5.2). On success the browser keeps only the HttpOnly cookie; no
 * token touches JavaScript storage (docs/09 §5).
 */
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { SessionGate } from '../components/SessionGate';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';

interface LoginLocationState {
  from?: string;
}

function redirectTarget(state: unknown): string {
  const from = (state as LoginLocationState | null)?.from;
  if (typeof from === 'string' && from.startsWith('/') && !from.startsWith('/login')) {
    return from;
  }
  return '/';
}

export function LoginPage() {
  const { status, sessionError, login, refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const target = redirectTarget(location.state);

  if (status === 'authenticated') {
    return <Navigate to={target} replace />;
  }

  if (status === 'loading') {
    return (
      <SessionGate
        title="Verificando tu sesión"
        detail="Un momento antes de mostrar el panel."
        busy
      />
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError(null);

    if (!email.trim() || !password) {
      setError('Ingresá tu correo y tu contraseña para continuar.');
      return;
    }

    setSubmitting(true);
    try {
      await login(email.trim(), password);
      navigate(target, { replace: true });
    } catch (reason) {
      if (reason instanceof ApiError) {
        if (reason.status === 401) {
          setError(
            'No pudimos iniciar sesión con esas credenciales. Verificá tu correo y contraseña.',
          );
        } else if (reason.status === 429) {
          setError(
            'Demasiados intentos. Esperá un minuto antes de volver a intentar.',
          );
        } else if (reason.status === 400) {
          setError('Revisá los datos ingresados e intentá de nuevo.');
        } else if (reason.status === 0) {
          setError(reason.message);
        } else {
          setError(
            'El servidor no pudo completar el inicio de sesión. Intentá de nuevo en unos minutos.',
          );
        }
      } else {
        setError('No pudimos iniciar sesión. Intentá de nuevo.');
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
          <h1 className="login__title">Iniciar sesión</h1>
          <p className="login__lede">
            Accedé con tu cuenta para administrar el contenido del sitio.
          </p>

          {sessionError ? (
            <div className="form__notice" role="alert">
              <p>{sessionError}</p>
              <button
                type="button"
                className="button button--quiet button--small"
                onClick={() => {
                  void refresh();
                }}
              >
                Reintentar
              </button>
            </div>
          ) : null}

          <form className="login__form" onSubmit={handleSubmit} noValidate>
            <div className="field">
              <label className="field__label" htmlFor="email">
                Correo electrónico
              </label>
              <input
                id="email"
                name="email"
                className="field__input"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="field">
              <label className="field__label" htmlFor="password">
                Contraseña
              </label>
              <input
                id="password"
                name="password"
                className="field__input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
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
              {submitting ? 'Ingresando…' : 'Iniciar sesión'}
            </button>
          </form>

          <p className="login__footnote">
            La sesión se guarda en una cookie segura del navegador. No se
            almacenan credenciales en el panel.
          </p>
        </div>
      </section>
    </main>
  );
}
