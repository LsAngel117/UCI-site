# 07 — Technical Architecture

## 1. Purpose

This document defines the technical architecture for the UCI website and its advanced CMS.

It establishes the main architectural decisions, application boundaries, responsibilities, deployment model, persistence strategy, security principles, rendering strategy, and technical constraints that guide implementation.

The architecture must support:

- A fast, SEO-friendly public website.
- A modern and maintainable CMS.
- Structured management of church content.
- External multimedia resources without unnecessarily filling the database or VPS storage.
- Strong separation between public content and administrative operations.
- Secure authentication and authorization.
- Future growth without unnecessary infrastructure complexity.

---

## 2. Architectural Principles

1. **Modular monolith first.** The initial system is one deployable application composed of clear internal modules.
2. **Astro is the public website core.** The public experience should remain server/static-first wherever possible.
3. **React is used for interactivity.** React should not turn the entire public website into a client-rendered application.
4. **Node.js owns application logic and API access.** The frontend never connects directly to PostgreSQL.
5. **PostgreSQL is the source of truth for structured content.**
6. **The CMS manages content, not arbitrary page layout.**
7. **Media is separated from structured data.** Large images, videos, and other media should generally live outside PostgreSQL.
8. **Security is enforced by the backend.** Hiding UI controls is not authorization.
9. **Published content is the only content exposed publicly.**
10. **Avoid premature infrastructure.** Redis, Elasticsearch, Kafka, Kubernetes, GraphQL, CQRS, event sourcing, and microservices are not part of the initial architecture unless a demonstrated requirement appears.
11. **Framework-independent domain logic.**
12. **Configuration and secrets stay outside source code.**
13. **Database changes are versioned through migrations.**
14. **The architecture should remain understandable by a small development team.**

---

## 3. Main Architecture

The initial system consists of:

- **Astro** — public website.
- **React** — interactive public components and CMS interface.
- **Node.js** — backend/API.
- **PostgreSQL** — relational persistence.
- **Docker** — application/container packaging.
- **Caddy** — HTTPS termination and reverse proxy.
- **TypeScript** — primary application language.

```text
                         INTERNET
                            │
                            ▼
                         CADDY
                   HTTPS / Reverse Proxy
                            │
              ┌─────────────┴─────────────┐
              │                           │
              ▼                           ▼
        PUBLIC WEBSITE                 CMS PANEL
           Astro                         React
              │                           │
              └─────────────┬─────────────┘
                            │
                            ▼
                       NODE.JS API
                            │
             ┌──────────────┼──────────────┐
             │              │              │
             ▼              ▼              ▼
        Application       Domain      Infrastructure
             │                             │
             │                             ▼
             │                         PostgreSQL
             │
             └───────────────► External Services
                                / Media Providers
```

There is no direct browser-to-PostgreSQL connection.

---

## 4. Deployment Model

The initial production deployment is a single-server architecture:

```text
Internet
   │
   ▼
Caddy :443
   │
   ▼
UCI Application
 ├── Public website
 ├── Admin panel
 └── Node API
   │
   ▼
PostgreSQL
```

The application and database may run as separate containers on the same VPS.

The architecture must preserve the ability to move PostgreSQL to a managed service or separate server later without changing the domain/application layer.

---

## 5. Monorepo Structure

The project remains a single repository and coherent application.

```text
src/
├── web/
│   ├── pages/
│   ├── layouts/
│   ├── components/
│   ├── sections/
│   ├── lib/
│   └── styles/
│
├── admin/
│   ├── pages/
│   ├── components/
│   ├── features/
│   ├── forms/
│   ├── services/
│   └── lib/
│
├── server/
│   ├── api/
│   ├── application/
│   ├── domain/
│   ├── infrastructure/
│   ├── auth/
│   └── config/
│
└── shared/
    ├── contracts/
    ├── schemas/
    ├── types/
    └── constants/

public/
tests/
docs/
```

The exact framework-specific structure may evolve, but the separation of responsibilities must remain.

---

## 6. Backend Layers

The backend follows four conceptual layers.

### API / HTTP

