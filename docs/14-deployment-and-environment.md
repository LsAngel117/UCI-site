# Deployment and Environment

## 1. Purpose

This document defines the deployment architecture, environments, runtime configuration, infrastructure responsibilities, containerization strategy, reverse proxy, persistent storage, backups, observability, and operational requirements for UCI.

The deployment architecture must support:

- the Astro public website;
- the React administrative panel;
- the Node.js/TypeScript API;
- PostgreSQL;
- media storage;
- Caddy;
- HTTPS;
- scheduled operations;
- backups;
- future growth.

The target deployment is intentionally lightweight and cost-conscious while remaining production-oriented.

---

# 2. Deployment Principles

The deployment architecture follows these principles:

1. Keep the application modular but operationally simple.
2. Use one repository and one application deployment.
3. Keep PostgreSQL private.
4. Put Caddy at the public network boundary.
5. Keep persistent data outside ephemeral application containers.
6. Treat media storage separately from database storage.
7. Keep configuration outside source code.
8. Make backups independent from the application process.
9. Avoid unnecessary infrastructure services.
10. Preserve the possibility of moving media to object storage later.

---

# 3. Target Infrastructure

The initial production environment is an Oracle Cloud Always Free A1 Flex VM running:

```text
Ubuntu 24.04.4 LTS
ARM64 / aarch64
Approximately 2 OCPU
Approximately 12 GiB RAM
Approximately 200 GB storage
```

The server may host UCI alongside other projects under:

```text
/opt/
```

The UCI deployment must therefore avoid assuming exclusive ownership of the entire server.

---

# 4. Server Isolation

Each application should have an isolated project directory.

Conceptually:

```text
/opt/
├── orbit/
├── uci/
└── other-projects/
```

The exact directory name for UCI may be finalized during deployment.

UCI must not depend on files belonging to unrelated applications.

---

# 5. Production Architecture

The target production flow is:

```text
Internet
   │
   ▼
DNS
   │
   ▼
Caddy
   │
   ├── HTTPS
   ├── Security headers
   ├── Public routing
   └── Reverse proxy
          │
          ▼
      UCI Application
          │
    ┌─────┼─────────────┐
    │     │             │
 Astro   React        Node API
    │     │             │
    └─────┼─────────────┘
          │
          ▼
      PostgreSQL
          │
          ▼
      Persistent Data

Media
  │
  ▼
Media Storage
(VPS initially / Object Storage later)
```

---

# 6. Application Architecture at Runtime

Although the source architecture contains:

```text
src/web
src/admin
src/server
src/shared
src/db
```

the deployment should avoid unnecessarily multiplying production services.

The application may run as one main container/process architecture while exposing the public and administrative interfaces according to the chosen runtime strategy.

The final implementation must preserve the logical separation between:

- public frontend;
- admin frontend;
- API;
- shared code;
- database.

---

# 7. Docker

Docker is the preferred deployment mechanism for consistency between environments.

The production environment should use containers for:

- UCI application;
- PostgreSQL;
- Caddy where appropriate.

Persistent data must be stored outside ephemeral container layers.

---

# 8. Docker Compose

Docker Compose should define the production service relationship.

Conceptually:

```text
services:
  app
  db
  caddy
```

Additional services should not be introduced unless they solve a concrete operational requirement.

---

# 9. PostgreSQL Container

PostgreSQL should run as an internal service.

It must:

- use persistent storage;
- not expose its port publicly;
- be reachable by the application through the internal Docker network;
- use credentials supplied through environment/secret configuration.

---

# 10. PostgreSQL Persistence

Database data must be stored in a persistent volume.

Conceptually:

```text
postgres
   ↓
persistent volume
```

Deleting/recreating the application container must not delete the database.

---

# 11. Media Persistence

If the initial VPS filesystem is used for media, media must also be mounted as persistent storage.

Conceptually:

```text
Host media directory
       ↓
Application/media container
       ↓
MediaStorage
```

Media must not live only inside a disposable container layer.

---

# 12. Media and Database Separation

The following must remain conceptually independent:

```text
PostgreSQL backup
```

and:

```text
Media backup
```

A database dump does not contain uploaded images or documents.

---

# 13. Caddy

Caddy acts as the public HTTP/HTTPS boundary.

Responsibilities include:

- TLS certificates;
- HTTPS redirection;
- reverse proxy;
- public routing;
- security headers where appropriate;
- static/media delivery where configured;
- compression where appropriate.

---

# 14. HTTPS

