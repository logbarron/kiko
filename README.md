# Kiko

![Kiko wedding site preview](docs/kiko.webp)

A privacy and security minded project for a wedding. Built on Cloudflare's edge infrastructure.

For video walk throughs and detailed information, read on my personal website: [Small Software: Kiko](https://loganbarron.com/posts/2025-11-11-smallsoftware-kiko/)

## Features


- **Encrypted Data** – All PII encrypted using AES-GCM envelope encryption with AAD binding 
- **Magic Link Authentication** – Passwordless guest login
- **Server Side Rendered** – Guest pages are SSR + vanilla JS; admin mounts React
- **Multi-Event RSVPs** – Guests manage multiple event RSVPs for each invited party
- **Admin Portal** – (via Cloudflare Access) Send email invites & updates, manage guests, manage website content, metrics for all RSVP information
- **Stripe Integration** – Stripe elements integration for gifting, never leave the page

## Bring Your Own Content

This repository is the technical frame for a wedding/event site—**it ships with no real content or production assets.** Expect to customize every guest-facing surface before sharing it with real people.

- **Copy & data**: Guest list, event details, registry links, and admin content all start empty; you must provide the data after deploying your own D1 database.
- **Images & branding**: Everything under `public/assets/` and `public/index.html` uses placeholder artwork. Replace them with your own media.
- **Email + notifications**: Configure invite/magic-link subjects in the admin panel; customize templates in `src/lib/gmail.ts` as needed.
- **Secrets & services**: No API keys are included. Configure Cloudflare, Stripe, Google Workspace, and API credentials yourself (follow the [production setup guide](docs/setup.md#production-setup-first-time)).

## Project Structure

```
/
├── docs/                # Guides and reference
├── functions/           # API & SSR
│   ├── admin/           # Admin endpoints
│   ├── auth/            # Magic link verification
│   └── stripe/          # Checkout sessions & webhooks
├── migrations/          # Database schema
├── public/              # Static assets + build
├── scripts/             # Scheduled cleanup
├── src/
│   ├── components/      # React components
│   ├── lib/             # Shared utilities
│   ├── styles/          # Tailwind entrypoint
│   └── views/           # SSR templates
└── tests/               # Test suite
```

## Documentation

### Setup
- **[Setup Guide](docs/setup.md)** – Complete configuration and deployment walkthrough
- **[Configuration](docs/codebase/configuration.md)** – Root config files (wrangler, tsconfig,
  vite, tailwind)

### Codebase
- **[Database Schema](docs/codebase/database.md)** – Tables, encryption strategy, migrations
- **[API Endpoints](docs/codebase/cloudflare-functions.md)** – All Cloudflare Functions routes
- **[Libraries](docs/codebase/libraries.md)** – Core utilities (crypto, auth, email, rate limiting)
- **[Components](docs/codebase/components.md)** – React UI components (Radix + Tailwind)
- **[Views](docs/codebase/views.md)** – Server-rendered HTML and progressive enhancement
- **[Assets](docs/codebase/assets.md)** – Branding, styling, theme-aware images
- **[Testing](docs/codebase/tests.md)** – Test philosophy and coverage