Responsible for:

- HTTP routes.
- Request parsing.
- Authentication context.
- Authorization checks.
- Input validation.
- Response serialization.
- HTTP status codes.
- Error translation.

The HTTP layer must not contain core business rules.

### Application

Coordinates use cases such as:

- Create/update sermon.
- Publish/schedule/unpublish sermon.
- Create/update/publish event.
- Manage ministries.
- Manage media metadata.
- Update church information.
- Preview content.

### Domain

Contains business rules independent of infrastructure:

- Publication state transitions.
- Slug rules.
- Content relationships.
- Event temporal rules.
- Featured-content rules.
- Editorial constraints.
- Visibility rules.

### Infrastructure

Responsible for:

- PostgreSQL access.
- ORM/query implementation if selected.
- Authentication persistence.
- External media providers.
- Email provider.
- External integrations.
- Logging.
- Scheduled jobs.
- Storage adapters.

---

## 7. Public Website

Astro is the primary public rendering framework.

The public website should favor:

- Server rendering.
- Static generation where appropriate.
- Minimal client-side JavaScript.
- Progressive enhancement.
- React islands only where interaction requires them.

Examples that may justify React:

- Search.
- Sermon filters.
- Event/calendar interaction.
- Contact form.
- Interactive navigation.
- Media controls.

Static informational content should not become unnecessary client-side applications.

---

## 8. Rendering Strategy

Rendering is selected according to content behavior.

### Static / pre-rendered

Suitable for:

- Stable institutional information.
- Design-controlled pages.
- Some navigation structures.
- Infrequently changing content.

### Server-rendered

Suitable for:

- Frequently updated CMS content.
- Sermon listings.
- Events.
- Search results.
- Content affected by publication state.

### Client-interactive

Used only when browser-side interaction materially improves the experience.

The public site must not require a large JavaScript application merely to display ordinary content.

---

## 9. Node.js Backend

The Node.js backend is the single application boundary between clients and persistent data.

Responsibilities include:

- Content CRUD.
- Editorial workflows.
- Authentication.
- Authorization.
- Publication scheduling.
- Media metadata.
- Search.
- Contact forms.
- Public content APIs.
- Administrative APIs.
- Validation.
- Audit information.
- External service integration.

The backend must enforce the functional rules defined in `06-functional-requirements.md`.

---

## 10. API Boundary

The API should be organized around resources and use cases rather than exposing database tables directly.

The API must not become a generic CRUD mirror of PostgreSQL.

For example, publishing a sermon should represent a business operation and enforce valid editorial transitions instead of allowing unrestricted updates to a `status` field.

---

## 11. Public and Administrative APIs

### Public operations

- Published sermons.
- Published events.
- Published ministries.
- Published stories.
- Published articles.
- Public church information.
- Public service schedules.
- Public galleries.
- Public live-stream configuration.
- Public search.

### Administrative operations

- Authentication.
- CRUD.
- Publishing.
- Scheduling.
- Unpublishing.
- Archiving.
- Preview.
- Media management.
- Taxonomy management.
- Global configuration.
- Audit information.

Administrative endpoints must never rely solely on the frontend to prevent unauthorized operations.

---

## 12. Domain Concepts

Based on `05-content-model-cms.md`, core concepts include:

- `ChurchProfile`
- `ServiceSchedule`
- `Location`
- `Person`
- `Sermon`
- `SermonSeries`
- `Topic`
- `Event`
- `EventCategory`
- `Ministry`
- `Story`
- `Article`
- `GalleryAlbum`
- `MediaAsset`
- `ManagedPage`
- `SocialLink`
- `GivingConfig`
- `LiveStreamConfig`
- `HomepageConfig`

These are conceptual domain entities. Their final database representation belongs to the persistence specification.

---

## 13. Application Use Cases

Representative use cases include:

### Sermons

- Create sermon.
- Update sermon.
- Publish sermon.
- Schedule sermon.
- Unpublish sermon.
- Archive sermon.
- Restore sermon.
- Associate sermon with series.
- Associate sermon with topics.
- Attach external video.
- Attach sermon notes.

