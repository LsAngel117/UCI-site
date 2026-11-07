# 15 — Implementation Roadmap

## 1. Purpose

This document defines the implementation sequence for the UCI website and CMS.

It translates the approved product, architecture, API, administration, SEO, security, media, accessibility, and deployment specifications into an executable roadmap.

The roadmap answers:

- What should be implemented first.
- What depends on what.
- Which capabilities can be developed in parallel.
- What constitutes implementation readiness.
- What must be completed before a phase can be considered done.
- Which capabilities belong to the initial production MVP.
- Which capabilities should remain post-MVP.
- Where architectural or product decisions must be revisited before implementation proceeds.
- What the final production state should look like.

This document does **not** replace the previous specifications.

It is an execution-order document.

When an implementation decision conflicts with a more specific specification, the more specific specification remains authoritative.

---

# 2. Roadmap Principles

The implementation must follow these principles.

## 2.1 Build foundations before features

The project should establish its structural foundations before implementing large content modules.

The implementation order should generally follow:

```text
Foundation
    ↓
Shared contracts and database
    ↓
Authentication and authorization
    ↓
CMS core
    ↓
Media
    ↓
Content modules
    ↓
SEO and discovery
    ↓
Public website
    ↓
Admin panel
    ↓
Integration and hardening
    ↓
Production deployment
```

---

## 2.2 Implement business capabilities, not isolated CRUD screens

A CMS capability is considered implemented only when its complete business flow exists.

For example, implementing Sermons does not mean creating a `sermons` table and a CRUD endpoint.

The Sermons capability includes:

```text
Data model
    ↓
Domain rules
    ↓
Persistence
    ↓
API
    ↓
Authorization
    ↓
Draft/revision behavior
    ↓
Media relationships
    ↓
SEO data
    ↓
Publication behavior
    ↓
Public representation
    ↓
Admin editorial workflow
```

The same principle applies to Events, Pages, Ministries, Media, and other major modules.

---

## 2.3 Preserve clear module boundaries

The project is a modular monolith.

Modules should be implemented independently enough that future extraction or replacement remains possible.

Examples:

```text
Auth
Users
Permissions
Content
Pages
Sermons
Events
Ministries
Navigation
Media
SEO
Search
Contact
Audit
Settings
```

A module should not directly manipulate another module's persistence structures when a service or application boundary is more appropriate.

---

## 2.4 API contracts should stabilize before dependent UI work

The public website and admin panel depend on API behavior.

Therefore:

```text
Domain/API contract
        ↓
Backend implementation
        ↓
UI integration
```

The UI should not become the place where business rules are invented.

The backend remains authoritative for:

- permissions;
- publication state;
- scheduling;
- ownership;
- validation;
- relationships;
- content visibility;
- media references;
- destructive operations.

---

## 2.5 Media must be treated as infrastructure

Media is not a secondary feature.

The implementation must establish the media abstraction before content modules become heavily dependent on uploads.

This prevents the CMS from becoming coupled to the initial filesystem implementation.

---

## 2.6 Public and administrative experiences may progress in parallel

The implementation does not need to be completely sequential.

Once the API contracts and visual foundations are sufficiently stable, the following workstreams may progress concurrently:

```text
                    ┌── Public Website
                    │
API + Content ──────┤
                    │
                    └── Admin Panel
```

The two interfaces consume the same backend contracts but have different responsibilities.

---

## 2.7 Production concerns are considered from the beginning

Production deployment should not be treated as an afterthought.

The implementation should preserve:

- secure configuration;
- persistent storage;
- migration safety;
- media persistence;
- session security;
- observability;
- backups;
- recoverability;
- ARM64 compatibility;
- canonical URLs;
- indexing behavior.

---

# 3. Source Specifications

This roadmap coordinates the following specifications.

| Specification | Role |
|---|---|
| `01-product-requirements.md` | Product scope and requirements |
| `02-architecture-technical-specs.md` | System architecture and technical boundaries |
| `03-visual-design-system.md` | Public and administrative visual foundations |
| `04-*` | Supporting product/design specification(s) |
| `05-*` | Supporting product/design specification(s) |
| `06-*` | Functional requirements |
| `07-*` | Technical architecture / implementation boundaries |
| `08-api-spec.md` | API contract |
| `09-admin-panel-spec.md` | Administrative experience |
| `10-seo-and-content-discovery.md` | SEO and discovery |
| `11-security-and-permissions.md` | Security and authorization |
| `12-media-and-assets.md` | Media architecture |
| `13-responsive-and-accessibility.md` | Responsive and accessibility requirements |
| `14-deployment-and-environment.md` | Deployment and operational environment |

These documents form the specification baseline for implementation.

---

# 4. Source-of-Truth Hierarchy

When an implementation question arises, use the following hierarchy.

```text
Product requirements
        ↓
Architecture
        ↓
Specific domain specification
        ↓
API contract
        ↓
Admin / UX specification
        ↓
Implementation roadmap
        ↓
Implementation detail
```

The roadmap does not override a domain-specific decision.

For example:

- Security rules come from `11-security-and-permissions.md`.
- Media rules come from `12-media-and-assets.md`.
- API behavior comes from `08-api-spec.md`.
- Admin behavior comes from `09-admin-panel-spec.md`.
- SEO behavior comes from `10-seo-and-content-discovery.md`.

If the roadmap becomes inconsistent with a later approved specification, the roadmap must be updated.

---

# 5. Implementation Strategy

The project should be implemented in capability-oriented phases.

Each phase contains:

- Objective
- Dependencies
- Ready conditions
- Implementation scope
- Deliverables
- Done conditions
- Follow-up dependencies

The implementation should avoid creating large amounts of UI before the underlying contracts are sufficiently stable.

---

# 6. Phase 0 — Project Foundation

## 6.1 Objective

Establish the project skeleton and the shared technical boundaries required by every later phase.

This phase creates the environment in which all other modules can be implemented consistently.

---

## 6.2 Dependencies

None.

This is the starting point.

---

## 6.3 Ready

The following decisions must already be approved:

- repository strategy;
- monorepo/single-repository approach;
- application boundaries;
- Astro public application;
- React admin application;
- Node.js backend;
- PostgreSQL;
- shared TypeScript code;
- Docker/Compose development strategy;
- Caddy production strategy.

---

## 6.4 Implementation

Establish the project structure according to the approved architecture.

Conceptually:

```text
src/
├── web/
├── admin/
├── server/
├── shared/
└── db/
```

Establish:

- application entry points;
- server bootstrap;
- public application bootstrap;
- admin application bootstrap;
- shared module boundary;
- environment configuration boundary;
- database connection boundary;
- API routing boundary;
- error handling boundary;
- logging boundary;
- configuration validation boundary.

Create the initial domain/application/infrastructure separation where required by the architecture.

---

## 6.5 Deliverables

- Repository structure.
- Public Astro application.
- React admin application.
- Node API application.
- Shared TypeScript layer.
- PostgreSQL integration boundary.
- Environment configuration.
- Initial API version namespace.
- Initial application health endpoint.
- Base logging/request context.
- Development runtime configuration.

---

## 6.6 Done

Phase 0 is complete when:

- all applications can start within the intended development environment;
- the public application can render;
- the admin application can render;
- the API can start;
- the database connection boundary exists;
- shared code can be consumed by the appropriate applications;
- configuration is environment-driven;
- no module is yet coupled to production-specific infrastructure unnecessarily.

---

# 7. Phase 1 — Shared Core & Database

## 7.1 Objective

Establish the persistence foundation and shared domain primitives required by all business modules.

---

## 7.2 Dependencies

Phase 0.

---

## 7.3 Ready

The following must be defined:

- UUID strategy;
- timestamp conventions;
- database naming conventions;
- migration strategy;
- common API response model;
- common error model;
- pagination model;
- content lifecycle model;
- audit metadata strategy.

---

## 7.4 Implementation

Establish the PostgreSQL schema foundation.

Implement shared persistence concerns such as:

- UUID identifiers;
- creation timestamps;
- update timestamps;
- publication timestamps where applicable;
- revision/version metadata;
- soft/archive state where appropriate;
- relational constraints;
- indexes;
- foreign keys.

Establish shared application concepts:

```text
Entity
Value/Object concepts where required
Repository interfaces
Application services/use cases
Domain validation
DTO boundaries
Pagination
Filtering
Sorting
Error mapping
```

Implement the base API conventions from `08-api-spec.md`.

---

## 7.5 Initial Database Domains

The initial database foundation should account for the future domains without prematurely implementing every feature.

Expected domains include:

```text
users
roles
permissions
sessions
pages
sermons
sermon_revisions
events
ministries
navigation
media
media_references
seo_metadata
settings
contact_submissions
audit_logs
```

Additional supporting tables may be introduced according to the specific domain specifications.

The roadmap does not prescribe exact table schemas where those are already defined elsewhere.

---

## 7.6 Deliverables

- Database connection layer.
- Migration system.
- Shared database conventions.
- Core domain primitives.
- Common API response contracts.
- Error contracts.
- Pagination contracts.
- Base repositories/application services.
- Initial schema foundation.
- Shared API types.

---

## 7.7 Done

Phase 1 is complete when:

- migrations can create the required database foundation;
- application code can access PostgreSQL through the intended abstraction;
- common API contracts are stable;
- UUID/timestamp conventions are consistent;
- database constraints support later business rules;
- shared contracts are available to API and UI layers.

---

# 8. Phase 2 — Authentication & Authorization

## 8.1 Objective

Establish the security boundary before protected CMS functionality is exposed.

---

## 8.2 Dependencies

- Phase 1.

---

## 8.3 Ready

Required:

- users domain;
- roles;
- permissions;
- session strategy;
- cookie strategy;
- password policy;
- security requirements from `11-security-and-permissions.md`.

---

## 8.4 Implementation

Implement:

### Authentication

- login;
- logout;
- current-session lookup;
- secure session creation;
- secure session invalidation;
- password verification;
- secure password storage;
- session expiration;
- cookie configuration.

### Authorization

Implement permission evaluation independently from UI visibility.

Conceptually:

```text
Request
  ↓
Session
  ↓
Authenticated User
  ↓
Role
  ↓
Permissions
  ↓
Resource / Action Authorization
  ↓
Application Service
```

Implement permission checks for:

- users;
- content;
- media;
- publishing;
- navigation;
- settings;
- audit;
- administration.

---

## 8.5 Initial Roles

Initial roles:

```text
ADMIN
EDITOR
```

The authorization model must remain extensible.

Do not hard-code business logic around the assumption that these will be the only roles forever.

---

## 8.6 Deliverables

- Login API.
- Logout API.
- Current-user API.
- Session infrastructure.
- User model.
- Role model.
- Permission model.
- Authorization service.
- Protected route middleware.
- Permission-aware API behavior.

---

## 8.7 Done

Authentication and authorization are complete when:

- an unauthenticated user cannot access protected APIs;
- authenticated users receive appropriate permissions;
- permissions are enforced server-side;
- cookies follow the security specification;
- logout invalidates the session;
- unauthorized actions return the correct API error;
- the admin application can establish and maintain a session.

---

# 9. Phase 3 — CMS Core

## 9.1 Objective

Create the reusable editorial foundation required by all content modules.

---

## 9.2 Dependencies

- Phase 1.
- Phase 2.

---

## 9.3 Ready

Authentication and authorization must be operational.

The content lifecycle must be defined.

The revision and publication model must be sufficiently stable.

---

## 9.4 Implementation

Implement shared CMS behavior for:

- draft state;
- publication state;
- archive state;
- revision creation;
- revision retrieval;
- revision restoration;
- publication actions;
- scheduling foundation;
- preview foundation;
- optimistic concurrency;
- slug management;
- content metadata;
- editorial timestamps.

The CMS core should provide reusable application patterns rather than duplicating workflow logic inside every content module.

---

## 9.5 Publication Model

The initial lifecycle:

```text
DRAFT
  │
  ├── publish ──→ PUBLISHED
  │
  └── archive ─→ ARCHIVED

PUBLISHED
  │
  └── archive ─→ ARCHIVED

ARCHIVED
  │
  └── restore/edit according to domain rules
```

Scheduling should be implemented as a capability of publication rather than as an unrelated content state.

---

## 9.6 Preview

Establish the secure preview mechanism.

Preview must:

- require authorization or secure temporary access;
- never expose unpublished content publicly by default;
- not be indexable;
- not accidentally become a permanent public URL;
- respect content permissions.

---

## 9.7 Revisions

Implement:

- revision creation;
- revision listing;
- revision detail;
- revision restoration;
- revision metadata.

Restoration should create a new revision rather than silently destroying history.

---

## 9.8 Deliverables

- CMS lifecycle service.
- Revision system.
- Publication service.
- Scheduling foundation.
- Preview mechanism.
- Slug management.
- Concurrency protection.
- Shared content DTO patterns.
- Shared editorial action patterns.

