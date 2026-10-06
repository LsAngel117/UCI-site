# UCI Website — Product Requirements

## 1. Document Purpose

This document defines the functional and product requirements for the
official website of Iglesia UCI — Unidad Cristiana de Intercesión.

It establishes what the public website and its content management system
must provide.

The visual implementation is defined separately in the design system and
page-specific specifications.

---

# 2. Product Scope

The UCI website consists of two main interfaces:

1. Public Website
2. Administrative CMS

## 2.1 Public Website

The public website is the primary experience for visitors, members and
people interested in Iglesia UCI.

It must provide access to:

- Church identity
- Service information
- Visitor information
- Sermons
- Events
- Ministries
- Stories / testimonies
- Church information
- Contact information
- Giving information
- Social channels
- Live or online content when available

---

## 2.2 Administrative CMS

The CMS allows authorized church personnel to manage the content displayed
on the public website.

The CMS must provide management for:

- Sermons
- Events
- Ministries
- Stories / testimonials
- News / articles
- Gallery
- Church information
- Site settings
- Media

The CMS must not require technical knowledge for normal content-management
operations.

---

# 3. Primary Audiences

## 3.1 First-Time Visitor

A person who does not know UCI or has little knowledge about the church.

Primary needs:

- Understand what UCI is
- Know when services take place
- Know where the church is located
- Understand what to expect
- Discover the church's identity
- Find a simple way to contact the church
- Decide how to visit

---

## 3.2 Church Member

A person who already attends UCI.

Primary needs:

- Find sermons
- Discover events
- Find ministries
- Review schedules
- Access church information
- Share content
- Stay connected with church activities

---

## 3.3 Online Visitor

A person interacting with UCI without physically attending.

Primary needs:

- Watch sermons
- Access online services when available
- Discover church identity
- Follow social channels
- Find contact information
- Learn how to participate physically or digitally

---

## 3.4 Church Administrator

A person responsible for maintaining website content.

Primary needs:

- Create content
- Edit content
- Publish content
- Unpublish content
- Manage images and media
- Maintain church information
- Maintain events and schedules
- Manage sermons
- Keep website information current

---

# 4. Product Goals

The website must achieve the following product goals.

## PR-001 — Communicate UCI Identity

The website must clearly communicate the identity of Iglesia UCI.

A visitor should understand the church's central identity without needing
to navigate through multiple pages.

---

## PR-002 — Provide Immediate Service Information

Service information must be easy to discover.

At minimum, the website must communicate:

- Day
- Time
- Location
- Directions

This information must be available prominently on the homepage.

---

## PR-003 — Support First-Time Visitors

The website must provide a dedicated path for people visiting UCI for the
first time.

The visitor experience should answer:

- Where are we?
- When do we meet?
- What happens during a service?
- What should I expect?
- How can I contact someone?
- How can I plan my visit?

---

## PR-004 — Provide Sermon Discovery

Visitors must be able to discover and consume UCI sermons.

The sermon experience must support:

- Latest sermon
- Sermon archive
- Sermon details
- Preacher
- Date
- Scripture
- Series
- Topic
- Video
- Audio when available
- Sermon notes when available

---

## PR-005 — Communicate Church Activities

The website must make current and upcoming activities easy to discover.

Events must provide relevant information such as:

- Name
- Date
- Time
- Location
- Description
- Image
- Registration or contact information when applicable

---

## PR-006 — Communicate Ministries

Visitors must be able to discover the ministries available at UCI.

Each ministry may provide:

- Name
- Description
- Image
- Meeting schedule
- Location
- Leader
- Contact information
- Social links
- Related events

Only information actually provided by UCI should be published.

---

## PR-007 — Facilitate Connection

The website must provide clear paths for people who want to connect with
UCI.

Potential connection paths include:

- Visit the church
- Contact the church
- WhatsApp
- Social networks
- Ministries
- Events
- Prayer-related contact when applicable

The exact channels will be configured through the CMS.

---

## PR-008 — Support Content Publishing

Authorized administrators must be able to manage public content without
developer intervention.