Production traffic must use HTTPS.

HTTP requests should redirect to HTTPS.

The production application must not expose administrative functionality over plaintext HTTP.

---

# 15. TLS

Caddy should manage certificates automatically where DNS and domain configuration permit.

The application should not implement TLS itself.

---

# 16. DNS

The production domain and any required subdomains must resolve to the production server.

Possible architecture:

```text
example.com
www.example.com
media.example.com
```

The exact UCI domain structure should be finalized according to the project's domain configuration.

---

# 17. Public Routing

The reverse proxy should route public traffic to the appropriate application service.

Conceptually:

```text
/
    → Public Astro site

/panel
    → React admin application

/api/v1
    → Node.js API

/media
    or
media subdomain
    → Public media delivery
```

The exact implementation may vary without changing the logical architecture.

---

# 18. API Routing

The API remains versioned:

```text
/api/v1
```

Caddy must not rewrite the public API into an unversioned contract.

---

# 19. Administrative Routing

The administrative application remains conceptually available at:

```text
/panel
```

The panel must communicate with the versioned API.

---

# 20. Internal Service Communication

Application-to-database communication should occur over the internal Docker network.

The public internet must not have direct database access.

---

# 21. Environment Separation

At minimum, the platform must distinguish:

```text
Development
Production
```

A staging environment may be introduced later.

---

# 22. Development Environment

Development should allow developers to run the architecture locally with minimal infrastructure setup.

Docker Compose may provide:

```text
PostgreSQL
```

while the application can run through the normal development tooling.

The exact developer workflow remains outside this deployment specification.

---

# 23. Production Environment

Production must use:

- production credentials;
- secure cookies;
- HTTPS;
- restricted CORS;
- production logging;
- appropriate security headers;
- persistent database;
- persistent media;
- backups.

Development configuration must never be reused blindly.

---

# 24. Environment Variables

Configuration that differs between environments must be externalized.

Examples include:

```text
NODE_ENV
PORT
DATABASE_URL
SESSION_SECRET
PUBLIC_SITE_URL
API_BASE_URL
MEDIA_BASE_URL
MEDIA_STORAGE_PROVIDER
MEDIA_STORAGE_PATH
CORS_ALLOWED_ORIGINS
```

Additional external integration variables may include:

```text
SMTP configuration
YouTube-related configuration
analytics configuration
storage provider credentials
```

only when those integrations are actually enabled.

---

# 25. Secrets

Secrets must never be committed to Git.

Production secrets must be supplied through:

- environment configuration;
- protected deployment configuration;
- secure secret management where available.

Examples:

```text
Database password
Session secret
SMTP credentials
Object-storage credentials
```

---

# 26. Configuration Validation

The application should validate required environment variables during startup.

A missing critical variable should cause a clear startup failure rather than a partially functional insecure deployment.

---

# 27. Production Logging

Production logs should be structured and useful for diagnosis.

Logs should include information such as:

```text
timestamp
level
service
message
requestId
```

when appropriate.

---

# 28. Sensitive Logging

Production logs must not expose:

- passwords;
- session cookies;
- authentication secrets;
- database credentials;
- API keys;
- complete sensitive request bodies.

---

# 29. Request Correlation

API requests should support request/correlation identifiers.

This allows an error to be traced across:

```text
Caddy
   ↓
Application
   ↓
Database
```

where logs support such tracing.

---

# 30. Health Checks

The application should expose a lightweight health mechanism for operational monitoring.

The health model should distinguish between:

```text
Application process is alive
```

and:

```text
Application dependencies are operational
```

where necessary.

---

# 31. Readiness

A readiness check may verify critical dependencies such as PostgreSQL.

The application should not be considered ready to receive traffic if required dependencies are unavailable.

---

# 32. Container Health

Docker health checks may be used for:

- application;
- PostgreSQL;
- Caddy where useful.

Health checks should be lightweight and not create unnecessary load.

---

# 33. Restart Policy

Production services should have appropriate restart behavior so transient failures do not permanently leave the site offline.

However, automatic restarts must not hide persistent configuration or database failures.

---

# 34. Deployment Strategy

The deployment should follow a predictable sequence:

```text
Pull/obtain release
        ↓
Build application
        ↓
Prepare containers
        ↓
Run database migrations
        ↓
Start/update services
        ↓
Verify health
        ↓
Verify public site
        ↓
Verify API
        ↓
Verify /panel
```

Database migration ordering must be handled carefully to preserve compatibility during deployments.

---

# 35. Database Migrations

