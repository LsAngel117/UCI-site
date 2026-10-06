# 02 — Architecture / Technical Specifications

## 1. Purpose

This document defines the technical architecture and engineering constraints
for the church website and its advanced Content Management System (CMS).

It translates the product requirements defined in
`01-product-requirements.md` into a concrete technical architecture.

The architecture MUST provide:

* A performant public church website.
* An advanced administrative CMS.
* Secure authentication and authorization.
* Structured content management.
* Media management.
* SEO management.
* Publication workflows.
* Extensibility for future church functionality.
* Low operational complexity.
* Low infrastructure cost.
* Clear separation between presentation, application, domain, persistence,
  and infrastructure concerns.

This document defines HOW the system is technically structured.

Functional requirements are defined in `01-product-requirements.md`.

Feature-specific behavior MAY be defined in subsequent specifications.

---

# 2. Architectural Principles

The following principles MUST guide implementation.

## 2.1 Simplicity

The system MUST remain a modular monolith.

Microservices MUST NOT be introduced unless explicitly approved by a future
architectural decision.

The system should solve the current product requirements without introducing
unnecessary infrastructure.

---

## 2.2 Separation of Concerns

The following responsibilities MUST remain separated:

* Public presentation
* Administrative presentation
* API
* Application services
* Domain logic
* Persistence
* Media storage
* External integrations
* Infrastructure

Frontend applications MUST NOT access the database directly.

---

## 2.3 Backend as Authority

The backend API is the authoritative layer for:

* Authentication
* Authorization
* Validation
* Business rules
* Publication rules
* Data persistence
* Media management
* Administrative operations

Frontend validation is for user experience only.

Security and business rules MUST NOT depend exclusively on frontend behavior.

---

## 2.4 Replaceable Infrastructure

Infrastructure providers SHOULD be replaceable when practical.

The application MUST NOT tightly couple domain logic to:

* Oracle Cloud
* Cloudflare
* Cloudinary
* YouTube
* Email providers
* Google Maps
* Other external services

External dependencies SHOULD be isolated behind interfaces or dedicated
services.

---

# 3. High-Level Architecture

The system consists of:

1. Public Website
2. Administrative CMS
3. Backend API
4. PostgreSQL Database
5. Media Storage
6. External Integrations
7. Reverse Proxy / Web Server

High-level architecture:

```
                     INTERNET
                        │
                        ▼
                     CADDY
                        │
          ┌─────────────┼─────────────┐
          │             │             │
          ▼             ▼             ▼
    Public Website     CMS          API
        Astro         React       Node.js
          │             │             │
          └─────────────┼─────────────┘
                        │
                        ▼
                 Application Layer
                        │
          ┌─────────────┴─────────────┐
          │                           │
          ▼                           ▼
     PostgreSQL                  MediaStorage
          │                           │
          │                     ┌─────┴─────┐
          │                     │           │
          ▼                     ▼           ▼
      Structured              Oracle      Future
         Data                  VPS       Provider
                                 
```

External integrations are accessed through the backend where credentials,
business rules, or application data are involved.

Examples:

* YouTube
* Google Maps
* Email provider
* Social networks
* Analytics
* Future external services

---

# 4. Architectural Style

## 4.1 Modular Monolith

The backend MUST be implemented as a modular monolith.

All backend modules run within the same application.

Modules MUST have explicit boundaries.

A module SHOULD expose:

* Application services
* Domain concepts
* Repository interfaces
* API contracts where applicable

Modules SHOULD NOT directly manipulate the internal implementation of other
modules.

---

## 4.2 Monorepo

The entire system MUST use a single repository.

The project MUST NOT introduce:

* Turborepo
* Nx
* Multiple independent repositories
* Multiple package managers
* Unnecessary workspace infrastructure

The objective is to maintain a simple development and deployment model.

---

# 5. Technology Stack

## 5.1 Public Website

The public website MUST use:

* Astro
* TypeScript
* React where interactive components are required
* Lucide Icons

Astro is responsible for:

* Routing
* Page rendering
* SEO
* Static generation
* Server-side rendering where appropriate
* Performance optimization

