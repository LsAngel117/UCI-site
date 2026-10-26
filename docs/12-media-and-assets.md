# Media and Assets

## 1. Purpose

This document defines the media and asset architecture for the UCI website and CMS.

The system must support a production-oriented media workflow for:

- sermon images;
- sermon notes;
- event images;
- ministry images;
- page imagery;
- logos;
- icons;
- social sharing images;
- downloadable documents where required;
- future audio assets;
- externally hosted video references.

Media is treated as a first-class subsystem rather than as a collection of arbitrary file uploads.

The architecture must keep PostgreSQL lightweight, avoid storing binary media in the database, provide reusable assets through a Media Library, and allow storage migration without redesigning the CMS.

---

## 2. Core Principles

The media subsystem follows these principles:

1. PostgreSQL stores metadata and references, not binary files.
2. Physical storage is abstracted behind a storage service.
3. Media is reusable across content.
4. Uploads are validated and processed before publication.
5. Public URLs are independent from internal filesystem paths.
6. Media must support future migration to object storage.
7. The CMS must avoid duplicate uploads when an existing asset can be reused.
8. Image variants should be generated when useful.
9. External video remains external.
10. Deleting media must account for existing references.
11. Media metadata must support SEO and accessibility.
12. The architecture must support the large volume of weekly sermon assets without unnecessarily growing the database.

---

## 3. Media Categories

The system should support explicit media categories.

Initial categories:

```text
IMAGE
VIDEO_EXTERNAL
AUDIO
DOCUMENT
LOGO
ICON
```

The category is metadata and must not be treated as the sole security mechanism.

---

## 4. Media Use Cases

The platform must support media for:

### Sermons

- sermon cover image;
- sermon notes;
- supporting images;
- YouTube video;
- future audio.

### Events

- event cover;
- promotional graphics;
- supporting documents.

### Ministries

- ministry hero/cover;
- gallery/supporting imagery.

### Pages

- hero images;
- content images;
- Open Graph images.

### Site identity

- UCI logo;
- alternate logo;
- favicon;
- social identity assets;
- decorative graphics.

---

## 5. Storage Architecture

The CMS must use an abstraction between the application and physical storage.

Conceptually:

```text
MediaService
     │
     ▼
MediaStorage
     │
 ┌───┼─────────────────────────┐
 │   │                         │
VPS  S3-compatible            Cloudinary
filesystem   storage          or future provider
```

The domain/application layer must not depend directly on filesystem APIs.

---

## 6. Storage Adapter

A storage abstraction should provide operations conceptually equivalent to:

```text
put()
get()
delete()
exists()
getPublicUrl()
```

Additional operations may include:

```text
copy()
move()
getMetadata()
```

The exact interface may evolve during implementation.

---

## 7. Initial Storage Strategy

The first deployment may use the Oracle VPS filesystem.

The architecture should allow a structure conceptually similar to:

```text
media/
├── sermons/
│   └── YYYY/
│       └── MM/
├── events/
├── ministries/
├── pages/
├── site/
└── documents/
```

The exact production filesystem location is an environment configuration concern.

The application must not hardcode `/opt/...` paths into domain logic.

---

## 8. Future Object Storage

The storage abstraction must allow migration to:

- Cloudflare R2;
- Amazon S3;
- S3-compatible providers;
- Cloudinary;
- another managed object storage provider.

Migration must not require changing:

- sermon records;
- page records;
- event records;
- CMS workflows;
- public content models.

Only the storage adapter and deployment/configuration should need substantial changes.

---

## 9. Database Responsibilities

PostgreSQL stores metadata such as:

```text
id
storageKey
originalFilename
mimeType
extension
size
width
height
altText
caption
title
description
category
visibility
createdAt
updatedAt
```

Optional fields may include:

```text
checksum
duration
provider
externalId
metadata
```

The database must not store the binary contents of uploaded images or documents.

---

## 10. Media Identity

Every media asset should have a stable UUID.

Example:

```text
media.id
```

The UUID identifies the media record independently from its physical storage key.

This allows the storage location to change without changing content references.

---

## 11. Storage Key vs Public URL

The system must distinguish between:

```text
storageKey
```

and:

```text
publicUrl
```

Example conceptual model:

