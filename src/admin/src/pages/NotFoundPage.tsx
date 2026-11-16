/**
 * In-shell 404. Unknown panel URLs are not public routes: they keep the
 * authenticated chrome and offer a way back (docs/09 §4).
 */
import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <section className="page">
      <header className="page__heading">
        <p className="page__eyebrow">Página no encontrada</p>
        <h1 className="page__title">Esa sección no existe</h1>
        <p className="page__lede">
          La dirección que abriste no corresponde a ninguna sección del panel.
        </p>
      </header>
      <div className="panel">
        <Link className="button button--quiet" to="/">
          Volver al panel
        </Link>
      </div>
    </section>
  );
}