React SHOULD be used selectively.

Static content SHOULD remain Astro-rendered.

---

# 6. Administrative CMS

The CMS MUST be implemented as a dedicated React application.

The CMS is considered a first-class product interface.

Unlike a minimal CRUD administration panel, the CMS MUST support an advanced
content-management workflow.

The CMS architecture SHOULD support:

* Dashboard
* Content management
* Drafts
* Publishing
* Scheduled publication
* Content previews
* Media library
* Media metadata
* Reusable media
* Search
* Filtering
* Sorting
* Pagination
* Bulk actions where appropriate
* Role-based permissions
* User management
* Site configuration
* SEO configuration
* Content revision history
* Publication status
* Content relationships
* Validation
* Notifications/toasts
* Responsive administrative interface

The exact features are defined in product and feature specifications.

---

# 7. CMS Application Architecture

The CMS SHOULD be organized by features rather than by generic component
folders alone.

Example:

```
src/admin/
├── app/
├── layouts/
├── components/
├── features/
│   ├── dashboard/
│   ├── pages/
│   ├── sermons/
│   ├── events/
│   ├── ministries/
│   ├── media/
│   ├── users/
│   ├── seo/
│   └── settings/
├── hooks/
├── services/
├── lib/
└── styles/
```

Each feature SHOULD own its:

* Components
* Forms
* Validation
* API calls
* Types
* State management where required

Generic reusable UI components belong in shared component infrastructure.

---

# 8. Backend Architecture

The backend MUST use:

* Node.js
* TypeScript
* REST API

The backend SHOULD separate:

```
HTTP
  ↓
Application
  ↓
Domain
  ↓
Infrastructure
  ↓
PostgreSQL / External Services
```

Controllers/routes MUST remain thin.

Business logic MUST NOT be embedded directly inside HTTP handlers.

---

# 9. Repository Structure

The project SHOULD follow:

```
church-platform/
│
├── src/
│   ├── web/
│   │   ├── pages/
│   │   ├── layouts/
│   │   ├── components/
│   │   ├── sections/
│   │   ├── assets/
│   │   ├── styles/
│   │   └── lib/
│   │
│   ├── admin/
│   │   ├── app/
│   │   ├── layouts/
│   │   ├── components/
│   │   ├── features/
│   │   ├── hooks/
│   │   ├── services/
│   │   └── lib/
│   │
│   ├── server/
│   │   ├── modules/
│   │   ├── application/
│   │   ├── domain/
│   │   ├── infrastructure/
│   │   ├── middleware/
│   │   ├── config/
│   │   └── server.ts
│   │
│   ├── db/
│   │   ├── migrations/
│   │   ├── schema/
│   │   └── seed/
│   │
│   └── shared/
│       ├── types/
│       ├── constants/
│       ├── validation/
│       └── utils/
│
├── public/
├── docs/
├── docker/
├── docker-compose.yml
├── package.json
├── tsconfig.json
└── README.md
```

The exact directory structure MAY evolve during implementation, but the
architectural boundaries MUST remain.

---

# 10. Core Backend Modules

The backend SHOULD initially be divided into the following logical modules:

* Authentication
* Users
* Roles and Permissions
* Pages
* Sermons
* Events
* Ministries
* Media
* SEO
* Site Settings
* Navigation
* Contact
* Audit

Additional modules MAY be introduced when required by the product.

---

# 11. Authentication

The CMS MUST use secure backend-managed authentication.

The preferred browser authentication mechanism is secure HTTP-only cookies.

Authentication credentials MUST NOT be stored in localStorage when an
HTTP-only cookie architecture is used.

Expected endpoints:

```
POST /api/v1/auth/login
POST /api/v1/auth/logout
GET  /api/v1/auth/me
```

Passwords MUST:

* Never be stored in plaintext.
* Be securely hashed.
* Never be returned by API responses.

Authentication failures SHOULD be rate-limited.

---

# 12. Authorization

Authorization MUST be enforced by the backend.

The initial system SHOULD support role-based access control.

Initial roles:

* ADMIN
* EDITOR

The permission system SHOULD be designed so that additional roles can be
introduced later without redesigning the entire authentication system.

Permissions SHOULD be granular enough to distinguish operations such as:

* Read
* Create
* Update
* Delete
* Publish
* Manage
* Configure

The exact permission matrix is defined by CMS specifications.

---

# 13. Content Lifecycle

CMS-managed content MUST support a lifecycle.

Minimum states:

* DRAFT
* PUBLISHED
* ARCHIVED

The architecture MUST allow future states such as:

* SCHEDULED
* REVIEW
* REJECTED

where required.

Content MUST NOT become publicly visible merely because it exists in the
database.

Publication state MUST be evaluated by the backend.

---

# 14. Content Scheduling

The architecture MUST support scheduled publication.

A content item MAY contain:

* published_at
* unpublished_at

The backend MUST determine whether content is currently publishable.

Scheduled content MUST NOT require the administrator to manually publish
it at the exact publication time.

The implementation mechanism MAY use:

* Application scheduler
* Database query based publication rules
* Cron
* Background worker

The simplest reliable implementation SHOULD be selected.

---

# 15. Content Preview

The CMS SHOULD support previewing unpublished content.

Preview access MUST NOT make draft content publicly indexable.

Preview mechanisms MUST require appropriate authorization or temporary
secure preview tokens.

Search engines MUST NOT index draft content.

---

# 16. Content Versioning

The architecture SHOULD support revision history for important CMS-managed
content.

A revision MAY include:

* Content snapshot
* User
* Timestamp
* Version number
* Change metadata

The exact versioning strategy MAY be implemented per content type.

Version history SHOULD allow administrators to understand previous
published or edited states.

---

# 17. Pages Module

The Pages module manages configurable public pages.

A page MAY contain:

* Title
* Slug
* Summary
* Content
* Hero content
* Images
* SEO metadata
* Publication state
* Publication dates

The architecture SHOULD allow pages to contain structured content rather
than relying exclusively on one large HTML field.

---

# 18. Sermons Module

The Sermons module manages sermon content.

A sermon MAY contain:

* Title
* Slug
* Description
* Preacher
* Date
* Scripture reference
* Main image
* Notes
* Video URL
* Audio URL
* Related media
* SEO metadata
* Publication state

Video and audio SHOULD normally be hosted by external media providers.

YouTube SHOULD be supported as an external video provider.

Large video files MUST NOT be stored in PostgreSQL.

---

# 19. Events Module

The Events module manages church events.

An event MAY contain:

* Title
* Slug
* Description
* Date
* Start time
* End time
* Location
* Image
* Registration URL
* External URL
* Publication state
* SEO metadata

The architecture SHOULD support recurring events in the future.

---

# 20. Ministries Module

The Ministries module manages church ministry information.

A ministry MAY contain:

* Name
* Slug
* Description
* Image
* Schedule
* Contact information
* Leader information
* Social links
* Publication state

---

# 21. Navigation Management

Navigation SHOULD be configurable through the CMS where required.

The architecture MAY support:

* Header navigation
* Footer navigation
* External links
* Internal links
* Ordering
* Visibility
* Nested navigation

Navigation configuration MUST be validated before publication.

---

# 22. Media Architecture

Media MUST be treated as an independent subsystem.

PostgreSQL MUST NOT store image or video binary data.

PostgreSQL MUST store only:

* Media metadata
* Storage references
* Public/private state
* Relationships
* Optional transformations
* Alt text
* Titles
* Captions
* Upload information

---

# 23. MediaStorage Abstraction

The application MUST use a storage abstraction.

Conceptually:

```
MediaStorage
    │
    ├── LocalMediaStorage
    ├── S3MediaStorage
    ├── CloudflareR2MediaStorage
    └── CloudinaryMediaStorage
```

The initial implementation SHOULD use storage located on the Oracle VPS.

The domain and CMS MUST NOT depend directly on the physical filesystem.

Example conceptual interface:

```
upload(file, options)
delete(key)
getUrl(key)
exists(key)
metadata(key)
```

