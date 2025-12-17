# Source Code - View Rendering

Server-rendered HTML views for authenticated guests and admin dashboard.

---

### View Architecture

**Pattern**: Server-side rendering (SSR) with different hydration strategies
- **SSR**: Functions return HTML strings with inline styles and scripts
- **Admin pages**: Full React 19 hydration via `enhance.js`
- **Guest pages**: Vanilla JavaScript only (no React hydration)
- **CSP Compliance**: All inline scripts use nonce-based CSP

**File Structure**:
- `src/views/layout.ts`: Base HTML layout wrapper
- `src/views/admin.tsx`: Admin dashboard shell
- `src/views/event/`: Guest-facing event page components
- `src/views/shared/`: Shared components (theme toggle)

---

### src/views/layout.ts

**Purpose**: Base HTML layout wrapper for all server-rendered pages.

**Key Features**:
- `<html>` scaffold with meta tags, viewport, charset
- CSP nonce injection for inline scripts/styles
- Dark mode flash prevention via inline script (reads `admin-theme` from localStorage)
- Applies `dark` class to `<html>` element when theme is dark
- Responsive design with mobile-first breakpoints

**Function**: `renderLayout(title, content, nonce, options)`

**Parameters**:
- `title`: Page title for `<title>` tag
- `content`: HTML body content
- `nonce`: CSP nonce for inline scripts
- `options.includePageStyles`: Whether to include inline page styles (default: true)

**Output**: Complete HTML document as string

---

### src/views/admin.tsx

**Purpose**: Admin dashboard shell with React hydration point.

**Key Features**:
- Minimal SSR shell: `<div id="root"></div>`
- Loads Vite-built React bundle: `/build/enhance.js`
- Loads Tailwind CSS: `/build/enhance.css`
- React 19 hydrates admin dashboard into `#root`

**Function**: `renderAdminDashboard(nonce)`

**Output**: HTML string with CSP-compliant script tags

**Notes**:
- Admin dashboard requires JavaScript (not progressively enhanced)
- Uses full React SPA experience for complex admin operations

---

### src/views/event.ts

**Purpose**: Re-exports guest event page renderer.

**Export**: `renderEventPage` from `./event/index.ts`

---

### src/views/event/index.ts

**Purpose**: Main renderer for guest-facing event page.

**Key Features**:
- Server-rendered HTML with vanilla JavaScript interactions
- Navigation with dropdowns for event sections
- Theme-aware images (light/dark variants)
- Inline JavaScript for navigation, scroll behavior, theme toggle
- No React hydration - pure SSR with vanilla JS

**Function**: `renderEventPage(view, nonce)`

**Parameters**:
- `view`: `EventPageViewModel` containing guest, event, and navigation data
- `nonce`: CSP nonce

**Output**: Complete HTML page with:
- Top navigation bar with dropdown menus
- Event sections (hero, ceremony, schedule, travel, registry, RSVP)
- Inline styles via `renderEventStyles`
- Inline scripts via `renderEventScripts`
- Theme toggle via `renderThemeScript`

**Guest Page Behavior**:
- Uses `guest-theme` localStorage key for theme persistence
- Applies `data-theme` attribute to `<body>` element
- No React - all interactions via vanilla JavaScript

---

### src/views/event/components/hero.ts

**Purpose**: Renders hero section with event title and date.

**Key Features**:
- Theme-aware hero image (`/assets/light/hero.webp` or `/assets/dark/herodark.webp`)
- Event title from configuration
- Formatted date with timezone
- Welcome message

**Function**: `renderHeroSection(view)`

**Output**: HTML string for hero section

---

### src/views/event/components/ceremony.ts

**Purpose**: Renders ceremony event section.

**Key Features**:
- Event label (e.g., "Ceremony")
- Date and time with timezone
- Venue name and address
- Google Maps link
- Theme-aware image

**Function**: `renderCeremonySection(view)`

**Output**: HTML string for ceremony section

**Notes**:
- Uses `renderTimelineSection` helper for consistent event layout

---

### src/views/event/components/schedule.ts

**Purpose**: Renders schedule/reception event section.

**Key Features**:
- Event label (e.g., "Reception")
- Date and time with timezone
- Venue name and address
- Google Maps link
- Theme-aware image

**Function**: `renderScheduleSection(view)`

**Output**: HTML string for schedule section

**Notes**:
- Generic renderer for any event type (not just reception)