---

## 9.9 Done

The CMS core is complete when at least one representative content type can use the entire workflow without duplicating the core logic.

The first representative implementation should be Sermons.

---

# 10. Phase 4 — Media Subsystem

## 10.1 Objective

Implement the media architecture before content modules become dependent on ad-hoc file handling.

---

## 10.2 Dependencies

- Phase 1.
- Phase 2.
- Phase 3 for editorial integration.

---

## 10.3 Ready

The following must be defined:

- `MediaStorage` abstraction;
- media metadata model;
- allowed file types;
- size limits;
- upload security rules;
- public URL strategy;
- image processing strategy;
- reference tracking;
- deletion behavior.

---

## 10.4 Implementation

Implement:

```text
MediaStorage
    ↓
MediaService
    ↓
Media Repository
    ↓
Media API
    ↓
Media Library
```

The initial storage implementation may use the approved VPS filesystem storage.

The application must not make the filesystem implementation part of the domain model.

---

## 10.5 Media Metadata

Store metadata such as:

- media ID;
- original filename;
- safe storage key;
- MIME type;
- file size;
- dimensions where applicable;
- media category/type;
- alt text;
- caption;
- description;
- created timestamp;
- uploader;
- storage provider;
- storage key;
- public URL or URL derivation metadata.

The exact fields remain governed by `12-media-and-assets.md`.

---

## 10.6 Image Processing

Implement the approved image processing strategy for:

- thumbnails;
- responsive variants;
- editorial previews;
- public image delivery.

Where appropriate, generate modern image formats such as WebP/AVIF.

Do not generate unnecessary variants indiscriminately.

---

## 10.7 Media References

Implement reference tracking.

The system must be able to determine where media is being used before destructive deletion.

Conceptually:

```text
Media
 ├── Sermon
 ├── Event
 ├── Page
 ├── Ministry
 └── Other content
```

---

## 10.8 External Video

Implement external video metadata separately from uploaded media.

For YouTube:

```text
provider = YOUTUBE
externalId = ...
url = ...
```

The system must never treat a YouTube video as a local binary upload.

---

## 10.9 Deliverables

- Media storage abstraction.
- Initial filesystem storage implementation.
- Media repository.
- Media service.
- Secure upload pipeline.
- Media metadata.
- Media Library API.
- Reference tracking.
- Image variants.
- Thumbnail strategy.
- External YouTube reference model.

---

## 10.10 Done

The media subsystem is complete when:

- authorized users can upload approved files;
- files are validated securely;
- metadata is persisted;
- files are not stored in PostgreSQL;
- media can be reused by multiple content items;
- media references can be inspected;
- deletion is reference-aware;
- public media URLs work;
- the storage provider can theoretically be replaced without changing content domain logic.

---

# 11. Phase 5 — Sermons

## 11.1 Objective

Implement the primary content type and the CMS's most important editorial workflow.

---

## 11.2 Dependencies

- CMS Core.
- Authentication/Authorization.
- Media subsystem.

---

## 11.3 Ready

The following must exist:

- publication workflow;
- revisions;
- preview;
- media references;
- SEO metadata;
- YouTube references;
- permissions.

---

## 11.4 Implementation

Implement the complete Sermons domain:

### Data

- title;
- slug;
- preacher;
- date;
- scripture;
- description;
- rich content;
- sermon notes/media;
- YouTube video;
- optional audio where approved;
- SEO metadata;
- publication metadata.

### Editorial workflow

- create draft;
- edit;
- autosave if enabled;
- manual save;
- create revision;
- preview;
- publish;
- schedule;
- archive;
- restore revision.

### Public behavior

- sermon listing;
- sermon detail;
- related content;
- media;
- video;
- metadata;
- structured data;
- canonical URL.

---

## 11.5 Deliverables

- Sermon domain.
- Sermon persistence.
- Sermon API.
- Sermon revisions.
- Sermon publication workflow.
- Sermon media relationships.
- Sermon SEO.
- Admin sermon workflow.
- Public sermon representation.

---

## 11.6 Done

An editor can:

```text
Create sermon
    ↓
Save draft
    ↓
Add content
    ↓
Attach sermon notes
    ↓
Attach YouTube video
    ↓
Edit SEO metadata
    ↓
Preview
    ↓
Publish or schedule
    ↓
Appear correctly on public website
```

All actions respect permissions and preserve revision history.

---

# 12. Phase 6 — Events & Ministries

## 12.1 Objective

Implement the second group of major content modules.

---

## 12.2 Dependencies

- CMS Core.
- Media.
- Authentication.
- Sermon implementation patterns where reusable.

---

# 12.3 Events

Implement:

- title;
- slug;
- description;
- date/time;
- location;
- image/media;
- registration/external link if required;
- status;
- SEO;
- publication;
- archive behavior.

Public capabilities:

- event listing;
- event detail;
- upcoming events;
- relevant event filtering.

Administrative capabilities:

- create;
- edit;
- publish;
- schedule;
- archive;
- duplicate where appropriate.

---

# 12.4 Ministries

Implement:

- name;
- slug;
- description;
- image/media;
- contact information where approved;
- meeting information;
- call-to-action;
- SEO;
- publication.

Public capabilities:

- ministry listing;
- ministry detail;
- discovery from relevant pages.

---

## 12.5 Deliverables

- Events API and domain.
- Ministries API and domain.
- Admin workflows.
- Public representations.
- Media integration.
- SEO integration.
- Publication workflow integration.

---

## 12.6 Done

Editors can manage Events and Ministries through the CMS, and published content appears correctly on the public site with appropriate SEO and accessibility behavior.

---

# 13. Phase 7 — Pages & Navigation

## 13.1 Objective

Implement the general-purpose page system and the site's navigation structure.

---

## 13.2 Dependencies

- CMS Core.
- Media.
- SEO foundation.
- Sermon/Event/Ministry patterns.

---

## 13.3 Pages

Implement:

- title;
- slug;
- structured content;
- media;
- SEO metadata;
- publication;
- revisions;
- preview;
- archive.

Pages should support the site's required informational content without requiring developers to create a new route for every editorial change.

---

## 13.4 Navigation

Implement:

- navigation groups;
- menu items;
- internal links;
- external links;
- hierarchy;
- ordering;
- visibility;
- target behavior;
- permission-aware administration.

The public site should consume navigation configuration rather than hard-coding all navigation entries.

---

## 13.5 URL Strategy

Implement the approved slug and URL behavior.