```text
storageKey:
sermons/2026/10/sermon-cover-8d3f.webp

publicUrl:
https://media.example.com/sermons/2026/10/sermon-cover-8d3f.webp
```

The database should preferably store the stable storage reference rather than baking infrastructure-specific URLs into domain logic.

Public URLs may be derived by the storage/public media layer.

---

## 12. Public Media Host

Production media should ideally be exposed through a dedicated media host or path rather than directly exposing the application's internal filesystem.

Conceptually:

```text
https://media.<domain>/
```

or:

```text
https://<domain>/media/
```

The final choice depends on deployment and CDN/storage strategy.

The important requirement is separation between:

```text
application internals
```

and:

```text
public media delivery
```

---

## 13. Media Library

The CMS must provide a reusable Media Library.

The Media Library should allow administrators/editors with appropriate permissions to:

- browse media;
- search;
- filter;
- sort;
- upload;
- edit metadata;
- inspect references;
- reuse existing assets;
- delete/archive assets when allowed.

The Media Library must not require uploading a new image every time content needs an image.

---

## 14. Media Picker

Content editors should be able to select existing media from a reusable picker.

Conceptually:

```text
Content Editor
      ↓
Select Media
      ↓
Media Library
      ↓
Choose existing asset
      ↓
Attach to content
```

This is especially important for:

- logos;
- recurring graphics;
- sermon notes;
- event assets;
- ministry imagery.

---

## 15. Media References

Content records should reference media by stable media ID.

Example:

```text
sermon.coverMediaId
event.coverMediaId
page.heroMediaId
```

For rich content, structured media references may use:

```text
mediaId
```

rather than embedding raw storage paths.

---

## 16. Reference Tracking

The system should be able to determine where a media asset is used.

Example:

```text
Media:
sermon-cover.webp

Referenced by:
- Sermon: "..."
- Open Graph image for Page: "..."
```

This prevents accidental deletion of actively used assets.

---

## 17. Deletion Policy

Media deletion must be reference-aware.

Before deleting an asset, the system should determine whether it is referenced.

If referenced:

```text
Deletion blocked
```

or:

```text
Deletion requires explicit replacement/removal workflow
```

The first implementation should prefer preventing destructive mistakes.

---

## 18. Orphaned Media

The system should be able to identify assets that are no longer referenced.

Potential states:

```text
IN_USE
UNREFERENCED
```

Unreferenced assets should not necessarily be deleted automatically.

A future cleanup workflow may allow administrators to review and remove them.

---

## 19. Soft Deletion

For important assets, soft deletion or archival may be preferable to immediate physical deletion.

Conceptually:

```text
ACTIVE
ARCHIVED
```

The exact model can be decided during implementation.

The objective is to prevent accidental irreversible removal.

---

## 20. Upload Workflow

The upload workflow should be:

```text
Select file
   ↓
Client-side validation
   ↓
Upload request
   ↓
Authentication / authorization
   ↓
Server-side validation
   ↓
File signature validation
   ↓
Security checks
   ↓
Image/document processing
   ↓
Storage
   ↓
Metadata persistence
   ↓
Media record available
```

A failed processing step must not leave inconsistent database/storage state.

---

## 21. Upload Security

Uploaded files are untrusted input.

The server must validate:

- file size;
- MIME type;
- extension;
- file signature;
- dimensions;
- file structure;
- filename;
- content type.

The extension alone must never determine whether a file is safe.

---

## 22. Filename Handling

Original filenames may be preserved as metadata for editorial convenience.

They must not become the canonical storage filename.

The storage key should be generated by the application.

Example:

```text
Original:
Notas Sermón Domingo.png

Storage:
sermons/2026/10/7b7f3b3e-notas-sermon.webp
```

---

## 23. File Size Limits

Upload limits must be configurable per category.

Conceptually:

```text
Images → moderate limit
Documents → higher limit
Audio → higher limit
```

The exact limits should be defined in deployment configuration after considering VPS capacity and expected usage.

Large files should not be allowed merely because the underlying filesystem can technically store them.

---

## 24. Image Formats

The platform should support common web image formats such as:

```text
JPEG
PNG
WebP
AVIF
```

SVG requires additional security restrictions because SVG may contain active content.

---

## 25. SVG Policy

SVG uploads should be treated as potentially active content.