### Events

- Create event.
- Update event.
- Publish event.
- Schedule event.
- Archive event.
- Associate category.
- Associate location.

### Ministries

- Create ministry.
- Update ministry.
- Publish ministry.
- Unpublish ministry.
- Order ministries.

### Media

- Register media asset.
- Update metadata.
- Associate media with content.
- Replace media reference.
- Archive media metadata.

### Church configuration

- Update church profile.
- Update service schedule.
- Update location.
- Update social links.
- Update giving configuration.
- Update live-stream configuration.

---

## 14. Database Architecture

PostgreSQL is the authoritative persistence layer for structured application data.

The database should contain:

- Content metadata.
- Relationships.
- Publication states.
- Editorial information.
- Configuration.
- User/account information.
- Audit information.
- Media references and metadata.

The database should generally **not** contain large binary media files.

---

## 15. Database Rules

The persistence layer must provide:

- Referential integrity.
- Foreign keys where appropriate.
- Unique constraints.
- Unique public slugs.
- Appropriate indexes.
- Transactional updates for multi-entity operations.
- Versioned migrations.
- Explicit timestamps.
- Consistent timezone handling.

Database constraints complement, rather than replace, application validation.

---

## 16. Time and Timezones

The system must use a clearly defined timezone strategy.

The church's operational timezone should initially correspond to Colombia time.

Dates stored in the database must use an unambiguous representation.

The system must distinguish:

- Instant in time.
- Local date.
- Local time.
- Recurring schedule.

Event and service rendering must not silently shift times because of browser timezone differences.

---

## 17. Editorial State Machine

Content entities that support publication use controlled editorial states:

```text
DRAFT
   │
   ├──────────────► SCHEDULED
   │                    │
   │                    ▼
   └──────────────► PUBLISHED
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
         UNPUBLISHED             ARCHIVED
              │                     │
              └────────► PUBLISHED ◄┘
```

Valid transitions must be enforced by the application.

A scheduled item becomes public only when its publication conditions are satisfied.

---

## 18. Scheduled Publishing

Scheduled publishing may initially use a lightweight application-level scheduler or worker.

It must:

- Detect content whose publication time has arrived.
- Validate the content before publishing.
- Execute the transition transactionally.
- Record publication metadata.
- Make the content available to public queries.
- Avoid duplicate execution.

A distributed job system is not required initially.

---

## 19. Caching and Revalidation

Caching should be introduced according to measured need.

The first optimization layer should be:

1. Efficient database queries.
2. Appropriate indexes.
3. Astro rendering strategy.
4. HTTP/browser caching.
5. Static generation where appropriate.
6. Targeted server-side caching.

Redis is not required for the initial architecture.

If caching is introduced, it must never allow unpublished content to leak publicly.

---

## 20. Content Visibility

Public queries must explicitly enforce publication visibility.

The public website must never rely on a frontend condition such as `status === "PUBLISHED"` as its primary security mechanism.

The backend/public data layer must already exclude content that should not be publicly visible.

Administrative users may access additional states according to their permissions.

---

## 21. CMS Architecture

The CMS is a React application served under:

```text
/panel
```

The CMS communicates exclusively through the backend/API boundary.

It should provide:

- Dashboard.
- Content lists.
- Content editor.
- Media library.
- Taxonomies.
- Publication controls.
- Scheduling.
- Preview.
- Global church configuration.
- Search/filtering.
- Editorial status indicators.

The CMS must not allow unrestricted modification of arbitrary frontend HTML or CSS.

---

## 22. Shared Contracts and Validation

The public frontend, admin frontend, and backend should share explicit contracts where practical.

Shared contracts may include:

- TypeScript types.
- Validation schemas.
- Enumerations.
- API response contracts.
- Pagination structures.
- Error structures.

Validation occurs at multiple boundaries:

- Client for immediate feedback.
- API for every incoming request.
- Domain for business rules.
- Database for persistence integrity.

Client-side validation is never a security boundary.

---

## 23. API Error Model

Errors should use a consistent structure.

Conceptually:

