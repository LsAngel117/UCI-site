# 10 — SEO & Content Discovery Specification

## 1. Purpose

This document defines the SEO, indexation and content-discovery strategy for the UCI public website.

Its purpose is to ensure that people searching for UCI, its sermons, events, ministries and other public content can discover the right information through search engines and through the website itself.

This document intentionally focuses on:

- technical SEO;
- editorial SEO;
- URL strategy;
- canonical URLs;
- sitemap;
- robots directives;
- Open Graph and social sharing;
- Schema.org structured data;
- indexation rules;
- content discovery;
- sermon discovery;
- event discovery;
- page discovery;
- internal linking;
- content relationships;
- search-friendly content strategy.

It does **not** redefine the API, database architecture, admin-panel experience, authentication, deployment or general CMS capabilities already specified elsewhere.

---

## 2. SEO Objectives

The UCI website should:

1. make UCI discoverable by its official name and relevant local searches;
2. make sermons easy to find by title, speaker, series, topic and date;
3. make upcoming events discoverable;
4. make permanent church information easy to locate;
5. provide search engines with clear relationships between content;
6. generate reliable previews when URLs are shared;
7. prevent drafts, previews and administrative content from being indexed;
8. maintain stable and meaningful URLs;
9. preserve SEO value when content changes;
10. use structured data where it accurately represents visible content.

SEO should support the church's mission and content strategy rather than turn the website into a keyword-driven publication.

---

# 3. SEO Philosophy

## 3.1 People First

Content should be written primarily for people.

The website should answer real questions such as:

- ¿Qué es UCI?
- ¿Dónde está UCI?
- ¿Cuándo son los servicios?
- ¿Cómo puedo visitar UCI?
- ¿Cuál fue el último sermón?
- ¿Quién predicó?
- ¿Sobre qué tema fue el sermón?
- ¿Qué eventos vienen?
- ¿Qué ministerios existen?
- ¿Cómo puedo contactar a UCI?

Search engines should be able to understand those answers because the website communicates them clearly.

## 3.2 No Keyword Stuffing

The site must not use:

- repetitive keywords;
- hidden text;
- artificial keyword blocks;
- irrelevant metadata;
- titles written only for search engines.

Natural language and useful content take priority.

## 3.3 Content as the Main SEO Asset

The most important long-term SEO asset for UCI is the quality and consistency of its real content:

- sermons;
- sermon series;
- events;
- ministry information;
- church information;
- testimonies/stories;
- articles or announcements where genuinely useful.

The CMS should make it possible to publish this content correctly, while this document defines how that content becomes discoverable.

---

# 4. Search Intent

SEO strategy should consider several types of intent.

## 4.1 Navigational Intent

People already know UCI and are looking for:

- UCI;
- Iglesia UCI;
- Unidad Cristiana de Intercesión;
- UCI redes sociales;
- UCI dirección;
- UCI horarios.

The homepage and official information pages should satisfy this intent.

## 4.2 Local Intent

People looking for a church or UCI-related information in its geographic area may search for:

- iglesia cristiana;
- iglesia cerca;
- servicios de iglesia;
- culto;
- iglesia UCI;
- dirección de UCI.

Local information must therefore remain consistent across the website and relevant external profiles.

## 4.3 Sermon Intent

People may search for:

- a sermon title;
- a biblical passage;
- a preacher;
- a sermon series;
- a topic;
- a phrase associated with a sermon.

Sermon pages should expose meaningful metadata and relationships so these searches can lead to the original UCI content.

## 4.4 Event Intent

People may search for:

- an event name;
- a church activity;
- a conference;
- a special service;
- an event date.

Published event pages should contain enough contextual information to answer the searcher's question.

---

# 5. URL Strategy

## 5.1 Principles

Public URLs must be:

- readable;
- stable;
- descriptive;
- lowercase;
- free from unnecessary technical identifiers;
- easy to share;
- predictable.

## 5.2 Core URLs

The initial public structure is:

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

The final implementation must preserve the information architecture defined in `02-information-architecture.md`.

## 5.3 Slugs

Slugs should normally derive from the public title.

Example:

```text
Una iglesia que intercede
→ /sermones/una-iglesia-que-intercede
```

Slugs should avoid:

- database IDs;
- dates as the only identifier;
- unnecessary category prefixes;
- query strings for canonical content.

## 5.4 Slug Changes

Published slugs should not be changed without a reason.

When a published slug changes:

1. the new URL becomes canonical;
2. the previous URL should redirect to the new URL;
3. internal links should be updated;
4. sitemap output should use the new URL;
5. old URLs should not remain as duplicate indexable pages.

## 5.5 Trailing Slash Policy

The site must use one consistent trailing-slash convention.

The convention should be applied consistently to:

- canonical URLs;
- internal links;
- sitemap entries;
- redirects.

---

# 6. Canonical URLs

## 6.1 Canonical Principle

Every indexable public page must have one canonical URL.

Canonical URLs should represent the preferred public version of a page.

## 6.2 Canonical Sources

Canonical URLs should be generated from:

- configured production origin;
- normalized public route;
- current published slug.

They must not depend on arbitrary request parameters.

## 6.3 Query Parameters

Query parameters used for:

- filters;
- sorting;
- tracking;
- temporary UI state;

must not automatically create separate canonical pages.

For example:

```text
/sermones?tema=oracion
```

may be a useful discovery state without becoming a separate indexable document.

## 6.4 Duplicate Content

The site should avoid publishing multiple URLs containing substantially identical content.

Where duplication is unavoidable, canonicalization or non-indexation must be used intentionally.

## 6.5 Preview URLs

Preview URLs must never become normal indexable canonical URLs.

---

# 7. Indexation Strategy

## 7.1 Indexable Content

The following content is generally eligible for indexing when published and complete:

- homepage;
- Nosotros;
- Soy Nuevo;
- Contacto;
- published sermons;
- published sermon series where represented publicly;
- published events where useful after publication;
- published ministries;
- published articles;
- public galleries/pages when editorially useful.

## 7.2 Non-Indexable Content

The following should not be indexed:

- `/panel`;
- authenticated admin pages;
- drafts;
- scheduled unpublished content;
- unpublished content;
- internal preview URLs;
- administrative API responses;
- temporary technical routes;
- duplicate utility states.

## 7.3 Publication Is Required

Being stored in the CMS does not make content indexable.

A piece of content becomes eligible for indexation only when:

- it is published;
- it has a valid public URL;
- it contains sufficient public content;
- it is not explicitly marked noindex.

## 7.4 Thin Content

Content should not be indexed merely because a URL exists.

A page with insufficient useful information should remain unpublished or be handled as a non-indexable utility state.

---

# 8. Robots Rules

## 8.1 Public Site

The public website should permit crawling of intended public content.

## 8.2 Admin

Administrative paths such as:

```text
/panel
```

must not be intended for search indexing.

Authentication remains the real access-control mechanism; robots directives are not a security boundary.

## 8.3 Preview

Preview routes must use appropriate noindex behavior and must be protected from unintended discovery.

## 8.4 API

API endpoints are not the site's primary search documents.

They should not be treated as indexable public content pages.

## 8.5 Robots.txt

The production site should expose a valid:

```text
/robots.txt
```

It should:

- permit intended crawling;
- discourage indexing of administrative/technical areas;
- reference the canonical sitemap location where appropriate.

---

# 9. XML Sitemap

## 9.1 Purpose

The sitemap helps search engines discover important UCI URLs.

It is a discovery mechanism, not a replacement for internal linking.

## 9.2 Sitemap Content

The sitemap should include eligible public URLs such as:

- homepage;
- permanent informational pages;
- published sermons;
- public sermon series;
- published events when appropriate;
- ministries;
- articles;
- other intentionally indexable public content.

## 9.3 Sitemap Exclusions

Do not include:

- drafts;
- scheduled unpublished content;
- archived content that is no longer publicly available;
- `/panel`;
- preview URLs;
- API endpoints;
- duplicate/filter URLs.

## 9.4 Last Modification

Where supported, sitemap entries may expose meaningful `lastmod` information.

It should represent actual meaningful content changes, not artificial timestamp updates.

## 9.5 Dynamic Generation

Because UCI content changes through the CMS, the sitemap should be generated dynamically or regenerated automatically from the published content source.

---

# 10. Open Graph & Social Sharing

## 10.1 Objective

Every important public page should produce a useful preview when shared through messaging or social platforms.

## 10.2 Required Metadata

Indexable content pages should support:

- `og:title`;
- `og:description`;
- `og:url`;
- `og:type`;
- `og:image`;
- `og:site_name`.

Where appropriate, social-specific metadata may also be provided.

## 10.3 Default Sharing Image

UCI should have a controlled default social-sharing image representing the church identity.

The default should use the established:

- dark;
- blue;
- gold;
- UCI logo;

