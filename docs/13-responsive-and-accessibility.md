# Responsive Design and Accessibility

## 1. Purpose

This document defines the responsive behavior and accessibility requirements for the UCI public website and administrative CMS.

The objective is to ensure that the platform:

- works across desktop, tablet, and mobile devices;
- provides a consistent experience across viewport sizes;
- remains usable with keyboard navigation;
- supports assistive technologies;
- follows WCAG 2.2 Level AA as the primary accessibility target;
- preserves content hierarchy and functionality across responsive states;
- provides accessible forms, navigation, media, dialogs, editors, tables, and administrative workflows.

This specification complements:

- `02-architecture-technical-specs.md`
- `03-visual-design-system.md`
- `08-api-spec.md`
- `09-admin-panel-spec.md`
- `10-seo-and-content-discovery.md`
- `11-security-and-permissions.md`
- `12-media-and-assets.md`

This document defines behavior and requirements rather than prescribing a specific CSS framework or component library.

---

# 2. Accessibility Objective

The UCI platform should target:

> **WCAG 2.2 Level AA**

Accessibility is a product requirement rather than a post-development audit.

Accessibility must therefore be considered in:

- information architecture;
- visual design;
- content modeling;
- component behavior;
- forms;
- media;
- navigation;
- editorial workflows;
- responsive layouts;
- authentication;
- error handling.

---

# 3. Scope

Accessibility requirements apply to:

```text
Public Website
├── Home
├── Sermons
├── Sermon Detail
├── Events
├── Event Detail
├── Ministries
├── Pages
├── Contact
├── Navigation
└── Media

Administrative CMS
├── Login
├── Dashboard
├── Content Lists
├── Content Editors
├── Rich Text Editor
├── Media Library
├── Navigation Management
├── SEO
├── Settings
├── Users
└── Audit
```

---

# 4. Responsive Design Principles

The platform must be responsive by default.

The design should adapt to the available viewport rather than create separate desktop and mobile applications.

The same underlying content and functionality must remain available across supported viewport sizes unless a deliberate responsive adaptation is required.

---

# 5. Responsive Breakpoints

Breakpoints must be based on layout needs rather than targeting specific device brands.

The implementation may use logical ranges such as:

```text
Small
Medium
Large
Extra Large
```

The exact pixel values belong to the implementation/design system and should not be duplicated throughout individual components.

Components should primarily respond to available space.

---

# 6. Mobile-First Behavior

Public components should generally be designed from the smallest practical viewport upward.

The responsive progression should conceptually be:

```text
Mobile
   ↓
Tablet
   ↓
Desktop
   ↓
Wide Desktop
```

Desktop layouts must not be treated as the only authoritative layout.

---

# 7. Public Site Responsive Requirements

The public site must remain functional at:

- narrow mobile widths;
- common smartphone widths;
- tablet widths;
- laptop widths;
- desktop widths;
- large desktop widths.

The interface must avoid:

- horizontal scrolling caused by normal content;
- clipped buttons;
- inaccessible navigation;
- unreadable text;
- overlapping content;
- media extending beyond its container.

---

# 8. Content Priority

Responsive behavior must preserve content priority.

When space decreases:

```text
Primary content
    ↓
Primary action
    ↓
Secondary content
    ↓
Decorative content
```

Decorative elements may be reduced or removed when necessary.

Core content and actions must not disappear merely because the viewport is small.

---

# 9. Navigation

The public navigation must provide a usable mobile experience.

Possible behavior:

```text
Desktop:
Full navigation

Mobile:
Menu trigger
   ↓
Navigation panel
```

The mobile navigation must:

- have a clear accessible name;
- expose its expanded/collapsed state;
- be keyboard accessible;
- manage focus correctly;
- allow users to close it;
- not trap users unexpectedly.

---

# 10. Mobile Navigation Focus

When a mobile navigation drawer/dialog opens:

1. focus should move to an appropriate element;
2. the navigation should expose its state;
3. keyboard users must be able to navigate it;
4. closing should return focus to the triggering control where appropriate.

The exact implementation may use a disclosure pattern or dialog pattern depending on the visual behavior.

---

# 11. Header Behavior

The header should adapt to available space without hiding essential functionality.

If a sticky header is used:

- it must not obscure focused content;
- it must not prevent keyboard users from understanding their position;
- it must remain usable at zoomed layouts.

---

