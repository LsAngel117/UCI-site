# 08 — API Specification

## 1. Purpose

This document defines the HTTP API contract for the UCI church website and CMS.

The API is the central application interface between:

- the public Astro website;
- the React-based `/panel` administration interface;
- the PostgreSQL persistence layer;
- media storage;
- external integrations;
- future clients that may consume UCI content.

The API is responsible for exposing application capabilities through a stable, versioned REST interface.

The API must not expose PostgreSQL or persistence-layer details directly to clients.

---

# 2. API Design Principles

The API follows these principles:

1. REST-oriented resource design.
2. Explicit API versioning.
3. JSON request and response bodies.
4. Consistent response structures.
5. Consistent error structures.
6. Explicit validation at the API boundary.
7. Authentication through secure HTTP-only cookies.
8. Authorization through server-side RBAC and permissions.
9. Public endpoints expose only published/public content.
10. Administrative endpoints require authentication and authorization.
11. Database models are not exposed directly as API contracts.
12. Pagination is mandatory for potentially large collections.
13. Search and filtering are supported where meaningful.
14. Slugs are first-class identifiers for public content.
15. Internal IDs remain available where administrative operations require them.
16. API contracts must remain independent from the frontend implementation.
17. Media binaries are not stored in PostgreSQL.
18. External video providers are represented through metadata and provider identifiers.
19. API behavior must remain compatible with the modular-monolith architecture.
20. The initial implementation must not require microservices or GraphQL.

---

# 3. Base URL

All versioned API routes use:

```text
/api/v1
```

Production example:

```text
https://uci.example.org/api/v1
```

Development example:

```text
http://localhost:3000/api/v1
```

The API version is part of the URL and must not depend exclusively on headers.

---

# 4. Content Types

The API primarily uses:

```http
Content-Type: application/json
```

JSON is used for:

- authentication requests;
- content creation;
- content updates;
- content metadata;
- configuration;
- search and filtering;
- API responses.

Multipart requests may be used for media upload operations where appropriate.

The media upload contract is defined separately from ordinary JSON resources.

---

# 5. API Groups

The API is logically divided into the following groups:

```text
/api/v1
├── /auth
├── /users
├── /permissions
├── /pages
├── /sermons
├── /events
├── /ministries
├── /navigation
├── /media
├── /settings
├── /seo
├── /contact
├── /search
└── /audit
```

Not every resource is publicly accessible.

---

# 6. Public API vs Administrative API

The API has two logical access layers.

## 6.1 Public API

Public endpoints are intended for:

- the Astro website;
- public content discovery;
- public search;
- SEO-oriented pages;
- publicly visible church information.

Public endpoints must expose only:

```text
published
active
public
```

content according to the resource's business rules.

Draft, archived, scheduled, private, or administrative information must never be exposed through public endpoints.

---

## 6.2 Administrative API

Administrative endpoints are consumed by `/panel`.

They provide:

- authentication;
- dashboard data;
- content management;
- publishing;
- scheduling;
- media management;
- user management;
- permissions;
- SEO management;
- site configuration;
- audit information.

Administrative endpoints require an authenticated session and appropriate permissions.

---

# 7. Authentication API

## 7.1 Login

```http
POST /api/v1/auth/login
```

### Request

```json
{
  "email": "admin@example.org",
  "password": "password"
}
```

### Successful Response

```http
200 OK
```

```json
{
  "data": {
    "user": {
      "id": "uuid",
      "name": "Administrator",
      "email": "admin@example.org",
      "role": "ADMIN"
    }
  }
}
```

Authentication state is established through a secure HTTP-only session cookie.

The session token must not be returned as a JavaScript-readable response field.

---

## 7.2 Current Session

```http
GET /api/v1/auth/me
```

Returns the currently authenticated user.

### Response

```json
{
  "data": {
    "id": "uuid",
    "name": "Administrator",
    "email": "admin@example.org",
    "role": "ADMIN",
    "permissions": [
      "content.read",
      "content.create",
      "content.update",
      "content.publish",
      "media.manage"
    ]
  }
}
```

---

## 7.3 Logout

```http
POST /api/v1/auth/logout
```

### Response

```http
204 No Content
```

The server invalidates the current session.

---

## 7.4 Authentication Errors

Invalid credentials:

```http
401 Unauthorized
```

Authenticated but insufficient permissions:

```http
403 Forbidden
```

---

# 8. Users API

Administrative users are managed through:

```text
/api/v1/users
```

## 8.1 List Users

```http
GET /api/v1/users
```

Supported parameters:

```text
page
limit
search
role
status
sort
order
```

Example:

```http
GET /api/v1/users?page=1&limit=20&search=juan&role=EDITOR
```

---