Changed slugs must not silently break established URLs.

Where required:

```text
Old URL
   ↓
Redirect
   ↓
New canonical URL
```

---

## 13.6 Deliverables

- Pages domain.
- Pages API.
- Page editor.
- Page preview.
- Page publication.
- Navigation API.
- Navigation editor.
- Public navigation integration.
- Redirect foundation.

---

## 13.7 Done

Editors can create and publish pages without code changes, and the public site's primary navigation is CMS-driven.

---

# 14. Phase 8 — SEO & Content Discovery

## 14.1 Objective

Integrate the SEO and discovery system after content models and public URLs are stable enough to produce meaningful metadata.

---

## 14.2 Dependencies

- Pages.
- Sermons.
- Events.
- Ministries.
- Navigation.
- Media.
- Public URL strategy.

---

## 14.3 Implementation

Implement:

- canonical URLs;
- title metadata;
- descriptions;
- Open Graph metadata;
- social metadata;
- robots directives;
- sitemap generation;
- robots.txt;
- structured data;
- breadcrumbs;
- internal linking patterns;
- content discovery;
- search behavior;
- pagination SEO rules;
- noindex rules for preview/drafts/admin;
- redirects for changed URLs;
- image SEO metadata.

---

## 14.4 Structured Data

Implement Schema.org representations appropriate to the content.

Potential types include:

```text
Organization
LocalBusiness
WebSite
WebPage
Article
Event
BreadcrumbList
VideoObject
```

Only use types supported by actual page content.

Do not generate misleading structured data.

---

## 14.5 Sitemap

The sitemap should represent indexable public URLs.

It must exclude:

- admin pages;
- login;
- previews;
- drafts;
- archived content where not indexable;
- duplicate URLs;
- canonicalized non-primary routes.

---

## 14.6 Content Discovery

Implement discovery paths between:

```text
Home
 ├── Sermons
 │    └── Sermon
 ├── Events
 │    └── Event
 ├── Ministries
 │    └── Ministry
 └── Pages
```

The site should not rely exclusively on the main navigation to expose content.

---

## 14.7 Deliverables

- SEO data model integration.
- Metadata rendering.
- Sitemap generation.
- Robots behavior.
- Structured data.
- Canonical URLs.
- Redirect behavior.
- Search/discovery foundation.
- Indexability rules.
- Internal linking patterns.

---

## 14.8 Done

Every public content type has:

- stable URL;
- canonical URL;
- appropriate metadata;
- indexability behavior;
- structured data where applicable;
- discoverable relationships;
- sitemap inclusion rules.

---

# 15. Phase 9 — Public Website

## 15.1 Objective

Implement the production public-facing UCI website using the approved visual, responsive, accessibility, content, and SEO specifications.

---

## 15.2 Dependencies

Backend public APIs for:

- Pages;
- Sermons;
- Events;
- Ministries;
- Navigation;
- Media;
- SEO;
- Settings.

The public visual foundation may begin earlier in parallel.

---

## 15.3 Parallel Preparation

The following work may begin during earlier phases:

```text
Visual design system
       ↓
Astro layout
       ↓
Header / Footer
       ↓
Typography
       ↓
Responsive primitives
       ↓
Reusable content components
```

This work should initially use stable mock data or API contracts.

---

## 15.4 Implementation

Build the public site around the actual CMS capabilities.

Core areas should include:

### Home

- UCI identity;
- primary call to action;
- featured content;
- sermons;
- events;
- ministries;
- church information;
- discovery paths.

### Sermons

- listing;
- filtering where required;
- detail;
- media;
- YouTube;
- notes;
- related content.

### Events

- upcoming events;
- event detail;
- relevant calls to action.

### Ministries

- listing;
- detail;
- contact/discovery information.

### Pages

- CMS-driven pages.

### Navigation

- CMS-driven navigation.

---

## 15.5 Accessibility

Implement according to `13-responsive-and-accessibility.md`.

Target:

```text
WCAG 2.2 AA
```

Particular attention:

- keyboard navigation;
- focus states;
- semantic HTML;
- heading hierarchy;
- accessible images;
- reduced motion;
- contrast;
- forms;
- dialogs;
- media controls;
- responsive behavior.

---

## 15.6 Performance

Astro should remain the default rendering model.

React should be introduced only where interaction requires it.

Avoid unnecessary client-side JavaScript.

Public content should be server-rendered or statically optimized wherever appropriate.

---

## 15.7 Deliverables

- Public layout.
- Header.
- Footer.
- Navigation.
- Home.
- Sermon pages.
- Event pages.
- Ministry pages.
- CMS-driven informational pages.
- Search/discovery interfaces.
- SEO metadata.
- Structured data.
- Responsive behavior.
- Accessibility implementation.

---

## 15.8 Done

The public website can consume production-like CMS data and provides the complete visitor experience required by the product specification.

---

# 16. Phase 10 — Admin Panel

## 16.1 Objective

Implement the complete editorial operating environment defined in `09-admin-panel-spec.md`.

---

## 16.2 Dependencies

- Authentication.
- Authorization.
- API modules.
- Media.
- Content modules.
- SEO.
- Navigation.

---

## 16.3 Parallelization

The admin shell may begin earlier.

Recommended sequence:

```text
Auth
  ↓
Admin shell
  ↓
Permission-aware navigation
  ↓
Reusable list/detail/form patterns
  ↓
Content modules
  ↓
Media Library
  ↓
SEO/settings
  ↓
Audit/administration
```

---

## 16.4 Admin Shell

Implement:

- `/panel`;
- login;
- authenticated layout;
- sidebar;
- header;
- breadcrumbs;
- user/session controls;
- notifications;
- responsive behavior;
- permission-aware navigation.

---

## 16.5 Dashboard

Implement:

- content statistics;
- recent activity;
- scheduled content;
- quick actions;
- media overview;
- relevant operational information.

The dashboard should prioritize useful editorial information rather than decorative metrics.

---

## 16.6 Content Interfaces

Implement reusable patterns for:

```text
List
    ↓
Filter/search
    ↓
Detail
    ↓
Edit
    ↓
Preview
    ↓
Publish
```

Each module should expose only the actions the current user can perform.

---

## 16.7 Sermon Editor

The Sermon editor should be the reference implementation for the CMS editing experience.

It should support:

- basic information;
- rich content;
- preacher;
- date;
- scripture;
- description;
- media;
- YouTube;
- SEO;
- publication;
- revisions;
- preview;
- scheduling.

---

## 16.8 Media Library