If SVG support is enabled, uploaded SVGs must be sanitized before public exposure.

Alternatively, SVG uploads may be restricted to trusted administrative assets only.

Arbitrary user-provided SVG should not be served publicly without sanitization.

---

## 26. Image Processing

Where practical, uploaded images should be processed into web-optimized variants.

Possible transformations include:

- resizing;
- compression;
- format conversion;
- metadata normalization;
- thumbnail generation.

The original may be retained when useful for future processing.

---

## 27. Responsive Image Variants

The system should support responsive variants for major public-site images.

Example:

```text
small
medium
large
original
```

The exact widths should be determined by the public site's actual layout.

The CMS should not generate dozens of unnecessary variants.

---

## 28. Image Variant Model

Conceptually:

```text
Original Media
      │
      ├── thumbnail
      ├── small
      ├── medium
      └── large
```

Each variant may have:

```text
width
height
mimeType
storageKey
size
```

The parent media record remains the canonical identity.

---

## 29. Image Delivery

The public Astro frontend should use appropriate responsive image techniques.

Where possible:

```text
srcset
sizes
width
height
loading
decoding
```

should be generated according to the site's image architecture.

Large images should not be delivered to small mobile layouts unnecessarily.

---

## 30. Image Dimensions

Image metadata should store:

```text
width
height
```

This enables the frontend to reserve layout space and reduce layout shifts.

It also improves media selection and responsive rendering.

---

## 31. Alt Text

Images used as meaningful content must support editorial `altText`.

Alt text should describe the relevant content or function of the image.

Decorative images may use an empty alternative:

```text
alt=""
```

The CMS should make accessibility-conscious image metadata possible without forcing meaningless alt text.

---

## 32. Image Titles and Captions

Optional metadata may include:

```text
title
caption
description
```

These fields should not be automatically rendered everywhere.

The content model decides whether they are visible.

---

## 33. Image SEO

Important images should support:

- meaningful filenames where practical;
- descriptive alt text;
- appropriate dimensions;
- optimized formats;
- responsive delivery;
- relevant contextual placement.

Image metadata should support the broader SEO requirements defined in `10-seo-and-content-discovery.md`.

---

## 34. Open Graph Images

Pages, sermons, events, and other shareable content may define a dedicated social sharing image.

The media system should support a distinction between:

```text
content image
```

and:

```text
social preview image
```

An Open Graph image may reuse an existing media asset or use a dedicated asset.

---

## 35. Generated Social Images

The architecture should allow future automatic generation of social images for:

- sermons;
- events;
- pages.

This does not require implementation in the first release.

The media model should not prevent generated assets from being represented as normal media records.

---

## 36. Sermon Notes

Sermon notes are an important UCI-specific media workflow.

They may be represented as:

```text
IMAGE
```

assets and attached to a sermon.

The architecture must avoid storing sermon-note image binaries in PostgreSQL.

Example:

```text
Sermon
  │
  ├── Cover Image
  ├── Sermon Notes Image(s)
  └── YouTube Video
```

---

## 37. Weekly Sermon Media

The system must support recurring weekly media without creating unnecessary infrastructure overhead.

A typical workflow:

```text
Create Sermon
     ↓
Upload/reuse cover
     ↓
Upload sermon notes
     ↓
Attach YouTube video
     ↓
Add metadata
     ↓
Preview
     ↓
Publish
```

The CMS should make this workflow fast enough to repeat regularly.

---

## 38. External Video

Video should primarily remain externally hosted.

Initial provider:

```text
YouTube
```

The database should store references such as:

```text
provider
videoId
url
title
thumbnailUrl
```

where appropriate.

The actual video binary must not be uploaded to the UCI VPS for the initial architecture.

---

## 39. YouTube Security and Embedding

The public site should embed YouTube content only when appropriate.

The implementation should consider:

- privacy-enhanced YouTube domains where compatible;
- lazy loading;
- click-to-load strategies for performance;
- CSP frame restrictions;
- accessibility of video controls.

---

## 40. External Video Metadata

A sermon should not depend entirely on live YouTube API availability to render its basic page.

Important metadata should be stored locally when appropriate.

Example:

```text
provider: YOUTUBE
videoId: ...
title: ...
thumbnailUrl: ...
```