## 8.2 Get User

```http
GET /api/v1/users/:id
```

---

## 8.3 Create User

```http
POST /api/v1/users
```

Example:

```json
{
  "name": "Juan Pérez",
  "email": "juan@example.org",
  "role": "EDITOR",
  "status": "ACTIVE"
}
```

---

## 8.4 Update User

```http
PATCH /api/v1/users/:id
```

Only supplied fields are modified.

---

## 8.5 Disable User

```http
POST /api/v1/users/:id/disable
```

The account should normally be disabled rather than physically deleted when historical audit records depend on it.

---

# 9. Permissions API

Permissions are primarily used internally by the administration interface and authorization layer.

```http
GET /api/v1/permissions
```

The endpoint may return the permissions available to the authenticated administrator.

Permissions follow a resource/action model.

Example:

```text
content.read
content.create
content.update
content.delete
content.publish

sermons.read
sermons.create
sermons.update
sermons.delete
sermons.publish

events.read
events.create
events.update
events.delete
events.publish

media.read
media.upload
media.update
media.delete

users.read
users.create
users.update
users.disable

settings.read
settings.update

seo.read
seo.update

audit.read
```

The definitive authorization model is specified in `11-security-and-permissions.md`.

---

# 10. Pages API

Pages represent general website content.

Examples:

- About the Church
- Contact
- Vision
- Beliefs
- Ministries overview
- Other editorial pages

---

## 10.1 Public Page by Slug

```http
GET /api/v1/pages/:slug
```

Only published pages are returned.

Example:

```http
GET /api/v1/pages/about
```

---

## 10.2 Public Page Listing

```http
GET /api/v1/pages
```

Only pages intended for public discovery are returned.

Supported parameters may include:

```text
search
page
limit
```

---

## 10.3 Administrative Page Listing

```http
GET /api/v1/admin/pages
```

Returns pages regardless of publication state according to the authenticated user's permissions.

Supported filters:

```text
search
status
author
createdFrom
createdTo
updatedFrom
updatedTo
page
limit
sort
order
```

---

## 10.4 Create Page

```http
POST /api/v1/admin/pages
```

Example:

```json
{
  "title": "Nuestra Iglesia",
  "slug": "nuestra-iglesia",
  "excerpt": "Conoce nuestra identidad y propósito.",
  "content": {},
  "status": "DRAFT",
  "seo": {
    "title": "Nuestra Iglesia | UCI",
    "description": "Conoce la identidad y propósito de UCI."
  }
}
```

---

## 10.5 Update Page

```http
PATCH /api/v1/admin/pages/:id
```

---

## 10.6 Publish Page

```http
POST /api/v1/admin/pages/:id/publish
```

---

## 10.7 Archive Page

```http
POST /api/v1/admin/pages/:id/archive
```

---

# 11. Sermons API

Sermons are a primary content type of the UCI platform.

A sermon may contain:

- title;
- slug;
- preacher;
- date;
- main scripture;
- description;
- rich content;
- video;
- audio;
- sermon notes;
- cover image;
- additional media;
- SEO metadata;
- related sermons.

---

## 11.1 Public Sermon Listing

```http
GET /api/v1/sermons
```

Example:

```http
GET /api/v1/sermons?page=1&limit=12
```

Supported filters:

```text
page
limit
search
preacher
from
to
sort
order
```

Default public ordering:

```text
date DESC
```

---

## 11.2 Public Sermon

```http
GET /api/v1/sermons/:slug
```

Only published sermons are returned.

Example:

```http
GET /api/v1/sermons/obediencia-y-fe
```

---

## 11.3 Administrative Sermon Listing

```http
GET /api/v1/admin/sermons
```

Additional filters:

```text
status
author
preacher
publishedFrom
publishedTo
createdFrom
createdTo
```

---

## 11.4 Create Sermon

```http
POST /api/v1/admin/sermons
```

Example:

```json
{
  "title": "Obediencia y fe",
  "slug": "obediencia-y-fe",
  "preacher": {
    "name": "Nombre del predicador"
  },
  "sermonDate": "2026-10-04",
  "scripture": {
    "reference": "Juan 14:15",
    "text": "..."
  },
  "description": "Descripción del mensaje.",
  "content": {},
  "media": {
    "coverImageId": "uuid",
    "video": {
      "provider": "YOUTUBE",
      "videoId": "abc123"
    }
  },
  "status": "DRAFT"
}
```

---

## 11.5 Update Sermon

```http
PATCH /api/v1/admin/sermons/:id
```

---

## 11.6 Publish Sermon

```http
POST /api/v1/admin/sermons/:id/publish
```

---

## 11.7 Schedule Sermon

```http
POST /api/v1/admin/sermons/:id/schedule
```