visual language.

## 10.4 Content-Specific Images

Where a sermon, event, article or story has a suitable editorial image, that image should become the preferred social preview.

## 10.5 Image Requirements

Social images should:

- represent the content accurately;
- remain readable at preview sizes;
- avoid excessive text;
- preserve UCI visual identity.

## 10.6 Open Graph Does Not Replace SEO Metadata

Open Graph metadata is primarily for link previews.

It does not replace:

- title tags;
- meta descriptions;
- canonical URLs;
- structured data;
- meaningful page content.

---

# 11. SEO Titles & Meta Descriptions

## 11.1 Title

Every indexable page needs a unique, meaningful title.

The title should communicate:

- what the page is;
- why it matters;
- UCI context where useful.

## 11.2 Sermon Titles

Sermon pages should prioritize the actual sermon title.

A contextual suffix such as UCI may be added when useful.

Example pattern:

```text
[Sermon Title] | Iglesia UCI
```

The exact title template may vary according to actual content length.

## 11.3 Event Titles

Event titles should represent the actual event rather than generic labels.

## 11.4 Meta Description

Descriptions should summarize the actual page.

They should not be keyword lists.

For sermons, useful information may include:

- sermon theme;
- speaker;
- biblical passage;
- relevant context.

For events:

- event name;
- date;
- purpose;
- location where useful.

## 11.5 Editorial Override

CMS editors may provide a deliberate SEO title/description when the default generated value is insufficient.

The existence of this field does not make SEO configuration a free-form page-builder feature.

---

# 12. Schema.org Strategy

## 12.1 General Principle

Structured data should help search engines understand entities represented on the page.

It must always reflect visible, truthful content.

Do not add structured data solely to attempt to obtain a rich result that the page does not genuinely support.

## 12.2 Church / Organization

The site should expose structured information about UCI as the appropriate organization/church entity.

Relevant information may include:

- official name;
- logo;
- website;
- address;
- telephone;
- social profiles;
- location;
- opening/service information where appropriate.

The exact Schema.org type should be selected according to the final implementation and Google's supported structured-data guidance.

## 12.3 WebSite

The homepage may expose WebSite structured data describing the official website.

## 12.4 BreadcrumbList

Content detail pages should expose breadcrumbs when the visual information architecture provides them.

Examples:

```text
Inicio
→ Sermones
→ Sermon específico
```

or:

```text
Inicio
→ Eventos
→ Evento específico
```

## 12.5 Event

Published event pages may use Event structured data when they contain sufficient real event information.

Relevant fields may include:

- name;
- start date;
- end date;
- location;
- description;
- image;
- organizer;
- event status.

## 12.6 Article

Articles/news content may use Article structured data when the content genuinely represents an article.

## 12.7 Video

Where a page presents a qualifying video, appropriate video structured data may be considered.

External YouTube hosting does not prevent the page from describing the video content.

## 12.8 Sermons

Sermons should be represented primarily through clear HTML content and appropriate page metadata.

Where supported and justified, video-related structured data may describe the sermon recording.

A custom unsupported schema type must not be invented simply to label something a sermon.

---

# 13. Sermon Discovery

Sermons are one of the most important content-discovery systems in UCI.

## 13.1 Discoverability Dimensions

A sermon should be discoverable through:

- title;
- speaker;
- series;
- topic;
- Scripture/reference;
- date;
- related sermons;
- homepage feature;
- search;
- internal links.

## 13.2 Sermon Archive

The `/sermones` page should provide an indexable and human-friendly archive.

Users should be able to discover sermons through meaningful filters without requiring every filter state to become an indexable page.

## 13.3 Sermon Detail

A sermon detail page should expose, where available:

- title;
- speaker;
- date;
- series;
- topics;
- Scripture;
- description/summary;
- video;
- sermon notes;
- related sermons.

## 13.4 Speaker Discovery

Speaker names should link to relevant content where the information architecture supports it.

The goal is to create meaningful content relationships rather than isolated sermon pages.

## 13.5 Series Discovery

Sermon series should create another discovery path.

A visitor should be able to move from:

```text
Sermon
→ Series
→ Other sermons in the series
```

## 13.6 Topic Discovery

Topics may help visitors explore related teaching.

Topic pages should only become standalone indexable pages when they contain enough meaningful content to justify being public destinations.

## 13.7 Scripture Discovery

Scripture references should remain visible and semantically meaningful.

They may support discovery through search without requiring an indexable page for every Bible reference.

---