The exact implementation MAY vary.

---

# 24. Initial Media Storage

The initial media provider will be the Oracle VPS.

Example directory:

```
/opt/church/media/
```

Suggested organization:

```
/opt/church/media/
├── sermons/
│   └── YYYY/
│       └── MM/
├── events/
│   └── YYYY/
│       └── MM/
├── ministries/
├── pages/
└── general/
```

The storage structure MUST NOT leak into domain logic.

The application should operate using storage keys rather than hardcoded
filesystem paths.

---

# 25. Future Media Migration

The architecture MUST allow media storage to migrate from the Oracle VPS
to another provider.

Possible future providers include:

* Cloudflare R2
* Amazon S3
* S3-compatible storage
* Cloudinary
* Other object storage providers

Changing the provider MUST NOT require changes to:

* Sermon domain logic
* Event domain logic
* CMS content models
* Public website components

Only the infrastructure implementation and configuration should change.

---

# 26. Media Library

The CMS MUST provide an advanced media library.

The media library SHOULD support:

* Upload
* Search
* Filtering
* Sorting
* Preview
* Metadata editing
* Alt text
* Captions
* Copy URL
* Reuse existing media
* Delete
* Relationship inspection
* Bulk operations where appropriate

The CMS SHOULD warn before deleting media that is referenced by published
content.

---

# 27. Image Processing

Uploaded images SHOULD be optimized before public delivery.

The architecture SHOULD support:

* Resizing
* Compression
* Responsive variants
* WebP
* AVIF where appropriate
* Thumbnail generation

The exact image-processing implementation MAY be local or delegated to a
future external provider.

Original files MAY be preserved depending on storage requirements.

---

# 28. Media URLs

Media URLs SHOULD be generated through the storage abstraction.

The database SHOULD store a stable storage key or canonical media reference.

The public website SHOULD receive the final usable URL.

Example:

```
https://media.example.org/sermons/2026/09/sermon-01.webp
```

The exact hostname MUST be configurable.

---

# 29. External Media

Large media that is already hosted by an external provider SHOULD remain
external.

Examples:

* YouTube videos
* External audio providers
* Social media content

The CMS SHOULD store provider information and external URLs.

Example conceptual structure:

```
provider: YOUTUBE
external_id: XXXXX
url: https://...
```

The application SHOULD avoid downloading and duplicating externally hosted
videos unless explicitly required.

---

# 30. Database Architecture

PostgreSQL is the primary structured-data store.

The database MUST contain application metadata and relationships but SHOULD
NOT contain large binary media files.

Core entities are expected to include:

* users
* roles
* permissions
* pages
* sermons
* events
* ministries
* media
* media_relations
* navigation_items
* site_settings
* seo_metadata
* audit_logs
* content_revisions

Additional entities MAY be introduced according to feature specifications.

---

# 31. Database IDs

Persistent entities SHOULD use UUID identifiers.

Database-generated sequential identifiers MAY be used internally where
appropriate, but public resource identifiers SHOULD NOT expose predictable
sequential IDs when that creates unnecessary enumeration risk.

---

# 32. Database Timestamps

Persistent entities SHOULD include:

* created_at
* updated_at

Content entities SHOULD additionally support:

* published_at
* unpublished_at

Auditable entities SHOULD include:

* created_by
* updated_by

where appropriate.

---

# 33. Database Migrations

All schema changes MUST be managed through migrations.

Production database schema MUST NOT normally be modified manually.

Every migration MUST be reproducible from source control.

---

# 34. API Architecture

The backend MUST expose a versioned REST API.

Base path:

```
/api/v1
```

Examples:

```
/api/v1/auth
/api/v1/pages
/api/v1/sermons
/api/v1/events
/api/v1/ministries
/api/v1/media
/api/v1/users
/api/v1/settings
/api/v1/navigation
```

Public endpoints and administrative endpoints MUST be clearly separated.

---

# 35. Public API

Public API endpoints MUST return only information that is intended for
public consumption.

Examples:

```
GET /api/v1/public/pages
GET /api/v1/public/sermons
GET /api/v1/public/events
GET /api/v1/public/ministries
```

The exact API design MAY use resource-based routes rather than this exact
naming convention.

The important constraint is that unpublished or administrative information
MUST NOT be exposed.

---

# 36. Administrative API

Administrative endpoints MUST require:

* Authentication
* Authorization
* Request validation

Examples:

```
POST   /api/v1/admin/sermons
PATCH  /api/v1/admin/sermons/:id
DELETE /api/v1/admin/sermons/:id
POST   /api/v1/admin/sermons/:id/publish
```

The exact endpoint structure MAY evolve while preserving the separation.

---

# 37. API Validation

Backend validation MUST cover:

* Required fields
* Types
* Lengths
* Formats
* URLs
* Dates
* Enumerations
* Slugs
* Permissions
* File metadata
* Business constraints

Invalid requests MUST return consistent error responses.

---

# 38. API Error Model

API errors SHOULD use a consistent structure.

Conceptual example:

```
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request contains invalid fields",
    "details": [...]
  }
}
```

Internal implementation details MUST NOT be exposed in production.

Stack traces MUST NOT be returned to clients.

---

# 39. Pagination

Collection endpoints SHOULD support pagination where content can grow.

Pagination SHOULD support:

* Page/limit or cursor-based pagination
* Sorting
* Filtering

The CMS MUST be capable of handling large content libraries without
loading the entire dataset into the browser.

---

# 40. Search

The CMS SHOULD provide server-side search for content collections.

Search SHOULD support relevant fields such as:

* Title
* Slug
* Description
* Author/preacher
* Status

The implementation SHOULD initially use PostgreSQL capabilities rather
than introducing a dedicated search engine unnecessarily.

A dedicated search engine MAY be introduced later if justified by scale.

---

# 41. SEO Architecture

SEO MUST be treated as a first-class architectural concern.

The public website MUST support:

* Title
* Meta description
* Canonical URL
* Open Graph
* Social metadata
* Structured data
* Sitemap
* Robots directives

CMS-managed content SHOULD allow editorial SEO configuration.

---

# 42. Structured Data

The architecture SHOULD support relevant schema.org structured data.

Potential types include:

* Organization
* LocalBusiness
* Event
* Article
* VideoObject
* BreadcrumbList

Structured data MUST be generated from validated application data.

It MUST NOT depend exclusively on manually inserted HTML.

---

# 43. Sitemap

The public application MUST generate a sitemap containing eligible public
content.

Draft and private content MUST NOT appear in the sitemap.

Deleted or unpublished content MUST be removed appropriately.

---

# 44. URL and Slug Architecture

Public content MUST use stable, human-readable URLs.

Examples:

```
/sermones
/sermones/fe-genuina
/eventos
/eventos/culto-familiar
/ministerios
/ministerios/jovenes
```

Slugs MUST:

* Be URL-safe
* Be unique within their resource
* Avoid unnecessary identifiers
* Support future redirects

Changing a published slug SHOULD create a redirect from the previous URL
when appropriate.

---

# 45. Frontend Design System

The website and CMS SHOULD use reusable design tokens.

Tokens SHOULD define:

* Colors
* Typography
* Spacing
* Border radius
* Shadows
* Breakpoints
* Motion
* Z-index layers

The church's approved visual identity is the source of truth.

Design tokens MUST be centralized rather than duplicated across components.

---

# 46. Public Frontend Components

Reusable public components SHOULD include:

* Header
* Navigation
* Footer
* Hero
* Section
* Button
* Card
* SermonCard
* EventCard
* MinistryCard
* Media component
* Breadcrumbs
* Social links
* Contact sections

Components SHOULD remain composable.

---

# 47. CMS Design System

The CMS SHOULD have a dedicated administrative design system.

Reusable components SHOULD include:

* Sidebar
* Header
* Breadcrumbs
* DataTable
* Pagination
* SearchInput
* FilterBar
* Modal
* Drawer
* FormField
* RichTextEditor
* MediaPicker
* MediaUploader
* StatusBadge
* ConfirmationDialog
* Toast
* EmptyState
* LoadingState
* ErrorState

