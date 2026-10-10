# Security and Permissions

## 1. Purpose

This document defines the security model, permission system, authentication strategy, authorization boundaries, session management, auditability, data protection requirements, and security controls for the UCI website and CMS.

The goal is to provide a security foundation appropriate for a production church website with an advanced administrative CMS, while keeping the architecture extensible as the platform grows.

This specification complements:

- `02-architecture-technical-specs.md`
- `08-api-spec.md`
- `09-admin-panel-spec.md`
- `10-seo-and-content-discovery.md`
- `12-media-and-assets.md`

It does not redefine API contracts or the complete `/panel` user experience. Instead, it defines the security rules those components must follow.

---

## 2. Security Objectives

The platform must protect:

1. Administrative accounts.
2. Authentication credentials.
3. Administrative sessions.
4. Published and unpublished content.
5. Draft and preview content.
6. Media assets and their metadata.
7. Site configuration.
8. User and permission data.
9. Audit information.
10. Contact submissions and other potentially sensitive information.
11. Infrastructure and internal services.
12. The integrity of publication workflows.

Security must be treated as a cross-cutting concern rather than as a feature implemented only at the login screen.

---

## 3. Security Principles

### 3.1 Server-side authority

The backend is the ultimate authority for:

- authentication;
- authorization;
- permissions;
- content visibility;
- publication state;
- media access rules;
- administrative operations;
- destructive operations.

The frontend must never be considered a security boundary.

Hiding a button in React does not constitute authorization.

---

### 3.2 Least privilege

Users must receive only the permissions required to perform their responsibilities.

An `EDITOR` should not automatically receive administrative capabilities merely because the interface can technically display them.

---

### 3.3 Deny by default

Unknown or unauthenticated requests must not gain access to administrative functionality.

Authorization should follow this general rule:

```text
No authenticated identity
        ↓
No administrative access

Authenticated identity
        ↓
Explicit permission required
        ↓
Operation allowed
```

---

### 3.4 Defense in depth

Security should exist at multiple layers:

```text
Internet
   ↓
HTTPS / Caddy
   ↓
HTTP security controls
   ↓
Application
   ↓
Authentication
   ↓
Authorization
   ↓
Business rules
   ↓
Database
   ↓
Storage
```

A failure in one layer must not automatically expose the entire system.

---

### 3.5 Secure by default

New users, endpoints, resources, media objects, and administrative features must default to the safest reasonable state.

Examples:

- New content starts as `DRAFT`.
- New users receive no elevated permissions unless explicitly assigned.
- Preview content is not indexable.
- Uploaded files are not executable.
- Administrative routes require authentication.
- Destructive operations require explicit authorization.

---

## 4. Threat Model

The system should consider at least the following threat categories.

### 4.1 Credential attacks

Potential attacks include:

- brute-force login attempts;
- credential stuffing;
- password reuse;
- leaked credentials;
- automated login attacks.

Required mitigations include:

- password hashing;
- login rate limiting;
- secure sessions;
- generic authentication errors;
- account security monitoring;
- optional future MFA support.

---

### 4.2 Session attacks

Potential attacks include:

- session theft;
- session fixation;
- stolen cookies;
- CSRF;
- session replay.

Mitigations include:

- HTTP-only cookies;
- Secure cookies in production;
- SameSite protection;
- session rotation;
- expiration;
- server-side session invalidation;
- CSRF protection where required.

---

### 4.3 Authorization attacks

Potential attacks include:

- accessing admin endpoints directly;
- manipulating resource IDs;
- privilege escalation;
- modifying resources owned by another user;
- invoking hidden endpoints;
- bypassing UI restrictions.

All authorization checks must therefore occur server-side.

---

### 4.4 Content attacks

Potential attacks include:

- stored XSS through rich text;
- malicious HTML;
- malicious links;
- script injection;
- unsafe embeds;
- dangerous SVG content.

Rich content must be sanitized according to an explicit allowlist policy.

---

### 4.5 File upload attacks

Potential attacks include:

- executable uploads;
- malicious SVG;
- oversized files;
- malformed images;
- path traversal;
- content-type spoofing;
- decompression bombs;
- storage exhaustion.

The media subsystem must implement independent upload security controls.

Detailed media requirements are defined in `12-media-and-assets.md`.

---

### 4.6 Infrastructure attacks

Potential attacks include:

- exposed database ports;
- exposed internal services;
- leaked environment variables;
- compromised containers;
- unauthorized SSH access;
- vulnerable dependencies;
- misconfigured reverse proxy.

Production deployment must expose only services that are intentionally public.

---

## 5. Authentication