Content must support publication states where appropriate.

At minimum:

- Draft
- Published
- Archived / unpublished

---

# 5. Public Website Requirements

## 5.1 Global Navigation

The public website must provide a consistent navigation system.

Primary navigation:

- Inicio
- Nosotros
- Sermones
- Eventos
- Ministerios
- Contacto

Primary actions:

- Soy nuevo
- Ver en vivo

The navigation must adapt to smaller screens through a mobile navigation
pattern.

---

## 5.2 Homepage

The homepage is the principal public entry point.

The approved conceptual structure is:

1. Header / navigation
2. Hero
3. Somos UCI
4. Core identity / pillars
5. Próximo servicio
6. Primera vez en UCI
7. Último sermón
8. Sermon library
9. Próximos eventos
10. Ministerios
11. Historias / testimonios
12. Generosidad
13. Final CTA
14. Footer

The detailed visual implementation belongs to:

`docs/04-home-page-spec.md`

---

# 6. Homepage Hero Requirements

The hero must communicate:

- UCI identity
- Primary message
- Invitation
- Next service information

Required primary message:

> UNA IGLESIA QUE INTERCEDE.

Supporting message:

> Una comunidad que busca a Dios, vive Su Palabra y permanece en oración.

Primary actions:

- Conócenos
- Ver último sermón

Service information:

- Day
- Time
- Location
- Directions

The hero should prioritize visual impact while preserving readability and
accessibility.

---

# 7. Church Identity Requirements

The website must include a section explaining what UCI is.

The identity section should communicate:

- Church name
- Meaning / identity
- Mission or central purpose
- Community character
- Biblical orientation
- Prayer / intercession emphasis

The section should incorporate the UCI visual identity.

Primary visual symbol:

- Globe
- Open Bible
- Heartbeat

---

# 8. Core Pillars

The homepage must communicate three conceptual pillars:

## ADORAMOS

Focus:

Worship and devotion to God.

---

## APRENDEMOS

Focus:

Growing through God's Word and biblical teaching.

---

## INTERCEDEMOS

Focus:

Prayer, intercession and standing in prayer for others.

These pillars form part of the current UCI homepage concept.

Their final copy may be refined during content production without changing
their conceptual purpose.

---

# 9. Visit Experience

The website must contain a clear "first visit" experience.

Suggested entry point:

> ¿ES TU PRIMERA VEZ EN UCI?

The experience must provide practical information including:

- Location
- Service schedule
- What to expect
- How to arrive
- Contact method

The content must be editable through the CMS where appropriate.

---

# 10. Sermon Requirements

## 10.1 Sermon Entity

A sermon may contain:

- Title
- Slug
- Description
- Scripture reference
- Preacher
- Date
- Series
- Topic
- Cover image
- Video URL
- Audio URL
- Notes / PDF
- Publication status
- Featured status

Not every field must be mandatory.

---

## 10.2 Sermon Listing

The sermon archive must support browsing.

Possible filtering dimensions:

- Preacher
- Series
- Topic
- Date

The interface must remain usable when the sermon library grows.

---

## 10.3 Featured Sermon

The homepage must be able to display a featured/latest sermon.

The CMS must provide a mechanism for determining which sermon appears as
the primary featured sermon.

---

## 10.4 Sermon Detail

Each published sermon should have its own public URL.

The sermon page should provide:

- Title
- Preacher
- Date
- Scripture
- Description
- Video
- Audio when available
- Notes when available
- Related sermons when appropriate

---

# 11. Event Requirements

## 11.1 Event Entity

An event may contain:

- Title
- Slug
- Description
- Date
- Start time
- End time
- Location
- Image
- Category
- Registration URL
- Contact information
- Publication status
- Featured status

---

## 11.2 Event Listing

The public website must provide:

- Upcoming events
- Event detail pages
- Calendar or archive access when appropriate

Past events should not appear as upcoming events.

---

# 12. Ministry Requirements

Each ministry may contain:

- Name
- Slug
- Description
- Image
- Schedule
- Meeting location
- Leader
- Contact
- Social links
- Status