Example:

```json
{
  "publishAt": "2026-10-11T08:00:00-05:00"
}
```

---

## 11.8 Archive Sermon

```http
POST /api/v1/admin/sermons/:id/archive
```

---

## 11.9 Sermon Revisions

```http
GET /api/v1/admin/sermons/:id/revisions
```

```http
GET /api/v1/admin/sermons/:id/revisions/:revisionId
```

Restoring a previous revision:

```http
POST /api/v1/admin/sermons/:id/revisions/:revisionId/restore
```

Restoration creates a new revision rather than destroying historical data.

---

# 12. Events API

Events represent church activities and scheduled activities.

Examples:

- services;
- conferences;
- special meetings;
- youth activities;
- workshops;
- outreach activities.

---

## 12.1 Public Events

```http
GET /api/v1/events
```

Supported filters:

```text
from
to
category
page
limit
```

Default ordering:

```text
startDateTime ASC
```

---

## 12.2 Public Event

```http
GET /api/v1/events/:slug
```

---

## 12.3 Administrative Events

```http
GET /api/v1/admin/events
POST /api/v1/admin/events
GET /api/v1/admin/events/:id
PATCH /api/v1/admin/events/:id
POST /api/v1/admin/events/:id/publish
POST /api/v1/admin/events/:id/archive
```

Example creation payload:

```json
{
  "title": "Culto Dominical",
  "slug": "culto-dominical",
  "description": "Servicio principal de la iglesia.",
  "startDateTime": "2026-10-11T09:00:00-05:00",
  "endDateTime": "2026-10-11T11:00:00-05:00",
  "location": {
    "name": "Auditorio UCI"
  },
  "coverImageId": "uuid",
  "status": "DRAFT"
}
```

---

# 13. Ministries API

Ministries represent church ministries and areas of service.

A ministry may contain:

- name;
- slug;
- description;
- leader/responsible person;
- schedule;
- contact information;
- social links;
- cover image;
- status;
- SEO metadata.

---

## 13.1 Public Ministries

```http
GET /api/v1/ministries
```

---

## 13.2 Public Ministry

```http
GET /api/v1/ministries/:slug
```

---

## 13.3 Administrative Ministries

```http
GET /api/v1/admin/ministries
POST /api/v1/admin/ministries
GET /api/v1/admin/ministries/:id
PATCH /api/v1/admin/ministries/:id
POST /api/v1/admin/ministries/:id/publish
POST /api/v1/admin/ministries/:id/archive
```

---

# 14. Navigation API

Navigation is managed through the CMS.

The API must support:

- navigation groups;
- menu items;
- internal links;
- external links;
- ordering;
- nested items where required;
- visibility state.

---

## 14.1 Public Navigation

```http
GET /api/v1/navigation
```

Example:

```http
GET /api/v1/navigation?location=HEADER
```

Public responses contain only visible navigation items.

---

## 14.2 Administrative Navigation

```http
GET /api/v1/admin/navigation
POST /api/v1/admin/navigation
PATCH /api/v1/admin/navigation/:id
DELETE /api/v1/admin/navigation/:id
```

Ordering changes may use a dedicated endpoint:

```http
POST /api/v1/admin/navigation/reorder
```

Example:

```json
{
  "items": [
    {
      "id": "uuid-1",
      "position": 1
    },
    {
      "id": "uuid-2",
      "position": 2
    }
  ]
}
```

---

# 15. Media API

Media is a first-class subsystem of the CMS.

The API must distinguish between:

- media metadata;
- physical storage;
- media references;
- external media.

PostgreSQL stores metadata and references, not binary media files.

---

## 15.1 Media Library

```http
GET /api/v1/admin/media
```

Supported parameters:

```text
page
limit
search
type
mimeType
folder
createdFrom
createdTo
sort
order
```

---

## 15.2 Media Metadata

```http
GET /api/v1/admin/media/:id
```

Response example:

```json
{
  "data": {
    "id": "uuid",
    "type": "IMAGE",
    "filename": "sermon-october.webp",
    "mimeType": "image/webp",
    "size": 245120,
    "width": 1600,
    "height": 900,
    "storageKey": "sermons/2026/10/sermon-october.webp",
    "url": "https://media.example.org/sermons/2026/10/sermon-october.webp",
    "alt": "Predicación del domingo",
    "title": "Predicación de octubre",
    "createdAt": "2026-10-04T15:00:00-05:00"
  }
}
```

---

## 15.3 Media Upload

```http
POST /api/v1/admin/media/upload
```

This endpoint accepts multipart form data.

The API must:

1. validate the uploaded file;
2. validate MIME type;
3. validate file size;
4. generate a safe storage key;
5. persist the binary through `MediaStorage`;
6. generate metadata;
7. persist metadata in PostgreSQL;
8. return the resulting media resource.