# 12. Hero Sections

Hero sections must remain functional on small screens.

Desktop composition may be simplified on mobile.

The implementation must avoid:

- text becoming unreadable over imagery;
- buttons being pushed below excessive decorative space;
- important content being hidden behind background elements;
- excessively tall hero sections.

---

# 13. Typography

Typography must preserve readability across viewport sizes.

The design system should define:

- body text sizes;
- heading scale;
- line height;
- letter spacing;
- maximum readable content width.

Text must not depend on image rendering to remain understandable.

---

# 14. Text Scaling

The site must remain usable when text is enlarged.

The implementation must avoid fixed-height containers that clip text.

Components must accommodate content growth.

---

# 15. Reflow

The site should support reflow consistent with WCAG requirements.

Content must remain usable when viewport width is substantially reduced or browser text size is increased.

Users should not be forced into unnecessary two-dimensional scrolling for normal textual content.

---

# 16. Content Width

Long-form content such as sermons should use an appropriate maximum reading width.

Example conceptual structure:

```text
Viewport
└── Content container
    └── Reading column
        └── Long-form content
```

The reading column should not span the entire desktop viewport.

---

# 17. Responsive Grids

Cards and content collections should adapt naturally.

Example:

```text
Desktop:
4 → 3 columns

Tablet:
2 columns

Mobile:
1 column
```

The exact column count belongs to each component's layout requirements.

---

# 18. Cards

Cards must preserve:

- readable titles;
- meaningful image proportions;
- accessible links;
- usable actions.

A card must not rely solely on hover behavior to reveal essential information.

---

# 19. Touch Targets

Interactive controls must provide sufficiently large touch targets.

The design should follow WCAG 2.2 requirements for target size and spacing.

Small icons must not become difficult to activate on mobile.

---

# 20. Hover Independence

Important information and actions must not depend exclusively on hover.

Anything revealed on hover should have an appropriate keyboard/focus equivalent.

---

# 21. Focus Visibility

Keyboard focus must always be visually identifiable.

The design must not remove browser focus indicators without providing a stronger accessible alternative.

Focus indicators should provide sufficient contrast against surrounding content.

---

# 22. Keyboard Navigation

All interactive functionality must be usable using a keyboard.

Users must be able to access:

- navigation;
- links;
- buttons;
- forms;
- dialogs;
- menus;
- tabs;
- accordions;
- media controls;
- administrative tables;
- content editors.

---

# 23. Logical Focus Order

Focus order must follow the visual and semantic structure of the page.

The implementation must avoid unnecessary custom `tabindex` values.

Positive `tabindex` values should generally be avoided.

---

# 24. Skip Navigation

The public site should provide a skip link allowing keyboard users to bypass repeated navigation.

Conceptually:

```text
Skip to main content
```

The target must have an appropriate semantic identifier.

---

# 25. Semantic HTML

The public website should use semantic HTML elements where appropriate:

```text
header
nav
main
section
article
aside
footer
button
form
label
```

ARIA must enhance semantics rather than replace valid HTML unnecessarily.

---

# 26. Heading Hierarchy

Pages must maintain a logical heading structure.

The general model should be:

```text
h1
 ├── h2
 │    ├── h3
 │    └── h3
 └── h2
```

Heading levels must not be selected purely for visual size.

---

# 27. Landmark Structure

Public pages should expose meaningful landmarks.

Typical structure:

```text
header
nav
main
footer
```

Additional regions may be used when semantically appropriate.

---

# 28. Accessible Names

Interactive elements must have accessible names.

Examples:

Bad:

```text
<button>
  <Icon />
</button>
```

Preferred:

```text
<button aria-label="Open navigation">
```

or visible text that already provides the accessible name.

---

# 29. Icon-Only Controls

Icon-only controls must expose meaningful accessible names.

Decorative icons should be hidden from assistive technologies where appropriate.

---

# 30. Images

Images must follow the media requirements defined in `12-media-and-assets.md`.

Meaningful images require appropriate alternative text.

Decorative images should not create redundant announcements.

---

# 31. Complex Images

Charts, diagrams, or complex informational graphics require an accessible textual alternative.

The alternative may be:

- nearby explanatory text;
- a description;
- a linked accessible resource.

---

# 32. Background Images

Background images must not contain essential information that is unavailable elsewhere.

Important text should not be embedded solely inside a background image.

---

# 33. Video Accessibility

