# 09 — Admin Panel Specification

## 1. Purpose

This document defines the functional, structural, and UX requirements for the UCI administrative panel.

The administrative panel is the primary content-management interface for the church website.

It must provide a complete CMS experience for authorized church staff and content editors while keeping the complexity of the underlying technical architecture hidden from users.

The panel is accessed through:

```text
/panel
```

The application is implemented as a React-based administrative interface consuming the versioned Node.js API defined in `08-api-spec.md`.

---

# 2. Admin Panel Goals

The panel must allow authorized users to:

- manage website content;
- create and edit sermons;
- manage sermon notes and associated media;
- manage events;
- manage ministries;
- manage pages;
- manage navigation;
- manage images and other assets;
- manage SEO metadata;
- publish and schedule content;
- preview unpublished content;
- manage revisions;
- manage administrative users;
- manage permissions;
- manage site settings;
- review audit activity.

The panel must prioritize:

1. clarity;
2. speed;
3. editorial safety;
4. discoverability;
5. consistency;
6. accessibility;
7. responsive behavior;
8. protection against accidental destructive actions.

---

# 3. Admin Panel Architecture

The panel is a separate frontend interface within the same project.

Conceptually:

```text
UCI Project
│
├── Public Website
│   └── Astro
│
├── Admin Panel
│   └── React
│
├── API
│   └── Node.js / TypeScript
│
├── Database
│   └── PostgreSQL
│
└── Media Storage
    └── MediaStorage abstraction
```

The panel does not communicate directly with PostgreSQL.

```text
React Panel
     │
     ▼
REST API
     │
     ▼
Application Layer
     │
     ▼
PostgreSQL / MediaStorage
```

---

# 4. Access URL

The primary administrative route is:

```text
/panel
```

Authentication routes may include:

```text
/panel/login
/panel/forgot-password
/panel/reset-password
```

Authenticated sections should be grouped below:

```text
/panel/*
```

Unauthenticated users attempting to access protected routes must be redirected to the login screen.

---

# 5. Authentication Experience

The panel uses the API authentication system defined in `08-api-spec.md`.

Authentication is session-based and uses secure HTTP-only cookies.

The frontend must never store the authentication token in:

- localStorage;
- sessionStorage;
- URL parameters;
- ordinary JavaScript-readable cookies.

---

# 6. Login Screen

The login screen must be intentionally simple.

Required fields:

```text
Email
Password
```

Actions:

```text
Iniciar sesión
```

Optional:

```text
¿Olvidaste tu contraseña?
```

The interface should clearly communicate authentication errors without revealing sensitive information.

Example:

```text
No pudimos iniciar sesión con esas credenciales.
Verifica tu correo y contraseña.
```

The panel must not distinguish whether an email address exists in the system during password authentication failures.

---

# 7. Session Initialization

When the panel loads, it should verify the current session through:

```text
GET /api/v1/auth/me
```

The returned user context determines:

- identity;
- role;
- permissions;
- available navigation;
- accessible modules.

The frontend must treat the API as the authority.

Frontend route protection is a UX mechanism, not a security boundary.

---

# 8. Admin Layout

The authenticated panel uses a consistent application shell.

Conceptually:

```text
┌───────────────────────────────────────────────────────┐
│ Header                                                │
│ Logo │ Search │ Notifications │ User                 │
├───────────────┬───────────────────────────────────────┤
│               │                                       │
│ Sidebar       │ Main Content                          │
│               │                                       │
│ Dashboard     │                                       │
│ Sermons       │                                       │
│ Events        │                                       │
│ Ministries    │                                       │
│ Pages         │                                       │
│ Media         │                                       │
│ Navigation    │                                       │
│ SEO           │                                       │
│ Users         │                                       │
│ Settings      │                                       │
│ Audit         │                                       │
│               │                                       │
└───────────────┴───────────────────────────────────────┘
```

The exact visual styling follows the UCI visual system while remaining distinct from the public website when appropriate.

---

# 9. Admin Header

The header should provide:

- UCI branding;
- global search where implemented;
- notifications/status indicators where applicable;
- user identity;
- user menu;
- access to public website;
- logout.

The user menu may contain:

```text
Mi perfil
Configuración
Ver sitio
Cerrar sesión
```

Available options depend on permissions.

---

# 10. Sidebar Navigation

The sidebar is the primary navigation mechanism.

Initial navigation:

```text
Dashboard

Contenido
├── Sermones
├── Eventos
├── Ministerios
├── Páginas

Multimedia
└── Biblioteca multimedia

Sitio
├── Navegación
├── SEO
└── Configuración

Administración
├── Usuarios
├── Roles y permisos
└── Auditoría
```

The sidebar must be permission-aware.

A user without permission for a module should not see the corresponding navigation item.

---

# 11. Breadcrumbs

Complex administrative screens should provide breadcrumbs.

Example:

```text
Contenido
  /
Sermones
  /
Obediencia y fe
```

Breadcrumbs help users understand their current location and provide quick navigation.

---

# 12. Dashboard

The dashboard is the default authenticated route:

```text
/panel
```

It should provide a useful operational overview rather than merely displaying decorative statistics.

---

# 13. Dashboard Content

The dashboard may include:

### Content summary

```text
Sermones publicados
Borradores
Eventos próximos
Páginas publicadas
```

### Recent activity

Examples:

```text
Juan creó un sermón
María actualizó una página
Carlos publicó un evento
```

### Upcoming scheduled content

Example:

```text
Sermón "Fe y obediencia"
Programado para:
Domingo, 11 de octubre — 08:00
```

### Quick actions

```text
Nuevo sermón
Nuevo evento
Nueva página
Subir imagen
```

### Media overview

Examples:

```text
Imágenes recientes
Espacio utilizado
```

Storage statistics must be informational and must not expose infrastructure internals unnecessarily.

---

# 14. Dashboard Personalization

Future versions may allow dashboard widgets to be customized.

The initial implementation should not overcomplicate this.

The default dashboard should remain useful for the most common administrative workflows.

---

# 15. Content Management Philosophy

The CMS should treat content as editorial entities rather than database records.

Users should think in terms of:

```text
Crear sermón
Editar sermón
Guardar borrador
Vista previa
Publicar
Programar
Archivar
```

rather than:

```text
INSERT
UPDATE
DELETE
```

The interface must hide implementation details.

---

# 16. Content List Pages

All major content modules should follow a consistent list pattern.

Example:

```text
Sermones

[Buscar sermón...] [Filtros] [Nuevo sermón]

------------------------------------------------
Título             Estado       Fecha       ...
------------------------------------------------
Obediencia y fe    Publicado    04 Oct      ...
Fe y esperanza     Borrador     --          ...
```

The same pattern applies to:

- sermons;
- events;
- ministries;
- pages.

---

# 17. List Page Requirements

List pages should support where appropriate:

- search;
- filtering;
- sorting;
- pagination;
- status indicators;
- date information;
- author;
- quick actions;
- bulk selection.

The interface should preserve filters when navigating into an item and returning to the list where practical.

---

# 18. Search

Search must provide a clear input.

Example:

```text
Buscar por título...
```

Search should debounce requests where appropriate.

The panel must not send a request for every keystroke when unnecessary.

---

# 19. Filters

Filters should be contextual to each module.

For sermons:

```text
Estado
Predicador
Fecha
```

For events:

```text
Estado
Categoría
Fecha
```

For media:

```text
Tipo
Formato
Fecha
Carpeta
```

For pages:

```text
Estado
Autor
Fecha
```

Filters should be removable individually or reset as a group.

---

# 20. Pagination

The UI must use the pagination contract defined in `08-api-spec.md`.

It should provide:

- current page;
- total pages;
- next;
- previous;
- optional page-size selection.

Example:

```text
Mostrando 1–20 de 83

< Anterior    1  2  3  4    Siguiente >
```

---

# 21. Content Status Indicators

Status must be visually clear.

Initial states:

```text
Borrador
Publicado
Archivado
```

Future states:

```text
En revisión
Programado
Rechazado
```

Status indicators must not depend solely on color.

They should combine:

- text;
- iconography where useful;
- visual distinction.

---

# 22. Sermon Management

Sermons are one of the most important CMS entities.

The sermon editor must support:

```text
Información básica
Contenido
Predicador
Fecha
Escritura
Multimedia
SEO
Publicación
Revisiones
```

---

# 23. Sermon Editor

Recommended structure:

```text
Editar sermón

Título
Slug

Predicador
Fecha del sermón

Escritura principal

Descripción

Contenido del mensaje

Multimedia
├── Imagen principal
├── Video
├── Audio
└── Notas del sermón

SEO

Estado / Publicación
```

The exact layout may use tabs, sections, or a two-column editor depending on responsive behavior.

---

# 24. Rich Text Editor

The sermon content editor must support structured rich content.

Potential capabilities:

- headings;
- paragraphs;
- bold;
- italic;
- lists;
- links;
- quotes;
- scripture references;
- images;
- embedded media;
- dividers.

The editor should avoid generating unnecessarily complex HTML.

Content should use a controlled structured representation.

---

# 25. Sermon Notes

Sermon notes may include associated images or downloadable resources.

The CMS must treat these as media assets rather than storing binary data in PostgreSQL.

Editors should be able to:

```text
Seleccionar imagen existente
Subir nueva imagen
Reemplazar imagen
Eliminar referencia
```

The same media asset may be reused across multiple pieces of content.

---

# 26. Sermon Video

The editor must allow external video references.

Initial provider:

```text
YouTube
```

The UI may provide:

```text
URL del video
```

or:

```text
ID del video
```

The system should normalize and validate the reference.

Video binaries must never be uploaded to the UCI server.

---

# 27. Sermon Audio

The architecture should allow audio references.

Audio may initially be external or represented as a media asset according to the final media strategy.

The UI should not assume that audio is always hosted locally.

The data model should allow future providers without redesigning the sermon entity.

---

# 28. Autosave

Autosave may be supported for long-form editors.

If implemented, it must:

- avoid excessive API traffic;
- indicate save state;
- avoid overwriting newer revisions;
- preserve drafts;
- clearly distinguish saved state from published state.

Example indicator:

```text
Guardado
```

or:

```text
Guardando...
```

Autosave must never publish content.

---

# 29. Manual Save

The editor must always provide an explicit save action.

Example:

```text
Guardar borrador
```

The user should receive clear confirmation.

---

# 30. Publish Workflow

Publishing is an explicit action.

Example:

```text
Guardar borrador
Vista previa
Publicar
```

The publish action should require appropriate permission.

Before publication, the interface should validate required fields.

---

# 31. Publish Confirmation

For important content, publication should require confirmation.

Example:

```text
¿Publicar este sermón?

Al publicarlo será visible en el sitio web.

[Cancelar] [Publicar]
```

The confirmation should communicate the consequence, not merely ask:

```text
¿Está seguro?
```

---

# 32. Schedule Workflow

Where scheduling is enabled:

```text
Publicar ahora
Programar publicación
```

The scheduling interface should include:

```text
Fecha
Hora
Zona horaria
```

The selected date/time must be clearly displayed before confirmation.

---

# 33. Scheduled Content

Scheduled content must be visible in the CMS.

Example status:

```text
Programado
Domingo 11 de octubre
08:00
```

Editors should be able to:

```text
Editar
Cambiar fecha
Cancelar programación
Publicar ahora
```

subject to permissions.

---

# 34. Preview

Every content type that supports publication should support preview.

The preview should approximate the public website as closely as practical.

The editor should have:

```text
Vista previa
```

before publication.

Unpublished content must remain inaccessible to normal public requests.

---

# 35. Preview Security

Preview URLs must not expose permanent public access to drafts.

Possible implementation mechanisms include:

- short-lived preview tokens;
- authenticated preview sessions;
- signed preview URLs.

Preview access must expire or be invalidated appropriately.

---

# 36. Revisions

The CMS must maintain revision history for important content.

A revision represents a recoverable version of content.

The revision interface may display:

```text
Versión 7
Actualizada por Juan
04 Oct 2026 — 18:20

Versión 6
Actualizada por María
04 Oct 2026 — 16:05
```

---

# 37. Revision Actions

Authorized users may:

```text
Ver versión
Comparar
Restaurar
```

Restoring a revision must create a new revision.

Historical revisions must not be silently overwritten.

---

# 38. Unsaved Changes

The panel should warn users when leaving an editor with unsaved changes.

Example:

```text
Tienes cambios sin guardar.

¿Quieres salir sin guardar?
```

Actions:

```text
Seguir editando
Salir sin guardar
```

This protection is especially important for sermon editing.

---

# 39. Events Management

The event editor should support:

```text
Título
Slug
Descripción
Fecha
Hora
Ubicación
Categoría
Imagen
Enlaces
SEO
Estado
```

The interface should make date/time editing easy and unambiguous.

---

# 40. Event Calendar

A calendar-oriented view may be provided in addition to the standard list.

The calendar should help administrators understand:

- upcoming events;
- overlapping activities;
- publication state;
- dates requiring attention.

The calendar is a visualization layer and does not replace the underlying event list.

---

# 41. Ministries Management

The ministry editor should support:

```text
Nombre
Slug
Descripción
Responsable
Horario
Contacto
Redes sociales
Imagen
SEO
Estado
```

