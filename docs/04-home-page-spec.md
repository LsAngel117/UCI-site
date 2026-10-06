# UCI Website --- Homepage Specification

**Project:** Iglesia UCI --- Unidad Cristiana de Intercesión\
**Document:** Homepage Specification\
**Version:** 1.0\
**Status:** Approved conceptual direction\
**Depends on:** `00-project-vision.md`, `01-product-requirements.md`,
`02-information-architecture.md`, `03-visual-design-system.md`

------------------------------------------------------------------------

# 1. Purpose

This document defines the structure, content intent, visual composition,
behavior, and content requirements of the public UCI homepage.

The homepage is the principal digital entry point to Iglesia UCI.

It must combine:

-   UCI identity
-   spiritual atmosphere
-   practical visitor information
-   sermons
-   community
-   events
-   ministries
-   stories
-   connection

The homepage must follow the approved visual direction established in
the UCI mockup and `03-visual-design-system.md`.

This document describes what the Home must contain and how its sections
relate to one another. It does not prescribe implementation code.

------------------------------------------------------------------------

# 2. Homepage Objective

The homepage must allow a first-time visitor to understand UCI quickly
while also giving existing members useful access to current church
content.

Within the initial experience, a visitor should be able to understand:

-   What UCI is
-   What UCI emphasizes
-   When UCI meets
-   Where UCI meets
-   What a first visit is like
-   What is happening at UCI
-   What the latest sermon is
-   Where to find other sermons
-   What ministries exist
-   How to connect

The homepage should feel like a guided experience rather than a
directory.

------------------------------------------------------------------------

# 3. Approved Homepage Narrative

The approved narrative is:

``` text
IDENTITY
   ↓
INVITATION
   ↓
WHO WE ARE
   ↓
HOW WE LIVE
   ↓
WHEN WE MEET
   ↓
FIRST VISIT
   ↓
GOD'S WORD / SERMON
   ↓
SERMON LIBRARY
   ↓
COMMUNITY / EVENTS
   ↓
MINISTRIES
   ↓
STORIES
   ↓
GENEROSITY
   ↓
INVITATION
```

The visual rhythm follows the dark/light system defined in the visual
design system.

------------------------------------------------------------------------

# 4. Homepage Section Order

The initial approved section order is:

1.  Global Header / Navigation
2.  Hero
3.  Somos UCI
4.  En UCI --- Three Pillars
5.  Próximo Servicio
6.  ¿Es tu primera vez en UCI?
7.  Último Sermón
8.  Explora Nuestros Mensajes
9.  Próximos Eventos
10. Ministerios
11. Historias / Testimonios
12. Generosidad
13. Final CTA
14. Footer

The order should remain stable unless a product or content requirement
requires a documented change.

------------------------------------------------------------------------

# 5. Header / Navigation

## 5.1 Purpose

Provide immediate access to the principal areas of the church website
without competing with the hero.

------------------------------------------------------------------------

## 5.2 Desktop Structure

Left:

-   UCI compact/full logo

Center or primary navigation:

-   Inicio
-   Nosotros
-   Sermones
-   Eventos
-   Ministerios
-   Contacto

Right:

-   Soy nuevo
-   Ver en vivo

------------------------------------------------------------------------

## 5.3 Visual Treatment

Initial state:

-   transparent or highly translucent
-   positioned over hero
-   white/light navigation text
-   gold active indicator
-   subtle contrast treatment

Scrolled state:

-   dark navy / near-black surface
-   increased opacity
-   subtle backdrop effect
-   persistent UCI identity

------------------------------------------------------------------------

## 5.4 Navigation Behavior

The header should remain accessible while scrolling.

The transition from transparent to solid should be subtle.

The navigation must not create a visual jump in the page layout.

------------------------------------------------------------------------

## 5.5 Mobile

Mobile header:

-   compact UCI mark
-   menu trigger
-   optional primary action when space permits

The opened menu should use a dark UCI surface.

The mobile menu must expose the same principal destinations without
creating unnecessary nesting.

------------------------------------------------------------------------

# 6. Hero

## 6.1 Purpose

The Hero establishes UCI identity immediately.