The API must not trust a user-provided filename as a storage path.

---

## 15.4 Update Media Metadata

```http
PATCH /api/v1/admin/media/:id
```

Example:

```json
{
  "alt": "Predicación sobre obediencia",
  "title": "Obediencia",
  "description": "Imagen asociada al sermón."
}
```

---

## 15.5 Delete Media

```http
DELETE /api/v1/admin/media/:id
```

Deletion must verify whether the media asset is referenced by published or draft content.

The API should prevent destructive deletion when active references exist unless the operation explicitly supports replacement or forced deletion under the appropriate permission.

---

## 15.6 Media References

```http
GET /api/v1/admin/media/:id/references
```

This endpoint identifies content currently using the asset.

Example:

```json
{
  "data": {
    "mediaId": "uuid",
    "references": [
      {
        "type": "SERMON",
        "id": "uuid",
        "title": "Obediencia y fe"
      }
    ]
  }
}
```

---

# 16. External Media API

External video must not be uploaded to the UCI server.

For YouTube:

```json
{
  "provider": "YOUTUBE",
  "videoId": "abc123",
  "url": "https://www.youtube.com/watch?v=abc123"
}
```

The API may validate provider identifiers and normalize URLs.

The application stores the external media reference, not the video binary.

---

# 17. Site Settings API

Global website configuration is exposed through:

```text
/api/v1/settings
```

Public settings may include:

- church name;
- logo;
- contact information;
- address;
- phone;
- email;
- WhatsApp;
- social networks;
- service schedules;
- public map information;
- default SEO configuration.

---

## 17.1 Public Settings

```http
GET /api/v1/settings/public
```

Only explicitly public settings are returned.

---

## 17.2 Administrative Settings

```http
GET /api/v1/admin/settings
PATCH /api/v1/admin/settings
```

Sensitive administrative configuration must never be included in the public endpoint.

---

# 18. SEO API

SEO metadata is associated primarily with content resources.

Administrative SEO configuration may be accessed through:

```http
GET /api/v1/admin/seo
PATCH /api/v1/admin/seo
```

The API may expose:

- title;
- meta description;
- canonical URL;
- Open Graph title;
- Open Graph description;
- Open Graph image;
- robots directives;
- structured-data configuration where applicable.

Individual content resources may contain:

```json
{
  "seo": {
    "title": "Obediencia y fe | UCI",
    "description": "Mensaje predicado en UCI.",
    "canonicalUrl": null,
    "ogImageId": "uuid"
  }
}
```

The detailed SEO architecture is defined in `10-seo-and-content-discovery.md`.

---

# 19. Contact API

Public contact forms are submitted through:

```http
POST /api/v1/contact
```

Example:

```json
{
  "name": "Juan Pérez",
  "email": "juan@example.com",
  "subject": "Información",
  "message": "Quisiera conocer los horarios."
}
```

The API must validate:

- required fields;
- email format;
- message length;
- abuse/rate limits.

Contact submissions may be persisted or forwarded to the configured notification mechanism according to the final implementation.

The endpoint must not expose internal contact records publicly.

---

# 20. Search API

Public content search:

```http
GET /api/v1/search
```

Example:

```http
GET /api/v1/search?q=obediencia&page=1&limit=10
```

Search may include:

```text
sermons
events
ministries
pages
```

The response must identify the content type.

Example:

```json
{
  "data": [
    {
      "type": "SERMON",
      "id": "uuid",
      "title": "Obediencia y fe",
      "slug": "obediencia-y-fe",
      "excerpt": "..."
    },
    {
      "type": "PAGE",
      "id": "uuid",
      "title": "Nuestra Iglesia",
      "slug": "nuestra-iglesia",
      "excerpt": "..."
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 2,
    "totalPages": 1
  }
}
```

Only public content is searchable through the public search endpoint.

---

# 21. Audit API

Audit records are administrative data.

```http
GET /api/v1/admin/audit
```

Supported filters:

```text
user
action
resource
resourceId
from
to
page
limit
```

Example response:

```json
{
  "data": [
    {
      "id": "uuid",
      "action": "CONTENT_PUBLISHED",
      "resource": "SERMON",
      "resourceId": "uuid",
      "user": {
        "id": "uuid",
        "name": "Administrator"
      },
      "createdAt": "2026-10-04T15:30:00-05:00"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

Audit records are immutable through the normal API.

---

# 22. Content Lifecycle API

Editorial content follows the lifecycle established by the architecture.

Initial states:

```text
DRAFT
PUBLISHED
ARCHIVED
```

Future workflow states may include:

```text
REVIEW
REJECTED
SCHEDULED
```

The API must enforce valid state transitions server-side.

Clients must not be allowed to arbitrarily change lifecycle state through a generic `PATCH` operation when that change represents a business action.

For example:

```text
PATCH /sermons/:id
```

must not be used to bypass publication rules.

Instead:

```text
POST /sermons/:id/publish
POST /sermons/:id/schedule
POST /sermons/:id/archive
```

represent explicit business operations.

---

# 23. Publishing Contract

Publishing is a server-side business operation.

A publication request must:

1. verify authentication;
2. verify the required permission;
3. validate the content;
4. validate required SEO fields where applicable;
5. validate required media references;
6. create the publication/revision record;
7. update publication state;
8. record the action in the audit log.

The public API must never expose content before it is officially published.

---

# 24. Preview API

Authenticated editors may preview unpublished content.

Example:

```http
GET /api/v1/admin/sermons/:id/preview
```

Preview responses may contain:

```text
DRAFT
SCHEDULED
REVIEW
```

content depending on the user's permissions.

Preview functionality must not accidentally make unpublished content available through the normal public endpoint.

---

# 25. Pagination

Collection endpoints must use a consistent pagination contract.

Query parameters:

```text
page
limit
```

Example:

```http
GET /api/v1/sermons?page=2&limit=12
```

Response:

```json
{
  "data": [],
  "meta": {
    "page": 2,
    "limit": 12,
    "total": 45,
    "totalPages": 4
  }
}
```

Default:

```text
page = 1
```

The API must define a reasonable maximum `limit` to prevent excessive queries.

---

# 26. Sorting

Where supported:

```text
sort
order
```

Example:

```http
GET /api/v1/sermons?sort=sermonDate&order=desc
```

The API must expose only approved sortable fields.

Clients must not be able to inject arbitrary SQL expressions through sorting parameters.

---

# 27. Filtering

Filters must use explicit resource-specific parameters.

Examples:

```text
status
category
preacher
from
to
publishedFrom
publishedTo
```

Unknown or unsupported filter fields should be rejected or ignored according to the endpoint contract, but must never be translated directly into database queries.

---

# 28. Search

Search parameters use:

```text
search
```

or:

```text
q
```

depending on the endpoint.

For resource collections:

```text
search
```

is preferred.

For global search:

```text
q
```

is preferred.

Search must be implemented using parameterized queries.

---

# 29. Standard Success Response

Single resources:

```json
{
  "data": {
    "id": "uuid",
    "title": "..."
  }
}
```

Collections:

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 0,
    "totalPages": 0
  }
}
```

Operations that return no content:

```http
204 No Content
```

---

# 30. Standard Error Response

All API errors should follow a consistent structure.

Example:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request contains invalid data.",
    "details": [
      {
        "field": "title",
        "message": "Title is required."
      }
    ]
  }
}
```

The `code` is intended for programmatic handling.

The `message` is intended to be human-readable.

Internal implementation details must never be exposed.

---

# 31. Standard HTTP Status Codes

The API uses conventional HTTP status codes.

```text
200 OK
201 Created
204 No Content

400 Bad Request
401 Unauthorized
403 Forbidden
404 Not Found
409 Conflict
422 Unprocessable Entity
429 Too Many Requests