Database schema changes must be managed through versioned migrations.

Production must not depend on manually editing PostgreSQL tables.

Migrations should be:

- deterministic;
- versioned;
- reviewable;
- repeatable in the intended deployment process.

---

# 36. Migration Safety

Destructive schema changes should be approached carefully.

For important production data, migration strategies should favor:

```text
Expand
   ↓
Migrate
   ↓
Switch
   ↓
Contract
```

when a change could otherwise cause downtime or data loss.

---

# 37. Deployment Rollback

The deployment process should allow application rollback when practical.

The system should distinguish:

```text
Application rollback
```

from:

```text
Database rollback
```

Database migrations should not assume that every application rollback can safely reverse the schema automatically.

---

# 38. Static Assets

Application static assets should be produced during the application build process.

They should not require runtime modification.

CMS media remains outside source-controlled application assets.

---

# 39. Media Deployment

Deploying a new application version must not overwrite or delete existing CMS media.

Media storage must be mounted/persisted independently of the application image.

---

# 40. Media Migration Readiness

The production configuration should allow:

```text
MEDIA_STORAGE_PROVIDER=vps
```

or equivalent configuration.

Future providers may include:

```text
r2
s3
cloudinary
```

without changing content records.

---

# 41. Database Backups

PostgreSQL must have regular backups.

At minimum, backups should include:

- schema;
- content;
- users;
- settings;
- revisions;
- audit data where retention requires it.

---

# 42. Media Backups

Media backups must be handled independently.

At minimum, the backup strategy should account for:

- sermon images;
- sermon notes;
- event images;
- ministry images;
- page assets;
- documents;
- other CMS-managed media.

---

# 43. Backup Location

Backups should not exist only on the same disk as the production database/media.

A server failure must not destroy both production data and its only backup.

The exact external backup destination should be established as part of operational deployment.

---

# 44. Backup Frequency

The final frequency should reflect:

- content publication frequency;
- available storage;
- recovery objectives.

Because sermons and events are regularly created/updated, database backups should be frequent enough to avoid unacceptable content loss.

---

# 45. Backup Verification

A backup is not considered reliable merely because the command completed successfully.

The operational process should periodically verify that backups can actually be restored.

---

# 46. Recovery

Recovery planning should cover:

```text
Database failure
Media loss
Application failure
Container failure
Server failure
Configuration loss
```

The recovery process should document where each type of data is restored from.

---

# 47. Recovery Order

A conceptual recovery process is:

```text
Infrastructure
   ↓
Persistent storage
   ↓
PostgreSQL
   ↓
Application configuration
   ↓
Application
   ↓
Media
   ↓
Caddy / HTTPS
   ↓
Functional verification
```

The exact order may vary depending on failure type.

---

# 48. Storage Monitoring

Because the initial server has finite disk capacity, storage must be monitored.

At minimum:

```text
Disk usage
Database volume
Media volume
Docker volumes
Logs
Temporary files
```

must be considered.

---

# 49. Log Rotation

Logs must not grow indefinitely and consume the production disk.

Docker/system logging should have appropriate rotation or retention.

---

# 50. Resource Constraints

The Oracle VM has finite CPU, memory, and disk resources.

The architecture should therefore avoid unnecessary services such as:

- Redis unless required;
- Elasticsearch unless required;
- separate message brokers;
- unnecessary monitoring stacks;
- redundant application containers.

The modular monolith is intentionally appropriate for this scale.

---

# 51. PostgreSQL Resource Configuration

PostgreSQL configuration should be appropriate for the available VM resources.

The database should not be configured as though it were running on a large dedicated database server.

---

# 52. Node.js Runtime

The application should use the Node.js version established by the project architecture.

Production and development should use compatible major versions.

The production image should use a slim runtime image where practical.

---

# 53. Architecture Compatibility

The production stack must support:

```text
ARM64 / aarch64
```

because the initial Oracle VM uses ARM architecture.

All selected base images and dependencies must therefore be compatible with ARM64.

---

# 54. Docker Image Strategy

Images should be kept reasonably small.

The production image should avoid shipping:

- development-only dependencies;
- unnecessary tooling;
- source files that are not required at runtime.

---

# 55. Build and Runtime Separation

Where practical:

```text
Build stage
   ↓
Production runtime
```

should be separated.

This reduces runtime image size and attack surface.

---

# 56. File Permissions

Production containers and mounted directories must use appropriate permissions.

The application should not run with unnecessary filesystem privileges.