This provides resilience if an external API becomes temporarily unavailable.

---

## 41. Audio

Audio is not required as a primary media-hosting capability for the first release, but the architecture should support it.

Possible future flow:

```text
Sermon
   ↓
Audio Media
   ↓
Object Storage / External Provider
```

Audio must follow the same metadata/reference principles as other media.

---

## 42. Documents

Documents may include:

- PDFs;
- downloadable guides;
- event material;
- church resources.

Documents should be represented as media assets with metadata such as:

```text
filename
mimeType
size
downloadable
```

Public documents must have intentional visibility.

---

## 43. Public vs Private Media

Media should support a visibility concept such as:

```text
PUBLIC
PRIVATE
```

Future states may include:

```text
PREVIEW_ONLY
ARCHIVED
```

Public visibility must be explicit.

---

## 44. Private Media

Private media must not be publicly addressable simply because its storage key is predictable.

If private media is introduced, access should pass through an authorization-controlled delivery mechanism or signed/temporary URLs.

---

## 45. Cache Strategy

Public immutable media should be cache-friendly.

Versioned or content-addressed filenames/storage keys are preferred because they allow aggressive caching without stale-content problems.

Example:

```text
sermon-cover-<unique-id>.webp
```

or equivalent immutable storage identifiers.

---

## 46. Cache Headers

Public static media should use appropriate cache headers.

Conceptually:

```text
Cache-Control: public, max-age=..., immutable
```

may be used for immutable versioned assets.

Administrative/private assets require different policies.

---

## 47. Cache Invalidation

Replacing an image should not require complex global cache invalidation if media URLs are immutable.

Preferred strategy:

```text
new upload
   ↓
new storage key
   ↓
new public URL
```

rather than overwriting an existing public asset at the same URL.

---

## 48. Media Metadata Editing

Editors with appropriate permissions should be able to modify:

- title;
- alt text;
- caption;
- description;
- category;
- visibility.

Changing editorial metadata must not unnecessarily create a new physical file.

---

## 49. Media Replacement

The CMS should distinguish:

```text
Edit metadata
```

from:

```text
Replace binary asset
```

When replacing an asset, the system should preserve content references through the media record when possible.

---

## 50. Media Usage and Dependency Awareness

Before destructive operations, the CMS should display usage information.

Example:

```text
This image is currently used by:

- Sermon: "..."
- Event: "..."
- Page: "..."
```

This is especially important for shared media.

---

## 51. Duplicate Detection

The system may support duplicate detection using a checksum/hash.

Example:

```text
SHA-256
```

This can identify identical binary uploads.

Duplicate detection should assist editors but must not automatically delete or merge assets without explicit rules.

---

## 52. Media Search

Media Library search should support:

- filename;
- title;
- caption;
- description;
- category;
- MIME type;
- date;
- usage status.

Future search may include:

- dimensions;
- tags;
- checksum.

---

## 53. Media Filters

Useful filters include:

```text
Type
Category
Date
Used / unused
Public / private
```

For images:

```text
Orientation
Dimensions
```

may be added later.

---

## 54. Media Sorting

The Media Library should support sorting by:

- newest;
- oldest;
- name;
- size;
- recently updated.

The default should favor recent uploads because church media workflows are generally chronological.

---

## 55. Bulk Operations

The CMS may support bulk operations such as:

- archive;
- delete when safe;
- categorize;
- update visibility.

Bulk deletion must still respect reference protection.

---

## 56. Media API Boundary

The API defined in `08-api-spec.md` should expose media operations through explicit endpoints.

The API should not expose arbitrary filesystem operations.

Example conceptual operations:

```text
List media
Upload media
Get media
Update media metadata
Get media references
Delete/archive media
```

---

## 57. Multipart Uploads

Media uploads use:

```text
multipart/form-data
```

where appropriate.

The API must validate both:

```text
multipart metadata
```

and:

```text
binary content
```

---

## 58. Upload Transaction Integrity

The system must avoid this inconsistent state:

```text
Database record exists
but file does not exist
```

or:

```text
File exists
but database record does not exist
```

The implementation should define a failure/recovery strategy.

A practical workflow is:

```text
Validate
   ↓
Store temporary object
   ↓
Process
   ↓
Persist metadata
   ↓
Promote to final storage key
```