Implement:

- grid/list view;
- search;
- filters;
- sorting;
- pagination;
- upload;
- metadata editing;
- selection;
- media picker;
- reference inspection;
- deletion safeguards;
- bulk operations where approved.

---

## 16.9 Administration

Implement:

- users;
- roles;
- permissions;
- audit;
- settings;
- navigation;
- SEO administration.

---

## 16.10 Deliverables

- Complete `/panel`.
- Login.
- Dashboard.
- Content management.
- Media Library.
- Navigation manager.
- SEO manager.
- Settings.
- User administration.
- Permission-aware interfaces.
- Audit interface.

---

## 16.11 Done

An authorized church administrator/editor can operate the CMS without requiring direct database access or developer intervention for normal editorial operations.

---

# 17. Phase 11 — Contact & Supporting Features

## 17.1 Objective

Implement supporting functionality required for a complete public product.

---

## 17.2 Dependencies

- Public Website.
- API foundation.
- Security.
- Admin Panel where administrative management is required.

---

## 17.3 Contact

Implement:

- public contact form;
- server-side validation;
- anti-abuse/rate limiting;
- secure submission;
- administrative visibility where required;
- optional notification integration.

Never trust client-side validation alone.

---

## 17.4 Search

Complete the search experience if not already implemented during discovery.

Initial search may use PostgreSQL capabilities.

The implementation should not introduce Elasticsearch/OpenSearch unless the requirements demonstrate that PostgreSQL search is insufficient.

---

## 17.5 Settings

Complete operational settings such as:

- church identity;
- contact information;
- social links;
- public URLs;
- external integrations;
- SEO defaults.

Sensitive secrets must remain environment configuration, not ordinary CMS settings.

---

## 17.6 Audit

Complete audit visibility for relevant administrative actions.

At minimum, important events should be traceable:

- login/security events where required;
- content creation;
- content updates;
- publishing;
- scheduling;
- archiving;
- media deletion;
- user changes;
- permission changes;
- settings changes.

---

## 17.7 Done

The site provides the supporting capabilities required for normal public interaction and administrative operation.

---

# 18. Phase 12 — Integration & Hardening

## 18.1 Objective

Bring the system together and remove integration-level risks before production.

---

## 18.2 Dependencies

All MVP feature phases.

---

## 18.3 Integration Areas

Verify complete flows.

### Editorial flow

```text
Login
 ↓
Create sermon
 ↓
Upload notes
 ↓
Attach YouTube
 ↓
Edit SEO
 ↓
Preview
 ↓
Publish
 ↓
Public page
 ↓
Sitemap
 ↓
Search discovery
```

### Event flow

```text
Create
 ↓
Edit
 ↓
Publish/schedule
 ↓
Public listing
 ↓
Event detail
 ↓
Structured data
```

### Page flow

```text
Create page
 ↓
Set slug
 ↓
SEO
 ↓
Publish
 ↓
Navigation
 ↓
Public URL
```

---

## 18.4 Security Hardening

Review:

- authentication;
- sessions;
- cookies;
- authorization;
- CSRF protection where applicable;
- CORS;
- security headers;
- rate limiting;
- input validation;
- output encoding;
- rich-text sanitization;
- file upload validation;
- preview access;
- secret handling;
- audit logs;
- error exposure.

---

## 18.5 Media Hardening

Verify:

- upload limits;
- MIME validation;
- file signature validation;
- safe filenames;
- storage isolation;
- public URL behavior;
- image processing;
- deletion/reference protection;
- orphan handling;
- backup inclusion;
- disk monitoring.

---

## 18.6 Content Hardening

Verify:

- slug uniqueness;
- publication rules;
- scheduled publishing;
- archive behavior;
- revision preservation;
- concurrency behavior;
- preview isolation;
- relationship integrity.

---

## 18.7 SEO Hardening

Verify:

- canonical URLs;
- sitemap;
- robots.txt;
- structured data;
- metadata;
- Open Graph;
- indexability;
- noindex rules;
- redirects;
- broken links;
- duplicate URLs.

---

## 18.8 Accessibility Hardening

Verify:

- keyboard operation;
- focus behavior;
- semantic structure;
- accessible names;
- form errors;
- dialogs;
- responsive layouts;
- reduced motion;
- contrast;
- zoom/reflow;
- media alternatives.

---

## 18.9 Performance Hardening

Review:

- server rendering;
- API response sizes;
- image variants;
- image dimensions;
- lazy loading;
- caching;
- client-side JavaScript;
- React island boundaries;
- database query efficiency;
- pagination;
- media delivery.

---

## 18.10 Done

The application behaves as one coherent system rather than a collection of independently working modules.

---

# 19. Phase 13 — Production Deployment

## 19.1 Objective

Deploy the completed MVP to the Oracle VPS according to `14-deployment-and-environment.md`.

---

## 19.2 Dependencies

Phase 12 complete.

---

## 19.3 Ready

Required:

- production environment configuration;
- domain/DNS;
- Caddy configuration;
- persistent database storage;
- persistent media storage;
- backup strategy;
- migration strategy;
- logging;
- health endpoints;
- production build configuration.

---

## 19.4 Production Topology

Target topology:

```text
Internet
   │
   ▼
 Caddy
   │
   ├───────────────┐
   ▼               ▼
Public Web       /panel
Astro            React
   │               │
   └───────┬───────┘
           ▼
       Node API
       /api/v1
           │
     ┌─────┴─────┐
     ▼           ▼
PostgreSQL    MediaStorage
```

PostgreSQL must remain private.

Only intended public services should be exposed externally.

---

## 19.5 Deployment Sequence

The deployment flow should be conceptually:

```text
Release selected
    ↓
Application artifacts available
    ↓
Production configuration loaded
    ↓
Database available
    ↓
Migrations applied safely
    ↓
Application containers/services started
    ↓
Health checks
    ↓
Caddy routing
    ↓
Public verification
    ↓
Admin verification
    ↓
Monitoring
```

---

## 19.6 Production Verification

Verify:

### Public

- HTTPS;
- canonical host;
- homepage;
- navigation;
- sermons;
- events;
- ministries;
- pages;
- media;
- SEO;
- sitemap;
- robots;
- structured data.

### Admin

- login;
- session;
- permissions;
- content editing;
- media upload;
- publishing;
- scheduling;
- preview;
- audit.

### Infrastructure

- database persistence;
- media persistence;
- logs;
- health endpoints;
- restart behavior;
- backup operation;
- storage capacity.

---