The website must provide a ministry listing and individual ministry
information when appropriate.

---

# 13. Stories / Testimonials

The website may publish stories or testimonies from the church community.

A story may contain:

- Title
- Person's name
- Short description
- Testimony
- Image
- Date
- Publication status

The CMS must allow administrators to control whether a story is published.

Stories should be treated as human content rather than generic marketing
testimonials.

---

# 14. News / Articles

The CMS should support church articles or news.

An article may contain:

- Title
- Slug
- Excerpt
- Content
- Cover image
- Author
- Publication date
- Category
- Tags
- Publication status

This functionality may be activated according to the church's actual
content needs.

---

# 15. Gallery

The CMS must support church photography and media galleries.

Gallery content may include:

- Image
- Title
- Description
- Date
- Category
- Event association
- Publication status

The public gallery must prioritize authentic UCI photography.

---

# 16. Giving

The website may include a giving section.

The initial website should communicate:

> UNA IGLESIA GENEROSA

The section must provide the official giving method configured by UCI.

Possible methods may include:

- External giving platform
- Bank transfer
- Payment link
- Other official mechanism

The CMS must allow the administrator to update the relevant information.

The website must not invent or assume financial information.

---

# 17. Live / Online Content

The website must support an optional "Ver en vivo" experience.

When an online service is active, the website may provide:

- Live video
- Platform link
- Service information
- Current message information

When there is no active live service, the navigation should redirect to
the most relevant configured online content or sermon experience.

The exact behavior will be defined during implementation.

---

# 18. Contact Requirements

The website must provide clear contact information.

Configurable information includes:

- Church name
- Address
- Phone
- WhatsApp
- Email
- Social networks
- Service schedules
- Map/location
- Contact form when required

The public website must not display placeholder information in production.

---

# 19. Social Media

The CMS must allow administrators to configure official social channels.

Potential channels include:

- Instagram
- Facebook
- YouTube
- TikTok
- WhatsApp

Only configured channels should appear publicly.

---

# 20. Church Information

The CMS must allow management of general church information.

Possible fields:

- Church name
- Full name
- Description
- Mission
- Vision
- Address
- City
- Phone
- WhatsApp
- Email
- Service schedules
- Map coordinates
- Social links
- Logo
- Favicon
- Main images

---

# 21. Content Relationships

The CMS should support relationships between content entities.

Examples:

### Sermon → Series

A sermon may belong to a series.

### Sermon → Preacher

A sermon may be associated with a preacher.

### Event → Ministry

An event may belong to a ministry.

### Story → Event

A story may optionally originate from an event or activity.

### Gallery → Event

Gallery images may be associated with an event.

These relationships should be used where they provide useful content
discovery without introducing unnecessary complexity.

---

# 22. Search and Discovery

The public website should support content discovery as the amount of
content grows.

At minimum, sermon discovery should support filtering.

A global search may be introduced if justified by the final content volume.

The initial implementation should avoid adding search complexity that does
not provide meaningful value.

---

# 23. CMS Requirements

## 23.1 Dashboard

The CMS dashboard should provide a concise overview of:

- Recent sermons
- Upcoming events
- Published content
- Draft content
- Relevant content statistics

The dashboard should prioritize operational clarity over visual
decoration.

---

## 23.2 Content Management

Administrators must be able to:

- Create
- View
- Edit
- Publish
- Unpublish
- Archive
- Delete

content according to their permissions.

---

## 23.3 Media Management

Administrators must be able to:

- Upload images
- Select existing media
- Replace media
- Remove unused media where permitted

The CMS should provide enough metadata to identify uploaded media.

---

# 24. Publishing Rules

Public content must only become visible when its publication state permits
it.

Draft content must never appear on the public website.

Archived or unpublished content must not appear in normal public listings.

Future-dated content must respect its configured publication date when such
functionality is enabled.

---

# 25. Content Quality Requirements

The website must prioritize:

- Accurate information
- Current schedules
- Authentic photography
- Consistent naming
- Consistent typography
- Correct Scripture references
- Correct dates
- Correct contact information