The CMS SHOULD maintain a coherent visual language across all modules.

---

# 48. Rich Content Editing

The CMS SHOULD support structured rich content.

The implementation MUST avoid forcing administrators to manually write raw
HTML for normal content-management operations.

Where rich text is required, the editor SHOULD provide:

* Headings
* Paragraphs
* Lists
* Links
* Quotes
* Images
* Embeds
* Basic formatting

The exact editor technology is a technical implementation decision.

---

# 49. Media Selection

Content editors SHOULD be able to select existing media from the media
library rather than uploading duplicate files.

The CMS SHOULD distinguish between:

* Upload new media
* Select existing media
* Replace media
* Remove media relationship

Deleting a media record SHOULD NOT automatically delete a physical file
unless the system verifies that it is no longer referenced.

---

# 50. Audit Logging

The system SHOULD maintain audit information for important administrative
operations.

Potential actions:

* Login
* Logout
* Create content
* Update content
* Publish content
* Unpublish content
* Delete content
* Restore content
* User changes
* Permission changes
* Settings changes
* Media deletion

Audit logs SHOULD include:

* User
* Action
* Resource
* Resource ID
* Timestamp
* Relevant metadata

Sensitive values MUST NOT be logged.

---

# 51. Security

The application MUST follow secure-by-default principles.

Requirements include:

* HTTPS in production
* HTTP-only cookies
* Secure cookies
* Appropriate SameSite policy
* CSRF protection where applicable
* Input validation
* Authorization
* Rate limiting
* Secure headers
* Password hashing
* Secret management
* Safe file uploads
* MIME validation
* File-size limits
* Path traversal protection

Uploaded files MUST NOT be trusted solely based on their filename or
extension.

---

# 52. File Upload Security

The media subsystem MUST validate uploaded files.

Validation SHOULD include:

* MIME type
* File extension
* File size
* Image dimensions where applicable
* File content where practical

The application MUST prevent:

* Executable file uploads
* Path traversal
* Arbitrary filesystem access
* Uncontrolled file overwrites

User-controlled filenames MUST NOT determine the final filesystem path.

---

# 53. Environment Configuration

Configuration MUST be externalized.

Example variables:

```
NODE_ENV
DATABASE_URL
SESSION_SECRET
MEDIA_STORAGE_PROVIDER
MEDIA_STORAGE_PATH
MEDIA_PUBLIC_BASE_URL
YOUTUBE configuration
EMAIL configuration
External API credentials
```

Secrets MUST NOT be committed to Git.

A `.env.example` file SHOULD document required configuration.

---

# 54. Local Development

The project SHOULD support local development through Docker Compose.

Initial services:

```
app
postgres
```

Media storage MAY use a local directory during development.

The local architecture SHOULD resemble production sufficiently to avoid
environment-specific surprises.

---

# 55. Production Infrastructure

The initial production environment is expected to run on the Oracle Cloud
VPS.

The production stack SHOULD include:

```
Caddy
Node.js application
PostgreSQL
Media storage directory
```

Example:

```
/opt/church/
├── app/
├── postgres/
└── media/
```

Persistent volumes MUST be used for:

* PostgreSQL data
* Media storage

---

# 56. Reverse Proxy

Caddy SHOULD handle:

* HTTPS
* TLS certificates
* Reverse proxy
* Domain routing
* Media delivery where appropriate
* Security headers

Possible routing:

```
example.org
    → Public Website

example.org/admin
    → CMS

example.org/api
    → Backend API

media.example.org
    → Media storage
```

The final routing configuration is an infrastructure implementation
concern.

---

# 57. Docker

Production deployment SHOULD use Docker.

The application container MUST remain stateless except for temporary files.

Persistent application data MUST NOT depend on the lifecycle of the
container.

PostgreSQL MUST use a persistent volume.

Media storage MUST use a persistent volume or external storage.

---

# 58. Backups

PostgreSQL MUST have automated backups in production.

Media SHOULD also be backed up.