```json
{
  "error": {
    "code": "CONTENT_NOT_PUBLISHABLE",
    "message": "The content cannot be published in its current state.",
    "details": {}
  }
}
```

The public website must not expose internal stack traces, SQL errors, or infrastructure details.

---

## 24. Pagination and Search

Administrative lists should use pagination.

Public lists should also support pagination when datasets can become large.

Likely paginated resources include:

- Sermons.
- Events.
- Articles.
- Gallery albums.
- Search results.

The initial search implementation should use PostgreSQL capabilities.

A dedicated search engine such as Elasticsearch/OpenSearch is not required initially.

The application should expose search through an abstraction that permits a future provider without changing the public UI contract.

---

## 25. Media Architecture

Media is deliberately separated from structured content.

The database stores metadata and references such as:

- URL.
- Provider.
- MIME type.
- Width.
- Height.
- Alt text.
- Caption.
- File size when available.
- External identifier.
- Content associations.

Actual binary files should generally be stored in:

- External image hosting.
- Object storage.
- CDN-backed storage.
- Another dedicated media provider.

The exact provider is deferred.

---

## 26. Images and Video

Images should not normally be stored as PostgreSQL binary blobs.

```text
CMS
 │
 ▼
Media Provider / Object Storage
 │
 └── URL / identifier
          │
          ▼
      PostgreSQL
```

Videos should generally remain external, including YouTube or future providers.

The CMS stores provider, external ID, URL/reference, title, thumbnail information where applicable, and embed configuration when required.

The application is not initially a video-hosting platform.

---

## 27. External Service Adapters

External providers should be accessed through adapters/interfaces.

Examples:

```text
MediaStorage
VideoProvider
EmailProvider
SearchProvider
```

The domain/application layer should not depend directly on a specific provider.

---

## 28. Authentication and Authorization

Administrative authentication is required for `/panel`.

The architecture must support:

- Secure login.
- Session/token management.
- Password hashing when password authentication is used.
- Session expiration.
- Logout.
- Credential-abuse protection.
- Secure cookie configuration when cookie-based sessions are used.

Authorization is enforced by the backend.

The initial role model should at least distinguish administrative/editorial capabilities as required by the final security specification.

The exact authentication library and permission matrix are intentionally deferred.

---

## 29. Admin Route Protection

The following must be protected:

```text
/panel
/panel/*
```

and all administrative API operations.

Knowing an administrative URL must never grant access.

Unauthorized API operations should return appropriate HTTP errors without leaking sensitive information.

---

## 30. Sessions, CSRF and CORS

If cookie-based authentication is used:

- Cookies should be `HttpOnly` where appropriate.
- `Secure` should be enabled in production.
- SameSite policy must be deliberate.
- CSRF protection must be considered for state-changing requests.

The system should minimize cross-origin requirements.

If CORS is required, it must use explicit allowed origins. Wildcard origins must not be used for authenticated administrative APIs.

---

## 31. Rate Limiting and Contact

Rate limiting should protect:

- Login.
- Contact form.
- Search.
- Public API endpoints susceptible to abuse.
- Administrative APIs.

Public contact submissions must go through Node.js.

The backend must:

- Validate input.
- Apply anti-abuse controls.
- Sanitize content.
- Record or forward the message according to policy.
- Avoid exposing internal recipient addresses.

Email delivery is accessed through an adapter.

---

## 32. SEO Architecture

The public frontend must generate technical SEO metadata from authoritative content.

The architecture supports:

- Unique titles.
- Meta descriptions.
- Canonical URLs.
- Open Graph metadata.
- Social preview metadata.
- Sitemap.
- Robots directives.
- Structured data.
- Clean slugs.
- Proper heading hierarchy.

Structured data should be generated from CMS data rather than duplicated manually whenever practical.

Potential schema.org entities include:

- `Church`
- `Organization`
- `Event`
- `Article`
- `VideoObject`
- `BreadcrumbList`

---

## 33. Public URL Architecture

The initial route structure is:

```text
/
/nosotros
/sermones
/sermones/[slug]
/eventos
/eventos/[slug]
/ministerios
/ministerios/[slug]
/soy-nuevo
/contacto
```