Media directories should allow only the operations required by the application.

---

# 57. Container Security

Containers should:

- run with minimal privileges;
- avoid privileged mode;
- expose only necessary ports;
- use read-only filesystems where practical for immutable application areas;
- mount writable storage only where needed.

---

# 58. Network Exposure

Publicly exposed ports should be limited.

Conceptually:

```text
80   → Caddy
443  → Caddy
```

Internal services such as PostgreSQL should remain on private/container networks.

---

# 59. Firewall

The host firewall should allow only required public services.

SSH access must also be controlled.

The database port should not be publicly exposed.

---

# 60. SSH

Server administration should use secure SSH configuration.

Preferred controls include:

- SSH keys;
- limited administrative access;
- disabled password authentication where operationally appropriate;
- firewall restrictions.

---

# 61. Domain and Canonical URL

Production configuration must define the canonical public site URL.

This value is consumed by:

- SEO;
- canonical tags;
- Open Graph;
- sitemap;
- structured data;
- absolute links where required.

---

# 62. Caddy and Canonical Host

The production deployment should define one canonical public hostname.

If both:

```text
www.example.com
```

and:

```text
example.com
```

are supported, one should redirect to the canonical host.

This should align with `10-seo-and-content-discovery.md`.

---

# 63. Caching

Caching should be applied according to content type.

Static immutable assets can have long cache lifetimes.

Dynamic CMS content requires more controlled caching.

---

# 64. Public Content Caching

Because the public site is primarily content-oriented, caching may be used aggressively where safe.

However, newly published or updated content must become visible within the expected publication workflow.

---

# 65. Admin Caching

Administrative pages and authenticated API responses should not be cached as public content.

Session-specific data must remain private.

---

# 66. API Caching

Public read-only API endpoints may be cacheable where appropriate.

Administrative endpoints should generally be treated as private/no-cache unless there is a specific reason otherwise.

---

# 67. Compression

Caddy/application delivery should use appropriate compression for textual resources.

Compression should not be applied in a way that creates security or operational problems.

---

# 68. Static Asset Versioning

Build assets should use hashed/versioned filenames where supported by the framework.

This allows safe long-term caching.

---

# 69. Media Cache Strategy

Media assets should use stable immutable storage keys where possible.

When an image is replaced, a new storage key should preferably be generated.

This avoids complicated cache invalidation.

---

# 70. Search Engine Accessibility

Production deployment must ensure that public pages are accessible to search engine crawlers.

The deployment must not accidentally block:

```text
/
```

through server configuration.

Administrative routes and previews must remain protected/non-indexable as defined in the SEO/security specifications.

---

# 71. Robots and Deployment

The production environment must serve the intended production `robots.txt`.

Development environments should not accidentally become the source of production indexing directives.

---

# 72. Preview Environment

If a preview/staging environment is introduced later, it must be protected from indexing.

It should use appropriate:

```text
noindex
```

and access controls.

---

# 73. Analytics

Analytics integration should be configurable.

The application must not hardcode analytics identifiers into source code when environment/site configuration is more appropriate.

---

# 74. External Integrations

Possible external services include:

```text
YouTube
Google Maps
Google Business Profile
Analytics
Email
Future object storage
```

Integrations must be optional/configurable unless required for core functionality.

---

# 75. YouTube Dependency

The public site must not fail completely if YouTube is temporarily unavailable.

Stored sermon metadata should allow the page to remain meaningful.

---

# 76. Email

If contact forms use email notifications, SMTP credentials must be external configuration.

The contact submission itself should remain a server-side operation and should not expose SMTP credentials to the browser.

---

# 77. Scheduled Operations

The CMS may eventually require scheduled tasks for:

- publishing scheduled content;
- archiving expired content;
- cleanup of temporary media;
- maintenance tasks.

The architecture should support a scheduler without requiring a separate infrastructure platform.

---

# 78. Scheduler Strategy

For the initial deployment, scheduled tasks may be implemented through:

- application scheduler;
- host-level cron;
- container-compatible scheduled process.

The final mechanism should avoid unnecessary infrastructure complexity.

---

# 79. Scheduled Publishing Reliability

Scheduled publishing must not depend on an administrator opening the `/panel`.

If scheduled publishing is supported, the backend must be able to execute the publication workflow independently.

---

# 80. Timezone

The application must define an explicit timezone policy.

Dates stored in the database should use unambiguous timestamps.

User-facing event times should be rendered according to the site's intended timezone.