Database and media backups SHOULD be stored separately from the primary
application instance when practical.

Restoration procedures SHOULD be tested periodically.

---

# 59. Logging

The backend MUST provide sufficient logging for:

* Authentication failures
* API errors
* Database errors
* Media upload failures
* External integration failures
* Important administrative operations

Logs MUST NOT contain:

* Passwords
* Session secrets
* Authentication tokens
* Unnecessary sensitive data

---

# 60. Caching

Public content MAY be cached.

Potential cache targets:

* Public pages
* Sermons
* Events
* Ministries
* Public navigation
* Site configuration

Administrative responses MUST NOT be publicly cached.

Cache invalidation SHOULD occur after relevant content publication or update.

---

# 61. Performance

The architecture MUST prioritize public website performance.

Requirements include:

* Minimal JavaScript
* Astro-first rendering
* Selective React hydration
* Optimized images
* Responsive image variants
* Lazy loading where appropriate
* Efficient API calls
* Server-side rendering or static generation where beneficial
* Avoidance of unnecessary client-side state

The public website SHOULD target strong Core Web Vitals.

---

# 62. Accessibility

The public website SHOULD target WCAG 2.2 AA principles where practical.

Requirements include:

* Semantic HTML
* Keyboard navigation
* Visible focus
* Accessible forms
* Sufficient contrast
* Alternative text
* Accessible interactive controls
* Reduced-motion consideration
* Screen-reader compatible structure

The CMS SHOULD also follow accessible interaction principles.

---

# 63. External Integrations

External integrations MUST be isolated.

Potential integrations:

* YouTube
* Google Maps
* Email
* Social networks
* Analytics
* Future donation platforms
* Future registration platforms

Credentials MUST remain server-side.

External URLs MAY be stored in PostgreSQL when they are part of application
content.

The application SHOULD store provider identifiers separately when useful.

---

# 64. YouTube Integration

YouTube videos SHOULD remain hosted on YouTube.

The CMS SHOULD allow administrators to associate a YouTube video with a
sermon or other content.

The application SHOULD store:

* Provider
* Video ID
* URL
* Optional title/metadata

The website SHOULD render an appropriate embedded player or link according
to the feature requirements.

The application MUST NOT duplicate the full video on the VPS without an
explicit requirement.

---

# 65. Google Maps Integration

Map information MAY be managed through site settings.

The architecture SHOULD support:

* Address
* Coordinates
* Google Maps URL
* Embed configuration where appropriate

API credentials MUST remain private when applicable.

---

# 66. Shared Types and Contracts

Shared types MAY be used where useful between:

* Public website
* CMS
* Backend

Shared types MUST NOT expose:

* Database internals
* Secrets
* Sensitive administrative information

API contracts SHOULD be explicit.

The public frontend SHOULD consume API DTOs rather than database models.

---

# 67. Testing Architecture

Testing SHOULD exist at multiple levels.

## Unit

For:

* Domain rules
* Application services
* Validation
* Utility logic

## Integration

For:

* API
* Database
* Authentication
* Authorization
* Media storage
* External integrations where practical

## End-to-End

For critical flows:

* Admin login
* Content creation
* Content editing
* Content publishing
* Scheduled publication
* Media upload
* Media selection
* Public content visibility

---

# 68. Technical Constraints

The implementation MUST NOT:

* Store large images or videos in PostgreSQL.
* Access PostgreSQL directly from frontend applications.
* Store secrets in source control.
* Introduce microservices without approval.
* Introduce unnecessary databases.
* Introduce a second package manager.
* Duplicate business rules between frontend and backend.
* Depend directly on Oracle filesystem paths inside domain logic.
* Couple sermon content directly to YouTube implementation.
* Couple media management directly to a specific storage provider.
* Expose draft content through public APIs.
* Trust frontend authorization as a security mechanism.

---

# 69. Architecture Decision — Media Storage

## ADR-003

### Decision

Application media will NOT be stored as binary data inside PostgreSQL.

PostgreSQL will store media metadata and references.

A `MediaStorage` abstraction will isolate the application from the physical
storage provider.