500 Internal Server Error
503 Service Unavailable
```

Typical use:

### 400

Malformed request.

### 401

Authentication required or invalid session.

### 403

Authenticated user lacks permission.

### 404

Resource does not exist or is not publicly available.

### 409

Business conflict.

Example:

```text
duplicate slug
```

### 422

Structurally valid request with invalid business data.

### 429

Rate limit exceeded.

### 500

Unexpected server-side failure.

---

# 32. Resource Not Found Behavior

Public endpoints must avoid leaking information about unpublished resources.

For example:

```http
GET /api/v1/sermons/private-sermon
```

should return:

```http
404 Not Found
```

rather than revealing that a draft sermon exists.

Administrative endpoints may distinguish between:

```text
resource does not exist
```

and:

```text
resource exists but access is forbidden
```

according to the security policy.

---

# 33. Slug Contract

Publicly addressable resources use unique slugs.

Slugs must:

- be URL-safe;
- be normalized;
- be unique within their resource scope;
- remain stable unless explicitly changed;
- not contain arbitrary executable content.

Example:

```text
obediencia-y-fe
```

If a slug is changed, the application should consider redirect/history support to prevent broken indexed URLs.

---

# 34. UUIDs and Internal Identifiers

Public API resources use stable identifiers.

The preferred internal identifier format is UUID.

Example:

```text
550e8400-e29b-41d4-a716-446655440000
```

UUIDs must not be generated by clients unless explicitly required by a future integration.

The API is responsible for identifier generation.

---

# 35. Date and Time Contract

All timestamps exchanged through the API use ISO 8601.

Example:

```text
2026-10-11T09:00:00-05:00
```

Dates without time use:

```text
YYYY-MM-DD
```

Example:

```text
2026-10-11
```

The API must distinguish between:

- date-only values;
- local event times;
- absolute timestamps.

The application timezone configuration must be centralized and must not be inferred independently by each frontend component.

---

# 36. Validation

Validation occurs at the API boundary.

The backend must validate:

- request body;
- query parameters;
- route parameters;
- authentication state;
- authorization;
- business rules;
- resource relationships.

Frontend validation improves user experience but is never considered a security boundary.

---

# 37. Business Rule Enforcement

Business rules must be enforced server-side.

Examples:

- a sermon cannot be published without required content;
- an event cannot be published with an invalid date range;
- a deleted media asset cannot remain referenced by published content;
- an editor cannot publish content without the required permission;
- a scheduled publication must have a valid future timestamp;
- a user cannot disable the final active administrator without an appropriate safeguard.

The exact authorization and security rules are defined in `11-security-and-permissions.md`.

---

# 38. Optimistic Concurrency

Administrative content updates should support protection against accidental overwrites.

Where appropriate, the API may use:

```text
updatedAt
```

or an explicit revision/version number.

Example request:

```json
{
  "title": "Nuevo título",
  "version": 4
}
```

If the server has already advanced the resource:

```http
409 Conflict
```

This prevents one editor from silently overwriting another editor's recent changes.

---

# 39. Idempotency

Operations that may be retried by clients should be designed to avoid unintended duplication.

Particularly relevant operations include:

- media uploads;
- publication;
- scheduling;
- external integration synchronization.

Where necessary, an idempotency mechanism may be introduced for selected endpoints.

The initial API should not require idempotency keys on every request.

---

# 40. Rate Limiting

Rate limiting is required for publicly exposed endpoints that can be abused.

Particularly:

```text
POST /api/v1/auth/login
POST /api/v1/contact
GET /api/v1/search
```

Administrative APIs should also have reasonable protection against abusive automated requests.

Rate limiting must be implemented at the application/reverse-proxy architecture level without changing the public API contract.

---

# 41. CORS

The API should use a restrictive CORS policy.

The public website and administrative interface should be treated as trusted application origins.

Credentials must be enabled only where required by the authentication model.

Wildcard origins must not be used in production for authenticated requests.

---

# 42. Cookies and Sessions

Authentication uses secure HTTP-only cookies.

Production cookies should use:

```text
HttpOnly
Secure
SameSite
```

with appropriate domain/path configuration.

The session mechanism must support:

- expiration;
- logout;
- invalidation;
- server-side verification;
- protection against session fixation.

The exact implementation belongs to the authentication module.

---

# 43. API Security Boundaries

The API must never trust:

- client-provided roles;
- client-provided permissions;
- hidden frontend fields;
- frontend route protection;
- client-provided publication state;
- client-provided audit information;
- client-provided storage paths.

All security-sensitive decisions occur on the server.

---

# 44. API and Media Storage Boundary

The API owns media metadata and lifecycle.

The `MediaStorage` abstraction owns physical storage.

Conceptually:

```text
Admin Panel
    │
    ▼
Media API
    │
    ├── PostgreSQL
    │      └── metadata/reference
    │
    └── MediaStorage
           └── binary file
```

The API must not couple domain logic directly to the physical filesystem.

This allows the initial Oracle VPS storage strategy to be replaced later by:

```text
Cloudflare R2
S3
S3-compatible storage
Cloudinary
```

without redesigning the CMS API.

---

# 45. API and External Video Boundary

Video content remains external.

For YouTube:

```text
CMS
 │
 ▼
API
 │
 └── provider = YOUTUBE
     videoId = ...