External video content should support:

- accessible player controls;
- captions when available;
- meaningful titles;
- transcripts where appropriate.

YouTube embeds must not become inaccessible black boxes within the site.

---

# 34. Audio Accessibility

If audio is introduced, important spoken content should have an accessible equivalent where appropriate.

A sermon audio player should not be the only way to access the sermon information.

---

# 35. Motion

Animations must remain subtle and purposeful.

The UCI visual identity may use:

- blue/gold glow;
- orbital movement;
- subtle Earth motion;
- ECG pulse;
- light effects.

These effects must not interfere with content comprehension.

---

# 36. Reduced Motion

The site must respect:

```text
prefers-reduced-motion
```

Users who request reduced motion should receive:

- reduced transitions;
- reduced decorative animation;
- no unnecessary parallax;
- no continuous decorative movement where avoidable.

Essential state changes must remain understandable without animation.

---

# 37. Auto-Playing Media

Autoplay should be avoided unless there is a strong product reason.

If media automatically moves or changes:

- users must retain control;
- motion must not create accessibility problems;
- reduced-motion preferences must be respected.

---

# 38. Color

Color must not be the only mechanism used to communicate information.

For example:

```text
Draft
Published
Archived
```

should not be differentiated only by color.

Use combinations such as:

- text;
- icon;
- status label;
- color.

---

# 39. Contrast

Text and meaningful interface elements must meet appropriate WCAG 2.2 AA contrast requirements.

The UCI blue/gold visual identity must be adapted where necessary to preserve readability.

Brand color fidelity must not override accessibility requirements for body text or controls.

---

# 40. Links

Links must be distinguishable from surrounding content.

Link text should communicate destination or purpose.

Avoid vague links such as:

```text
Click here
More
Read this
```

when context is insufficient.

---

# 41. Buttons vs Links

Use:

```text
<a>
```

for navigation.

Use:

```text
<button>
```

for actions.

The interface should not use clickable `<div>` elements as substitutes for semantic controls.

---

# 42. Forms

All forms must provide:

- visible labels;
- appropriate input types;
- accessible descriptions where needed;
- validation feedback;
- clear error states;
- keyboard support.

---

# 43. Form Labels

Every form control must have an associated label.

Placeholder text must not be used as the only label.

---

# 44. Form Errors

Errors must be:

- understandable;
- associated with the relevant field;
- visually identifiable;
- announced appropriately to assistive technology.

Example:

```text
Email
[invalid value]

Please enter a valid email address.
```

---

# 45. Required Fields

Required fields must be communicated in more than one way where appropriate.

The implementation should use semantic attributes such as:

```text
required
```

when applicable.

---

# 46. Authentication Accessibility

The `/panel/login` experience must support:

- keyboard navigation;
- visible focus;
- accessible labels;
- password manager compatibility;
- readable error messages;
- sufficient contrast.

Security controls must not unnecessarily make authentication inaccessible.

---

# 47. Dialogs

Dialogs must:

- have an accessible name;
- trap focus only while appropriate;
- provide a close mechanism;
- support Escape where appropriate;
- restore focus appropriately.

Destructive confirmation dialogs must clearly identify the action.

---

# 48. Toasts and Notifications

Transient notifications should not be the only mechanism for communicating important state.

For example, after saving content:

```text
Content saved successfully.
```

should be exposed appropriately to assistive technologies.

Critical errors should remain visible long enough to understand and recover.

---

# 49. Tables

Administrative tables must remain usable on smaller screens.

Possible responsive strategies include:

- horizontal scrolling within the table region;
- priority columns;
- stacked mobile representations;
- responsive row layouts.

The implementation must not arbitrarily hide critical information.

---

# 50. Data Table Accessibility

Tables should provide:

- proper headers;
- meaningful row/column relationships;
- sortable state where applicable;
- accessible pagination;
- accessible selection controls.

---

# 51. Pagination

Pagination controls must expose:

- current page;
- previous/next;
- available pages where shown.

Example:

```text
Previous
Page 2 of 8
Next
```

---

# 52. Search

Search controls must have:

- an accessible label;
- clear input purpose;
- accessible result status where appropriate;
- keyboard navigation.

Dynamic search results must not create confusing focus behavior.

---

# 53. Empty States

Empty states must explain what happened and, where appropriate, what the user can do next.

Example:

```text
No sermons found.

Try changing the filters or create a new sermon.
```