or an equivalent reliable strategy.

---

## 59. Temporary Uploads

Temporary uploads must have:

- controlled lifetime;
- isolated storage;
- cleanup.

Abandoned uploads must not accumulate indefinitely.

---

## 60. Cleanup Jobs

The media subsystem should support future scheduled cleanup for:

- abandoned temporary files;
- orphaned generated variants;
- stale processing artifacts.

Cleanup must not delete referenced media.

---

## 61. Storage Monitoring

Because the initial deployment may use the VPS filesystem, storage consumption must be monitored.

The system should provide enough operational visibility to identify:

```text
disk usage
media growth
temporary files
database growth
```

The media subsystem must not silently consume the entire VPS disk.

---

## 62. Backup Strategy

The media architecture must distinguish:

```text
Database backup
```

from:

```text
Media backup
```

A PostgreSQL backup does not contain uploaded images.

Production backup planning must therefore include the media storage layer.

---

## 63. Migration Strategy

A future migration from VPS filesystem to object storage should be possible through a controlled process:

```text
Inventory media
       ↓
Copy objects
       ↓
Validate checksums
       ↓
Update storage configuration
       ↓
Verify public URLs
       ↓
Retire old storage
```

Media IDs and content references should remain unchanged.

---

## 64. Media URL Stability

Whenever possible, public media URLs should remain stable.

However, the architecture should prioritize logical media identity over permanent dependence on a specific storage provider.

This distinction enables:

```text
Media ID
    ≠
Storage location
    ≠
Delivery provider
```

---

## 65. Asset Types Outside the CMS

Not every visual asset must be dynamically managed through the Media Library.

Static application assets may remain inside source control, including:

- UI icons;
- developer-controlled SVGs;
- code-level illustrations;
- immutable branding assets required by the application.

The distinction should be:

```text
CMS-managed content media
```

versus:

```text
application source assets
```

---

## 66. Public-Site Static Assets

Astro-managed static assets should be optimized according to the frontend architecture.

CMS media should not be copied into the source repository.

This prevents:

- repository growth;
- unnecessary Git history;
- deployment bloat;
- duplication between source and production storage.

---

## 67. Logo and Brand Assets

UCI brand assets should have controlled variants where needed:

```text
Primary logo
Light logo
Dark logo
Icon/mark
Favicon
Social preview
```

Brand assets should be centrally managed to avoid inconsistent versions across pages.

The existing blue/gold UCI visual identity must be preserved when creating future generated or animated assets.

---

## 68. Animated Logo Assets

The architecture may support future animated branding assets.

Potential formats include:

```text
WebM
MP4
GIF
Lottie
CSS/SVG animation
```

The preferred format should depend on the actual implementation and browser requirements.

The existing visual direction includes:

- subtle blue/gold illumination;
- restrained glow;
- gold ECG pulse;
- subtle Earth movement;
- orbital motion/light;
- approximately 5–8 second loop.

These are visual/design requirements rather than storage requirements.

---

## 69. Media Accessibility

Media workflows should support:

- alt text;
- captions;
- transcript references for video/audio where available;
- accessible download labels;
- meaningful document titles.

Accessibility behavior is detailed further in `13-responsive-and-accessibility.md`.

---

## 70. Media Performance

Media delivery must prioritize:

- appropriate dimensions;
- compression;
- responsive variants;
- modern formats;
- lazy loading for non-critical images;
- eager loading only when justified;
- stable dimensions;
- CDN/object-storage compatibility.

Hero/LCP images should receive special treatment.

---

## 71. Largest Contentful Paint

The media architecture should support identifying images likely to become LCP candidates.

For important hero imagery:

```text
lazy loading
```

should not be applied automatically.

The Astro frontend should decide based on page structure.

---

## 72. Decorative Media

Decorative assets should not introduce unnecessary accessibility or loading overhead.

Where appropriate:

```text
alt=""
```

and optimized loading should be used.

---

## 73. Media and SEO

The media subsystem supports SEO through:

- optimized image delivery;
- meaningful alt text;
- dimensions;
- stable URLs;
- Open Graph assets;
- structured media references;
- video metadata.

The complete SEO strategy remains defined in:

```text
10-seo-and-content-discovery.md
```

---

## 74. Media and Content Lifecycle