Ministries may be reordered where the public website requires a defined presentation order.

---

# 42. Pages Management

The page editor should support:

```text
Título
Slug
Resumen
Contenido
Imagen
SEO
Estado
```

Pages should support draft and publication workflows.

The editor should distinguish system-critical pages from ordinary editorial pages where required.

---

# 43. Navigation Management

Navigation management should provide a visual way to manage:

- menu groups;
- menu items;
- order;
- hierarchy;
- internal links;
- external links;
- visibility.

Example:

```text
Header

Inicio
Sermones
Eventos
Ministerios
Nosotros
Contacto
```

Editors should be able to reorder items without manually entering numeric positions.

---

# 44. Navigation Reordering

The preferred UX is drag-and-drop or an equivalent direct manipulation interaction.

The interface must provide:

- visible drop targets;
- clear ordering;
- save/revert behavior;
- protection against accidental deletion.

The server remains responsible for validating resulting ordering.

---

# 45. Media Library

The Media Library is a core part of the advanced CMS.

It should behave like a reusable asset management system rather than a simple upload form.

Primary route:

```text
/panel/media
```

---

# 46. Media Library Interface

Conceptually:

```text
Biblioteca multimedia

[Buscar...] [Tipo] [Ordenar] [Subir archivo]

┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
│ IMG  │ │ IMG  │ │ IMG  │ │ IMG  │
│      │ │      │ │      │ │      │
└──────┘ └──────┘ └──────┘ └──────┘
```

The library should support:

- grid view;
- list view where useful;
- search;
- filters;
- sorting;
- pagination;
- selection;
- metadata editing.

---

# 47. Media Upload Experience

The upload interface should support:

- drag and drop;
- file picker;
- upload progress;
- validation feedback;
- cancellation where technically possible;
- successful upload confirmation.

The interface must clearly communicate:

```text
Subiendo...
Procesando...
Listo
Error
```

---

# 48. Media Validation

Before upload, the UI should provide early validation for:

- supported file types;
- maximum file size;
- obvious filename problems.

The backend remains authoritative.

The UI must never assume that frontend validation is sufficient.

---

# 49. Media Details

Selecting a media asset should open a details view or panel.

Information may include:

```text
Vista previa
Nombre
Tipo
Tamaño
Dimensiones
URL
Texto alternativo
Título
Descripción
Fecha de carga
Usos
```

---

# 50. Media Picker

Content editors should not need to upload an image every time.

The CMS should provide a reusable media picker:

```text
Seleccionar imagen

[Buscar...]

[Imagen 1] [Imagen 2] [Imagen 3]

[Seleccionar]
```

Actions:

```text
Seleccionar existente
Subir nueva
Cancelar
```

---

# 51. Media References

Before deleting an asset, the CMS should show where it is being used.

Example:

```text
Esta imagen está siendo utilizada en:

- Sermón: Obediencia y fe
- Página: Nuestra Iglesia
```

This prevents accidental broken content.

---

# 52. Bulk Media Actions

The Media Library may support:

- bulk selection;
- bulk deletion;
- bulk metadata operations;
- bulk organization.

Bulk destructive operations must require explicit confirmation.

---

# 53. SEO Management

SEO fields should be available directly inside relevant content editors.

The user should not need to navigate to a separate technical module for normal SEO editing.

Example:

```text
SEO

Título SEO
[................................]

Descripción
[................................]

Imagen para compartir
[ Seleccionar imagen ]

URL canónica
[................................]
```

---

# 54. SEO Preview

The panel should provide an approximate search/social preview.

Example:

```text
Google Preview

Obediencia y fe | UCI
uci.example.org/sermons/obediencia-y-fe

Descripción del mensaje...
```

This is a visual aid, not a guarantee of how search engines will display the result.

---

# 55. Site Settings

The settings interface should group configuration logically.

Example:

```text
Configuración

General
Contacto
Ubicación
Redes sociales
Horarios
SEO
Integraciones
```

Sensitive infrastructure configuration must not be exposed through ordinary site settings.

---

# 56. Public Church Information

The CMS may manage:

```text
Nombre de la iglesia
Descripción
Dirección
Teléfono
Correo
WhatsApp
Horarios
Redes sociales
Mapa
```

This information should have a single source of truth.

The public website consumes it through the API.

---

# 57. User Management

Users with appropriate permissions can be managed through:

```text
/panel/users
```

The interface should provide:

```text
Nombre
Correo
Rol
Estado
Última actividad
```