For the UCI context, Colombia time should be treated consistently throughout the application unless a future requirement introduces multi-timezone events.

---

# 81. Time Synchronization

The production server must maintain correct system time.

Correct time is important for:

- sessions;
- scheduled publishing;
- audit records;
- certificates;
- logs.

---

# 82. Production Security

Deployment must implement the security requirements from `11-security-and-permissions.md`.

At minimum:

- HTTPS;
- secure cookies;
- restricted CORS;
- private database;
- protected secrets;
- security headers;
- controlled ports;
- non-root/minimal container privileges where practical.

---

# 83. Production Observability

The deployment should provide enough visibility to answer:

```text
Is the site online?
Is the API healthy?
Is PostgreSQL available?
Is disk space sufficient?
Are containers running?
Are media uploads succeeding?
Are scheduled tasks executing?
```

The first release does not require a large observability platform.

---

# 84. Operational Alerts

Future alerts may include:

```text
Disk almost full
Database unavailable
Application repeatedly restarting
Backup failure
Certificate problem
Media storage failure
```

The exact notification mechanism may be introduced later.

---

# 85. Deployment Documentation

The project should maintain operational documentation covering:

- server setup;
- environment variables;
- deployment;
- migrations;
- backups;
- restore;
- media storage;
- Caddy configuration;
- domain configuration.

Sensitive values themselves must not be committed.

---

# 86. Source Control

Git should contain:

- application source;
- database migrations;
- configuration templates;
- Docker configuration;
- Caddy configuration templates;
- documentation.

Git should not contain:

- production secrets;
- database dumps;
- uploaded CMS media;
- runtime logs;
- generated temporary files.

---

# 87. `.gitignore`

The project must exclude runtime and secret material such as:

```text
.env
.env.*
node_modules/
logs/
runtime/
media/
database dumps
temporary files
```

The exact rules depend on which files are intentionally version-controlled.

---

# 88. Production Configuration Files

Production configuration should be separated from development configuration.

Where configuration files must be versioned, they should contain placeholders rather than secrets.

---

# 89. Deployment Directory

A conceptual production layout may be:

```text
/opt/uci/
├── compose/
├── app/
├── config/
├── data/
│   ├── postgres/
│   └── media/
├── backups/
└── logs/
```

The exact structure may change during implementation.

The important rule is that persistent data is separated from ephemeral application code.

---

# 90. Media Directory

If VPS storage is used initially:

```text
/opt/uci/data/media/
```

may serve as the persistent media root.

This is an example deployment location, not a domain-level dependency.

---

# 91. Database Directory

If PostgreSQL uses a local Docker volume or bind mount, its data must be persisted independently from the application source.

---

# 92. Backup Directory

Temporary/local backup staging may exist on the server, but local backups must not be considered the only disaster-recovery copy.

---

# 93. Zero-Downtime Expectations

The first release does not require sophisticated zero-downtime orchestration.

A short deployment interruption may be acceptable.

However:

- migrations should be safe;
- services should restart predictably;
- public downtime should be minimized.

---

# 94. Scaling Strategy

The initial architecture is intentionally vertically scaled.

When growth requires it, possible future steps include:

```text
Object storage
     ↓
CDN
     ↓
Dedicated database
     ↓
Application replicas
     ↓
External cache
```

These are future evolution paths, not first-release requirements.

---

# 95. Horizontal Scaling Compatibility

The application should avoid unnecessary reliance on local process memory for persistent application state.

This is especially important for:

- authentication;
- scheduled jobs;
- media;
- caching.

Server-side sessions and persistent storage provide a stronger foundation for future scaling.

---

# 96. Session Storage

If server-managed sessions are used, session state must remain available to the application across restarts according to the selected session implementation.

The design must not depend on an in-memory session store if future multiple application instances are expected.

---

# 97. Application Restart

Restarting the application must not delete:

- users;
- sessions where persistence requires it;
- content;
- revisions;
- media;
- settings;
- audit records.

---

# 98. Database Availability

The application should fail safely when PostgreSQL is unavailable.

It must not:

- silently create a new empty database;
- expose internal database errors;
- corrupt content state.

---

# 99. Media Availability

If media storage becomes temporarily unavailable, the application should fail gracefully.

Public content should not expose filesystem paths or internal errors.

---

# 100. Deployment Verification

After deployment, the following should be verified:

```text
Public site
   ↓
HTTPS
   ↓
Homepage
   ↓
Sermon pages
   ↓
Events
   ↓
Media
   ↓
API
   ↓
/panel
   ↓
Authentication
   ↓
Database
```