### 5.1 Authentication mechanism

The initial authentication mechanism must use server-managed sessions.

The browser receives a secure session cookie after successful authentication.

The frontend must not store authentication credentials in:

- `localStorage`;
- `sessionStorage`;
- URL parameters;
- client-managed JWT storage.

---

### 5.2 Login

The login flow is conceptually:

```text
POST /api/v1/auth/login
        ↓
Validate credentials
        ↓
Verify password hash
        ↓
Apply account/security rules
        ↓
Create authenticated session
        ↓
Set secure HTTP-only cookie
```

Authentication errors should not reveal whether a specific email or username exists.

Example:

```text
Invalid credentials.
```

rather than:

```text
User does not exist.
```

---

### 5.3 Password storage

Passwords must never be stored in plaintext.

Passwords must use a modern adaptive password hashing algorithm supported by the selected Node.js authentication/security stack.

Argon2id is the preferred option where available.

Password hashes must never be returned by the API.

---

### 5.4 Password policy

The system should enforce a reasonable password policy based primarily on password length and compromised-password resistance rather than arbitrary complexity rules.

The exact policy should be configurable without requiring a database redesign.

At minimum:

- minimum length;
- rejection of obviously compromised/common passwords;
- password confirmation during creation/change;
- secure password reset workflow if password recovery is implemented.

---

## 6. Session Management

### 6.1 Session characteristics

Sessions must be:

- server-side;
- random;
- unpredictable;
- revocable;
- time-limited;
- associated with a user;
- associated with creation and expiration timestamps.

The database may contain a session record such as:

```text
id
userId
createdAt
expiresAt
lastSeenAt
revokedAt
```

Additional security metadata may include:

```text
ipAddress
userAgent
```

when appropriate for security auditing.

---

### 6.2 Cookie configuration

Production authentication cookies should use:

```text
HttpOnly
Secure
SameSite=Lax
```

The exact `SameSite` policy may be adjusted if future integrations require cross-site behavior, but the least permissive valid configuration should be preferred.

Cookies must not contain plaintext credentials.

---

### 6.3 Session expiration

Sessions must expire.

The implementation should distinguish between:

- absolute session lifetime;
- inactivity timeout.

Example policy:

```text
Absolute lifetime: configurable
Idle timeout: configurable
```

Exact production values may be finalized during implementation and deployment hardening.

---

### 6.4 Session revocation

Administrators should be able to invalidate sessions when appropriate.

At minimum, all active sessions for a user must be invalidatable after:

- password reset;
- suspected account compromise;
- administrative account deactivation.

---

### 6.5 Session rotation

A new authenticated session must be generated after successful login.

The system must prevent session fixation.

---

## 7. Authorization Model

Authorization combines:

1. Authentication;
2. Role assignment;
3. Explicit permissions;
4. Resource/business rules.

The architecture should not rely exclusively on hardcoded role checks.

---

## 8. Roles

The initial roles are:

```text
ADMIN
EDITOR
```

### 8.1 ADMIN

`ADMIN` is intended for trusted users responsible for administration of the platform.

Potential capabilities include:

- manage users;
- manage roles and permissions;
- manage site settings;
- manage navigation;
- manage content;
- manage media;
- publish content;
- archive content;
- manage SEO configuration;
- view audit logs;
- perform administrative maintenance.

---

### 8.2 EDITOR

`EDITOR` is intended for editorial/content-management responsibilities.

Potential capabilities include:

- create content;
- edit content;
- manage drafts;
- manage sermons;
- manage events;
- manage ministries;
- manage pages;
- use the media library;
- prepare SEO metadata;
- preview content.

Publishing capabilities should be explicitly controlled by permission rather than assumed solely from the role name.

---

## 9. Permission Model

Permissions should use stable identifiers.

Example:

```text
users.read
users.create
users.update
users.disable

roles.read
roles.update

pages.read
pages.create
pages.update
pages.publish
pages.archive
pages.delete

sermons.read
sermons.create
sermons.update
sermons.publish
sermons.archive
sermons.delete

events.read
events.create
events.update
events.publish
events.archive
events.delete

ministries.read
ministries.create
ministries.update
ministries.publish
ministries.archive

media.read
media.upload
media.update
media.delete

navigation.read
navigation.update

seo.read
seo.update

settings.read
settings.update

audit.read
```

This is an initial vocabulary, not an exhaustive immutable list.

---

## 10. Permission Evaluation

The backend should evaluate authorization using a reusable authorization service/policy layer.

Conceptually:

```text
Request
   ↓
Authenticate
   ↓
Resolve user
   ↓
Resolve roles
   ↓
Resolve permissions
   ↓
Evaluate resource/business rules
   ↓
Allow / Deny
```