Actions may include:

```text
Crear usuario
Editar
Desactivar
Restablecer acceso
```

The panel must not expose passwords.

---

# 58. Roles

The initial role model is intentionally simple.

Initial roles:

```text
ADMIN
EDITOR
```

The architecture must remain extensible to additional roles.

Examples of future roles:

```text
AUTHOR
MEDIA_MANAGER
SEO_MANAGER
MODERATOR
```

Roles must map to permissions rather than frontend assumptions.

---

# 59. Permission-Aware Interface

The panel should hide or disable actions that the current user cannot perform.

For example:

An editor with:

```text
content.read
content.create
content.update
```

may see:

```text
Guardar borrador
```

but not:

```text
Publicar
```

if the user lacks:

```text
content.publish
```

The backend must independently enforce the same permission.

---

# 60. Destructive Actions

Destructive actions must be visually distinct and require confirmation.

Examples:

```text
Eliminar imagen
Desactivar usuario
Eliminar navegación
```

Confirmation dialogs must explain:

- what will happen;
- whether the action is reversible;
- whether dependencies exist.

---

# 61. Delete vs Archive

The CMS should prefer archival where historical content matters.

For example:

```text
Sermón → Archivar
Evento → Archivar
Página → Archivar
```

Permanent deletion should be restricted.

Media deletion requires reference checking.

User deletion should generally be replaced by account deactivation where audit history requires preservation.

---

# 62. Audit Interface

The audit interface allows authorized administrators to inspect important actions.

Example:

```text
Auditoría

Usuario       Acción             Recurso       Fecha
Juan Pérez    Publicó            Sermón        04 Oct
María López   Actualizó          Página        04 Oct
```

Filters should include:

```text
Usuario
Acción
Recurso
Fecha
```

Audit records must be read-only.

---

# 63. Notifications

The panel may use non-blocking notifications for routine operations.

Examples:

```text
Sermón guardado correctamente.
Página publicada.
Imagen subida correctamente.
```

Errors should be actionable.

Example:

```text
No fue posible publicar el sermón.

Falta la descripción SEO.

[Revisar SEO]
```

Notifications should not replace persistent validation messages.

---

# 64. Error Handling

API errors should be translated into useful interface messages.

The panel must not expose:

```text
SQL errors
stack traces
internal filesystem paths
ORM errors
```

Development environments may expose additional diagnostics through developer tooling, but production UI must remain user-friendly.

---

# 65. Loading States

All asynchronous operations should provide appropriate loading states.

Examples:

```text
Cargando sermones...
Guardando...
Publicando...
Subiendo imagen...
```

The UI should avoid unnecessary full-screen loading states.

Prefer localized loading indicators.

---

# 66. Empty States

Empty lists should explain what the user can do.

Bad:

```text
No data.
```

Better:

```text
Todavía no hay sermones.

Crea el primer sermón para comenzar a construir el archivo de mensajes.

[Nuevo sermón]
```

Empty states should include contextual actions when appropriate.

---

# 67. Skeleton States

Skeleton loaders may be used for larger content areas.

They should preserve approximate layout dimensions to avoid layout shifts.

---

# 68. Optimistic UI

Optimistic updates may be used for low-risk interactions such as:

- navigation reordering;
- toggling non-critical visibility;
- local UI preferences.

They should not be used blindly for:

- publication;
- deletion;
- permission changes;
- destructive actions.

Server confirmation is required for high-impact operations.

---

# 69. Responsive Admin Experience

The panel must be usable on:

- desktop;
- laptop;
- tablet;
- mobile.

Desktop remains the primary editing environment.

Mobile should prioritize:

- dashboard;
- content review;
- quick editing;
- publication monitoring;
- basic media operations.

Complex rich-text editing may be optimized primarily for larger screens.

Detailed responsive requirements are defined in `13-responsive-and-accessibility.md`.

---

# 70. Accessibility

The panel must support accessible operation.

Requirements include:

- keyboard navigation;
- visible focus states;
- semantic controls;
- accessible labels;
- sufficient contrast;
- screen-reader-friendly form errors;
- accessible dialogs;
- accessible dropdowns;
- accessible drag-and-drop alternatives.

Detailed requirements are defined in `13-responsive-and-accessibility.md`.

---

# 71. Keyboard Shortcuts

Keyboard shortcuts may be introduced for power users.

Possible examples:

```text
Ctrl/Cmd + S → Save draft
Ctrl/Cmd + K → Search
Esc          → Close dialog
```