```

The API does not download or proxy YouTube video binaries.

The public frontend resolves the external media reference into the appropriate embed/player representation.

---

# 46. API and Astro Public Frontend

Astro consumes public endpoints to obtain dynamic content such as:

- latest sermons;
- sermon detail;
- upcoming events;
- ministries;
- pages;
- site settings;
- navigation;
- public search.

The public frontend must never require administrative credentials.

Public endpoints must return sufficient data for:

- SEO;
- server-side rendering;
- metadata generation;
- structured data;
- content pages.

---

# 47. API and React Admin Panel

The `/panel` application consumes administrative endpoints.

Examples:

```text
/auth/me
/admin/sermons
/admin/events
/admin/pages
/admin/media
/admin/users
/admin/settings
/admin/audit
```

The admin frontend is responsible for presentation and interaction.

The backend remains responsible for:

- authorization;
- validation;
- business rules;
- persistence;
- publication;
- scheduling;
- auditability.

---

# 48. API Contract and Shared Types

The project may maintain shared API types under:

```text
src/shared/
```

Shared types may include:

```text
API response types
API error types
enum definitions
content status types
media types
pagination types
```

Shared types must not expose database-specific ORM types directly.

The API contract is the source of truth for communication between frontend and backend.

---

# 49. API Documentation

The API should provide machine-readable documentation using OpenAPI.

The documentation should describe:

- endpoints;
- methods;
- parameters;
- request schemas;
- response schemas;
- authentication;
- error responses;
- resource models.

The OpenAPI specification should remain synchronized with the actual API contract.

Interactive API documentation may be exposed only in appropriate environments or protected administrative/development contexts.

---

# 50. API Naming Conventions

Use plural resource names:

```text
/sermons
/events
/ministries
/pages
/media
/users
```

Use explicit action endpoints for business operations:

```text
/:id/publish
/:id/archive
/:id/schedule
/:id/restore
```

Avoid RPC-style endpoint naming such as:

```text
/createSermon
/updateSermon
/publishSermon
```

---

# 51. Administrative Namespace

Administrative collection endpoints should be explicitly separated where public and administrative behavior differs.

Preferred structure:

```text
/api/v1/sermons
/api/v1/admin/sermons
```

This prevents ambiguity between:

- public content retrieval;
- administrative content management.

The same principle applies to:

```text
pages
events
ministries
media
settings
users
audit
navigation
```

---

# 52. API Resource Matrix

| Resource | Public Read | Admin Read | Admin Write | Publish/Schedule | Audit |
|---|---:|---:|---:|---:|---:|
| Pages | Yes | Yes | Yes | Yes | Yes |
| Sermons | Yes | Yes | Yes | Yes | Yes |
| Events | Yes | Yes | Yes | Yes | Yes |
| Ministries | Yes | Yes | Yes | Yes | Yes |
| Navigation | Yes | Yes | Yes | N/A | Yes |
| Media | Public references only | Yes | Yes | N/A | Yes |
| Users | No | Yes | Yes | N/A | Yes |
| Settings | Public subset | Yes | Yes | N/A | Yes |
| SEO | Rendered public metadata | Yes | Yes | N/A | Yes |
| Audit | No | Yes | No | N/A | N/A |
| Contact | Submit | Yes, if persisted | Controlled | N/A | Yes |

---

# 53. API Endpoint Summary

## Authentication

```text
POST   /api/v1/auth/login
POST   /api/v1/auth/logout
GET    /api/v1/auth/me
```

## Public Content

```text
GET    /api/v1/pages
GET    /api/v1/pages/:slug

GET    /api/v1/sermons
GET    /api/v1/sermons/:slug

GET    /api/v1/events
GET    /api/v1/events/:slug

GET    /api/v1/ministries
GET    /api/v1/ministries/:slug

GET    /api/v1/navigation
GET    /api/v1/settings/public

GET    /api/v1/search
POST   /api/v1/contact
```

## Administration

```text
GET    /api/v1/admin/pages
POST   /api/v1/admin/pages
GET    /api/v1/admin/pages/:id
PATCH  /api/v1/admin/pages/:id
POST   /api/v1/admin/pages/:id/publish
POST   /api/v1/admin/pages/:id/archive

GET    /api/v1/admin/sermons
POST   /api/v1/admin/sermons
GET    /api/v1/admin/sermons/:id
PATCH  /api/v1/admin/sermons/:id
POST   /api/v1/admin/sermons/:id/publish
POST   /api/v1/admin/sermons/:id/schedule
POST   /api/v1/admin/sermons/:id/archive
GET    /api/v1/admin/sermons/:id/revisions
GET    /api/v1/admin/sermons/:id/revisions/:revisionId
POST   /api/v1/admin/sermons/:id/revisions/:revisionId/restore
GET    /api/v1/admin/sermons/:id/preview

GET    /api/v1/admin/events
POST   /api/v1/admin/events
GET    /api/v1/admin/events/:id
PATCH  /api/v1/admin/events/:id
POST   /api/v1/admin/events/:id/publish
POST   /api/v1/admin/events/:id/archive

GET    /api/v1/admin/ministries
POST   /api/v1/admin/ministries
GET    /api/v1/admin/ministries/:id
PATCH  /api/v1/admin/ministries/:id
POST   /api/v1/admin/ministries/:id/publish
POST   /api/v1/admin/ministries/:id/archive

GET    /api/v1/admin/navigation
POST   /api/v1/admin/navigation
PATCH  /api/v1/admin/navigation/:id
DELETE /api/v1/admin/navigation/:id
POST   /api/v1/admin/navigation/reorder