Additional routes may include:

```text
/sermones/series/[slug]
/articulos
/articulos/[slug]
/galeria
```

only where supported by the final information architecture.

Public URLs must remain human-readable and stable.

---

## 34. Preview

The CMS requires a preview mechanism for unpublished content.

Preview must:

- Require authorization.
- Retrieve non-public content securely.
- Prevent indexing.
- Prevent accidental public caching.
- Clearly distinguish preview from production.

---

## 35. Auditability and Recovery

Editorial operations should record enough information to answer:

- Who created content?
- Who modified it?
- Who published it?
- When was it published?
- Who unpublished or archived it?
- What state did it have?

Important CMS content should support recovery from accidental changes.

At minimum, the architecture must preserve modification timestamps, editorial actor information, publication state, and a revision strategy where required.

---

## 36. Observability and Health

Production should provide:

- Structured application logs.
- Error logging.
- Request identifiers where useful.
- Health checks.
- Database connectivity monitoring.
- External integration failure visibility.

Logs must not contain passwords, authentication tokens, session secrets, or unnecessary sensitive personal information.

Health checks should distinguish liveness and readiness where useful.

---

## 37. External Failure Handling

The public website must degrade gracefully when non-critical services fail.

Examples:

### Video provider unavailable

The sermon page still displays title, Scripture, date, description, and notes when available.

### Image provider unavailable

The page uses the defined fallback behavior.

### Email provider unavailable

The contact flow communicates its status appropriately and must not falsely claim delivery.

Search failure should degrade to normal browsing where possible.

Optional analytics failure must never block rendering.

---

## 38. Performance

Performance is a core architectural requirement.

Priorities:

1. Server/static-first rendering.
2. Optimized images.
3. Minimal JavaScript.
4. Efficient database queries.
5. Appropriate caching.
6. Lazy loading of non-critical media.
7. Avoid unnecessary third-party scripts.
8. Avoid oversized frontend dependencies.

The public homepage should remain performant as CMS content grows.

---

## 39. TypeScript and Dependencies

TypeScript is the primary language across:

- Astro.
- React.
- Node.js.
- Shared contracts.

Avoid excessive use of `any`.

Dependencies should be intentionally selected and kept minimal.

Avoid adopting large infrastructure or multiple overlapping libraries without a concrete requirement.

Lockfiles must be committed.

---

## 40. Configuration and Secrets

Environment-specific configuration must be externalized.

Examples:

```text
DATABASE_URL
APP_URL
SESSION_SECRET
MEDIA_PROVIDER_*
EMAIL_PROVIDER_*
YOUTUBE_*
```

Secrets must never be committed to Git.

Development and production values must be separate.

---

## 41. Docker and Caddy

Production services should be containerized where practical.

Conceptually:

```text
docker compose
├── uci-app
└── postgres
```

Caddy may run on the host or as part of the deployment architecture.

Containers should use:

- Reproducible versions.
- Non-root execution where practical.
- Minimal base images.
- Explicit environment configuration.
- Persistent database volumes.

Caddy provides:

- HTTPS.
- Domain routing.
- Reverse proxy.
- Security headers where appropriate.
- Compression where appropriate.
- Static asset delivery where applicable.

Internal Node ports should not be exposed directly to the Internet.

---

## 42. Local Development and Environments

Local development should reproduce the production architecture closely enough to detect integration problems.

Expected local services:

```text
Astro / Admin / Node
        │
        ▼
   PostgreSQL
```

Docker Compose may provide PostgreSQL locally.

Seed data should be representative but clearly non-production.

At minimum there are:

- Development.
- Production.

A permanent staging environment may be introduced later if justified.

---

## 43. Production Deployment

The production flow is conceptually:

```text
Git repository
      │
      ▼
Build
      │
      ▼
Container image / application
      │
      ▼
Production VPS
      │
      ├── Caddy
      ├── UCI application
      └── PostgreSQL
```

Deployment must preserve database data across application updates.

Database migrations must run in a controlled manner.

---

## 44. Backups