Authorization logic should not be duplicated independently across controllers.

---

## 11. Resource-Level Authorization

Permission alone may not always be sufficient.

Future resources may require rules such as:

```text
User has pages.update
AND
resource is editable by the user's scope
```

The architecture should therefore support resource-level policies even if the first release does not require complex multi-tenant ownership.

This prevents the permission model from becoming a limitation later.

---

## 12. Administrative API Protection

All `/api/v1/admin/...` endpoints require:

1. valid authenticated session;
2. appropriate permission;
3. applicable business-rule authorization.

Example:

```text
GET /api/v1/admin/sermons
```

requires a read permission.

```text
POST /api/v1/admin/sermons/:id/publish
```

requires a publish permission.

The API must never rely on `/panel` to enforce these rules.

---

## 13. Public API Security

Public endpoints must expose only information intentionally published for public consumption.

The public API must never return:

- password hashes;
- sessions;
- internal permissions;
- audit records;
- unpublished content;
- drafts;
- private media metadata;
- internal storage paths;
- infrastructure details.

---

## 14. Content Visibility

Content visibility must be evaluated server-side.

Typical states include:

```text
DRAFT
PUBLISHED
ARCHIVED
```

Future states may include:

```text
REVIEW
REJECTED
SCHEDULED
```

A draft must not become publicly accessible merely because a user knows its UUID or slug.

---

## 15. Preview Security

Preview URLs must not function as permanent public publication mechanisms.

Preview access should use:

- authenticated access; or
- short-lived, high-entropy preview tokens.

Preview responses must send:

```text
X-Robots-Tag: noindex, nofollow, noarchive
```

or equivalent page-level directives.

Preview content must not enter:

- public sitemap;
- search index;
- canonical URL graph;
- public RSS/feed;
- public content discovery APIs.

---

## 16. CSRF Protection

Because authentication uses cookies, CSRF must be explicitly considered.

State-changing requests must be protected through an appropriate combination of:

- SameSite cookies;
- origin/referrer validation where appropriate;
- CSRF tokens where required by the application architecture.

The chosen strategy must be consistent across the API.

---

## 17. CORS

CORS must be restrictive.

Production should explicitly define allowed origins.

The system must not use:

```text
Access-Control-Allow-Origin: *
```

for authenticated administrative APIs.

The public API may have broader read access if required, but credentials must not be exposed through permissive CORS configuration.

---

## 18. Rate Limiting

Rate limiting should be applied according to endpoint sensitivity.

Higher protection should be applied to:

- login;
- password reset;
- contact submission;
- preview token generation;
- media upload;
- search endpoints where abuse could become expensive.

Example conceptual policy:

```text
Authentication → strict
Administrative mutations → moderate
Public reads → higher threshold
Media upload → strict
```

Rate-limit responses should use:

```text
HTTP 429 Too Many Requests
```

where applicable.

---

## 19. Input Validation

Every API input must be validated server-side.

Validation applies to:

- path parameters;
- query parameters;
- JSON bodies;
- multipart metadata;
- identifiers;
- slugs;
- URLs;
- SEO fields;
- rich text structures;
- external media references.

Client-side validation improves UX but does not replace server validation.

---

## 20. Output Validation and Data Exposure

API responses should use explicit DTOs/view models rather than exposing database entities directly.

This prevents accidental exposure of:

- internal fields;
- security metadata;
- private identifiers;
- implementation details;
- future database columns.

---

## 21. Rich Text Security

The CMS may support structured rich content.

Rich content must be treated as untrusted input.

The system must sanitize:

- HTML;
- links;
- embeds;
- pasted content;
- imported markup.

Dangerous constructs such as arbitrary scripts must never be allowed.

The sanitization policy should use an allowlist rather than attempting to blacklist known attacks.

---

## 22. URL and Redirect Security

User-controlled URLs must be validated.

External URLs must not be blindly transformed into redirects.

The application must prevent:

- open redirects;
- `javascript:` URLs;
- malformed protocols;
- unexpected local file references.

Allowed protocols should normally include:

```text
https:
http:
```

with `https` preferred.

---

## 23. File Upload Security

File uploads must be considered untrusted.

The media subsystem must validate:

- file size;
- extension;
- MIME type;
- actual file signature;
- image decodability;
- dimensions;
- filename;
- storage path.

Files must never be saved using a user-provided filename as the physical storage identifier.

Detailed rules belong in:

```text
12-media-and-assets.md
```

---

## 24. Path Traversal Protection

User input must never directly construct filesystem paths.