The exact verification workflow belongs to deployment operations rather than product requirements.

---

# 101. Production Acceptance

The deployment can be considered operationally ready when:

- HTTPS works;
- canonical domain works;
- public site works;
- `/panel` works;
- API works;
- PostgreSQL persists data;
- media persists independently;
- backups exist;
- secrets are externalized;
- logs are usable;
- database is not publicly exposed;
- production indexing configuration is correct.

---

# 102. Environment Matrix

| Capability | Development | Production |
|---|---|---|
| HTTPS | Optional/local | Required |
| Secure cookies | Development-compatible | Required |
| PostgreSQL | Docker/local | Persistent |
| Media | Local storage | Persistent storage |
| CORS | Local origins | Restricted |
| Debug errors | Allowed | Disabled |
| Public indexing | Disabled/prevented | Enabled for public site |
| Admin access | Local | HTTPS |
| Secrets | Local env | Protected production config |
| Backups | Optional | Required |
| Logs | Development | Structured/rotated |
| Caddy | Optional | Required |
| ARM compatibility | Recommended | Required |

---

# 103. Deployment Non-Goals

The first release does not require:

- Kubernetes;
- Terraform;
- service mesh;
- multiple cloud providers;
- dedicated CDN;
- Redis;
- Elasticsearch;
- managed Kubernetes;
- multi-region deployment;
- complex CI/CD infrastructure.

The architecture should remain capable of evolving toward these patterns only if actual scale justifies them.

---

# 104. Relationship to Other Specifications

### `02-architecture-technical-specs.md`

Defines the application architecture and technology choices.

This document translates those choices into a deployable runtime environment.

### `08-api-spec.md`

Defines the API contract.

This document defines how the API is exposed and operated in production.

### `09-admin-panel-spec.md`

Defines `/panel`.

This document defines how the panel participates in the production deployment.

### `10-seo-and-content-discovery.md`

Defines public discoverability.

This document ensures production routing and indexing behavior support that strategy.

### `11-security-and-permissions.md`

Defines application security.

This document applies those requirements to infrastructure and runtime configuration.

### `12-media-and-assets.md`

Defines media architecture.

This document defines persistent deployment storage, backup, and future migration considerations.

### `13-responsive-and-accessibility.md`

Defines responsive and accessibility behavior.

This document ensures the deployment does not undermine those requirements through inappropriate runtime behavior.

---

# 105. Final Deployment Architecture

```text
                         INTERNET
                            │
                         DNS
                            │
                            ▼
                    ┌───────────────┐
                    │     CADDY     │
                    │ HTTPS / TLS   │
                    │ Proxy / Rules │
                    └───────┬───────┘
                            │
                  ┌─────────┴─────────┐
                  │                   │
                  ▼                   ▼
             Public Site            /panel
                Astro               React
                  │                   │
                  └─────────┬─────────┘
                            │
                            ▼
                       Node.js API
                       /api/v1
                            │
                 ┌──────────┴──────────┐
                 │                     │
                 ▼                     ▼
            PostgreSQL             MediaStorage
             persistent              │
                 │             ┌──────┴──────┐
                 │             │             │
                 │            VPS       Future R2/S3
                 │
                 └──────────┬──────────────┘
                            │
                       Backups
                            │
                   External backup target
```

---

# 106. Final Operational Principles

The UCI deployment should remain faithful to five principles:

### 1. Simple

Use the smallest infrastructure that can reliably operate the platform.

### 2. Persistent

Content, database data, media, and backups must survive container recreation.

### 3. Secure

Only intended public services should be exposed.

### 4. Recoverable

The system must have a realistic path to restore both PostgreSQL and media.

### 5. Evolvable

The initial Oracle VPS deployment must not prevent future migration to:

- object storage;
- CDN;
- dedicated database;
- additional application instances;
- stronger observability;
- more advanced infrastructure.

---

# 107. Final Architecture Boundary

The production model is:

```text
                  UCI SITE
                     │
        ┌────────────┼────────────┐
        │            │            │
     Astro         React       Node.js
    Public Site    /panel         API
        │            │            │
        └────────────┼────────────┘
                     │
                PostgreSQL
                     │
             Persistent Data
                     │
                MediaStorage
                     │
          ┌──────────┴──────────┐
          │                     │
       VPS Media          Future Object Storage
```

The deployment should therefore remain a **modular monolith with a deliberately simple operational footprint**, rather than introducing infrastructure complexity before the UCI product requires it.