---

### src/views/event/components/travel.ts

**Purpose**: Renders travel/accommodations section.

**Key Features**:
- Collapsible cards for Hotels, Transportation, and Local Guide
- Renders rich-text content from `EventDetails` (addresses, discount codes, notes)
- Theme-aware header image

**Function**: `renderTravelSection(view)`

**Output**: HTML string for travel section

**Notes**:
- Only renders when `view.navigation.showTravel` is true and at least one of `view.accommodations`, `view.transportationGuide`, or `view.localGuide` has content.

---

### src/views/event/components/registry.ts

**Purpose**: Renders gift registry section.

**Key Features**:
- List of registry items (label + URL + optional description)
- Opens links in new tab (`target="_blank"`)
- Theme-aware image
- Includes Stripe honeymoon fund widget (requires Stripe keys to work)

**Function**: `renderRegistrySection(view)`

**Output**: HTML string for registry section

**Notes**:
- Only renders when `view.navigation.showRegistry` is true and `view.registry` has at least one item.

---

### src/views/event/components/rsvp.ts

**Purpose**: Renders RSVP form with attendance and meal selection.

**Key Features**:
- Per-attendee Accept/Decline controls for each invited event
- Optional meal selection controls when `requiresMealSelection` is true (radio pills from `mealOptions`, otherwise freeform input)
- Optional per-attendee dietary notes (toggled, per event, when `collectDietaryNotes` is true)
- Auto-saves changes via `/rsvp` (AJAX) and reports status in `#rsvp-status`

**Function**: `renderRsvpSection(view)`

**Output**: HTML string for RSVP timeline section with `<form id="rsvp-form">`

**Client Behavior** (implemented in `src/views/event/scripts/interactions.ts` via `renderEventScripts`):
- Serializes the form state into the hidden `partyResponses` JSON field and POSTs to `/rsvp`
- Auto-saves on attendance changes (`data-auto-save="true"`) and meal/dietary updates
- Displays success/error messages in `#rsvp-status`

**Progressive Enhancement**:
- Guest pages render without React, but RSVP submission requires JavaScript (the server expects the `partyResponses` JSON payload).

**Validation**:
- Meal selection required if attending event with meals
- Dietary notes optional

---

### src/views/event/components/navigation.ts

**Purpose**: Renders navigation bar with dropdown menus.

**Key Features**:
- Navigation links for each visible section
- Dropdown menus for schedule and travel sub-sections
- Theme toggle button
- Mobile-responsive hamburger menu
- Scroll-to-section behavior via `data-scroll-target` attributes

**Function**: `renderNavigation(view)`

**Parameters**:
- `view`: `EventPageViewModel` with navigation visibility flags

**Output**: HTML string for navigation bar with anchor links and dropdowns

**Navigation Items** (conditionally rendered):
- Ceremony (if ceremony tabs exist)
- Schedule (dropdown with event sub-items)
- Travel (dropdown with hotels, transportation, local guide)
- Registry (if registry content exists)
- RSVP (if showRsvp is true)
- Theme toggle button

---

### src/views/event/components/theme-picture.ts

**Purpose**: Renders theme-aware image with light/dark variants.

**Key Features**:
- Uses `<picture>` element with `prefers-color-scheme` media queries
- Light image for light mode
- Dark image for dark mode
- Fallback `<img>` for browsers without `<picture>` support
- Adds `data-theme-*` attributes so the guest theme script can swap images when users toggle theme

**Function**: `renderThemePicture(options)`

**Required Options**:
- `lightSrc`, `darkSrc`, `alt`

**Output**: HTML string for `<picture>` element

**Example**:
```html
<picture data-theme-picture>
  <source srcset="/assets/dark/herodark.webp" media="(prefers-color-scheme: dark)" type="image/webp" data-theme-source>
  <img
    src="/assets/light/hero.webp"
    alt="Hero"
    data-theme-image
    data-theme-light="/assets/light/hero.webp"
    data-theme-dark="/assets/dark/herodark.webp"
  >
</picture>
```

---

### src/views/event/components/timeline-section.ts

**Purpose**: Generic renderer for event sections (ceremony, reception, etc.).

**Key Features**:
- Consistent layout for all event types
- Date/time formatting with timezone
- Venue information with Google Maps link
- Theme-aware image via `renderThemePicture`