## 19.7 Done

Production deployment is complete when the public site and CMS operate from the production environment and the system can be recovered using the defined backup and deployment procedures.

---

# 20. Parallel Workstreams

Not every task must wait for the previous phase to finish.

The implementation should exploit controlled parallelism.

---

## 20.1 Workstream A — Backend Core

```text
Foundation
    ↓
Database
    ↓
Auth
    ↓
CMS Core
    ↓
Content APIs
```

---

## 20.2 Workstream B — Public UI

Can begin after visual foundations are stable.

```text
Design System
    ↓
Astro Shell
    ↓
Header/Footer
    ↓
Responsive primitives
    ↓
Reusable content components
    ↓
API integration
```

---

## 20.3 Workstream C — Admin UI

Can begin once authentication contracts and API shapes are stable.

```text
Admin Shell
    ↓
Authentication
    ↓
Permission-aware navigation
    ↓
Reusable tables/forms
    ↓
Content editors
    ↓
Media Library
```

---

## 20.4 Workstream D — Media

Can overlap with CMS Core.

```text
Storage abstraction
    ↓
Upload pipeline
    ↓
Metadata
    ↓
Variants
    ↓
Media Library
```

Content modules should consume this capability once the API boundary is stable.

---

## 20.5 Workstream E — SEO

Can begin conceptually before all content modules are complete.

Implementation becomes final as content types and URLs stabilize.

```text
SEO model
    ↓
Metadata rendering
    ↓
Canonical rules
    ↓
Structured data
    ↓
Sitemap
    ↓
Content-specific discovery
```

---

## 20.6 Workstream F — Deployment

Should not wait until the final day.

Production infrastructure can be prepared while application development continues:

```text
Oracle VPS
    ↓
Docker/Compose
    ↓
Caddy
    ↓
PostgreSQL persistence
    ↓
Media persistence
    ↓
Backups
    ↓
Monitoring
```

The final production release still occurs only after integration hardening.

---

# 21. Dependency Matrix

| Capability | Depends On | Enables |
|---|---|---|
| Foundation | None | Everything |
| Database | Foundation | Backend modules |
| Shared contracts | Foundation | API/UI integration |
| Authentication | Database | Protected application |
| Authorization | Authentication | CMS administration |
| CMS Core | Auth + Database | Content modules |
| Media | Database + security | Media-dependent content |
| Sermons | CMS + Media | Sermon public experience |
| Events | CMS + Media | Event experience |
| Ministries | CMS + Media | Ministry experience |
| Pages | CMS + Media | General site content |
| Navigation | Pages/content model | Public navigation |
| SEO | Public content models | Discovery/indexing |
| Public Website | APIs + design | Visitor experience |
| Admin Panel | Auth + APIs | Editorial operation |
| Contact | API + security | Public interaction |
| Search | Content APIs/database | Content discovery |
| Audit | Auth + application actions | Administration |
| Deployment | Complete MVP | Production |

---

# 22. Dependency Rules

The following rules should guide implementation decisions.

## Rule 1 — Authentication before administration

No protected CMS feature should be considered complete before the authentication and authorization boundary exists.

---

## Rule 2 — Media abstraction before content uploads

Content modules must not implement their own filesystem upload logic.

---

## Rule 3 — CMS core before complex editorial workflows

Revision, publication, preview, and scheduling behavior should not be duplicated independently inside every content module.

---

## Rule 4 — API contract before UI dependency

The frontend should consume defined API contracts rather than inventing backend behavior.

---

## Rule 5 — Public URL before SEO finalization

SEO depends on stable canonical URLs and content representations.

---

## Rule 6 — Content before content-specific public pages

A public sermon page is meaningful only after the sermon API and publication rules exist.

---

## Rule 7 — Admin experience follows actual capabilities

The admin panel should expose capabilities that the backend can actually enforce.

---

## Rule 8 — Production storage is persistent

Database and media persistence must be explicit before production deployment.

---

# 23. MVP Definition

The UCI MVP should represent a complete, operational church website and CMS rather than a collection of partially implemented modules.

## 23.1 MVP Backend

Required:

- PostgreSQL;
- users;
- authentication;
- sessions;
- roles;
- permissions;
- pages;
- sermons;
- events;
- ministries;
- navigation;
- media;
- SEO;
- contact;
- audit;
- settings;
- search/discovery foundation.

---

## 23.2 MVP CMS

Required:

- login;
- dashboard;
- content lists;
- content editor;
- drafts;
- revisions;
- preview;
- publish;
- scheduling where specified;
- archive;
- media library;
- media picker;
- SEO editor;
- navigation editor;
- users/permissions;
- audit.

---

## 23.3 MVP Public Website

Required:

- home;
- navigation;
- sermon listing/detail;
- event listing/detail;
- ministry listing/detail;
- CMS-driven pages;
- media;
- contact;
- SEO;
- sitemap;
- structured data;
- responsive behavior;
- accessibility.

---

## 23.4 MVP Infrastructure

Required:

- Oracle VPS;
- Docker/Compose;
- Caddy;
- HTTPS;
- PostgreSQL persistence;
- media persistence;
- environment-based configuration;
- logs;
- health checks;
- backups;
- recovery procedure.

---

# 24. Post-MVP

The following capabilities may be intentionally deferred unless the product requirements explicitly promote them into MVP scope.

## 24.1 Advanced Search

Potential future improvements:

- relevance ranking;
- full-text weighting;
- advanced filters;
- search analytics.

---

## 24.2 Advanced Editorial Workflow

Potential states:

```text
DRAFT
 ↓
REVIEW
 ↓
APPROVED
 ↓
SCHEDULED
 ↓
PUBLISHED
```

With rejection:

```text
REVIEW
 ↓
REJECTED
 ↓
DRAFT
```

This should only be introduced when the church editorial process requires it.

---

## 24.3 External Object Storage

Migration from VPS filesystem to:

- Cloudflare R2;
- Amazon S3;
- S3-compatible storage;
- Cloudinary;
- another approved provider.

The `MediaStorage` abstraction is intended to make this transition controlled.

---

## 24.4 CDN

A CDN may be introduced when traffic or media volume justifies it.

---

## 24.5 Advanced Analytics

Potential additions:

- content performance;
- sermon views;
- search queries;
- conversion events;
- campaign attribution.

---

## 24.6 RSS / Feeds

Sermon and event feeds can be introduced if there is a clear distribution requirement.

---

## 24.7 Multilingual Content

Multilingual support should not be added implicitly.