---

# 54. Loading States

Loading states should communicate progress without causing unnecessary screen-reader noise.

Skeletons should not replace meaningful accessible status where the user needs to know that content is loading.

---

# 55. Admin Panel Responsive Behavior

The `/panel` must support:

- desktop;
- tablet;
- mobile where practical.

The admin interface may use different information density than the public site, but it must remain operational on smaller screens.

---

# 56. Admin Sidebar

Desktop:

```text
Sidebar
   +
Main content
```

Mobile:

```text
Top bar
   +
Navigation drawer
   +
Main content
```

The transition must preserve access to every authorized section.

---

# 57. Admin Content Editors

Content editors must remain usable on smaller screens.

Complex forms may change from:

```text
Two-column desktop
```

to:

```text
Single-column mobile
```

without losing fields or controls.

---

# 58. Sticky Editor Controls

Sticky save/publish controls may be used.

They must not:

- cover form content;
- obscure focused elements;
- create keyboard traps;
- become unusable at zoom.

---

# 59. Rich Text Editor

The rich text editor must provide accessible controls.

Toolbar buttons require:

- accessible names;
- keyboard access;
- visible focus;
- meaningful state where applicable.

Editor content itself must remain navigable using standard keyboard behavior.

---

# 60. Media Library Accessibility

The Media Library must support:

- keyboard navigation;
- accessible selection;
- list/grid alternatives where necessary;
- visible focus;
- accessible upload controls;
- meaningful image labels.

Image thumbnails must have meaningful accessible descriptions where needed.

---

# 61. Drag and Drop

Drag-and-drop functionality must never be the only way to perform an action.

If media can be dragged into an upload area, there must also be:

```text
Choose file
```

or equivalent keyboard-accessible functionality.

---

# 62. Responsive Media Picker

The media picker must work on narrow screens.

Selection controls must remain accessible without requiring precise pointer interaction.

---

# 63. Zoom

The site should remain usable when browser zoom is increased.

Layouts must accommodate enlarged content rather than relying on fixed dimensions.

---

# 64. Orientation

The public site should work in both portrait and landscape orientations unless a specific feature legitimately requires otherwise.

---

# 65. Touch and Pointer Input

Functionality must not depend exclusively on:

- hover;
- precise mouse movement;
- drag-only interactions.

Touch alternatives must exist.

---

# 66. Responsive Images

The implementation must use the media architecture defined in `12-media-and-assets.md`.

Important images should support:

```text
srcset
sizes
width
height
```

when appropriate.

This reduces unnecessary downloads and helps prevent layout shifts.

---

# 67. Performance and Accessibility

Performance is part of the user experience.

Responsive pages should minimize:

- oversized images;
- unnecessary JavaScript;
- blocking resources;
- excessive animations;
- layout shifts.

The Astro architecture should keep static content server-rendered whenever interactivity is not required.

---

# 68. React Islands

React should be introduced selectively.

Interactive behavior should become a React island only when needed.

Examples:

```text
Navigation drawer
Search interaction
Media picker
Admin interface
Interactive forms
```

Pure content should not require unnecessary client-side JavaScript.

---

# 69. Progressive Enhancement

Public content should remain accessible as HTML whenever possible.

Interactive enhancements should improve the experience rather than make core content dependent on JavaScript.

---

# 70. Accessibility and SEO

Semantic accessibility also benefits SEO.

Requirements such as:

- semantic headings;
- meaningful links;
- descriptive page structure;
- useful alternative text;
- clear navigation;
- structured content

should support both accessibility and discoverability.

---

# 71. Accessibility of Published Content

The CMS should make accessibility possible at the editorial level.

Editors should have access to:

- alt text;
- captions;
- headings;
- link labels;
- descriptive titles;
- structured content.

The CMS should avoid forcing technically invalid or inaccessible content structures.

---

# 72. Editorial Accessibility Guidance

Where practical, the CMS should provide contextual guidance.

Examples:

```text
Alt text:
Describe the important subject or purpose of this image.

Heading:
Use headings to structure the content, not simply to change text size.
```

Guidance should assist editors without blocking legitimate editorial decisions unnecessarily.

---

# 73. Accessibility Validation

The project should validate accessibility through multiple layers:

```text
Design review
   ↓
Component review
   ↓
Automated checks
   ↓
Keyboard testing
   ↓
Screen-reader testing
   ↓
Responsive testing
```