GET    /api/v1/admin/media
POST   /api/v1/admin/media/upload
GET    /api/v1/admin/media/:id
PATCH  /api/v1/admin/media/:id
DELETE /api/v1/admin/media/:id
GET    /api/v1/admin/media/:id/references

GET    /api/v1/admin/users
POST   /api/v1/admin/users
GET    /api/v1/admin/users/:id
PATCH  /api/v1/admin/users/:id
POST   /api/v1/admin/users/:id/disable

GET    /api/v1/admin/settings
PATCH  /api/v1/admin/settings

GET    /api/v1/admin/seo
PATCH  /api/v1/admin/seo

GET    /api/v1/admin/audit
```

---

# 54. API Architectural Boundaries

The API must preserve the following dependency direction:

```text
HTTP Layer
    │
    ▼
Application / Use Cases
    │
    ▼
Domain
    │
    ▼
Infrastructure
```

HTTP controllers must not contain:

- complex business rules;
- direct SQL;
- filesystem logic;
- authorization bypasses;
- publication workflows.

The API layer translates HTTP requests into application use cases and application results into HTTP responses.

---

# 55. Persistence Boundary

The API must never expose ORM/database models as public contracts.

For example, the following pattern is prohibited:

```text
HTTP Request
    ↓
ORM Entity
    ↓
JSON.stringify(entity)
```

Instead:

```text
HTTP Request
    ↓
DTO / validation
    ↓
Use Case
    ↓
Domain
    ↓
Persistence
    ↓
Response DTO
```

This protects the API contract from changes in the persistence implementation.

---

# 56. Future API Evolution

The initial API version is:

```text
v1
```

Breaking changes require a new API version.

Examples of potentially breaking changes:

- removing response fields;
- changing field types;
- changing authentication semantics;
- changing URL semantics;
- changing required request fields;
- changing lifecycle behavior.

Non-breaking additions may remain within the current version when compatible.

The project should avoid unnecessary version proliferation.

---

# 57. API Source of Truth

The API specification, OpenAPI definition, validation schemas, and implementation must remain aligned.

The conceptual source of truth is:

```text
Business Requirements
        ↓
Architecture
        ↓
API Contract
        ↓
OpenAPI / Schemas
        ↓
Implementation
```

The API contract must not be derived accidentally from database tables.

---

# 58. Relationship With Other Specifications

This document defines the API contract at the application level.

It intentionally delegates detailed concerns to other specifications:

```text
01-product-requirements.md
    └── product and business requirements

02-architecture-technical-specs.md
    └── global technical architecture

08-api-spec.md
    └── HTTP API contract

09-admin-panel-spec.md
    └── administration experience

10-seo-and-content-discovery.md
    └── SEO and content discovery

11-security-and-permissions.md
    └── authentication, authorization and security

12-media-and-assets.md
    └── media architecture and asset management

13-responsive-and-accessibility.md
    └── responsive and accessibility requirements

14-deployment-and-environment.md
    └── environments and production deployment
```

No later document should redefine the fundamental API versioning, response model, authentication boundary, or resource naming conventions established here without explicitly documenting the architectural change.

---

# 59. Final API Model

The resulting API architecture is:

```text
                         ┌──────────────────────┐
                         │    Astro Website     │
                         │      Public UI       │
                         └──────────┬───────────┘
                                    │
                                    │ Public API
                                    ▼
┌────────────────────────────────────────────────────────┐
│                     Node.js API                        │
│                     /api/v1                             │
│                                                        │
│  Auth │ Pages │ Sermons │ Events │ Ministries         │
│  Media │ Navigation │ Settings │ SEO │ Search         │
│  Users │ Audit │ Contact                              │
│                                                        │
│             Application / Domain Layer                 │
└───────────────┬──────────────────────┬─────────────────┘
                │                      │
                ▼                      ▼
       ┌────────────────┐     ┌────────────────────┐
       │   PostgreSQL   │     │    MediaStorage    │
       │                │     │                    │
       │ Content        │     │ Images / Assets    │
       │ Users          │     │ VPS initially      │
       │ Revisions      │     │ R2/S3 later        │
       │ Metadata       │     │                    │
       └────────────────┘     └────────────────────┘
                ▲
                │
                │ Admin API
                │
       ┌────────┴─────────┐
       │   React /panel   │
       │   Advanced CMS   │
       └──────────────────┘
```

The API therefore acts as the **single application boundary** between UCI's public website, advanced CMS, persistence layer, media subsystem, and external integrations.

The architecture remains a **modular monolith**, with one Node.js API, one PostgreSQL database, one repository, and two principal interfaces, while preserving enough separation to evolve the platform without coupling the public website directly to the CMS internals.