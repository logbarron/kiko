# Source Code - View Rendering

Server-rendered HTML views for authenticated guests. Progressive enhancement strategy: works without JavaScript, enhances with React hydration.

---

### View Architecture

**Pattern**: Server-side rendering (SSR) with optional client-side hydration
- **SSR**: Functions return HTML strings with inline styles and scripts
- **Progressive Enhancement**: Core functionality works without JavaScript
- **Hydration**: React 19 hydrates interactive components when JS available
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
- Dark mode support via `html.dark` class
- Responsive design with mobile-first breakpoints
- Preloads critical fonts and assets

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
- Server-rendered HTML with progressive enhancement
- Tabs for event sections (hero, ceremony, reception, travel, registry, RSVP)
- Theme-aware images (light/dark variants)
- Inline JavaScript for tab navigation (works without React)
- Optional React hydration for enhanced interactions

**Function**: `renderEventPage(guest, event, pendingMealSelections, nonce)`

**Parameters**:
- `guest`: Decrypted guest profile with party members
- `event`: Decrypted event configuration
- `pendingMealSelections`: Events needing meal selection
- `nonce`: CSP nonce

**Output**: Complete HTML page with:
- Navigation tabs
- Event sections (hero, ceremony, reception, travel, registry, RSVP)
- Inline styles (scoped to page)
- Inline scripts (tab switching, theme toggle, RSVP submission)

**Progressive Enhancement**:
- **Without JS**: All content visible, no tab navigation (scroll-based)
- **With JS**: Tab navigation, theme toggle, form validation, RSVP submission

---

### src/views/event/components/hero.ts

**Purpose**: Renders hero section with event title and date.

**Key Features**:
- Theme-aware hero image (`/assets/light/hero.webp` or `/assets/dark/herodark.webp`)
- Event title from configuration
- Formatted date with timezone
- Welcome message

**Function**: `renderHero(event)`

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

**Function**: `renderCeremony(event)`

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

**Function**: `renderSchedule(event)`

**Output**: HTML string for schedule section

**Notes**:
- Generic renderer for any event type (not just reception)

---

### src/views/event/components/travel.ts

**Purpose**: Renders travel/accommodations section.

**Key Features**:
- Hotel name and address
- Booking URL link
- Theme-aware image

**Function**: `renderTravel(accommodations)`

**Output**: HTML string for travel section

**Notes**:
- Only renders if `accommodations` object exists in event configuration

---

### src/views/event/components/registry.ts

**Purpose**: Renders gift registry section.

**Key Features**:
- List of registry links (URL + name)
- Opens links in new tab (`target="_blank"`)
- Theme-aware image
- Optional Stripe honeymoon fund link

**Function**: `renderRegistry(registryLinks)`

**Output**: HTML string for registry section

**Notes**:
- Only renders if `registryLinks` array exists in event configuration

---

### src/views/event/components/rsvp.ts

**Purpose**: Renders RSVP form with attendance and meal selection.

**Key Features**:
- Radio buttons for attending/declined per person per event
- Meal selection dropdowns (conditionally shown)
- Dietary notes textarea per person
- General notes textarea
- Submit button with loading state
- Success/error messages

**Function**: `renderRsvp(guest, event, pendingMealSelections, nonce)`

**Output**: HTML string for RSVP form with inline script

**Inline JavaScript** (CSP-compliant with nonce):
- Form validation
- Conditional meal selection visibility
- AJAX submission to `/rsvp` endpoint
- Success/error toast notifications
- Loading state management

**Progressive Enhancement**:
- **Without JS**: Form submits via standard POST (fallback)
- **With JS**: AJAX submission with validation and feedback

**Validation**:
- Attendance status required per person per event
- Meal selection required if attending event with meals
- Dietary notes optional

---

### src/views/event/components/navigation.ts

**Purpose**: Renders tab navigation bar.

**Key Features**:
- Tabs for each section (Hero, Ceremony, Reception, Travel, Registry, RSVP)
- Active tab highlighting
- Sticky navigation on scroll
- Theme toggle button
- Tab IDs match section IDs for deep linking

**Function**: `renderNavigation(tabs, activeTab)`