Automated tooling must not be considered sufficient by itself.

---

# 74. Keyboard Testing Requirements

At minimum, verify:

- page navigation;
- menus;
- dialogs;
- forms;
- search;
- content editor;
- media picker;
- tables;
- pagination;
- publish workflow.

---

# 75. Screen Reader Testing

Representative workflows should be tested using common screen-reader/browser combinations.

Testing should focus on:

- landmarks;
- headings;
- navigation;
- forms;
- dialogs;
- dynamic status messages;
- content editor behavior.

---

# 76. Accessibility of Status Changes

Important dynamic state changes should be announced appropriately.

Examples:

```text
Saved successfully
Upload completed
Upload failed
Content published
Validation error
Search results updated
```

---

# 77. Error Recovery

Accessible error handling must tell users:

1. what went wrong;
2. where it happened;
3. how to recover where possible.

Errors should not merely change an input border color.

---

# 78. Language

The public site must declare the correct document language.

The CMS should support content language metadata in the future if multilingual content becomes a requirement.

Multilingual content is not part of the first release.

---

# 79. Accessibility and Authentication Security

Accessibility must not be weakened by security controls.

For example:

- CAPTCHA should not be the only anti-abuse mechanism;
- authentication errors should remain understandable;
- password managers should work;
- keyboard users must be able to authenticate.

---

# 80. Accessibility and Content Preview

Preview mode must preserve the same accessibility requirements as public pages.

Preview is not exempt from semantic structure or keyboard usability.

---

# 81. Accessibility and Archived Content

Archived content that remains publicly accessible must continue to meet the same accessibility expectations as published content.

---

# 82. Responsive Content Model

Content should not contain hardcoded assumptions about desktop dimensions.

Editors should not be required to create separate mobile versions of normal content.

The frontend owns responsive presentation.

---

# 83. Embedded Content

Third-party embeds such as YouTube or maps must be:

- responsive;
- keyboard accessible;
- visually contained;
- compatible with CSP;
- accompanied by sufficient context.

---

# 84. Maps

If Google Maps or another map provider is integrated:

- the map must not be the only source of location information;
- address information must also exist as text;
- keyboard accessibility must be considered;
- third-party scripts should load only when necessary.

---

# 85. Responsive Event Information

Event information should remain readable and actionable on mobile.

Important information such as:

- date;
- time;
- location;
- registration/action;

must remain visible without requiring horizontal scrolling.

---

# 86. Responsive Sermon Pages

Sermon detail pages should prioritize:

```text
Title
Preacher
Date
Scripture
Description
Video/audio
Notes
```

The reading experience should remain comfortable on mobile.

---

# 87. Responsive Media Galleries

Media galleries should adapt their grid without creating inaccessible interactions.

If a lightbox is used:

- keyboard navigation is required;
- Escape must close it;
- focus must be managed;
- images must have meaningful descriptions.

---

# 88. Accessibility Non-Goals

The first release does not require:

- a separate accessible version of the site;
- a separate mobile application;
- WCAG AAA compliance;
- elimination of all third-party accessibility limitations.

The objective is an accessible product architecture targeting WCAG 2.2 AA.

---

# 89. Definition of Done

A public or administrative interface should not be considered complete until it has been considered for:

```text
Responsive layout
Keyboard navigation
Focus visibility
Semantic HTML
Accessible names
Forms and validation
Color contrast
Motion preferences
Screen-reader behavior
Touch interaction
Zoom/reflow
```

---

# 90. Final Responsive and Accessibility Model

```text
                    UCI EXPERIENCE
                          │
            ┌─────────────┴─────────────┐
            │                           │
       Public Website              Admin Panel
            │                           │
     ┌──────┴──────┐             ┌──────┴──────┐
     │             │             │             │
   Mobile       Desktop       Mobile        Desktop
     │             │             │             │
     └──────┬──────┘             └──────┬──────┘
            │                           │
            └─────────────┬─────────────┘
                          │
                Accessible Components
                          │
          ┌───────────────┼────────────────┐
          │               │                │
       Keyboard        Screen Reader     Touch
          │               │                │
          └───────────────┼────────────────┘
                          │
                    WCAG 2.2 AA
```

The central principle is:

> **Responsive behavior changes presentation, not access to essential content or functionality. Accessibility is part of the product architecture, not a visual polish step.**