It is the strongest emotional and visual entry point on the page.

------------------------------------------------------------------------

## 6.2 Approved Message

Small label:

> BIENVENIDO A UCI

Primary heading:

> UNA IGLESIA\
> QUE INTERCEDE.

Supporting message:

> Una comunidad que busca a Dios, vive Su Palabra y permanece en
> oración.

Primary CTA:

> CONÓCENOS

Secondary CTA:

> VER ÚLTIMO SERMÓN

------------------------------------------------------------------------

## 6.3 Hero Visual

The hero should use authentic worship/church photography whenever
available.

Preferred composition:

-   congregation or worship environment
-   visible human presence
-   strong depth
-   atmospheric lighting
-   blue and warm highlights
-   enough negative space for typography

The visual must support the text rather than compete with it.

------------------------------------------------------------------------

## 6.4 Hero Overlay

Use a cinematic dark treatment.

Preferred:

-   stronger black/navy gradient behind text
-   controlled darkening toward lower areas
-   image remains recognizable
-   no flat opaque overlay unless required for accessibility

------------------------------------------------------------------------

## 6.5 Hero Typography

The headline should be the dominant text element.

A refined editorial serif may be used for the display treatment.

The phrase:

> QUE INTERCEDE.

may receive restrained gold emphasis.

------------------------------------------------------------------------

## 6.6 Hero Service Strip

A practical information strip must appear near the bottom of the hero.

Information:

-   service day
-   service time
-   location
-   directions

Example conceptual structure:

``` text
[calendar] DOMINGOS
           09:00 AM

[location] Villavicencio, Meta
           Dirección configurada

[arrow] CÓMO LLEGAR
```

The actual information must come from CMS-managed church/service data.

No hard-coded production placeholders.

------------------------------------------------------------------------

## 6.7 Hero Responsive Behavior

Desktop:

-   full viewport-width composition
-   large display heading
-   horizontal CTAs
-   service strip aligned horizontally

Mobile:

-   shorter but immersive composition
-   smaller display heading
-   CTAs stacked or compact
-   service information remains visible
-   important image subjects must not be cropped behind text

------------------------------------------------------------------------

# 7. Somos UCI

## 7.1 Purpose

Immediately after the emotional Hero, this section explains the identity
behind the visual message.

------------------------------------------------------------------------

## 7.2 Section Label

> SOMOS UCI

------------------------------------------------------------------------

## 7.3 Content

The section should explain:

-   who UCI is
-   what defines the community
-   biblical foundation
-   prayer/intercession emphasis

The final copy is content-managed or approved editorial content.

------------------------------------------------------------------------

## 7.4 Visual Composition

Dark navy / near-black background.

Two-column conceptual layout:

### Left

-   label
-   heading
-   short identity paragraph
-   CTA

### Right

-   UCI globe + open Bible + heartbeat visual

The visual should feel integrated into the environment rather than
sitting inside a generic card.

------------------------------------------------------------------------

## 7.5 CTA

> CONÓCENOS MÁS

Destination:

`/nosotros`

------------------------------------------------------------------------

## 7.6 Visual Asset

Use the approved UCI globe/Bible/heartbeat visual direction.

The asset should use:

-   blue atmospheric illumination
-   restrained gold
-   dark background
-   subtle depth

Avoid excessive glow or particles.

------------------------------------------------------------------------

# 8. En UCI --- Three Pillars

## 8.1 Purpose

Translate UCI identity into three simple expressions of church life.

------------------------------------------------------------------------

## 8.2 Section Label

> EN UCI

## 8.3 Section Heading

Concept:

> Te invitamos a...

------------------------------------------------------------------------

## 8.4 Pillars

### ADORAMOS

Concept:

> Exaltamos a Dios con todo nuestro corazón.

Visual:

-   worship photography
-   congregation
-   stage/service atmosphere

------------------------------------------------------------------------

### APRENDEMOS

Concept:

> Crecemos por medio de Su Palabra.

Visual:

-   Bible
-   teaching
-   study
-   preaching

------------------------------------------------------------------------

### INTERCEDEMOS

Concept:

> Creemos en el poder de una iglesia que ora.

Visual:

-   prayer
-   intercession
-   people praying

------------------------------------------------------------------------

## 8.5 Composition

Desktop:

-   three visual blocks
-   consistent image proportions
-   title and short description
-   subtle arrow/action

The blocks should feel photographic and editorial.

They must not look like generic SaaS cards.

Mobile:

-   stacked blocks
-   preserved image prominence
-   concise copy

------------------------------------------------------------------------

# 9. Próximo Servicio

## 9.1 Purpose

Convert general interest into a practical invitation.

The visitor should immediately know when and where the next service
takes place.

------------------------------------------------------------------------

## 9.2 Section Concept

> NOS VEMOS ESTE DOMINGO

Supporting text:

> Servicio de adoración

------------------------------------------------------------------------

## 9.3 Required Information

-   next service day
-   date
-   time
-   location
-   address
-   directions / route
-   optional service type

The information should be derived from CMS-managed church schedule data.

------------------------------------------------------------------------

## 9.4 Visual Composition

This section intentionally becomes lighter.

Preferred:

-   light background
-   subtle church/service photograph
-   navy typography
-   gold accent rule
-   blue secondary details

------------------------------------------------------------------------

## 9.5 CTA

> PLANEA TU VISITA

Destination:

`/soy-nuevo`

------------------------------------------------------------------------

# 10. ¿Es tu primera vez en UCI?

## 10.1 Purpose

Provide a direct path for first-time visitors.

This section should remove uncertainty.

------------------------------------------------------------------------

## 10.2 Heading

> ¿ES TU PRIMERA VEZ EN UCI?

Supporting message:

> Queremos que te sientas como en casa.

------------------------------------------------------------------------

## 10.3 Information Blocks

The section should answer three essential questions:

### ¿Dónde estamos?

Location / map.

### ¿Cuándo nos reunimos?

Service schedule.

### ¿Qué puedes esperar?

Concise explanation of the service experience.

------------------------------------------------------------------------

## 10.4 Visual Composition

Dark navy cinematic section.

Use authentic community photography.

Potential image placement:

-   right side on desktop
-   lower/full-width area on mobile

Information should remain easy to scan.

------------------------------------------------------------------------

## 10.5 CTA

> QUIERO CONOCER UCI

Destination:

`/soy-nuevo`

------------------------------------------------------------------------

# 11. Último Sermón

## 11.1 Purpose

Present the latest or featured sermon as a major editorial moment.

This section connects the visitor with the biblical teaching of UCI.

------------------------------------------------------------------------

## 11.2 Section Label

> ÚLTIMO SERMÓN

------------------------------------------------------------------------

## 11.3 Dynamic Content

The section must be populated from CMS sermon data.

Potential displayed data:

-   title
-   scripture
-   preacher
-   date
-   cover image
-   video availability
-   notes availability

------------------------------------------------------------------------

## 11.4 Visual Composition

Dark cinematic section.

Desktop conceptual layout:

### Left

-   label
-   sermon title
-   scripture
-   CTA buttons

### Right

-   pastor/preacher image
-   atmospheric service background
-   editorial annotations

------------------------------------------------------------------------

## 11.5 Sermon Notes Visual Language

The design may use visual elements inspired by UCI sermon notes:

-   hand-drawn arrows
-   circles
-   short handwritten notes
-   highlighted phrases

These elements should be used sparingly.

They must enhance the editorial feeling without becoming visual noise.

------------------------------------------------------------------------

## 11.6 CTA

Primary:

> VER SERMÓN

Secondary:

> VER NOTAS

Only show "Ver notas" when notes are available.

------------------------------------------------------------------------

# 12. Explora Nuestros Mensajes

## 12.1 Purpose

Provide a path from the featured sermon to the wider sermon archive.

------------------------------------------------------------------------

## 12.2 Section Label

> SERMONES

## 12.3 Heading

> EXPLORA NUESTROS MENSAJES

------------------------------------------------------------------------

## 12.4 Filters

Initial filters:

-   Todos
-   Predicadores
-   Series
-   Temas

The selected filter must be visually clear.

------------------------------------------------------------------------

## 12.5 Content

Display a curated number of recent/featured sermons.

