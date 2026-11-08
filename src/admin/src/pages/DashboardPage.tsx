/**
 * Editorial dashboard (docs/09 §12–§14, docs/visual/01 §8).
 *
 * Every figure on this screen comes from an existing admin endpoint. There are
 * no invented visits, growth percentages, uptime or infrastructure panels: when
 * a value is unavailable it renders an em dash, and when a section fails it says
 * so and offers a retry. Modules the session cannot read are simply absent.
 */
import { useEffect, useMemo, useState } from 'react';
import type { AuditLogDto } from '@shared/admin';
import type { MediaDto } from '@shared/media';
import { Link } from 'react-router-dom';
import { NavIcon } from '../components/admin/NavIcon';
import { MediaThumbnail } from '../components/media/MediaThumbnail';
import {
  EmptyPanel,
  ErrorPanel,
  LoadingPanel,
} from '../components/content/States';
import { listAdminEvents, listAdminPages, listAuditLogs } from '../lib/admin-api';
import { useAuth } from '../lib/auth';
import {
  auditActionText,
  auditEntryHref,
  initials,
  mergeScheduled,
  summarizeDrafts,
  visibleQuickActions,
  type DraftSource,
  type DraftSummary,
  type ScheduledEntry,
} from '../lib/dashboard';
import { describeError } from '../lib/errors';
import { formatInstant } from '../lib/format';
import { listMedia } from '../lib/media-api';
import type { NavIconName } from '../lib/navigation';
import { listSermons } from '../lib/sermons-api';
import { listStories } from '../lib/stories-api';

const COUNT_LIMIT = 1;
const SCHEDULED_LIMIT = 5;
const ACTIVITY_LIMIT = 6;
const MEDIA_LIMIT = 4;

interface DashboardCounts {
  sermonsPublished: number | null;
  drafts: DraftSummary | null;
  upcomingEvents: number | null;
  pagesPublished: number | null;
}

interface MediaSummary {
  total: number;
  recent: MediaDto[];
}

interface DashboardData {
  counts: DashboardCounts;
  scheduled: ScheduledEntry[];
  activity: AuditLogDto[];
  media: MediaSummary | null;
}

interface SectionErrors {
  counts: string | null;
  scheduled: string | null;
  activity: string | null;
  media: string | null;
}

const EMPTY_ERRORS: SectionErrors = {
  counts: null,
  scheduled: null,
  activity: null,
  media: null,
};

function StatCard({
  icon,
  label,
  value,
  meta,
  to,
  pending,
}: {
  icon: NavIconName;
  label: string;
  value: number | null;
  meta: string;
  to: string;
  pending: boolean;
}) {
  return (
    <Link className="stat-card" to={to}>
      <span className="stat-card__top">
        <span className="stat-card__icon" aria-hidden="true">
          <NavIcon name={icon} className="nav__icon" />
        </span>
        <span className="stat-card__value" aria-live="polite">
          {pending ? (
            <span className="skeleton skeleton--value" aria-hidden="true" />
          ) : value === null ? (
            '—'
          ) : (
            value
          )}
        </span>
      </span>
      <span className="stat-card__label">{label}</span>
      <span className="stat-card__meta">{meta}</span>
    </Link>
  );
}

function ActivityEntry({
  entry,
  hasPermission,
}: {
  entry: AuditLogDto;
  hasPermission: ReturnType<typeof useAuth>['hasPermission'];
}) {
  const href = auditEntryHref(entry, hasPermission);
  const description = auditActionText(entry.action);
  const actor = entry.actor?.name ?? 'Sistema';

  const body = (
    <>
      <span className="activity-avatar" aria-hidden="true">
        {entry.actor ? initials(entry.actor.name) : 'S'}
      </span>
      <span className="dashboard-list__main">
        <span className="dashboard-list__title">
          <strong>{actor}</strong> {description}
        </span>
        <time
          className="dashboard-list__meta"
          dateTime={entry.createdAt}
        >
          {formatInstant(entry.createdAt)}
        </time>
      </span>
    </>
  );

  return (
    <li className="dashboard-list__item">
      {href ? (
        <Link className="dashboard-list__link" to={href}>
          {body}
        </Link>
      ) : (
        <div className="dashboard-list__link">{body}</div>
      )}
    </li>
  );
}