The CMS should make incorrect or incomplete information less likely through
appropriate validation.

---

# 26. Mobile Requirements

The website must be fully usable on mobile devices.

Mobile is not a reduced desktop version.

The design must preserve:

- Visual hierarchy
- Navigation clarity
- Readability
- Touch targets
- Service information
- Sermon access
- Event access
- Contact actions

The approved mobile concept shown in the design mockup should guide the
responsive implementation.

---

# 27. SEO Requirements

The public website must support search-engine discoverability.

Requirements include:

- Semantic HTML
- Page titles
- Meta descriptions
- Canonical URLs
- Open Graph metadata
- Structured data where applicable
- XML sitemap
- Robots configuration
- Clean URLs
- Indexable public content

Specific SEO implementation details are defined separately.

---

# 28. Performance Requirements

The public website must prioritize performance.

Requirements include:

- Optimized images
- Responsive image delivery
- Lazy loading where appropriate
- Minimal client-side JavaScript
- Static/server-rendered content where appropriate
- Efficient asset loading
- Avoidance of unnecessary third-party scripts

Interactive behavior should not compromise initial page performance.

---

# 29. Accessibility Requirements

The website must provide an accessible experience.

Requirements include:

- Semantic HTML
- Keyboard navigation
- Visible focus states
- Sufficient color contrast
- Accessible labels
- Alternative text for meaningful images
- Appropriate heading hierarchy
- Reduced-motion consideration
- Accessible interactive controls

Accessibility must be considered during component and page design rather
than added only at the end.

---

# 30. Security Requirements

The system must protect:

- Administrative authentication
- CMS authorization
- Content management operations
- Uploaded media
- API endpoints
- Database access
- Sensitive configuration

Administrative operations must require authentication and appropriate
authorization.

Security architecture is defined separately.

---

# 31. Content Ownership

The website belongs to Iglesia UCI.

The CMS must make it possible for authorized church personnel to maintain
the website independently of the development team for normal content
operations.

---

# 32. Initial Public Routes

The initial public information architecture should support routes
equivalent to:

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

Additional routes may be introduced when justified by the final content
model.

---

# 33. Initial Administrative Routes

The administrative interface should be available under:

/panel

The exact internal route structure is defined by the administrative
architecture.

---

# 34. Product Constraints

The project must remain intentionally focused.

Avoid introducing:

- unnecessary third-party services
- unnecessary frontend frameworks
- unnecessary backend services
- unnecessary microservices
- unnecessary database complexity
- unnecessary CMS abstractions

The architecture should remain appropriate for a church website and its
actual operational needs.

---

# 35. Content vs. Presentation

Content and presentation must remain conceptually separated.

The CMS manages content.

The public website determines how that content is presented according to
the approved UCI design system.

Administrators should not be required to construct page layouts manually
through arbitrary visual builders.

The website should maintain a controlled and coherent visual identity.

---

# 36. Future Extensibility

The architecture should allow future capabilities without requiring a
complete rewrite.

Potential future capabilities may include:

- Prayer requests
- Member areas
- Ministry registration
- Event registration
- Online giving integrations
- Notifications
- Devotional content
- Podcast/audio distribution
- Multiple church locations

These are not part of the initial product scope unless explicitly added
to the requirements.

---

# 37. Requirement Priority

Requirements are conceptually divided into:

### Core

Required for the initial public website.

- Homepage
- Church information
- Service information
- First-time visitor experience
- Sermons
- Events
- Ministries
- Contact
- CMS
- Media management
- SEO foundations
- Responsive experience

### Supporting

Important but can be implemented according to project progression.

- Stories / testimonials
- Gallery
- Articles
- Giving
- Live content
- Advanced discovery

### Future

Not part of the initial implementation.

- Member portal
- Prayer management
- Notifications
- Ministry registration
- Advanced church administration
- Multi-campus management

---

# 38. Product Principle

The UCI website should always prioritize the following order:

1. People
2. Church identity
3. Clear information
4. Connection
5. Content
6. Visual expression
7. Technical complexity

Technology must support the experience rather than become the experience.