The application must prevent patterns such as:

```text
../../
..\..\ 
```

and equivalent encoded representations.

Storage paths must be generated by the server.

---

## 25. Database Security

PostgreSQL must not be publicly exposed to the internet.

Production access should be limited to the application/network layer.

Database credentials must come from environment/secret configuration and never be committed to source control.

The application database user should receive only the privileges required by the application.

---

## 26. Secrets Management

Secrets must never be committed to Git.

Sensitive configuration includes:

- database credentials;
- session secrets;
- API keys;
- external service credentials;
- SMTP credentials;
- storage credentials.

Development values should use environment-specific configuration.

Production secrets must be supplied through secure server/environment configuration.

---

## 27. Environment Separation

At minimum:

```text
Development
Production
```

should be logically separated.

Production must never depend on development secrets, debug settings, or permissive CORS configuration.

---

## 28. Security Headers

Caddy/application responses should provide appropriate security headers.

The final policy should consider:

```text
Content-Security-Policy
Strict-Transport-Security
X-Content-Type-Options
Referrer-Policy
Permissions-Policy
```

Potentially:

```text
X-Frame-Options
```

when compatible with the required embedding behavior.

The CSP must be designed around actual application requirements rather than blindly copying a generic policy.

---

## 29. Content Security Policy

CSP should restrict:

- scripts;
- styles;
- frames;
- images;
- connections;
- fonts;
- media.

External services such as YouTube, analytics, maps, or future media providers must be explicitly included only when required.

CSP should be introduced carefully to avoid breaking legitimate public-site functionality.

---

## 30. Clickjacking Protection

Administrative interfaces should not be embeddable by untrusted origins.

The platform should use an appropriate CSP `frame-ancestors` policy.

---

## 31. Audit Logging

Security-sensitive and editorially significant operations must be auditable.

Audit records should capture at least:

```text
id
actorUserId
action
resourceType
resourceId
timestamp
metadata
```

Optional contextual information may include:

```text
ipAddress
userAgent
requestId
```

---

## 32. Audited Operations

At minimum, audit:

### Authentication

- successful login;
- failed login;
- logout;
- password change;
- password reset;
- session revocation.

### Users

- user creation;
- role changes;
- permission changes;
- account disable/enable.

### Content

- creation;
- updates;
- publication;
- scheduling;
- archival;
- deletion;
- revision restoration.

### Media

- upload;
- metadata changes;
- deletion.

### Configuration

- navigation changes;
- SEO configuration changes;
- site setting changes.

---

## 33. Audit Log Integrity

Audit records should be append-oriented.

Normal administrative users must not be able to arbitrarily modify or delete audit history.

If retention policies are introduced later, they must be explicit and auditable.

---

## 34. Request Correlation

Requests should support a correlation/request identifier.

Conceptually:

```text
requestId
```

should flow through:

```text
HTTP request
   ↓
application logs
   ↓
audit/event records where appropriate
```

This improves incident investigation.

---

## 35. Logging Policy

Logs must not contain:

- passwords;
- session cookies;
- authentication tokens;
- sensitive credentials;
- full personal data unnecessarily.

Errors should contain enough information for diagnosis without exposing secrets.

---

## 36. Error Handling

Production API errors must not reveal:

- stack traces;
- SQL statements;
- filesystem paths;
- environment variables;
- internal service topology.

The API should expose stable error codes as defined by `08-api-spec.md`.

---

## 37. Account Lifecycle

Users should support explicit states such as:

```text
ACTIVE
DISABLED
```

A disabled user must immediately lose administrative access.

Existing sessions should be invalidated when an account is disabled.

---

## 38. Permission Changes

Permission changes must take effect without requiring a user to log out manually.

Depending on the session architecture, permissions should be resolved dynamically or sessions should be invalidated after significant role changes.

---

## 39. Administrator Protection

Because `ADMIN` users have elevated privileges, administrative accounts should receive additional protection.

Future-compatible controls should include:

- MFA;
- security notifications;
- session/device management;
- login history;
- forced session revocation.

MFA is not required for the first release unless explicitly prioritized, but the authentication architecture must not prevent its addition later.

---

## 40. Password Recovery

If password recovery is implemented, the flow must use:

- short-lived reset tokens;
- one-time use;
- secure random generation;
- generic responses;
- session invalidation after successful reset.

Password reset tokens must never be stored as plaintext when avoidable; they should be stored in a securely verifiable representation.

---

## 41. Media Authorization Boundary

Media may have different visibility requirements.

The system must distinguish between:

```text
Public media
Administrative/private media
Preview-only media
Orphaned media
```