PostgreSQL must have a backup strategy independent of normal application deployment.

Backups should consider:

- Automated schedule.
- Retention.
- Recovery testing.
- Off-server copy where practical.

The exact provider and retention policy are deferred to deployment/operations.

---

## 45. Scalability

The initial architecture targets a small-to-medium church website.

The first scaling path should be optimization and vertical scaling rather than immediate distribution.

Potential future topology:

```text
Caddy → UCI App(s) → Managed PostgreSQL
                  │
                  ├── External Media/CDN
                  └── Optional Cache
```

The domain and application layers must not depend on a single-server assumption.

---

## 46. Modular Backend and Frontends

Conceptual backend modules:

```text
auth
users
church
content
sermons
events
ministries
stories
articles
gallery
media
search
contact
configuration
audit
```

Conceptual CMS modules:

```text
Dashboard
Sermons
Events
Ministries
Stories
Articles
Gallery
Media
People
Taxonomies
Homepage
Church Information
Settings
Users / Permissions
```

Conceptual public experiences:

```text
Home
About
First Visit
Sermons
Events
Ministries
Stories
Articles
Gallery
Contact
```

The final navigation may be simplified according to actual product needs.

---

## 47. API Client and Serialization

The public and admin frontends should access backend endpoints through a defined client/service layer.

Components should not scatter raw HTTP calls throughout the UI.

API responses should use explicit DTO/response shapes.

Database models should not automatically become public API responses.

This prevents accidental exposure of private fields and uncontrolled coupling between database schemas and frontend contracts.

---

## 48. Homepage Architecture

The homepage combines:

### Structural sections

Controlled by the product/design.

### Dynamic content

Retrieved from the CMS.

Examples:

- Featured sermon.
- Latest sermon.
- Upcoming events.
- Featured ministries.
- Stories.
- Service schedule.
- Church location.

The CMS must not become a generic page builder.

Featured content should use structured configuration or editorial flags, with sensible fallbacks when selected content is unavailable.

---

## 49. Content Integrity and Deletion

The application must prevent invalid states such as:

- Published content without required public title.
- Published sermon without required canonical URL.
- Published event with invalid date information.
- Public content referencing inaccessible media without fallback.
- Duplicate public slugs.
- Public relations to deleted entities.

Hard deletion should be used carefully.

For content with historical value, prefer:

- Unpublish.
- Archive.
- Remove from public discovery.

Permanent deletion should require stronger administrative intent where appropriate.

---

## 50. Search, Jobs and Email

Public search operates only on published content.

Administrative search may include unpublished content according to permissions.

Background jobs may handle:

- Scheduled publishing.
- Email delivery.
- Media metadata synchronization.
- Other non-critical asynchronous work.

A distributed queue is not initially required.

Email is an external infrastructure concern accessed through an adapter.

---

## 51. API Versioning and Compatibility

The first API may use a version namespace such as:

```text
/api/v1/...
```

if appropriate before contracts are finalized.

Breaking changes must not silently invalidate existing clients.

Changes affecting public URLs, published content, CMS data, or external integrations require migration/compatibility consideration.

---

## 52. Testing Architecture

Testing should reflect architectural boundaries.

### Domain

Business rules independently of infrastructure.

### Application

Use cases and state transitions.

### API

Validation, authorization, responses, and integration behavior.

### Frontend

Critical user flows and interactive components.

### End-to-end

Important journeys such as:

- Visiting the homepage.
- Viewing a sermon.
- Finding an event.
- Submitting contact information.
- Logging into CMS.
- Publishing content.

The exact test stack is an implementation decision.

---

## 53. Database Performance

The persistence layer should be designed around common queries.

Likely indexes include:

- Slugs.
- Publication status.
- Publication date.
- Event dates.
- Foreign keys.
- Search-related fields.
- Ordering fields.

The final index set belongs to the database specification.

The API should avoid:

- N+1 relationship queries.
- Loading complete libraries when only a page is needed.
- Returning large media payloads unnecessarily.
- Unbounded administrative lists.

---

## 54. HTTP and Browser Caching