Media lifecycle should be independent but compatible with content lifecycle.

Example:

```text
Media uploaded
      ↓
Available to editor
      ↓
Attached to DRAFT
      ↓
Content published
      ↓
Media publicly referenced
```

If content is archived, the media must not automatically be deleted because another resource may still use it.

---

## 75. Media and Revisions

Content revisions should preserve references to the media used by that revision when required.

Restoring a sermon revision should not accidentally point to an unrelated replacement image.

Media IDs provide stable references for this purpose.

---

## 76. Media and Scheduled Content

Scheduled content may reference media before becoming public.

Therefore:

```text
Scheduled sermon
   +
private/pre-publication media
```

must not accidentally expose that media through public discovery.

Media visibility and content publication must be considered independently.

---

## 77. Media Access Control

The media subsystem must integrate with the permission system defined in `11-security-and-permissions.md`.

Example:

```text
media.read
media.upload
media.update
media.delete
```

The frontend may hide controls based on permissions, but the backend must enforce them.

---

## 78. Media Security Requirements

At minimum:

- never trust filenames;
- never trust extensions;
- validate actual file type;
- limit file size;
- sanitize SVG;
- prevent executable uploads;
- prevent path traversal;
- isolate temporary files;
- generate storage keys server-side;
- protect private media;
- restrict media API operations;
- audit destructive actions.

---

## 79. External Provider Abstraction

Although YouTube is the initial video provider, the media model should allow future providers.

Conceptually:

```text
ExternalMedia
├── YouTube
├── Vimeo
└── Future providers
```

The domain should not hardcode YouTube-specific assumptions into every sermon model.

---

## 80. Provider Metadata

External media may store:

```text
provider
externalId
url
title
thumbnailUrl
publishedAt
duration
```

Only fields needed by the application should be persisted.

Provider APIs must not become a required dependency for every public page render.

---

## 81. Thumbnail Strategy for External Video

For YouTube, the application may use a provider thumbnail URL or store a locally controlled thumbnail when appropriate.

A locally stored thumbnail may be useful if:

- provider availability is unreliable;
- the design requires a custom image;
- the sermon uses a branded thumbnail.

---

## 82. Media Lifecycle States

A useful conceptual state model is:

```text
UPLOADING
PROCESSING
READY
ARCHIVED
FAILED
```

Not every state must be persisted in the first implementation.

The important distinction is that media should not become publicly usable before processing succeeds.

---

## 83. Processing Failures

If image processing fails:

```text
Media = FAILED
```

rather than silently exposing a corrupted asset.

The CMS should provide enough information for an administrator to retry or replace the file.

---

## 84. Observability

Media operations should be observable through logs and metrics where appropriate.

Useful events include:

```text
media.upload.started
media.upload.completed
media.processing.failed
media.deleted
media.archived
```

The exact event infrastructure is optional for the first release.

---

## 85. Media Quotas

The first release does not require per-user or per-category quotas.

However, configuration should allow future limits such as:

```text
maximum file size
maximum storage allocation
maximum upload frequency
```

---

## 86. Media Retention

The system should not automatically delete old sermon assets merely because they are old.

Historical sermon content may remain valuable indefinitely.

Retention should therefore be driven by:

- editorial decisions;
- storage strategy;
- legal/operational requirements;
- explicit cleanup workflows.

---

## 87. Media Naming Strategy

Human-readable naming can help administrators, but storage identity must remain machine-safe.

Recommended conceptual pattern:

```text
<category>/<year>/<month>/<generated-id>.<extension>
```

This provides organization without depending on user-controlled filenames.

---

## 88. Media Metadata Model

A conceptual media entity:

```text
Media
├── id
├── storageKey
├── originalFilename
├── mimeType
├── extension
├── size
├── width
├── height
├── title
├── altText
├── caption
├── description
├── category
├── visibility
├── checksum
├── createdAt
└── updatedAt
```

Additional processing/provider fields may be added without changing the core concept.

---

## 89. Variant Model

A conceptual variant entity:

```text
MediaVariant
├── id
├── mediaId
├── variant
├── storageKey
├── mimeType
├── width
├── height
├── size
└── createdAt
```

Possible variant identifiers:

```text
thumbnail
small
medium
large
```

---

## 90. External Media Model