Each card may show:

-   image
-   title
-   scripture
-   date
-   play indicator

------------------------------------------------------------------------

## 12.6 CTA

> Ver todos los sermones

Destination:

`/sermones`

------------------------------------------------------------------------

## 12.7 Responsive

Desktop:

-   four-card conceptual row where content permits

Mobile:

-   stacked or horizontally scrollable content depending on final
    interaction
-   cards remain touch-friendly

------------------------------------------------------------------------

# 13. Próximos Eventos

## 13.1 Purpose

Show what is currently happening in UCI.

------------------------------------------------------------------------

## 13.2 Section Label

> LO QUE ESTÁ PASANDO EN UCI

## 13.3 Heading

> PRÓXIMOS EVENTOS

------------------------------------------------------------------------

## 13.4 Content

Display a limited number of upcoming events.

Each event summary may include:

-   date
-   title
-   time
-   location
-   image when useful
-   event category

------------------------------------------------------------------------

## 13.5 Date Presentation

Date should have strong visual hierarchy.

Example conceptual treatment:

``` text
07
SEP
```

with event information adjacent.

------------------------------------------------------------------------

## 13.6 CTA

> VER CALENDARIO

Destination:

`/eventos`

------------------------------------------------------------------------

## 13.7 Empty State

If there are no upcoming events:

> No hay eventos próximos.

The section should remain useful rather than disappearing unexpectedly
if the design allows a configured fallback.

------------------------------------------------------------------------

# 14. Ministerios

## 14.1 Purpose

Help visitors find a place to participate and connect.

------------------------------------------------------------------------

## 14.2 Section Label

> MINISTERIOS

## 14.3 Heading

> ENCUENTRA TU LUGAR

Supporting concept:

> Conoce nuestros ministerios y sé parte.

------------------------------------------------------------------------

## 14.4 Visual Composition

Return to a darker cinematic treatment.

Use:

-   authentic ministry photography
-   blue atmospheric lighting
-   restrained gold accents

Avoid generic category tiles.

------------------------------------------------------------------------

## 14.5 CTA

> VER MINISTERIOS

Destination:

`/ministerios`

------------------------------------------------------------------------

## 14.6 Content

The homepage may display a curated subset of ministries.

The CMS should determine which ministries are:

-   active
-   featured
-   visible

------------------------------------------------------------------------

# 15. Historias / Testimonios

## 15.1 Purpose

Show the human impact and lived experience of the church.

This section should communicate community rather than marketing claims.

------------------------------------------------------------------------

## 15.2 Section Concept

> DIOS SIGUE HACIENDO HISTORIA

------------------------------------------------------------------------

## 15.3 Content

A story may include:

-   person's name
-   short quote
-   portrait
-   optional longer story
-   navigation to additional content when available

------------------------------------------------------------------------

## 15.4 Visual Composition

Dark editorial section.

Preferred:

-   authentic portrait
-   strong negative space
-   large quote
-   subtle navigation controls

Avoid a repeated three-card testimonial pattern.

------------------------------------------------------------------------

## 15.5 Content Governance

Stories must only be published when authorized by UCI.

The CMS must support publication control.

------------------------------------------------------------------------

# 16. Generosidad

## 16.1 Purpose

Provide a clear but restrained route to the church's official giving
method.

------------------------------------------------------------------------

## 16.2 Heading

> UNA IGLESIA GENEROSA

Supporting concept:

> Tu generosidad nos permite continuar sirviendo, llevando el mensaje y
> acompañando a nuestra comunidad.

The exact copy is subject to church approval.

------------------------------------------------------------------------

## 16.3 Visual Treatment

Preferred:

-   blue / navy surface
-   restrained gold icon or line
-   concise text
-   one clear CTA

Avoid aggressive fundraising visual language.

------------------------------------------------------------------------

## 16.4 CTA

> QUIERO DAR

Destination or action:

Configured official giving mechanism.

The website must not invent financial information.

------------------------------------------------------------------------

# 17. Final CTA

## 17.1 Purpose

Conclude the homepage by returning to the visitor invitation.

------------------------------------------------------------------------

## 17.2 Heading