If required, it should receive a dedicated content-model and URL strategy.

---

## 24.8 Advanced Notifications

Future possibilities:

- email notifications;
- scheduled publication alerts;
- editorial reminders;
- contact notifications;
- system alerts.

---

# 25. Implementation Risks

## 25.1 Overbuilding the CMS

Risk:

Building a generic WordPress-like system rather than the CMS actually required by UCI.

Mitigation:

Implement only approved content types and editorial workflows.

---

## 25.2 Coupling Content to Filesystem Storage

Risk:

Sermons/pages/events become dependent on VPS filesystem paths.

Mitigation:

Always access media through `MediaStorage`/MediaService abstractions.

---

## 25.3 UI-First Development

Risk:

Building polished screens before API/business rules are stable.

Mitigation:

Stabilize contracts and core backend capabilities first.

---

## 25.4 Permission Drift

Risk:

Admin UI hides actions but API still allows them.

Mitigation:

Server-side authorization remains authoritative.

---

## 25.5 Revision Complexity

Risk:

Every content module implements revisions differently.

Mitigation:

Use shared CMS revision patterns.

---

## 25.6 Preview Exposure

Risk:

Draft or scheduled content becomes publicly accessible or indexed.

Mitigation:

Use secure preview access and explicit noindex behavior.

---

## 25.7 Media Storage Growth

Risk:

Weekly sermon images consume VPS storage faster than expected.

Mitigation:

Track disk usage, optimize image variants, keep database free of binaries, and preserve provider abstraction.

---

## 25.8 SEO Duplication

Risk:

Multiple routes expose the same content.

Mitigation:

Canonical URL rules, redirects, and explicit indexability.

---

## 25.9 Excessive Client-Side JavaScript

Risk:

React becomes the default rendering model for the entire public site.

Mitigation:

Keep Astro as the default and use React selectively.

---

## 25.10 Production Configuration Drift

Risk:

Development and production behave differently.

Mitigation:

Environment-driven configuration and production-like infrastructure validation before launch.

---

## 25.11 ARM64 Compatibility

Risk:

A dependency or container image works on x86 but not ARM64.

Mitigation:

Validate the production stack against the Oracle ARM64 environment before final deployment.

---

## 25.12 Database Growth

Risk:

Unbounded audit/revision/search data creates unnecessary growth.

Mitigation:

Monitor storage and define retention/archival policies where appropriate.

---

# 26. Decision Gates

The following gates prevent the project from advancing while a critical architectural concern remains unresolved.

---

## Gate 1 — Foundation

Before leaving Phase 0:

- application boundaries are stable;
- repository structure is stable;
- environment configuration is defined;
- runtime architecture is operational.

---

## Gate 2 — Backend Core

Before implementing major content modules:

- database foundation works;
- API conventions are stable;
- authentication works;
- authorization works.

---

## Gate 3 — CMS

Before building extensive editorial UI:

- publication workflow works;
- revisions work;
- preview works;
- permissions work;
- concurrency behavior is defined.

---

## Gate 4 — Media

Before attaching large amounts of content media:

- upload security works;
- storage abstraction works;
- metadata works;
- references work;
- deletion safeguards work.

---

## Gate 5 — Content

Before public content launch:

- sermons work end-to-end;
- events work end-to-end;
- ministries work end-to-end;
- pages work end-to-end;
- navigation works.

---

## Gate 6 — SEO

Before public indexing:

- canonical URLs are stable;
- sitemap works;
- robots behavior is correct;
- structured data is valid;
- preview/draft URLs are not indexable.

---

## Gate 7 — Accessibility

Before launch:

- public UI meets the intended WCAG 2.2 AA target;
- admin workflows are keyboard accessible;
- responsive behavior works;
- media and forms are accessible.

---

## Gate 8 — Production

Before DNS/public launch:

- database backups exist;
- media backups exist;
- restore path is understood;
- Caddy/TLS works;
- health checks work;
- production environment is configured;
- persistent storage is verified.

---

# 27. Recommended Implementation Order

The shortest practical dependency-aware order is:

```text
01. Project Foundation
        ↓
02. Shared Core + Database
        ↓
03. Authentication + Authorization
        ↓
04. CMS Core
        ↓
05. Media Subsystem
        ↓
06. Sermons
        ↓
07. Events + Ministries
        ↓
08. Pages + Navigation
        ↓
09. SEO + Discovery
        ↓
10. Public Website
        ↓
11. Admin Panel
        ↓
12. Contact + Supporting Features
        ↓
13. Integration + Hardening
        ↓
14. Production Deployment
```

This sequence is intentionally not a strict one-task-at-a-time process.

Within it, parallel work should be used where dependencies permit.

---

# 28. Recommended Parallel Development Model

A practical implementation can operate as follows:

```text
                    ┌──────────────────────┐
                    │   Foundation/Core    │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │ Database + Contracts │
                    └──────────┬───────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
           Backend           Public UI       Admin Shell
              │                │                │
              ▼                │                ▼
          CMS + Media          │          Auth Integration
              │                │                │
              ▼                │                │
           Content             │                │
              │                │                │
              └──────────┬─────┴───────┬────────┘
                         │             │
                         ▼             ▼
                       SEO          Admin Features
                         │             │
                         └──────┬──────┘
                                ▼
                       Integration
                                │
                                ▼
                           Production
```

The key constraint is that parallel work must converge through stable contracts.

---

# 29. Feature Completion Model

A feature should not be considered complete merely because its backend or UI exists.

Use the following completion model:

```text
Specification
    ↓
Domain model
    ↓
Persistence
    ↓
Application logic
    ↓
API
    ↓
Authorization
    ↓
Admin workflow
    ↓
Public representation
    ↓
SEO
    ↓
Accessibility
    ↓
Operational behavior
```

A feature that stops halfway through this chain is incomplete unless explicitly classified as an intermediate implementation milestone.

---

# 30. Example — Sermon Completion

The Sermon module is complete only when all of the following are true:

### Backend

- entity exists;
- persistence exists;
- validation exists;
- API exists;
- permissions exist;
- revisions exist;
- publication exists;
- scheduling exists where required;
- media relationships exist;
- SEO metadata exists.

### Admin

- create;
- edit;
- save;
- preview;
- media selection;
- YouTube reference;
- SEO;
- revision history;
- publish;
- schedule;
- archive.

### Public

- listing;
- detail;
- media;
- video;
- metadata;
- structured data;
- canonical URL;
- responsive behavior;
- accessibility.

### Operations