A conceptual external media entity:

```text
ExternalMedia
├── id
├── provider
├── externalId
├── url
├── title
├── thumbnailUrl
├── duration
├── createdAt
└── updatedAt
```

This may later become a generalized media relationship model.

---

## 91. API and Storage Separation

The architecture must preserve this boundary:

```text
HTTP/API
   ↓
Media Application Service
   ↓
Media Domain
   ↓
MediaStorage
   ↓
Filesystem / R2 / S3 / Provider
```

Controllers must not directly manipulate:

```text
fs.writeFile()
```

or equivalent storage operations.

---

## 92. Database and Storage Separation

The database answers:

> What is this media and where does it belong?

The storage layer answers:

> Where are the bytes?

Keeping those responsibilities separate is one of the most important architectural decisions in this subsystem.

---

## 93. Operational Disaster Recovery

If the VPS is lost, recovery must consider two independent components:

```text
PostgreSQL
+
Media storage
```

A database restore without media restoration is incomplete.

A media restoration without the corresponding database metadata is also incomplete.

---

## 94. Migration Safety

Before changing media providers:

1. inventory assets;
2. identify references;
3. copy assets;
4. validate checksums;
5. validate dimensions and MIME types;
6. test public URLs;
7. switch delivery configuration;
8. monitor;
9. retain old storage temporarily.

---

## 95. First Release Scope

The first production implementation should prioritize:

### Required

- Media Library;
- image uploads;
- secure validation;
- metadata;
- reusable media references;
- image variants where appropriate;
- public media delivery;
- reference tracking;
- deletion protection;
- YouTube references;
- sermon-note images;
- Open Graph images;
- storage abstraction;
- VPS filesystem adapter.

### Strongly recommended

- checksums;
- orphan detection;
- temporary upload cleanup;
- responsive image variants;
- media usage view.

### Future

- object storage;
- CDN;
- automated social image generation;
- audio hosting;
- advanced media transformations;
- automated media optimization pipeline.

---

## 96. Non-Goals

The first release does not require:

- hosting full-length video;
- building a video transcoding platform;
- replacing YouTube;
- a complete DAM platform;
- AI image tagging;
- facial recognition;
- automatic semantic image classification;
- complex multi-provider CDN orchestration.

The architecture should remain extensible without implementing unnecessary infrastructure prematurely.

---

## 97. Relationship to Other Specifications

### `08-api-spec.md`

Defines media-related API contracts.

This document defines the storage, processing, lifecycle, and architectural behavior behind those contracts.

### `09-admin-panel-spec.md`

Defines how editors interact with the Media Library.

This document defines what the Media Library must be capable of managing.

### `10-seo-and-content-discovery.md`

Defines image/video SEO and public discovery.

This document defines the media infrastructure supporting those requirements.

### `11-security-and-permissions.md`

Defines authentication and authorization.

This document defines how those security rules apply to media operations.

### `13-responsive-and-accessibility.md`

Will define the broader frontend behavior for responsive images, accessibility, and media presentation.

### `14-deployment-and-environment.md`

Will define the concrete production storage paths, environment variables, backup strategy, and deployment configuration.

---

## 98. Final Media Architecture

```text
                         CMS / PUBLIC SITE
                                │
                     ┌──────────┴──────────┐
                     │                     │
                  React                  Astro
                 /panel                Public Site
                     │                     │
                     └──────────┬──────────┘
                                │
                              API
                                │
                         Media Service
                                │
                     ┌──────────┴──────────┐
                     │                     │
                PostgreSQL            MediaStorage
                Metadata              Abstraction
                     │                     │
                     │          ┌──────────┼──────────┐
                     │          │          │          │
                     │        VPS        R2/S3    Future Provider
                     │      Storage
                     │
                     └──────────┬──────────┘
                                │
                         Media References
                                │
                  ┌─────────────┼─────────────┐
                  │             │             │
               Sermons        Events        Pages
                  │             │             │
              Notes/Video    Graphics       Images
```

The central architectural principle is:

> **UCI content references media logically; the application does not depend on where the media bytes are physically stored.**

This keeps PostgreSQL lean, makes the weekly sermon workflow practical, prevents media from becoming coupled to the Oracle VPS, and allows the platform to migrate to object storage or a CDN when growth justifies it.