**Output**: HTML string for navigation bar

**Inline JavaScript** (in main view):
- Tab click handlers
- Active tab state management
- Scroll-to-section behavior

---

### src/views/event/components/theme-picture.ts

**Purpose**: Renders theme-aware image with light/dark variants.

**Key Features**:
- Uses `<picture>` element with `prefers-color-scheme` media queries
- Light image for light mode
- Dark image for dark mode
- Fallback `<img>` for browsers without `<picture>` support

**Function**: `renderThemePicture(lightSrc, darkSrc, alt, className?)`

**Output**: HTML string for `<picture>` element

**Example**:
```html
<picture>
  <source srcset="/assets/dark/hero.webp" media="(prefers-color-scheme: dark)">
  <img src="/assets/light/hero.webp" alt="Hero" class="...">
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

**Function**: `renderTimelineSection(event, lightImage, darkImage)`

**Output**: HTML string for event section

**Used By**: `renderCeremony`, `renderSchedule`

---

### src/views/event/components/tab-ids.ts

**Purpose**: Constants for tab and section IDs.

**Exports**:
- `TAB_IDS`: Object mapping tab names to IDs (e.g., `hero`, `ceremony`, `rsvp`)

**Usage**: Ensures consistent IDs across navigation and sections

---

### src/views/event/styles.ts

**Purpose**: Inline CSS for event page.

**Key Features**:
- Scoped styles for event page components
- Tab navigation styles
- Section layout styles
- Form styles
- Responsive breakpoints
- Dark mode support via `html.dark` selector

**Function**: `getEventStyles(nonce)`

**Output**: `<style nonce="...">` tag with CSS

---

### src/views/event/scripts/interactions.ts

**Purpose**: Inline JavaScript for event page interactions.

**Key Features**:
- Tab navigation (click to switch tabs)
- Active tab highlighting
- Theme toggle (persists to localStorage)
- RSVP form submission (AJAX)
- Form validation
- Success/error handling

**Function**: `getEventScripts(nonce)`

**Output**: `<script nonce="...">` tag with JavaScript

**CSP Compliance**: All inline scripts use nonce from middleware

---

### src/views/event/view-models.ts

**Purpose**: Transforms database models into view-friendly formats.

**Key Functions**:
- `buildGuestViewModel(guest)`: Formats guest data for templates
- `buildEventViewModel(event)`: Formats event data for templates
- `formatDateTime(date, time, timezone)`: Formats date/time strings
- `buildGoogleMapsUrl(address)`: Generates Google Maps link

**Used By**: `renderEventPage` to transform API data before rendering

---

### src/views/event/utils/escape.ts

**Purpose**: HTML entity escaping for XSS prevention.

**Key Functions**:
- `escapeHtml(text)`: Escapes `<`, `>`, `&`, `"`, `'`
- `escapeAttribute(value)`: Escapes for HTML attribute context

**Used By**: All view rendering functions to sanitize user input

**Security**:
- Prevents XSS attacks via guest-provided data (names, notes, etc.)
- Applies to all dynamic content in templates

---

### src/views/event/utils/rich-text.ts

**Purpose**: Converts plain text with Markdown-like syntax to HTML.

**Key Features**:
- Converts URLs to `<a>` tags
- Converts newlines to `<br>` tags
- Preserves spacing and formatting
- Escapes HTML entities before processing

**Function**: `richTextToHtml(text)`

**Used By**: Event description rendering, notes fields

---

### src/views/event/utils/sanitize-toggle-label.ts

**Purpose**: Sanitizes user-provided tab labels for display.

**Key Functions**:
- `sanitizeToggleLabel(label)`: Removes special characters, limits length
- Prevents tab injection attacks

**Used By**: Tab navigation rendering

---

### src/views/shared/themeToggle.ts

**Purpose**: Shared theme toggle component for all pages.

**Key Features**:
- Sun/moon icon toggle
- Persists theme to localStorage
- Applies `.dark` class to `<html>` element
- Works without React (vanilla JavaScript)

**Function**: `renderThemeToggle(nonce)`

**Output**: HTML button with inline script

**Storage Key**: `theme` (values: `'light'`, `'dark'`)