Shortcuts must never prevent normal keyboard operation.

---

# 72. Global Search

The panel may eventually provide a global search.

The search could cover:

```text
Sermons
Events
Pages
Ministries
Media
Users
```

Results should indicate:

- resource type;
- title;
- status;
- relevant metadata.

Global search should respect permissions.

---

# 73. Draft Protection

The panel should minimize accidental loss of editorial work.

Mechanisms may include:

- autosave;
- unsaved-change warnings;
- revisions;
- optimistic concurrency;
- draft persistence.

These mechanisms should work together rather than relying on a single safeguard.

---

# 74. Content Duplication

Editors may benefit from duplicating existing content.

Example:

```text
Duplicar sermón
```

Duplication should create:

```text
new ID
new revision history
DRAFT status
```

The duplicate must not inherit publication state.

Unique fields such as slugs must be regenerated or require confirmation.

---

# 75. Bulk Content Actions

List views may support bulk operations.

Examples:

```text
Archivar seleccionados
Cambiar categoría
Asignar autor
```

Publishing in bulk should be treated as a high-risk operation and may require additional confirmation.

---

# 76. Content Relationship Selection

When editing content, related entities should be selected through searchable interfaces.

Examples:

```text
Seleccionar predicador
Seleccionar imagen
Seleccionar evento relacionado
Seleccionar sermón relacionado
```

The user should not have to enter raw database IDs.

---

# 77. Form Design

Forms should use clear visual hierarchy.

Each field should provide:

- label;
- optional description;
- validation;
- required indicator where applicable;
- contextual help when needed.

Avoid excessive field density.

Long editors should group related fields into logical sections.

---

# 78. Form Validation

Validation should happen:

1. during interaction where useful;
2. before submission;
3. on the server.

Server validation is authoritative.

Validation errors should identify the exact field.

Example:

```text
Título
Este campo es obligatorio.
```

---

# 79. Slug Editing

The CMS may generate slugs automatically from titles.

Example:

```text
Título:
Obediencia y fe

Slug:
obediencia-y-fe
```

Editors may manually modify the slug where authorized.

Changing a published slug should warn about URL implications.

---

# 80. URL Change Protection

When a published URL changes, the system should support future redirect management.

The panel may warn:

```text
Este contenido ya está publicado.

Cambiar el slug puede afectar enlaces existentes y SEO.
```

A future redirect subsystem may allow:

```text
/sermons/old-slug
        ↓
/sermons/new-slug
```

---

# 81. Content Scheduling Visibility

Scheduled items should be visible from:

- content list;
- content detail;
- dashboard;
- calendar where applicable.

This allows administrators to understand upcoming publication activity.

---

# 82. Publishing Safety

The panel must make the distinction between:

```text
Guardar
```

and:

```text
Publicar
```

obvious.

Saving changes must never accidentally publish content.

---

# 83. Preview Safety

Preview must show the content in a context close to the public website while retaining an obvious indication that the content is unpublished.

Example:

```text
VISTA PREVIA — NO PUBLICADO
```

This prevents administrators from confusing preview state with live state.

---

# 84. Media Storage Awareness

The panel should treat media storage as an implementation detail.

Editors interact with:

```text
Biblioteca multimedia
```

rather than:

```text
/opt/uci/media/...
```

The UI must never expose internal filesystem paths.

---

# 85. Media URL Handling

Media URLs returned by the API may be displayed for administrative purposes.

Example:

```text
https://media.example.org/sermons/2026/10/example.webp
```

The panel may provide:

```text
Copiar URL
```

but storage keys remain an implementation concern.

---

# 86. Admin Route Structure

Recommended route organization:

```text
/panel
/panel/login

/panel/sermons
/panel/sermons/new
/panel/sermons/:id
/panel/sermons/:id/edit

/panel/events
/panel/events/new
/panel/events/:id
/panel/events/:id/edit

/panel/ministries
/panel/ministries/new
/panel/ministries/:id
/panel/ministries/:id/edit

/panel/pages
/panel/pages/new
/panel/pages/:id
/panel/pages/:id/edit

/panel/media
/panel/media/:id

/panel/navigation

/panel/seo
/panel/settings

/panel/users
/panel/users/new
/panel/users/:id

/panel/roles

/panel/audit
```

Routes may evolve as the interface develops.

---

# 87. Admin Component Architecture

The React panel should use reusable administrative components.

Examples:

```text
AdminLayout
Sidebar
Header
Breadcrumbs
PageHeader
DataTable
Pagination
SearchInput
FilterBar
StatusBadge
ConfirmDialog
Modal
Drawer
Toast
FormField
RichTextEditor
MediaPicker
MediaLibrary
MediaUploader
SeoPanel
PublishPanel
RevisionHistory
PreviewButton
```

Components should be reusable without becoming excessively generic abstractions.

---

# 88. Data Tables

Tables should support:

- sorting;
- row actions;
- selection where appropriate;
- responsive adaptation;
- loading state;
- empty state;
- pagination.

Tables must remain readable on smaller screens.

On mobile, dense tables may transform into cards or horizontally scroll where appropriate.

---

# 89. Editor Layout

Long editors should prioritize the main content.

A possible desktop layout:

```text
┌──────────────────────────────────────────────────────┐
│ Title                                                │
├───────────────────────────────────────┬──────────────┤
│                                       │              │
│ Main editor                           │ Publish      │
│                                       │              │
│ Content                               │ SEO          │
│                                       │ Media        │
│                                       │              │
└───────────────────────────────────────┴──────────────┘
```

The exact visual implementation remains subject to the final UI design.

---

# 90. Sticky Editorial Controls

For long editors, important actions may remain visible:

```text
Guardar
Vista previa
Publicar
```

Sticky controls must not consume excessive screen space.

---

# 91. Admin Theme

The panel should visually belong to the UCI ecosystem while prioritizing usability.

It should reuse:

- typography;
- iconography;
- spacing principles;
- brand references.

However, administrative UI may use more neutral surfaces and denser layouts than the public website.

The panel should not attempt to reproduce the marketing website pixel-for-pixel.

---

# 92. Destructive Confirmation Pattern

A destructive confirmation should communicate consequences.

Example:

```text
Eliminar imagen

Esta imagen está siendo utilizada en 2 contenidos.

No puede eliminarse hasta reemplazar esas referencias.

[Cancelar]
```

If deletion is allowed:

```text
Esta acción no puede deshacerse.

[Cancelar] [Eliminar]
```

---

# 93. Permission Errors

If an action is rejected by the API with:

```text
403 Forbidden
```

the panel should show a clear message:

```text
No tienes permisos para realizar esta acción.
```

It must not expose the internal permission evaluation.

---

# 94. Session Expiration

If the session expires during panel usage:

```text
Tu sesión ha expirado.
Inicia sesión nuevamente para continuar.
```

The panel should preserve unsaved local editor state where technically possible before redirecting.

---

# 95. Network Failure

Temporary network failures should not result in silent data loss.

Example:

```text
No pudimos guardar los cambios.

Verifica tu conexión e inténtalo nuevamente.
```

The interface should preserve the current form state.

---

# 96. Auditability

Important administrative actions should create audit records.

Examples:

```text
LOGIN
LOGOUT
CONTENT_CREATED
CONTENT_UPDATED
CONTENT_PUBLISHED
CONTENT_SCHEDULED
CONTENT_ARCHIVED
MEDIA_UPLOADED
MEDIA_DELETED
USER_CREATED
USER_UPDATED
USER_DISABLED
SETTINGS_UPDATED
PERMISSION_CHANGED
```

The exact audit taxonomy is defined in the security specification.

---

# 97. Performance

The panel should remain responsive with realistic content volumes.

Requirements include:

- paginated API queries;
- lazy loading where appropriate;
- optimized media thumbnails;
- debounced searches;
- avoidance of unnecessary API requests;
- caching of stable reference data;
- efficient rich-editor rendering.

The panel must not load the entire media library or all sermons at once.

---

# 98. Media Thumbnails

The Media Library should use optimized thumbnails rather than loading full-resolution assets for every grid item.

This is particularly important as the church's sermon archive grows.

The underlying media architecture is defined in `12-media-and-assets.md`.

---

# 99. Notifications and Scheduled Jobs

The panel may expose status information related to background processes.

Examples:

```text
Programación activa
Procesamiento de imagen
```

The panel should not require administrators to understand worker infrastructure.

---

# 100. Administrative Audit Trail

The UI should make it possible to answer:

```text
¿Qué cambió?
¿Quién lo cambió?
¿Cuándo?
¿Sobre qué contenido?
```

For important content operations, the audit system and revision system should complement each other.

Revisions answer:

```text
¿Qué versión existía?
```

Audit logs answer:

```text
¿Qué acción realizó el usuario?
```

---

# 101. Editor Experience Priorities

The editorial experience should optimize for common workflows.

Primary workflow:

```text
Crear sermón
    ↓
Agregar información
    ↓
Agregar contenido
    ↓
Seleccionar medios
    ↓
Configurar SEO
    ↓
Guardar borrador
    ↓
Vista previa
    ↓
Publicar / Programar
```

This workflow should require as few unnecessary navigation changes as possible.

---

# 102. Common Quick Actions

The dashboard should provide shortcuts for:

```text
Nuevo sermón
Nuevo evento
Nueva página
Subir imagen
```

Additional shortcuts may be introduced as usage patterns become clear.

---

# 103. Admin Panel Source of Truth

The panel is not the source of truth for:

- permissions;
- publication state;
- business rules;
- content validity;
- audit records;
- media storage;
- scheduling.

The backend API remains authoritative.

The panel is the administrative presentation and interaction layer.

---

# 104. Relationship With Public Website

The panel and public website are intentionally separated.

```text
                 ┌───────────────┐
                 │   PostgreSQL  │
                 └───────┬───────┘
                         │
                    Node API
                    /api/v1
                     /     \
                    /       \
                   ▼         ▼
             Public Site    /panel
                Astro        React
```

Both interfaces consume the same application rules and content model.

The public website must never depend on the React admin application.

The admin panel must never need to know the internal implementation of the public Astro application.

---

# 105. Future Extensibility

The admin panel architecture should permit future modules such as:

```text
Donaciones
Devocionales
Testimonios
Galerías
Podcasts
Cursos
Formularios
Boletines
Voluntariado
```

These are not part of the initial scope unless defined by product requirements.

The architecture should accommodate them without redesigning the entire panel shell.

---

# 106. Technical Constraints

The admin panel must comply with the following architectural constraints:

- React-based;
- same repository as the public website;
- single package manager/project;
- single API;
- PostgreSQL;
- REST API;
- `/api/v1`;
- session-based authentication;
- server-side authorization;
- modular backend;
- reusable media library;
- external video support;
- no media binaries in PostgreSQL;
- no direct database access from the browser;
- no microservices requirement;
- no dependency on a third-party CMS SaaS.

---

# 107. Non-Goals

The initial admin panel is not intended to be:

- a generic page builder like Webflow;
- a full enterprise DAM;
- a social-media management suite;
- a video hosting platform;
- a marketing automation platform;
- a general-purpose ERP;
- a replacement for YouTube;
- a complex multi-tenant CMS.

The panel should be advanced where UCI actually needs editorial control without introducing unnecessary enterprise complexity.

---

# 108. Definition of a Successful Admin Panel

The `/panel` implementation is successful when an authorized church administrator can perform the complete editorial lifecycle without technical assistance:

```text
Log in
  ↓
Create content
  ↓
Edit content
  ↓
Upload/select media
  ↓
Configure SEO
  ↓
Save draft
  ↓
Preview
  ↓
Publish or schedule
  ↓
Verify publication
  ↓
Later edit or restore a revision
```

The user should not need to understand:

- PostgreSQL;
- Docker;
- filesystem paths;
- API implementation;
- media storage providers;
- deployment infrastructure.

---

# 109. Final Admin Panel Model

The final conceptual model is:

```text
┌─────────────────────────────────────────────────────┐
│                    UCI /panel                       │
│                                                     │
│  Dashboard                                          │
│                                                     │
│  Content                                             │
│  ├── Sermons                                         │
│  ├── Events                                          │
│  ├── Ministries                                      │
│  └── Pages                                           │
│                                                     │
│  Media                                                │
│  └── Media Library                                   │
│                                                     │
│  Site                                                 │
│  ├── Navigation                                      │
│  ├── SEO                                             │
│  └── Settings                                        │
│                                                     │
│  Administration                                      │
│  ├── Users                                           │
│  ├── Roles & Permissions                             │
│  └── Audit                                           │
│                                                     │
└───────────────────────┬─────────────────────────────┘
                        │
                        ▼
                ┌───────────────┐
                │   REST API    │
                │   /api/v1     │
                └───────┬───────┘
                        │
              ┌─────────┴─────────┐
              ▼                   ▼
        ┌───────────┐      ┌──────────────┐
        │ PostgreSQL│      │ MediaStorage │
        └───────────┘      └──────────────┘
```

The UCI `/panel` is therefore an **advanced editorial CMS interface**, not a collection of database forms.

Its primary purpose is to make content management safe, understandable, efficient, and scalable while keeping all business rules and security enforcement inside the backend architecture defined by the previous specifications.