> HAY UN LUGAR PARA TI.

------------------------------------------------------------------------

## 17.3 Supporting Message

Keep concise.

The final CTA should not introduce a new complex idea.

------------------------------------------------------------------------

## 17.4 CTA

> PLANEA TU VISITA

Destination:

`/soy-nuevo`

------------------------------------------------------------------------

## 17.5 Visual Composition

Strong cinematic conclusion.

Potential visual language:

-   dark landscape
-   worship/service atmosphere
-   blue illumination
-   warm light
-   UCI globe + Bible visual where appropriate

The section should feel like the culmination of the homepage.

------------------------------------------------------------------------

# 18. Footer

## 18.1 Purpose

Provide final navigation and essential church information.

------------------------------------------------------------------------

## 18.2 Content

Include:

-   UCI logo
-   church name
-   primary navigation
-   address
-   service schedule
-   contact
-   social links
-   copyright

------------------------------------------------------------------------

## 18.3 Visual Treatment

Near-black / deep navy.

Typography should remain clear and compact.

Gold may be used for small highlights.

------------------------------------------------------------------------

# 19. CMS Data Dependencies

The homepage should consume configurable content.

At minimum:

## Church Configuration

-   name
-   logo
-   address
-   coordinates
-   contact
-   WhatsApp
-   social links
-   service schedule

## Featured Sermon

-   sermon
-   image
-   preacher
-   scripture
-   video
-   notes

## Pillars

The conceptual pillars are fixed:

-   Adoramos
-   Aprendemos
-   Intercedemos

Their descriptions and imagery may be content-configurable where
appropriate.

## Events

Upcoming events.

## Ministries

Featured/active ministries.

## Stories

Featured/published stories.

## Giving

Configured giving information.

------------------------------------------------------------------------

# 20. Dynamic vs. Structural Content

The homepage should distinguish between stable structure and changing
content.

## Structural

These define the UCI experience:

-   section order
-   core pillars
-   major headings
-   navigation structure
-   visual hierarchy
-   CTA hierarchy

## Dynamic

These change over time:

-   latest sermon
-   sermon metadata
-   events
-   ministry content
-   stories
-   service schedule
-   church contact information
-   social links
-   giving information
-   images

The CMS should manage dynamic content without allowing administrators to
arbitrarily break the approved page structure.

------------------------------------------------------------------------

# 21. Featured Content Rules

## Featured Sermon

Only one sermon should occupy the principal featured position at a time.

If no explicit featured sermon exists, the system may use the most
recent published sermon according to the product rules.

------------------------------------------------------------------------

## Featured Ministries

The homepage should display a controlled subset rather than the entire
ministry catalog.

------------------------------------------------------------------------

## Upcoming Events

Only relevant upcoming events should appear in the homepage section.

Past events must not be presented as upcoming.

------------------------------------------------------------------------

## Stories

Only published/approved stories may appear.

------------------------------------------------------------------------

# 22. Loading Behavior

Homepage content should load progressively without causing layout
instability.

Large visual areas should reserve appropriate space before media
finishes loading.

Content should not jump vertically as images load.

------------------------------------------------------------------------

# 23. Error Behavior

If a dynamic section cannot load:

-   preserve the page structure where practical
-   avoid exposing technical errors
-   show a graceful fallback
-   allow the visitor to continue using the rest of the homepage

The entire homepage must not become unusable because one dynamic content
source fails.

------------------------------------------------------------------------

# 24. Empty Content Behavior

The homepage should handle legitimate content gaps.

Examples:

-   no upcoming events
-   no featured story
-   no giving method configured
-   no sermon notes available

The system should avoid showing empty visual shells.

Sections may:

-   show a fallback
-   display alternative content
-   collapse when appropriate
-   retain structural messaging when useful

The behavior should be determined per section rather than using one
generic rule.

------------------------------------------------------------------------

# 25. SEO

The homepage must provide:

-   unique title
-   meta description
-   canonical URL
-   Open Graph metadata
-   appropriate structured data
-   semantic heading hierarchy
-   indexable content

The homepage should clearly identify:

**Iglesia UCI --- Unidad Cristiana de Intercesión**

