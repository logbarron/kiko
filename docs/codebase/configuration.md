# Root Configuration Files

Configuration files that define the build pipeline, deployment settings, and TypeScript behavior.

---

### package.json

**Purpose**: npm package manifest with scripts, dependencies, and project metadata.

**Key Scripts**:
- `npm run dev`: Runs concurrent Vite, Tailwind, and Wrangler watchers
- `npm run build`: Minifies CSS and bundles React app to `/public/build`
- `npm run test`: Runs all tests via Vitest
- `npm run migrate:local`: Applies D1 migrations to local database

**Dependencies**:
- **Frontend**: React 19, Radix UI primitives, Tailwind CSS, date-fns, Lucide icons
- **Backend**: Stripe SDK, Cloudflare Workers types, Zod validation
- **Testing**: Vitest, ts-prune (dead code), jscpd (duplication detection)

**Project-specific values**:
- Update the D1 migration scripts (lines 14-15) so they reference `<your-d1-database-name>`

---

### wrangler.toml

**Purpose**: Cloudflare Pages deployment configuration for the main worker.

**Key Bindings**:
- `DB`: D1 database binding (SQLite)
- `RATE_LIMIT_KV`: KV namespace for rate limiting

**Environment Variables**:
- Session timeouts: `SESSION_IDLE_MIN` (30), `SESSION_ABSOLUTE_HOURS` (12)
- Magic link TTL: `MAGIC_LINK_TTL_MIN` (10)
- Rate limits: Per-email, per-IP, per-token thresholds
- RSVP spam control: `RSVP_SUBMISSIONS_PER_10MIN` (per guest/IP window, default 20)
- Debug logs: `ENABLE_DEBUG_LOGS` (false)

**Secrets** (set via `wrangler secret put`):
- `KEK_B64`: Base64-encoded 256-bit encryption key
- `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`: CAPTCHA keys
- `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GMAIL_FROM`: Email API credentials
- `APP_BASE_URL`: Production domain
- `ACCESS_AUD`: Cloudflare Access audience tag
- `ACCESS_JWT_ISS`: Cloudflare Access JWT issuer URL (e.g., `https://<team>.cloudflareaccess.com`)
- `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`: Payment keys

**Project-specific values**:
- Line 1: Set the project name to `<your-pages-project-name>`
- Lines 12-13: Bind `<your-d1-database-name>` / `<your-d1-database-id>`
- Lines 19-20: Bind `<your-kv-namespace-id>` / `<your-kv-preview-id>`

---

### wrangler.cleanup.toml

**Purpose**: Separate worker configuration for scheduled cleanup jobs.

**Schedule**: Runs nightly via cron expression
**Job**: Deletes expired sessions, magic links, and old audit events
**Bindings**: Same D1 database as main worker

**Project-specific values**:
- Line 1: Set the worker name to `<your-cleanup-worker-name>`
- Lines 8-9: Match `<your-d1-database-name>` and `<your-d1-database-id>` from `wrangler.toml`

---

### tsconfig.json

**Purpose**: TypeScript compiler configuration with strict mode enabled.

**Key Settings**:
- `strict: true`: Enables all strict type checks
- `paths: { "@/*": ["src/*"] }`: Allows `@/` imports
- `target: ES2022`, `lib: ES2022`: Modern JavaScript features
- `moduleResolution: node`: Node-style module resolution
- `jsx: react-jsx`: React 18+ JSX transform

**Includes**: `functions/**/*.ts`, `functions/**/*.tsx`, `src/**/*.ts`, `src/**/*.tsx`, `scripts/**/*.ts`
**Excludes**: `node_modules`, `dist`, `tests/e2e/**`

---

### vite.config.js

**Purpose**: Vite bundler configuration for React app.

**Key Settings**:
- Plugin: `@vitejs/plugin-react` with Fast Refresh
- Alias: `@/` resolves to `src/`
- Output: Emits to `/public/build`
- Entry: `enhance.js` (stable filename, no hash)
- Chunks: Named with hashes (`[name]-[hash].js`)
- No sourcemaps or manifest file generated

---

### tailwind.config.js