The public website must never gain access to private administrative assets merely because the physical storage is reachable.

The media architecture must therefore define public exposure separately from storage.

---

## 42. Backup Security

Backups may contain:

- database contents;
- user records;
- audit logs;
- content;
- media metadata;
- configuration.

Backups must be protected with access controls appropriate to their sensitivity.

Database backups must not be exposed through the public web server.

---

## 43. Dependency and Supply Chain Security

The project should minimize unnecessary dependencies.

Dependencies must be reviewed for:

- maintenance status;
- known vulnerabilities;
- transitive dependencies;
- unnecessary privileges.

Security advisories should be monitored as part of ongoing maintenance.

---

## 44. Deployment Security

Production deployment should follow these principles:

```text
Internet
   ↓
Caddy : 80/443
   ↓
UCI application
   ↓
PostgreSQL internal network
```

The following should not be directly exposed publicly:

- PostgreSQL;
- development servers;
- internal administration services;
- container management interfaces.

---

## 45. SSH and Server Access

Server administration should use:

- SSH keys;
- restricted access;
- non-root administrative practices where practical;
- firewall rules;
- minimal exposed ports.

Production server security is part of the application's security boundary.

---

## 46. Security Configuration

Security-sensitive configuration must be centralized rather than scattered throughout controllers.

Examples:

```text
session configuration
cookie configuration
rate limits
CORS origins
CSP
upload limits
password policy
preview lifetime
```

Configuration should be environment-aware.

---

## 47. Security Testing Boundaries

Security verification should cover at least:

### Authentication

- invalid credentials;
- expired sessions;
- revoked sessions;
- disabled users.

### Authorization

- missing permissions;
- insufficient permissions;
- direct endpoint access;
- privilege escalation attempts.

### Content

- draft access;
- preview access;
- publication boundaries.

### Media

- invalid files;
- oversized files;
- malicious filenames;
- unauthorized media operations.

### API

- malformed input;
- rate limiting;
- CORS;
- error leakage.

---

## 48. Security Non-Goals

The first release does not require:

- a zero-trust enterprise identity platform;
- multi-tenant authorization;
- complex attribute-based access control;
- federated enterprise SSO;
- mandatory MFA for every account;
- a dedicated SIEM.

However, the architecture must not make these future capabilities impossible.

---

## 49. Future Extensibility

The security architecture should allow future additions such as:

```text
MFA
SSO
OAuth/OIDC
more granular roles
resource scopes
security notifications
session/device management
advanced audit reporting
```

without replacing the entire authentication system.

---

## 50. Security Decision Summary

The UCI security architecture follows these core decisions:

| Area | Decision |
|---|---|
| Authentication | Server-managed sessions |
| Browser credential storage | HTTP-only secure cookie |
| Password storage | Adaptive password hashing |
| Authorization | RBAC + explicit permissions |
| Authority | Server-side |
| Admin API | Authenticated + permission-protected |
| Content visibility | Server-enforced |
| Preview | Short-lived/authenticated and non-indexable |
| CSRF | Explicitly protected |
| CORS | Restrictive |
| Rate limiting | Endpoint-sensitive |
| Audit | Security/editorial operations |
| Media | Independently secured |
| Database | Private/internal |
| Secrets | Environment/secure configuration |
| Production errors | No internal leakage |
| Future security | MFA/SSO-compatible |

---

## 51. Relationship to Other Specifications

### `08-api-spec.md`

Defines the API contract.

This document defines the security conditions under which those API operations may execute.

### `09-admin-panel-spec.md`

Defines the administrative experience.

This document defines why the interface must not be treated as the authorization boundary.

### `10-seo-and-content-discovery.md`

Defines public discoverability.

This document defines the security rules preventing drafts, previews, and private content from entering public discovery.

### `12-media-and-assets.md`

Defines media lifecycle and storage.

This document defines the security requirements media operations must satisfy.

---

## 52. Final Security Model

```text
                         INTERNET
                            │
                         HTTPS
                            │
                          Caddy
                            │
                  ┌─────────┴─────────┐
                  │                   │
             Public Site           /panel
                  │                   │
                  │              Secure Session
                  │                   │
                  └─────────┬─────────┘
                            │
                         API
                            │
                     Authentication
                            │
                      Authorization
                            │
                    Business Policies
                            │
              ┌─────────────┼─────────────┐
              │             │             │
           Content        Media        Settings
              │             │             │
              └─────────────┼─────────────┘
                            │
                       PostgreSQL
                            │
                     Audit / Logs
```

The essential security rule is:

> **The browser can request an operation, but only the server can authorize it.**