Local church information should be consistent with official church data.

------------------------------------------------------------------------

# 26. Accessibility

Every homepage section must preserve:

-   semantic headings
-   keyboard accessibility
-   visible focus
-   meaningful alt text
-   adequate contrast
-   accessible buttons and links
-   reduced-motion behavior

Decorative imagery must not be announced as meaningful content.

------------------------------------------------------------------------

# 27. Responsive Homepage Composition

## Desktop

The homepage may use:

-   full-width hero
-   2-column editorial layouts
-   3-column pillar blocks
-   4-column sermon cards
-   horizontal event presentation
-   cinematic split layouts

------------------------------------------------------------------------

## Tablet

Layouts should collapse progressively while preserving visual hierarchy.

------------------------------------------------------------------------

## Mobile

The homepage becomes a vertical narrative.

Expected sequence:

``` text
HEADER
↓
HERO
↓
SERVICE INFO
↓
SOMOS UCI
↓
PILLARS
↓
PRÓXIMO SERVICIO
↓
PRIMERA VEZ
↓
ÚLTIMO SERMÓN
↓
SERMONES
↓
EVENTOS
↓
MINISTERIOS
↓
HISTORIAS
↓
GENEROSIDAD
↓
FINAL CTA
↓
FOOTER
```

The mobile layout shown in the approved mockup should guide composition.

------------------------------------------------------------------------

# 28. Motion

Homepage motion must be subtle.

Potential behaviors:

-   hero content entrance
-   navigation transition
-   image reveal
-   section fade/translate
-   card hover
-   CTA hover
-   subtle image movement

Motion must support storytelling rather than distract from it.

Users who prefer reduced motion must receive an appropriate
reduced-motion experience.

------------------------------------------------------------------------

# 29. Visual Consistency

Every homepage section must follow `03-visual-design-system.md`.

Specifically:

-   approved colors
-   typography
-   spacing
-   image treatment
-   CTA hierarchy
-   iconography
-   dark/light rhythm
-   UCI visual motifs

A section must not introduce an unrelated design language.

------------------------------------------------------------------------

# 30. Do Not Turn the Homepage into a CMS Page Builder

The homepage must remain a designed experience.

The CMS should control content, not arbitrary layout composition.

Administrators should not be expected to manually construct:

-   grids
-   typography
-   spacing
-   visual sections
-   component hierarchy

The page structure remains controlled by the product and design system.

------------------------------------------------------------------------

# 31. Homepage Content Philosophy

The homepage should prioritize:

1.  People
2.  UCI identity
3.  Invitation
4.  Practical information
5.  God's Word
6.  Community
7.  Participation
8.  Connection

It should not prioritize:

-   excessive promotional content
-   visual effects
-   content volume
-   generic marketing language

------------------------------------------------------------------------

# 32. Approved Visual Reference

The approved UCI homepage mockup is the primary visual reference for
this specification.

The mockup establishes the intended relationship between:

-   header
-   hero
-   UCI identity
-   globe/Bible visual
-   three pillars
-   service information
-   first-time visitor experience
-   sermon feature
-   sermon archive
-   events
-   ministries
-   stories
-   giving
-   final CTA
-   footer

The mockup is not a pixel-perfect implementation contract.

Real content, responsive constraints, accessibility, performance and
actual media may require composition adjustments.

Those adjustments must preserve the intended hierarchy and visual
language.

------------------------------------------------------------------------

# 33. Homepage Definition of Done

The homepage concept is complete when:

-   UCI identity is immediately understandable
-   Hero communicates the primary message
-   next service information is easy to find
-   first-time visitor path is obvious
-   Somos UCI communicates identity
-   three pillars are represented
-   latest sermon is prominent
-   sermon archive is discoverable
-   upcoming events are visible
-   ministries are discoverable
-   stories can be presented
-   giving can be presented when configured
-   final visit CTA is clear
-   footer contains essential information
-   content is CMS-driven where required
-   mobile preserves the same narrative
-   visual system is consistent with `03-visual-design-system.md`
-   no section depends on hard-coded production content
-   empty and unavailable content states are handled gracefully
-   the page remains accessible and performant