**Purpose**: Tailwind CSS configuration with custom theme and plugins.

**Key Features**:
- Dark mode: `class` strategy (`.dark` class on `<html>`)
- Custom colors: Extends palette with rose accents (rose-50 through rose-900)
- Animations: Custom keyframes for fade, pulse, accordion
- Plugins: `@tailwindcss/forms`, `tailwindcss-animate`
- Content paths: Scans `src/**/*.{ts,tsx}`, `functions/**/*.{ts,tsx}`, and `public/**/*.html`

**Fonts**:
- Sans: System font stack (-apple-system, BlinkMacSystemFont, Segoe UI, Helvetica Neue, Arial, Noto Sans)

---

### postcss.config.js

**Purpose**: PostCSS configuration for Tailwind CSS and Autoprefixer.

**Plugins**:
- `tailwindcss`: Processes Tailwind directives
- `autoprefixer`: Adds vendor prefixes for browser compatibility

---

### vitest.config.ts

**Purpose**: Vitest test runner configuration.

**Key Settings**:
- Test patterns: `**/*.test.ts`, `**/*.test.tsx`
- Globals: Enabled for `describe`, `it`, `expect` without imports
- Environment: Node (for Cloudflare Workers compatibility)
- Coverage: Excludes `node_modules`, `public/build`, `tests/`

---

### components.json

**Purpose**: Shadcn UI configuration for component generation.

**Key Settings**:
- Style: New York variant
- Base color: Neutral
- CSS variables: Enabled for theming
- Aliases: `@/components`, `@/lib`, `@/hooks`

**Notes**: Used by `npx shadcn-ui@latest add <component>` CLI

---

### public/_headers

**Purpose**: Cloudflare Pages static header configuration.

**Key Headers**:
- CSP with nonce placeholder `{NONCE}` (replaced by middleware)
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: no-referrer`
- `Cache-Control: public, max-age=31536000, immutable` for `/build/*` only

**Notes**: Middleware dynamically replaces `{NONCE}` per request. Long cache headers only apply to build output, not all static assets.

---

### public/index.html

**Purpose**: Fallback landing page for unauthenticated visitors.

**Features**:
- Theme toggle button with logo swap
- Loads `/theme-toggle.js` for client-side theme persistence
- Loads `/main.css` for base styles
- Meta tags: viewport, color-scheme, description

**Project-specific values**:
- Line 6: Set the `<title>` element to `<your-site-name>`
- Line 19: Update the emblem alt text to `<your-site-emblem-alt>`

---

### public/main.css

**Purpose**: Hand-written base styles for landing page.

**Features**:
- CSS custom properties for theme colors
- Dark mode support via `body[data-theme="dark"]` selector
- Layout styles for container, logo, buttons
- Screen reader utilities

---

### public/theme-toggle.js

**Purpose**: Client-side theme persistence for landing page using localStorage.

**Features**:
- Reads `guest-theme` from localStorage on load
- Applies `data-theme` attribute to `<body>` element
- Swaps logo images based on theme
- Updates ARIA attributes for accessibility
- Dispatches `themechange` custom event

**Storage Key**: `guest-theme` (values: `'light'`, `'dark'`, or absent for system default)

---

### public/robots.txt

**Purpose**: Search engine crawler directives.

**Content**: `User-agent: *` followed by `Disallow: /` (blocks all crawlers)

**Notes**: Website is intentionally hidden from search engines

---

### public/assets/*

**Purpose**: Theme-aware images for hero sections and event categories.

**Structure**:
- `light/`: Images for light mode (hero.webp, ceremony.webp, reception.webp, travel.webp, registry.webp, rsvp.webp)
- `dark/`: Images for dark mode (herodark.webp, ceremonydark.webp, etc. - no hyphen in `dark` suffix)

**Format**: WebP for optimal compression

**Theme Switching**: SSR views use `renderThemePicture()` helper with `<picture>` elements and media queries

---

### public/logo.webp, public/logodark.webp

**Purpose**: Site logo/emblem with theme variants.

**Usage**: Landing page theme toggle button

---

### public/favicon.ico

**Purpose**: Browser tab icon.