# UCI Website — Project Vision

## 1. Project

**Name:** Iglesia UCI — Unidad Cristiana de Intercesión

**Project type:** Church website + content management system

**Primary objective:**
Create the official digital presence of Iglesia UCI, providing a modern,
cinematic and spiritually coherent experience that allows visitors,
members and the church community to discover the identity of UCI,
access sermons, discover activities and ministries, plan a visit,
and stay connected with the church.

The website must function as the church's digital front door.

---

## 2. Product Vision

The UCI website must communicate the identity of a church that:

- seeks God
- lives His Word
- remains in prayer
- intercedes
- welcomes people
- builds community
- communicates the Gospel
- provides a clear place for people to connect and participate

The website must not feel like a generic church template.

It must have a distinctive UCI visual identity based on the church's
existing brand and the visual direction established during the design phase.

---

## 3. Core Message

### Primary statement

> UNA IGLESIA QUE INTERCEDE.

### Supporting message

> Una comunidad que busca a Dios, vive Su Palabra y permanece en oración.

This message establishes the emotional and conceptual direction of the
homepage.

---

## 4. Brand Identity

The visual identity must preserve and reinforce the existing UCI identity.

### Core visual symbols

- Globe
- Open Bible
- Heartbeat / ECG line
- UCI typography
- Gold accent
- Blue illumination
- Dark cinematic backgrounds

### Symbolic meaning

**Globe**
Represents reach, community and the mission beyond a single local space.

**Bible**
Represents the Word of God as a central foundation of the church.

**Heartbeat**
Represents life, prayer, intercession and spiritual vitality.

These elements should be treated as a coherent visual system rather than
as isolated decorative elements.

---

## 5. Visual Direction

The website must feel:

- cinematic
- modern
- sober
- spiritual
- welcoming
- premium
- human
- editorial

The design should combine:

- dark cinematic sections
- deep navy backgrounds
- blue atmospheric lighting
- restrained gold accents
- white information sections
- real photography
- strong typography
- generous spacing
- subtle motion

The website must avoid looking like:

- a generic church template
- a stock-photo-heavy website
- an overly corporate website
- an outdated religious website
- an interface composed entirely of generic cards

---

## 6. Color Direction

Primary visual palette:

- Near Black: #05070A
- Deep Navy: #0B1220
- UCI Blue: #1675D1
- Light Blue: #5BB8F5
- Gold: #D9A441
- Light Gold: #F0C96A
- White: #F5F5F5
- Silver Gray: #9CA3AF

Gold must be used as an accent rather than as a dominant color.

Blue should provide the primary visual energy.

Black and deep navy should establish the cinematic and spiritual atmosphere.

White sections should be used strategically to create visual breathing
space and improve content readability.

---

## 7. Design Principles

### 7.1 Identity before decoration

Every major visual decision must reinforce UCI identity.

Decorative elements must not exist only because they look attractive.

---

### 7.2 Visitor first

The website must help a first-time visitor answer quickly:

- Who is UCI?
- What kind of church is UCI?
- When are services?
- Where is UCI?
- What can I expect?
- How can I visit?
- What is happening at UCI?
- Where can I hear a sermon?
- How can I connect?

---

### 7.3 Real people over generic imagery

Photography should prioritize authentic UCI environments,
services, pastors, members, ministries and activities.

Generated or stock visual material may be used as supporting visual content,
but it must not replace the human identity of the church.

---

### 7.4 Editorial storytelling

The homepage should feel like a visual narrative rather than a collection
of independent UI components.

Sections should flow naturally from:

Identity → Invitation → Community → Word → Participation → Connection.

---

### 7.5 Dark and light rhythm

Dark sections should communicate:

- spiritual atmosphere
- worship
- sermons
- testimony
- identity
- emotional moments

Light sections should communicate:

- information
- schedules
- events
- navigation
- practical visitor information

The contrast should create rhythm throughout the page.

---

## 8. Homepage Concept

The homepage approved during the design phase follows this conceptual order:

1. Navigation
2. Hero
3. Somos UCI
4. En UCI / three pillars
5. Próximo servicio
6. Primera vez en UCI
7. Último sermón
8. Sermon library
9. Próximos eventos
10. Ministerios
11. Testimonios / historias
12. Generosidad
13. Final CTA
14. Footer

This structure is the current approved conceptual direction.

Individual sections may evolve during implementation, but changes must
preserve the overall narrative and visitor-first objective.

---

## 9. Hero

The hero must establish the identity of UCI immediately.

### Main heading

> UNA IGLESIA  
> QUE INTERCEDE.

### Supporting text

> Una comunidad que busca a Dios, vive Su Palabra y permanece en oración.

### Primary actions

- Conócenos
- Ver último sermón

### Practical information

The hero should expose the next service information without requiring the
visitor to navigate away.

Information includes:

- day
- time
- location
- route / directions

The hero should use cinematic real photography or an equivalent
high-quality visual composition.

---

## 10. Core Experience

The website is not only an informational site.

It must provide four primary experiences:

### Discover

Understand who UCI is.

### Connect

Find a place within the church.

### Listen

Access sermons and biblical teaching.

### Participate

Discover events, ministries and opportunities to get involved.

---

## 11. Content Strategy

The website must support content that changes over time without requiring
developers to modify the public website manually.

Content areas include:

- sermons
- events
- ministries
- stories / testimonials
- news or articles
- gallery
- church information
- general site settings

These content areas will be managed through the CMS.

---

## 12. CMS Vision

The CMS must allow authorized church administrators to manage the content
that appears on the public website.

The CMS should prioritize:

- simplicity
- clarity
- controlled publishing
- media management
- content consistency
- role-based permissions
- traceability

The CMS is an operational tool for the church, not the visual center of
the product.

The public website remains the primary product experience.

---

## 13. Technical Direction

The project will follow the architectural direction established for the
UCI website:

- Astro for the public website
- React for interactive interfaces/components
- Node.js API
- PostgreSQL
- React-based administrative panel
- `/panel` for administration

The project will maintain a simple architecture rather than introducing
unnecessary monorepo complexity.

The implementation must remain compatible with the CLI + gentle-AI
orchestrator + specialized sub-agent workflow.

---

## 14. AI-Assisted Development Model

This project is specification-driven.

The development process will be executed through:

- CLI
- gentle-AI orchestrator
- specialized AI sub-agents
- model-specific tasks

The `docs/` directory is therefore considered a source of truth for the
implementation process.

Sub-agents must consult the relevant specifications before implementing
features.

Agents must not redefine previously approved product, architectural or
visual decisions without an explicit change to the specifications.

---

## 15. Non-Goals

The initial project is not intended to become:

- a social network
- a complete church ERP
- a theological education platform
- a complex member-management system
- an unnecessarily complex CMS
- a generic website template

The first objective is a high-quality church website with a focused CMS
for managing its public content.

---

## 16. Definition of Success

The project succeeds when:

1. A first-time visitor immediately understands what UCI is.
2. Service information is easy to find.
3. A visitor can understand how to attend UCI.
4. Sermons are easy to discover and consume.
5. Events and ministries are easy to discover.
6. The website visually communicates the UCI identity.
7. Church administrators can manage content without developer intervention.
8. The experience works well on desktop and mobile.
9. The site is performant and SEO-friendly.
10. The implementation remains consistent with the approved visual,
    product and architectural specifications.

---

## 17. Guiding Principle

> The website should not simply tell people that UCI exists.
>
> It should help people understand who UCI is, experience its identity,
> discover what God is doing through the church, and find a place to connect.