Use appropriate cache headers for:

- Static assets.
- Images.
- Public immutable resources.
- Public content where safe.

Administrative/private responses must not be publicly cached.

Cache invalidation must be considered whenever content changes.

---

## 55. Privacy and Personal Data

The system should minimize personal data collection.

Only intentionally public information about publicly represented people should be exposed.

Private administrative data must remain inaccessible through public APIs.

Contact-form data must be handled according to project privacy requirements and applicable Colombian data-protection obligations.

---

## 56. Accessibility and Internationalization

Technical architecture must support:

- Semantic HTML.
- Keyboard navigation.
- Focus management.
- Accessible forms.
- Text alternatives for images.
- Accessible interactive components.
- Reduced-motion preferences.

The initial website is Spanish-first.

The architecture should not make future language support impossible, but full internationalization is not required for the first release.

---

## 57. Initial Technology Stack

| Area | Technology |
|---|---|
| Public frontend | Astro |
| Interactive UI | React |
| Backend | Node.js |
| Language | TypeScript |
| Database | PostgreSQL |
| Reverse proxy | Caddy |
| Containers | Docker |
| CMS | React |
| Search | PostgreSQL initially |
| Media | External provider / object storage |
| Video | External provider such as YouTube |
| Deployment | VPS |

Specific versions and libraries remain implementation decisions unless fixed by another specification.

---

## 58. Explicitly Deferred Decisions

The following decisions are intentionally left for later specifications or implementation:

- Exact ORM/data-access library.
- Exact authentication library.
- Final authentication/session mechanism.
- Final permission matrix.
- Exact PostgreSQL table definitions.
- Exact API endpoint contracts.
- Exact media provider.
- Exact image transformation/CDN provider.
- Exact email provider.
- Exact backup provider.
- Exact production domain configuration.
- Detailed CMS component architecture.
- Final caching implementation.
- Final job/scheduler implementation.

These decisions must remain compatible with this architecture.

---

## 59. Architectural Constraints

The implementation must not:

- Connect Astro/React directly to PostgreSQL.
- Expose database credentials to browsers.
- Publish unpublished CMS content publicly.
- Treat UI visibility as authorization.
- Store large media in PostgreSQL without a demonstrated requirement.
- Turn the public website into a full client-rendered SPA unnecessarily.
- Introduce microservices without a concrete requirement.
- Introduce distributed infrastructure merely for theoretical scale.
- Make the CMS responsible for arbitrary page markup/layout.
- Hard-code church configuration in multiple frontend locations.
- Commit production secrets to the repository.

---

## 60. Definition of Done

The technical architecture is considered implemented when:

- Astro serves the public website.
- React powers required interactive areas and the CMS.
- Node.js provides the application/API boundary.
- PostgreSQL persists structured data.
- Public content is filtered by publication state.
- Administrative operations require authentication and authorization.
- CMS content can be created, edited, previewed, scheduled, published, unpublished, and archived according to defined rules.
- Media references are separated from structured content.
- External videos are supported without hosting video in the application.
- Database migrations are versioned.
- Production secrets are externalized.
- Caddy provides the public HTTPS entry point.
- Application health can be monitored.
- PostgreSQL backups exist.
- The public website remains usable when non-critical external integrations fail.
- The architecture remains a modular monolith without unnecessary distributed infrastructure.

---

## 61. Relationship to Following Specifications

This document establishes the architectural boundaries.

Expected next documents include:

- `08-api-backend-spec.md`
- `09-database-persistence-spec.md`
- `10-seo-performance-spec.md`
- `11-security-permissions-spec.md`
- Deployment/operations specification.

Those documents should refine the architecture rather than redefine its fundamental principles.

---

## Final Architectural Definition

The UCI website is a **modular monolithic web platform** built around:

**Astro + React + Node.js + PostgreSQL**, deployed behind **Caddy**, with a structured **advanced CMS**, externalized media, controlled editorial workflows, and a server/static-first public experience.

The architecture prioritizes:

**clarity → security → performance → maintainability → controlled extensibility**

over unnecessary infrastructure complexity.