# 14. Event Discovery

## 14.1 Upcoming Events

Upcoming events should be prominently discoverable from:

- homepage;
- `/eventos`;
- relevant ministry pages;
- navigation where appropriate.

## 14.2 Event Detail

An event page should communicate:

- what;
- when;
- where;
- who it is for;
- relevant description;
- registration/action information where applicable.

## 14.3 Past Events

Past events should not automatically disappear from the website.

Their treatment depends on editorial value.

Useful historical event pages may remain publicly accessible while being clearly marked as past.

## 14.4 Expired Events and SEO

An event that has ended does not necessarily need immediate removal.

If the page has enduring value, it may remain indexable.

If it has no continuing value, it may be archived or redirected according to editorial policy.

The system must avoid large numbers of useless expired URLs.

---

# 15. Ministry Discovery

Ministries should be discoverable through:

- `/ministerios`;
- individual ministry pages;
- homepage;
- relevant events;
- relevant stories/articles.

Ministry pages should explain their purpose and how a person can connect.

The system must not invent ministry categories that have not been defined by UCI.

---

# 16. Permanent Page Discovery

Permanent pages should answer core visitor needs.

Important examples:

- Nosotros;
- Soy Nuevo;
- Contacto;
- location;
- service schedule.

These pages should be reachable through:

- primary navigation;
- homepage;
- contextual links;
- footer.

They should not depend on search engines as the only discovery mechanism.

---

# 17. Internal Linking Strategy

## 17.1 Principle

Internal links should help visitors continue their journey.

The site should connect related content naturally.

## 17.2 Recommended Relationships

Examples:

```text
Homepage
→ Último sermón
→ Próximo evento
→ Ministerios
→ Soy Nuevo
```

```text
Sermon
→ Speaker
→ Series
→ Topics
→ Related sermons
```

```text
Event
→ Ministry
→ Related event
```

```text
Ministry
→ Events
→ Stories
```

## 17.3 Link Text

Links should use meaningful text.

Avoid generic labels such as:

- "haz clic aquí";
- "ver más";

when a more descriptive label is possible.

## 17.4 Orphan Pages

Important published pages should not become isolated from the site's internal linking structure.

---

# 18. Content Relationships & Discovery Graph

UCI content should behave as a connected ecosystem.

The conceptual discovery graph is:

```text
UCI
├── Sermons
│   ├── Series
│   ├── Speakers
│   ├── Topics
│   └── Scripture
├── Events
│   ├── Categories
│   └── Ministries
├── Ministries
│   ├── Events
│   └── Stories
├── Stories
├── Articles
└── Permanent Pages
```

These relationships should create multiple legitimate paths to the same useful content.

The objective is not to generate pages automatically for every relationship.

The objective is to make meaningful relationships visible when they provide genuine value.

---

# 19. Homepage as Discovery Hub

The homepage should act as the primary discovery hub.

Its approved content flow already establishes links to:

- UCI identity;
- three pillars;
- next service;
- first-time visitor information;
- latest sermon;
- sermon archive;
- events;
- ministries;
- stories;
- giving;
- final visit CTA.

The homepage should prioritize current and important content rather than attempting to expose every CMS record.

---

# 20. Search & On-Site Discovery

## 20.1 Search Objective

If on-site search is enabled, it should help users find meaningful UCI content.

Initial searchable content should prioritize:

- sermons;
- events;
- ministries;
- articles;
- pages.

## 20.2 Search Results

Results should communicate:

- title;
- content type;
- relevant date;
- short contextual information.

## 20.3 Search and Indexation Are Different

A filter or search result does not automatically become an indexable SEO page.

This distinction prevents thousands of low-value URLs from being created.

---

# 21. Content Strategy for Discoverability

## 21.1 Sermons as Evergreen Content

Sermons can remain useful long after their publication date.

A strong sermon archive should therefore preserve:

- accurate title;
- speaker;
- date;
- Scripture;
- series;
- topic;
- video;
- notes where available.

## 21.2 Events as Temporal Content

Events are time-sensitive.

The site should clearly distinguish:

- upcoming;
- ongoing;
- past;
- archived.

## 21.3 Articles and Announcements

Articles should be published when they provide real informational or pastoral value.

The site should not create articles solely to produce search-engine pages.

## 21.4 Stories

Stories/testimonies can support both human connection and content discovery.

They should remain authentic and should not be written as artificial SEO landing pages.

---

# 22. Local SEO Consistency

The public website should maintain one authoritative version of UCI's:

- official name;
- address;
- service schedule;
- contact information;
- website;
- social profiles.

The same information should be reused consistently across structured data and public pages.

Changes to these values should be treated as important local-search changes.

---

# 23. Search Appearance Integrity

Search engines should see content that matches what users see.

The site must avoid:

- hidden SEO text;
- metadata that contradicts visible content;
- structured data describing nonexistent information;
- false event dates;
- misleading images;
- duplicate canonical declarations.

---

# 24. Indexation Lifecycle

A typical content lifecycle should behave like:

```text
DRAFT
  ↓
SCHEDULED
  ↓
PUBLISHED
  ↓
UPDATED
  ↓
UNPUBLISHED / ARCHIVED
```

SEO behavior:

```text
DRAFT
→ not indexable

SCHEDULED
→ not indexable before publication

PUBLISHED
→ eligible for indexation

UPDATED
→ canonical URL remains stable when possible

UNPUBLISHED
→ removed from normal indexable discovery

ARCHIVED
→ handled according to whether a public historical page remains valuable
```

The SEO layer must respect the publication state defined by the content model.

---

# 25. Redirect Strategy

Redirects should preserve useful URLs when content moves.

Use redirects for:

- changed published slugs;
- consolidated duplicate pages;
- intentionally moved content.

Avoid chains such as:

```text
A → B → C
```

Prefer:

```text
A → C
```

Redirects should not be used to hide broken information architecture.

---

# 26. 404 Strategy

Unknown URLs should return a real 404 response.

The 404 page should:

- maintain UCI visual identity;
- explain that the page was not found;
- offer useful navigation;
- link to important discovery destinations.

The 404 page should not pretend that missing content exists.

---

# 27. Content Freshness

Freshness should come from meaningful editorial activity.

Examples:

- new sermons;
- new events;
- updated church information;
- new stories;
- new articles.

The site should not modify dates artificially just to appear fresh to search engines.

---

# 28. Social and Search Relationship

Social sharing can create discovery paths into the site.

Shared links should resolve to canonical public URLs.

A sermon shared through social media should lead directly to its sermon page rather than an unrelated homepage.

An event shared externally should lead to the event detail page.

---

# 29. SEO Governance

SEO should be treated as part of content quality.

Before publishing important content, editors should ensure:

- title is meaningful;
- slug is appropriate;
- description is useful;
- main image is suitable;
- relationships are correct;
- content is complete;
- public visibility is intentional.

These checks complement the CMS specification; they do not redefine the `/panel` experience.

---

# 30. Technical SEO Acceptance Criteria

The implementation is acceptable when:

- all indexable pages have canonical URLs;
- public URLs are stable and readable;
- sitemap contains intended public URLs;
- sitemap excludes drafts and technical routes;
- robots rules are valid;
- `/panel` is not intended for indexing;
- preview content is protected from indexation;
- Open Graph metadata is generated;
- important content has suitable social images;
- Schema.org data matches visible content;
- published sermons are discoverable by meaningful relationships;
- published events are discoverable;
- permanent pages are internally linked;
- important pages are not orphaned;
- slug changes preserve useful URLs through redirects;
- 404 responses are real 404s;
- search/filter states do not automatically generate indexable duplicates.

---

# 31. Editorial SEO Acceptance Criteria

A publishable content item should have, where applicable:

- meaningful public title;
- appropriate slug;
- useful description;
- correct publication state;
- relevant image;
- correct relationships;
- visible contextual information;
- no misleading SEO metadata.

SEO fields should improve discoverability without replacing substantive content.

---

# 32. Definition of Done

`10-seo-and-content-discovery.md` is satisfied when UCI has a clear and implementable strategy for:

- technical SEO;
- editorial SEO;
- URLs;
- canonicalization;
- robots;
- sitemap;
- Open Graph;
- Schema.org;
- indexation;
- sermon discovery;
- event discovery;
- ministry discovery;
- permanent-page discovery;
- internal linking;
- content relationships;
- on-site discovery;
- local SEO consistency;
- redirects;
- 404 behavior;
- content freshness;
- SEO acceptance criteria.

This document complements, rather than duplicates:

- `05-content-model-cms.md`;
- `06-functional-requirements.md`;
- `07-technical-architecture.md`;
- `08-api-spec.md`;
- `09-admin-panel-spec.md`.

The purpose of this specification is specifically to define **how UCI's public content becomes discoverable, understandable and shareable**, not how the CMS or backend is implemented.