function ScheduledRow({ entry }: { entry: ScheduledEntry }) {
  const body = (
    <>
      <span className="scheduled-type" aria-hidden="true">
        <NavIcon
          name={
            entry.kind === 'event'
              ? 'calendar'
              : entry.kind === 'page'
                ? 'file-text'
                : entry.kind === 'story'
                  ? 'quote'
                  : 'book-open'
          }
          className="nav__icon"
        />
      </span>
      <span className="dashboard-list__main">
        <span className="dashboard-list__title">{entry.title}</span>
        <span className="dashboard-list__meta">
          {entry.kindLabel} · {formatInstant(entry.publishAt)}
        </span>
      </span>
      <span className="badge badge--status-scheduled">Programado</span>
    </>
  );

  return (
    <li className="dashboard-list__item">
      {entry.href ? (
        <Link className="dashboard-list__link" to={entry.href}>
          {body}
        </Link>
      ) : (
        <div className="dashboard-list__link">{body}</div>
      )}
    </li>
  );
}

export function DashboardPage() {
  const { user, hasPermission } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<SectionErrors>(EMPTY_ERRORS);
  const [reloadKey, setReloadKey] = useState(0);

  const access = useMemo(
    () => ({
      sermonsRead: hasPermission('sermons.read'),
      sermonsUpdate: hasPermission('sermons.update'),
      pagesRead: hasPermission('pages.read'),
      eventsRead: hasPermission('events.read'),
      mediaRead: hasPermission('media.read'),
      auditRead: hasPermission('audit.read'),
    }),
    [hasPermission],
  );

  const displayName = user?.name?.trim() || user?.email || 'editor';
  const quickActions = useMemo(
    () => visibleQuickActions(hasPermission),
    [hasPermission],
  );

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    const failures = new Map<string, string>();

    async function guard<T>(
      section: keyof SectionErrors,
      task: Promise<T>,
    ): Promise<T | null> {
      try {
        return await task;
      } catch (error) {
        if (controller.signal.aborted) throw error;
        if (!failures.has(section)) {
          failures.set(section, describeError(error));
        }
        return null;
      }
    }

    async function load() {
      setLoading(true);
      setErrors(EMPTY_ERRORS);

      const now = new Date().toISOString();

      const [
        sermonsPublished,
        sermonsDraft,
        pagesPublished,
        pagesDraft,
        storiesDraft,
        eventsUpcoming,
        eventsDraft,
        sermonsScheduled,
        pagesScheduled,
        storiesScheduled,
        eventsScheduled,
        audit,
        media,
      ] = await Promise.all([
        access.sermonsRead
          ? guard(
              'counts',
              listSermons({ status: 'published', limit: COUNT_LIMIT }, controller.signal),
            )
          : Promise.resolve(null),
        access.sermonsRead
          ? guard(
              'counts',
              listSermons({ status: 'draft', limit: COUNT_LIMIT }, controller.signal),
            )
          : Promise.resolve(null),
        access.pagesRead
          ? guard(
              'counts',
              listAdminPages(
                { status: 'published', limit: COUNT_LIMIT },
                controller.signal,
              ),
            )
          : Promise.resolve(null),
        access.pagesRead
          ? guard(
              'counts',
              listAdminPages(
                { status: 'draft', limit: COUNT_LIMIT },
                controller.signal,
              ),
            )
          : Promise.resolve(null),
        access.pagesRead
          ? guard(
              'counts',
              listStories({ status: 'draft', limit: COUNT_LIMIT }, controller.signal),
            )
          : Promise.resolve(null),
        access.eventsRead
          ? guard(
              'counts',
              listAdminEvents(
                {
                  status: 'published',
                  startFrom: now,
                  limit: COUNT_LIMIT,
                },
                controller.signal,
              ),
            )
          : Promise.resolve(null),
        access.eventsRead
          ? guard(
              'counts',
              listAdminEvents({ status: 'draft', limit: COUNT_LIMIT }, controller.signal),
            )
          : Promise.resolve(null),
        access.sermonsRead
          ? guard(
              'scheduled',
              listSermons(
                { status: 'scheduled', limit: SCHEDULED_LIMIT },
                controller.signal,
              ),
            )
          : Promise.resolve(null),
        access.pagesRead
          ? guard(
              'scheduled',
              listAdminPages(
                { status: 'scheduled', limit: SCHEDULED_LIMIT },
                controller.signal,
              ),
            )
          : Promise.resolve(null),
        access.pagesRead
          ? guard(
              'scheduled',
              listStories(
                { status: 'scheduled', limit: SCHEDULED_LIMIT },
                controller.signal,
              ),
            )
          : Promise.resolve(null),
        access.eventsRead
          ? guard(
              'scheduled',
              listAdminEvents(
                { status: 'scheduled', limit: SCHEDULED_LIMIT },
                controller.signal,
              ),
            )
          : Promise.resolve(null),
        access.auditRead
          ? guard(
              'activity',
              listAuditLogs({ limit: ACTIVITY_LIMIT }, controller.signal),
            )
          : Promise.resolve(null),
        access.mediaRead
          ? guard('media', listMedia({ limit: MEDIA_LIMIT }, controller.signal))
          : Promise.resolve(null),
      ]);

      if (cancelled) return;

      const draftSources: DraftSource[] = [];
      if (access.sermonsRead) {
        draftSources.push({
          label: 'Sermones',
          total: sermonsDraft?.meta.total ?? null,
        });
      }
      if (access.pagesRead) {
        draftSources.push({
          label: 'Páginas',
          total: pagesDraft?.meta.total ?? null,
        });
        draftSources.push({
          label: 'Historias',
          total: storiesDraft?.meta.total ?? null,
        });
      }
      if (access.eventsRead) {
        draftSources.push({
          label: 'Eventos',
          total: eventsDraft?.meta.total ?? null,
        });
      }

      const scheduledGroups: ScheduledEntry[][] = [];
      if (access.sermonsRead && sermonsScheduled) {
        scheduledGroups.push(
          sermonsScheduled.data.map((sermon): ScheduledEntry => ({
            id: sermon.id,
            title: sermon.title,
            kind: 'sermon',
            kindLabel: 'Sermón',
            publishAt: sermon.publishAt,
            createdAt: sermon.createdAt,
            href: access.sermonsUpdate
              ? `/contenido/sermones/${sermon.id}`
              : `/contenido/sermones/${sermon.id}/preview`,
          })),
        );
      }
      if (access.pagesRead && pagesScheduled) {
        scheduledGroups.push(
          pagesScheduled.data.map((page): ScheduledEntry => ({
            id: page.id,
            title: page.title,
            kind: 'page',
            kindLabel: 'Página',
            publishAt: page.publishAt,
            createdAt: page.createdAt,
            href: '/contenido/paginas',
          })),
        );
      }
      if (access.pagesRead && storiesScheduled) {
        scheduledGroups.push(
          storiesScheduled.data.map((story): ScheduledEntry => ({
            id: story.id,
            title: story.title,
            kind: 'story',
            kindLabel: 'Historia',
            publishAt: story.publishAt,
            createdAt: story.createdAt,
            href: `/contenido/historias/${story.id}`,
          })),
        );
      }
      if (access.eventsRead && eventsScheduled) {
        scheduledGroups.push(
          eventsScheduled.data.map((event): ScheduledEntry => ({
            id: event.id,
            title: event.title,
            kind: 'event',
            kindLabel: 'Evento',
            publishAt: event.publishAt,
            createdAt: event.createdAt,
            href: '/contenido/eventos',
          })),
        );
      }

      setData({
        counts: {
          sermonsPublished: sermonsPublished?.meta.total ?? null,
          drafts: draftSources.length > 0 ? summarizeDrafts(draftSources) : null,
          upcomingEvents: eventsUpcoming?.meta.total ?? null,
          pagesPublished: pagesPublished?.meta.total ?? null,
        },
        scheduled: mergeScheduled(scheduledGroups, SCHEDULED_LIMIT),
        activity: audit?.data ?? [],
        media: media
          ? { total: media.meta.total, recent: media.data }
          : null,
      });
      setErrors({
        counts: failures.get('counts') ?? null,
        scheduled: failures.get('scheduled') ?? null,
        activity: failures.get('activity') ?? null,
        media: failures.get('media') ?? null,
      });
      setLoading(false);
    }

    void load().catch(() => {
      // Aborts are expected when filters / identity change or the screen closes.
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    access.auditRead,
    access.eventsRead,
    access.mediaRead,
    access.pagesRead,
    access.sermonsRead,
    access.sermonsUpdate,
    reloadKey,
  ]);

  const initialLoading = loading && data === null;
  const hasCountError = errors.counts !== null;
  const hasSectionError =
    hasCountError ||
    errors.scheduled !== null ||
    errors.activity !== null ||
    errors.media !== null;

  const draftValue = data?.counts.drafts ?? null;
  const draftMeta = draftValue
    ? `${draftValue.labels.join(', ')}${
        draftValue.complete ? '' : ' · datos parciales'
      }`
    : 'Contenido en preparación';

  const primaryDraftPath = access.sermonsRead
    ? '/contenido/sermones'
    : access.pagesRead
      ? '/contenido/paginas'
      : '/';

  return (
    <section className="page dashboard">
      <header className="dashboard__welcome">
        <p className="dashboard__eyebrow">Panel editorial</p>
        <h1 className="dashboard__title">Bienvenido, {displayName}</h1>
        <p className="dashboard__lede">
          Administra el contenido de UCI desde un solo lugar.
        </p>
      </header>

      {hasSectionError ? (
        <div className="dashboard__notice" role="alert">
          <p>
            Algunos bloques no se pudieron actualizar. El resto de la información
            sigue disponible.
          </p>
          <button
            type="button"
            className="button button--quiet button--small"
            onClick={() => setReloadKey((key) => key + 1)}
            disabled={loading}
          >
            Reintentar
          </button>
        </div>
      ) : null}

      <div className="dashboard__stats">
        {access.sermonsRead ? (
          <StatCard
            icon="book-open"
            label="Sermones publicados"
            value={data?.counts.sermonsPublished ?? null}
            meta="En el archivo editorial"
            to="/contenido/sermones"
            pending={initialLoading}
          />
        ) : null}

        {draftValue !== null || (access.sermonsRead || access.pagesRead || access.eventsRead) ? (
          <StatCard
            icon="edit"
            label="Borradores"
            value={draftValue?.total ?? null}
            meta={draftMeta}
            to={primaryDraftPath}
            pending={initialLoading}
          />
        ) : null}

        {access.eventsRead ? (
          <StatCard
            icon="calendar"
            label="Eventos próximos"
            value={data?.counts.upcomingEvents ?? null}
            meta="Publicados con fecha futura"
            to="/contenido/eventos"
            pending={initialLoading}
          />
        ) : null}

        {access.pagesRead ? (
          <StatCard
            icon="file-text"
            label="Páginas publicadas"
            value={data?.counts.pagesPublished ?? null}
            meta="Visibles en el sitio"
            to="/contenido/paginas"
            pending={initialLoading}
          />
        ) : null}
      </div>

      <div className="dashboard__grid">
        <div className="dashboard__column">
          {access.auditRead ? (
            <section className="panel" aria-labelledby="dashboard-activity">
              <div className="panel__head">
                <h2 className="panel__title" id="dashboard-activity">
                  Actividad reciente
                </h2>
                <Link className="panel__header-link" to="/administracion/auditoria">
                  Ver auditoría
                </Link>
              </div>
              {initialLoading ? (
                <LoadingPanel label="Cargando actividad…" />
              ) : errors.activity ? (
                <ErrorPanel
                  title="No pudimos cargar la actividad"
                  message={errors.activity}
                  onRetry={() => setReloadKey((key) => key + 1)}
                />
              ) : data && data.activity.length > 0 ? (
                <ul className="dashboard-list">
                  {data.activity.map((entry) => (
                    <ActivityEntry
                      key={entry.id}
                      entry={entry}
                      hasPermission={hasPermission}
                    />
                  ))}
                </ul>
              ) : (
                <EmptyPanel
                  title="Todavía no hay actividad registrada"
                  message="Las acciones del panel aparecerán acá a medida que se realicen."
                />
              )}
            </section>
          ) : null}

          {access.sermonsRead || access.pagesRead || access.eventsRead ? (
            <section className="panel" aria-labelledby="dashboard-scheduled">
              <div className="panel__head">
                <h2 className="panel__title" id="dashboard-scheduled">
                  Contenido programado
                </h2>
                <span className="panel__hint">Próximas publicaciones</span>
              </div>
              {initialLoading ? (
                <LoadingPanel label="Cargando contenido programado…" />
              ) : errors.scheduled ? (
                <ErrorPanel
                  title="No pudimos cargar el contenido programado"
                  message={errors.scheduled}
                  onRetry={() => setReloadKey((key) => key + 1)}
                />
              ) : data && data.scheduled.length > 0 ? (
                <ul className="dashboard-list">
                  {data.scheduled.map((entry) => (
                    <ScheduledRow key={`${entry.kind}-${entry.id}`} entry={entry} />
                  ))}
                </ul>
              ) : (
                <EmptyPanel
                  title="No hay contenido programado"
                  message="Las publicaciones con fecha futura van a aparecer en este bloque."
                />
              )}
            </section>
          ) : null}
        </div>

        <div className="dashboard__column">
          <section className="panel" aria-labelledby="dashboard-actions">
            <div className="panel__head">
              <h2 className="panel__title" id="dashboard-actions">
                Acciones rápidas
              </h2>
            </div>
            {quickActions.length > 0 ? (
              <div className="quick-actions">
                {quickActions.map((action) => (
                  <Link className="quick-action" to={action.to} key={action.key}>
                    <span className="quick-action__icon" aria-hidden="true">
                      <NavIcon name={action.icon} className="nav__icon" />
                    </span>
                    <span>{action.label}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="panel__empty-note">
                Tu rol no habilita acciones de creación en este momento.
              </p>
            )}
          </section>

          {access.mediaRead ? (
            <section className="panel" aria-labelledby="dashboard-media">
              <div className="panel__head">
                <h2 className="panel__title" id="dashboard-media">
                  Resumen multimedia
                </h2>
                <Link className="panel__header-link" to="/media/biblioteca">
                  Abrir biblioteca
                </Link>
              </div>
              {initialLoading ? (
                <LoadingPanel label="Cargando biblioteca…" />
              ) : errors.media ? (
                <ErrorPanel
                  title="No pudimos cargar la biblioteca"
                  message={errors.media}
                  onRetry={() => setReloadKey((key) => key + 1)}
                />
              ) : data?.media ? (
                data.media.total > 0 ? (
                  <>
                    <p className="media-summary__count">
                      {data.media.total}{' '}
                      <span>
                        {data.media.total === 1 ? 'archivo' : 'archivos'}
                      </span>
                    </p>
                    <div className="media-summary__thumbs">
                      {data.media.recent.map((item) => (
                        <span className="media-summary__thumb" key={item.id}>
                          <MediaThumbnail media={item} size="card" />
                        </span>
                      ))}
                    </div>
                    <p className="panel__hint">
                      Últimos archivos cargados en la biblioteca.
                    </p>
                  </>
                ) : (
                  <EmptyPanel
                    title="La biblioteca está vacía"
                    message="Subí la primera imagen desde la biblioteca multimedia."
                    action={
                      <Link className="button button--primary button--small" to="/media/biblioteca">
                        Subir archivo
                      </Link>
                    }
                  />
                )
              ) : null}
            </section>
          ) : null}
        </div>
      </div>
    </section>
  );
}