### Initial Provider

The initial provider will be local storage on the Oracle VPS.

Example:

```
/opt/church/media/
```

### Future Providers

The architecture MUST allow migration to:

* Cloudflare R2
* Amazon S3
* S3-compatible object storage
* Cloudinary
* Other suitable providers

### Rationale

The church will publish sermon notes and other media regularly.

Storing binary media directly in PostgreSQL would unnecessarily increase
database size, complicate backups, and couple database storage to media
management.

Using dedicated media storage keeps PostgreSQL focused on structured
application data.

The abstraction also allows the storage provider to change without
redesigning the CMS.

---

# 70. Architecture Decision — External Video

## ADR-004

### Decision

Video content will normally remain hosted on external video platforms,
primarily YouTube.

The application stores references to those videos.

### Rationale

Video files consume significantly more storage and bandwidth than normal
website images.

The church does not need to use its VPS as a video hosting platform for
the initial product.

External video platforms provide:

* Video delivery
* Adaptive streaming
* CDN infrastructure
* Player functionality
* Storage

The CMS therefore manages the relationship between church content and
external videos rather than storing the videos themselves.

---

# 71. Architecture Decision — Advanced CMS

## ADR-005

### Decision

The CMS is a first-class application and MUST NOT be treated as a minimal
administrative CRUD interface.

The CMS architecture will support:

* Multiple roles
* Permissions
* Publication workflow
* Drafts
* Scheduled publication
* Preview
* Revisions
* Media library
* SEO management
* Search
* Filtering
* Bulk operations where appropriate
* Audit information
* Site configuration

### Rationale

The church will publish content continuously, including weekly sermon
notes, events, ministries, and other information.

An advanced CMS reduces repeated technical intervention and allows authorized
church personnel to manage the website independently.

---

# 72. Architecture Evolution

The initial implementation MUST focus on current product requirements.

The architecture SHOULD remain extensible for future capabilities such as:

* Additional administrative roles
* Member accounts
* Prayer requests
* Online registrations
* Donations
* Volunteer management
* Notifications
* Mobile application
* Multiple church locations
* Multilingual content
* Advanced analytics

These features MUST NOT be implemented speculatively.

Future functionality MUST receive its own product and technical
specifications.

---

# 73. Source of Truth

The architecture is divided into the following documentation layers:

`01-product-requirements.md`

Defines:

* What the product must accomplish.
* Who uses it.
* Functional requirements.
* Business requirements.
* Product constraints.

`02-information-architecture.md`

Defines:

* Technical architecture.
* Technology choices.
* Application boundaries.
* Infrastructure.
* Storage.
* Security architecture.
* Data architecture.
* Technical constraints.

Feature specifications define:

* Detailed feature behavior.
* User flows.
* Specific API requirements.
* Specific UI requirements.
* Acceptance criteria.

Implementation code is the executable realization of the approved
specifications.

Architectural changes MUST be documented rather than silently introduced.

---

# 74. Final Architectural Model

The final intended architecture is:

```
                       INTERNET
                          │
                          ▼
                       CADDY
                          │
         ┌────────────────┼────────────────┐
         │                │                │
         ▼                ▼                ▼
    ASTRO WEBSITE      REACT CMS       NODE API
         │                │                │
         └────────────────┼────────────────┘
                          │
                 Application Layer
                          │
         ┌────────────────┼────────────────┐
         │                │                │
         ▼                ▼                ▼
    PostgreSQL       MediaStorage      Integrations
         │                │                │
   Structured Data    Oracle VPS       YouTube
                     initially         Maps
                                       Email
                                       Analytics
                          │
                          ▼
                Future Object Storage
                R2 / S3 / Cloudinary
```

The architecture MUST preserve the following fundamental separation:

DATABASE
→ Structured application data.

MEDIA STORAGE
→ Images and uploaded files.

EXTERNAL MEDIA
→ Videos and other externally hosted content.

CMS
→ Administrative management.

API
→ Security, business rules, validation and persistence.

PUBLIC WEBSITE
→ Presentation, SEO, performance and public content.