**Function**: `renderTimelineSection({ id, title, body, eyebrow?, summary?, align?, headerMedia? })`

**Output**: HTML string for a collapsible timeline section (toggle button + content)

**Used By**: `renderCeremonySection`, `renderScheduleSection`, `renderTravelSection`, `renderRegistrySection`, `renderRsvpSection`

---

### src/views/event/components/tab-ids.ts

**Purpose**: Generates sanitized tab and panel IDs.

**Exports**:
- `buildTabIds(prefix, value)`: Returns `{ tabId, panelId }` with sanitized IDs

**Usage**: Generates consistent, safe IDs for tab/panel pairs (e.g., `schedule-tab-event1`, `schedule-panel-event1`)

---

### src/views/event/styles.ts

**Purpose**: Inline CSS for event page.

**Key Features**:
- Scoped styles for event page components
- Navigation and dropdown styles
- Section layout styles
- Form styles
- Responsive breakpoints
- Dark mode support via `body[data-theme="dark"]` selector

**Function**: `renderEventStyles(nonce, fonts)`

**Output**: `<style nonce="...">` tag with CSS

---

### src/views/event/scripts/interactions.ts

**Purpose**: Inline JavaScript for event page interactions.

**Key Features**:
- Navigation dropdown toggle behavior
- Mobile hamburger menu toggle
- Scroll-to-section on navigation click
- Top bar visibility on scroll
- RSVP form submission (AJAX)
- Form validation
- Success/error handling

**Function**: `renderEventScripts(nonce)`

**Output**: `<script nonce="...">` tag with JavaScript

**CSP Compliance**: All inline scripts use nonce from middleware

Note: Theme toggle is handled separately by `renderThemeScript` from `src/views/shared/themeToggle.ts`

---

### src/views/event/view-models.ts

**Purpose**: Type definitions for the guest event page view model.

**Key Exports**:
- `EventPageViewModel`: Top-level shape consumed by `renderEventPage`
- `EventEntryViewModel`, `EventAttendeeViewModel`: Per-event schedule/attendee shapes

**Built By**:
- `functions/event.ts` builds the view model (`buildEventViewModel(...)`) before calling `renderEventPage(...)`.

---

### src/views/event/utils/escape.ts

**Purpose**: HTML entity escaping for XSS prevention.

**Key Functions**:
- `escapeHtml(text)`: Escapes `<`, `>`, `&`, `"`, `'`

**Used By**: All view rendering functions to sanitize user input

**Security**:
- Prevents XSS attacks via guest-provided data (names, notes, etc.)
- Applies to all dynamic content in templates

---

### src/views/event/utils/rich-text.ts

**Purpose**: Converts plain text with Markdown-like syntax to HTML.

**Key Features**:
- Converts URLs and Markdown links to `<a>` tags
- Supports lightweight formatting (bold/emphasis/highlight/code) with HTML escaping
- Supports lists and paragraphs for block rendering
- Preserves spacing and formatting
- Escapes HTML entities before processing to prevent injection

**Key Functions**:
- `renderRichTextBlock(input)`: Block-safe HTML (paragraphs, lists)
- `renderRichTextInline(input)`: Inline-safe HTML (no wrapping blocks)

**Used By**: Event description rendering, notes fields

---

### src/views/event/utils/sanitize-toggle-label.ts

**Purpose**: Normalizes user-provided labels into plain text for toggles and accessibility.

**Key Functions**:
- `sanitizeToggleLabel(source)`: Strips lightweight formatting and collapses whitespace

**Used By**: Schedule and travel toggle labels (button text, ARIA)

---

### src/views/shared/themeToggle.ts

**Purpose**: Shared theme toggle component for guest pages.

**Key Features**:
- Sun/moon icon toggle button
- Persists theme to localStorage
- Applies `data-theme` attribute to target element (body or documentElement)
- Works without React (vanilla JavaScript)
- Dispatches `themechange` custom event
- Respects system preference when no manual preference set

**Functions**:
- `renderThemeToggle()`: Returns HTML for the toggle button
- `renderThemeScript(nonce, options)`: Returns inline script for theme behavior

**Options**:
- `storageKey`: localStorage key (default: `'guest-theme'`)
- `customEventName`: Event name to dispatch (default: `'themechange'`)
- `target`: Where to apply data-theme - `'body'` (default) or `'documentElement'`

**Output**: HTML button + `<script nonce="...">` tag with theme logic