- logs;
- audit;
- backup;
- deployment;
- storage behavior.

Only then is Sermons considered production-ready.

---

# 31. Example — Media Completion

Media is complete when:

```text
Upload
 ↓
Validate
 ↓
Store
 ↓
Persist metadata
 ↓
Generate variants
 ↓
Expose public representation
 ↓
Reference from content
 ↓
Inspect references
 ↓
Prevent unsafe deletion
 ↓
Back up
```

The database must remain metadata/reference-oriented.

---

# 32. Example — Page Completion

Pages are complete when:

```text
Create
 ↓
Draft
 ↓
Edit
 ↓
Revision
 ↓
SEO
 ↓
Preview
 ↓
Publish
 ↓
Canonical URL
 ↓
Navigation/discovery
 ↓
Sitemap
 ↓
Public rendering
```

---

# 33. Example — Production Readiness

The application is production-ready only when:

```text
Application
     +
Database
     +
Media
     +
Authentication
     +
Authorization
     +
SEO
     +
Accessibility
     +
Backups
     +
Observability
     +
Deployment
     +
Recovery
```

are all operational.

---

# 34. Final Delivery Checklist

## Architecture

- [ ] Modular monolith implemented.
- [ ] Public/admin/backend boundaries preserved.
- [ ] Shared contracts implemented.
- [ ] Media storage abstraction preserved.
- [ ] External media boundary preserved.

## Backend

- [ ] API versioning implemented.
- [ ] Authentication implemented.
- [ ] Authorization implemented.
- [ ] Content lifecycle implemented.
- [ ] Revisions implemented.
- [ ] Preview implemented.
- [ ] Scheduling implemented where required.
- [ ] Validation implemented.
- [ ] Error contracts implemented.
- [ ] Pagination implemented.

## Content

- [ ] Sermons.
- [ ] Events.
- [ ] Ministries.
- [ ] Pages.
- [ ] Navigation.
- [ ] Settings.

## Media

- [ ] Media Library.
- [ ] Secure uploads.
- [ ] Metadata.
- [ ] Image variants.
- [ ] Media references.
- [ ] Deletion safeguards.
- [ ] External YouTube references.
- [ ] Persistent storage.

## Admin

- [ ] Login.
- [ ] Dashboard.
- [ ] Permission-aware navigation.
- [ ] Content editors.
- [ ] Media Library.
- [ ] Navigation manager.
- [ ] SEO controls.
- [ ] Users.
- [ ] Roles/permissions.
- [ ] Audit.

## Public

- [ ] Home.
- [ ] Sermons.
- [ ] Events.
- [ ] Ministries.
- [ ] Pages.
- [ ] Navigation.
- [ ] Contact.
- [ ] Search/discovery.
- [ ] Responsive behavior.
- [ ] Accessibility.

## SEO

- [ ] Metadata.
- [ ] Canonical URLs.
- [ ] Sitemap.
- [ ] Robots.
- [ ] Structured data.
- [ ] Open Graph.
- [ ] Redirects.
- [ ] Indexability rules.

## Security

- [ ] Secure cookies.
- [ ] Session protection.
- [ ] Authorization.
- [ ] Rate limiting.
- [ ] Input validation.
- [ ] Rich-text sanitization.
- [ ] Upload validation.
- [ ] Preview protection.
- [ ] Security headers.
- [ ] Audit logging.

## Operations

- [ ] Production Docker/Compose.
- [ ] Caddy.
- [ ] HTTPS.
- [ ] PostgreSQL persistence.
- [ ] Media persistence.
- [ ] Backups.
- [ ] Recovery procedure.
- [ ] Health checks.
- [ ] Logging.
- [ ] Resource monitoring.
- [ ] ARM64 compatibility.

---

# 35. Target End-State

The final UCI platform should operate as a unified system:

```text
                         UCI PLATFORM
                              │
             ┌────────────────┴────────────────┐
             │                                 │
             ▼                                 ▼
       PUBLIC WEBSITE                       ADMIN CMS
          Astro                              React
             │                                 │
             └──────────────┬──────────────────┘
                            │
                            ▼
                       REST API
                        /api/v1
                            │
        ┌───────────────────┼────────────────────┐
        │                   │                    │
        ▼                   ▼                    ▼
     Content             Identity             Media
        │                   │                    │
        │                   │                    │
        ├── Pages           ├── Users            ├── Images
        ├── Sermons         ├── Roles            ├── Variants
        ├── Events          ├── Permissions      ├── Metadata
        ├── Ministries      └── Sessions         └── External Media
        └── Navigation
        │
        ▼
   SEO / Discovery
        │
        ▼
   PostgreSQL + MediaStorage
        │
        ▼
   Production Infrastructure
        │
        ├── Caddy
        ├── Docker
        ├── Persistent DB
        ├── Persistent Media
        ├── Backups
        └── Monitoring
```

The desired result is not simply a website with an administration panel.

It is a maintainable church content platform in which:

- editors can manage content without developer intervention;
- the public site remains fast and accessible;
- content is structured and discoverable;
- media is reusable and storage-provider independent;
- security is enforced at the backend;
- publication workflows preserve editorial history;
- SEO is generated from real content;
- the infrastructure remains appropriate for the Oracle VPS;
- future storage and scaling changes do not require rewriting the CMS;
- the system can evolve without abandoning the initial architecture.

---

# 36. Roadmap Governance

This roadmap should be updated when implementation reveals a legitimate architectural change.

Changes should not be made merely to accommodate a temporary implementation shortcut.

When a significant change is identified:

```text
Implementation discovery
        ↓
Impact analysis
        ↓
Relevant specification identified
        ↓
Architecture/product decision
        ↓
Specification updated
        ↓
Roadmap updated
        ↓
Implementation continues
```

The roadmap should therefore remain a living execution document while the specifications remain the primary source of architectural and product truth.

---

# 37. Final Principle

The UCI implementation should progress from **foundations → capabilities → experiences → production**, rather than from isolated screens or database tables.

The implementation sequence should preserve the following chain:

```text
Requirements
    ↓
Architecture
    ↓
Contracts
    ↓
Domain
    ↓
Security
    ↓
CMS capabilities
    ↓
Media
    ↓
Content
    ↓
SEO
    ↓
Public experience
    ↓
Administrative experience
    ↓
Hardening
    ↓
Production
```

The purpose of this roadmap is to make that sequence explicit.

It should guide implementation without duplicating the specifications that define what each capability means.

**The specific domain and technical specifications remain authoritative; this document defines how the project reaches the target state.**