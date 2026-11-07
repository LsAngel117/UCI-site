/**
 * Honest placeholder for modules scheduled after 10A.
 *
 * It names what the module will do and which sub-phase delivers it, so an
 * operator never mistakes a navigation stub for a broken screen (feature doc
 * 10A: "en construcción" honesto).
 */
import { Link } from 'react-router-dom';
import type { ModulePhase } from '../lib/navigation';

interface SectionPlaceholderPageProps {
  title: string;
  description?: string;
  phase?: ModulePhase;
  parentLabel?: string | null;
}

export function SectionPlaceholderPage({
  title,
  description,
  phase,
  parentLabel,
}: SectionPlaceholderPageProps) {
  return (
    <section className="page">
      <header className="page__heading">
        <p className="page__eyebrow">{parentLabel ?? 'Módulo del panel'}</p>
        <div className="page__title-row">
          <h1 className="page__title">{title}</h1>
          <span className="badge badge--pending">En construcción</span>
        </div>
        {description ? <p className="page__lede">{description}</p> : null}
      </header>

      <div className="panel panel--notice">
        <h2 className="panel__title">Este módulo todavía no está disponible</h2>
        <p>
          La navegación ya reconoce esta sección y respeta tus permisos, pero la
          interfaz de gestión se implementa en la fase {phase ?? '10B'} del
          panel. No hay datos ni acciones inventadas en esta pantalla.
        </p>
        <Link className="button button--quiet" to="/">
          Volver al panel
        </Link>
      </div>
    </section>
  );
}
