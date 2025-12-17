# Cloudflare Functions

Serverless API endpoints running on Cloudflare Pages. All functions use TypeScript with strict mode and share the `@/` import alias.

---

### functions/_middleware.ts

**Purpose**: Global middleware for CSP nonce generation and security headers.

**Execution Order**: Runs before all other function handlers

**Key Features**:
- Generates unique 16-byte CSP nonce per request
- Replaces `{NONCE}` placeholder in CSP headers
- Adds security headers if missing: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`
- Sets `Cache-Control: no-store` for sensitive routes (`/event`, `/admin`, `/auth/verify`, `/rsvp`, `/stripe`)
- Sets `X-Robots-Tag: noindex, nofollow` for sensitive routes
- Enables debug logging via `__ENABLE_DEBUG_LOGS__` global

**Context Data**:
- `context.data.nonce`: Available to downstream handlers

**Default CSP** (if no header set):
```
default-src 'none'; 
base-uri 'self'; 
frame-ancestors 'none'; 
connect-src 'self' https://api.stripe.com https://m.stripe.network; 
img-src 'self' data: https://q.stripe.com https://b.stripecdn.com; 
font-src 'self' https://use.typekit.net; 
style-src 'self' 'nonce-{NONCE}' https://use.typekit.net https://p.typekit.net https://b.stripecdn.com; 
script-src 'self' 'nonce-{NONCE}' https://challenges.cloudflare.com https://js.stripe.com; 
frame-src https://challenges.cloudflare.com https://js.stripe.com https://checkout.stripe.com; 
form-action 'self'; 
manifest-src 'self'
```

---

### functions/invite.ts

**Purpose**: Renders invite landing page (GET) or sends magic link email (POST).

**Methods**: GET, POST

**Authentication**: None (public endpoint, rate-limited)

**GET /invite**:
- Renders HTML landing page with email form and Turnstile CAPTCHA
- Supports tracking token `?t=<token>` to record `invite_clicked` audit event

**POST /invite**:

**Rate Limits**:
- `INVITES_PER_EMAIL_PER_HOUR`: Max invites per email address
- `INVITES_PER_IP_PER_10MIN`: Max invites per IP address

**Request Body** (multipart/form-data):
```
email: string              // Guest email address
cf-turnstile-response: string  // CAPTCHA token
```

**Flow**:
1. Verify Turnstile CAPTCHA token
2. Check rate limits (by email and IP)
3. Lookup guest by email hash in database
4. Generate 32-byte magic link token
5. Store token hash in `magic_links` table with TTL
6. Send email via Gmail API with magic link URL
7. Record `email_sent` audit event
8. Update `invite_sent_at` timestamp on guest record

**Response**:
- Returns HTML page (success message or error)
- 400: Missing fields or already registered (HTML)
- 429: Rate limit exceeded (HTML)
- 404: Email not in guest list (HTML)
- 500: Server error (HTML)

**Security**:
- Tokens stored as HMAC-SHA256 hashes only
- Magic links expire after `MAGIC_LINK_TTL_MIN` (default 10 minutes)
- Single-use enforcement via `used_at` timestamp
- Email addresses normalized (lowercase, trimmed) before hashing

---

### functions/auth/verify.ts

**Purpose**: Verifies magic link token and creates session.

**Method**: GET

**Authentication**: None (public endpoint, rate-limited)

**Rate Limits**:
- `VERIFY_PER_IP_PER_10MIN`: Max verifications per IP
- `VERIFY_PER_TOKEN_PER_10MIN`: Max verifications per token

**Query Parameters**:
- `token`: Magic link token (32-byte base64url string)

**Flow**:
1. Extract token from query string
2. Check rate limits (by IP and token hash)
3. Hash token with HMAC-SHA256
4. Lookup token in `magic_links` table
5. Verify not expired and not already used
6. Mark token as used (`used_at = now`)
7. Create session with idle and absolute timeouts
8. Set HttpOnly session cookie (`__Host-s` prefix in production)
9. Record `verify_ok` or `verify_fail` audit event
10. Update `registered_at` timestamp on guest record (first verification only)
11. Redirect to `/event` page

**Response**:
- 302: Redirect to `/event` with session cookie
- 400: Invalid/expired/used token
- 429: Rate limit exceeded
- 500: Server error

**Security**:
- Magic links single-use (replay attack prevention)
- Session IDs are 32-byte random tokens
- Session ID hashes stored with HMAC-SHA256
- Cookies use `__Host-` prefix for additional security (production)
- `SameSite=Lax` allows navigation after magic link redirect
- `HttpOnly` prevents JavaScript access
- `Secure` flag enforced (except dev mode)

---

### functions/event.ts

**Purpose**: Serves guest profile and event details for authenticated guests.

**Method**: GET

**Authentication**: Session cookie required

**Flow**:
1. Validate session cookie (`__Host-s` in production, `s` in dev mode)
2. Check session not expired (idle timeout OR absolute timeout)
3. Update `last_seen_at` timestamp (idle timeout refresh)
4. Lookup guest by ID from session
5. Decrypt guest profile from `enc_profile` blob
6. Lookup event details from singleton `event` table
7. Decrypt event details from `enc_details` blob
8. Normalize attendance records (ensure all invited events present)
9. Compute pending meal selections (events needing meals)
10. Build view model and return SSR HTML

**Response**:
- Always returns HTML (server-rendered event page)
- CSP nonce injected for inline scripts
- Guest pages use vanilla JS theme toggle (no React hydration)

**Data Structures** (used internally for view model):

Guest profile:
```typescript
{
  party: Array<{
    personId: string;
    role: 'primary' | 'companion' | 'guest';
    firstName: string;
    lastName: string;
    invitedEvents: string[];
    attendance: {
      [eventId: string]: {
        status: 'yes' | 'no' | 'pending';
        updatedAt: number | null;
        source: 'guest' | 'admin' | 'system';
      };
    };
    mealSelections?: { [eventId: string]: string };
    dietaryNotes?: { [eventId: string]: string };
  }>;
}
```

Event details:
```typescript
{
  schemaVersion: number;       // Current: 6
  siteTitle: string;
  dateISO: string;
  timeZone: string;
  events: Array<{
    id: string;                // Event identifier
    label: string;
    startISO?: string;
    endISO?: string;
    venue?: { name, address[], geo, mapUrl };
    mealOptions?: string[];
  }>;
  registry?: Array<{ label, url, description }>;
  accommodations?: Array<{ name, address, discountCode, notes }>;
}
```

**Security**:
- Session validation on every request
- Idle timeout enforced (default 30 minutes)
- Absolute timeout enforced (default 12 hours)
- Guest can only access their own profile (session binds guest ID)
- Decryption uses AAD binding (table: `guests`, recordId: email_hash, purpose: `profile`)

**Error Responses**:
- 401: Invalid/expired session (redirects to `/` with login prompt)
- 500: Server error (database or decryption failure)

---

### functions/rsvp.ts

**Purpose**: Accepts RSVP submission with attendance and meal selections.

**Method**: POST

**Authentication**: Session cookie required

**Request Body** (multipart/form-data):
```
partyResponses: string  // JSON-encoded object:
```

```typescript
// partyResponses JSON structure:
{
  [personId: string]: {
    events: {
      [eventId: string]:
        | 'yes' | 'no' | 'pending'
        | { status: 'yes' | 'no' | 'pending' };
    };
    mealSelections?: { [eventId: string]: string };
    dietaryNotes?: { [eventId: string]: string };
  }
}
```

**Flow**:
1. Validate session cookie
2. Verify session not expired
3. Check rate limit (guest ID + client IP)
4. Check if RSVPs are open (returns 423 if closed)
5. Lookup guest by session guest_id
6. Decrypt guest profile
7. Parse `partyResponses` from form data
8. Verify person IDs match guest party members
9. Verify event IDs exist in event configuration
10. Validate meal selections (must match event's `mealOptions`)
11. Update guest profile with new attendance records
12. Encrypt updated profile
13. Upsert RSVP record with encrypted RSVP data
14. Record `rsvp_submit` audit event
15. Return JSON response with pending meal events (event IDs)

**Rate Limit**:
- `RSVP_SUBMISSIONS_PER_10MIN` (default: 20 submissions per 10 minutes, keyed by guest ID + client IP)

**Validation Rules**:
- All person IDs must belong to guest's party
- All event IDs must exist in event configuration
- Meal selections required if event has `requiresMealSelection` and status is `yes`
- Meal selection must be one of event's `mealOptions`
- Cannot select meal if status is `no`

**Response**:
- 200: `{ success: true, pendingMealEvents: string[] }`
- 401: `Unauthorized`
- 423: `{ success: false, error: string, code: 'RSVP_CLOSED' }`
- 429: `{ success: false, error: string, code: 'RSVP_RATE_LIMIT' }`
- 500: `An error occurred`

**Security**:
- Guest can only RSVP for their own party
- Meal selection validation prevents injection of arbitrary values
- Encrypted RSVP data uses AAD binding (table: `rsvps`, recordId: guest_id, purpose: `rsvp`)
- Server sets attendance `updatedAt` and `source` values (client cannot spoof)

---

### functions/admin/index.ts

**Purpose**: Serves admin dashboard SSR shell.

**Method**: GET

**Authentication**: Cloudflare Access JWT required (admin only)

**Flow**:
1. Validate Cloudflare Access JWT from `CF-Access-Jwt-Assertion` header
2. Verify JWT signature, audience, issuer, expiration
3. Render SSR HTML shell with CSP nonce
4. Return HTML (React app fetches data client-side via API endpoints)

**Response (HTML)**:
- Server-rendered HTML shell for React admin dashboard
- Tabs: Guests, Event (2 tabs total)
- React app mounts and fetches data from `/admin/guests`, `/admin/event`, `/admin/audit` APIs
- CSP nonce injected for inline scripts

**Security**:
- Requires valid Cloudflare Access JWT (enforced by Cloudflare Access application)
- JWT signature verified with Cloudflare Access public keys (JWKS)
- Access to admin dashboard - admin privilege required

**Dev Mode**:
- If `DEV_MODE=true`, bypasses Access validation

**Error Responses**:
- 401: Invalid/expired JWT
- 503: Cloudflare Access not configured (ACCESS_AUD or ACCESS_JWT_ISS missing)
- 500: Server error

---

### functions/admin/guests.ts

**Purpose**: Guest list operations with multi-action POST handler.

**Methods**: GET, POST

**Authentication**: Cloudflare Access JWT required

**GET /admin/guests**:
- Returns all guests with decrypted profiles
- Includes RSVP status, attendance summaries, audit summaries, and magic link stats

**POST /admin/guests**:
Multi-action handler based on `action` field:

| Action | Description |
|--------|-------------|
| `update` | Update guest profile (notes, phone, vip, allowPlusOne) |
| `resend` | Resend invitation email to guest |
| `updateEventVisibility` | Update which events guest is invited to |
| `updateEventAttendance` | Update attendance status for an event |
| `updateMealSelection` | Update meal selection for an event |
| `delete` | Delete guest record |

**Request Body (POST)**:
```typescript
{
  action: 'update' | 'resend' | 'updateEventVisibility' | 'updateEventAttendance' | 'updateMealSelection' | 'delete';
  guestId: number;
  updates?: { notes?: string; phone?: string; vip?: boolean; allowPlusOne?: boolean };
  visibility?: { [eventId: string]: boolean };
  attendance?: { eventId: string; status: 'yes' | 'no' | 'pending'; personId?: string };
  meal?: { eventId: string; personId: string; mealKey: string | null };
}
```

**Party Member Schema**:
```typescript
{
  personId: string;
  role: 'primary' | 'companion' | 'guest';  // No 'child' role
  firstName: string;
  lastName: string;
  invitedEvents: string[];
  attendance: {
    [eventId: string]: {
      status: 'yes' | 'no' | 'pending';
      updatedAt: number | null;
      source: 'guest' | 'admin' | 'system';
    };
  };
}
```

**Security**:
- Admin-only endpoint (Cloudflare Access enforced)
- Encrypts all PII fields
- Uses AAD binding (table: `guests`, recordId: email_hash, purpose: `profile`)

---

### functions/admin/event.ts

**Purpose**: Event configuration operations (singleton record).

**Methods**: GET, POST

**Authentication**: Cloudflare Access JWT required

**GET /admin/event**:
- Returns decrypted event configuration from singleton row (id=1)
- Creates empty event record if none exists

**POST /admin/event**:
- Creates or updates event configuration
- Validates and normalizes event data
- Encrypts and stores in database
- Records `event_updated` audit event

**Request Body**:
```typescript
{
  schemaVersion?: number;      // Server normalizes to 6
  siteTitle: string;
  heroHeadline?: string;
  magicLinkEmailSubject?: string;
  inviteEmailSubject?: string;
  dateISO: string;             // ISO 8601 date
  timeZone: string;            // IANA timezone
  rsvpDeadlineISO?: string;
  rsvpStatus?: { mode: 'open' | 'closed'; message?: string };
  events: Array<{
    id: string;                // Event identifier (not eventId)
    label: string;
    startISO?: string;         // ISO 8601 datetime
    endISO?: string;
    capacity?: number;
    venue?: {
      name?: string;
      address?: string[];
      geo?: string;
      mapUrl?: string;
    };
    dressCode?: string;
    requiresMealSelection?: boolean;
    mealOptions?: string[];
  }>;
  accommodations?: Array<{ name: string; address: string; discountCode?: string; notes?: string }>;
  registry?: Array<{ label: string; url: string; description?: string }>;
  localGuide?: { eat?: string; drink?: string; see?: string; do?: string };
  transportationGuide?: { planes?: string; trains?: string; automobiles?: string };
  ceremonyGuide?: { summary?: string; quickGuide?: string; stepByStep?: string; history?: string };
}
```

**Validation** (via `normalizeEventDetails`):
- Date validation: ISO 8601 format
- Timezone validation: IANA timezone database
- URL validation: HTTP/HTTPS only
- Event labels required
- Events must have `startISO`

**Security**:
- Admin-only endpoint
- Encrypts all event data
- Uses AAD binding (table: `event`, recordId: `1`, purpose: `details`)

---

### functions/admin/invite.ts

**Purpose**: Creates a new guest record (and optionally sends the initial invitation email).

**Method**: POST

**Authentication**: Cloudflare Access JWT required

**Request Body**:
```typescript
{
  primaryGuest: { firstName: string; lastName: string; email: string };
  companion?: { firstName?: string; lastName?: string };
  allowPlusOne?: boolean;                    // Adds a placeholder 'guest' party member
  eventVisibility?: Record<string, boolean>; // Event ID -> invited?
  sendEmail?: boolean;                       // Default: true
}
```

**Flow**:
1. Validate Cloudflare Access JWT
2. Load current event summaries (for validating `eventVisibility` IDs)
3. Validate required fields and normalize email
4. Reject if guest already exists (409)
5. Build party members (primary + optional companion or placeholder guest)
6. Generate invite tracking token and store `invite_token_hash`
7. Encrypt and insert the guest profile
8. If `sendEmail`:
   - Build tracking URL: `/invite?t=<inviteToken>`
   - Read `EventDetails.inviteEmailSubject` (optional)
   - Send invitation email via Gmail API
   - Record `invite_sent` audit event
9. If `sendEmail` is false: record `invite_seeded` audit event
10. Return JSON with the new guest ID

**Response**:
```typescript
{
  success: true;
  guestId: number;
  message: string;
}
```

**Notes**:
- Resending an invitation for an existing guest is handled by `POST /admin/guests` with `action: 'resend'`.

**Security**:
- Admin-only endpoint
- Encrypts all PII fields

---

### functions/admin/group-email.ts

**Purpose**: Sends custom message to multiple guests (bulk email).

**Method**: POST

**Authentication**: Cloudflare Access JWT required

**Request Body**:
```typescript
{
  subject: string;                    // Email subject
  body: string;                       // Plain text email body
  recipientMode: 'filter' | 'custom'; // Selection mode
  recipientEventFilter?: string;      // Event ID or 'all' (for filter mode)
  recipientStatusFilter?: string;     // 'all' | 'has-email' | 'accepted' | 'pending' | 'declined' | 'invited'
  recipientCustomIds?: number[];      // Guest IDs (for custom mode)
}
```

**Flow**:
1. Validate Cloudflare Access JWT
2. Resolve recipients based on mode (filter or custom IDs)
3. Decrypt guest profiles to get email addresses
4. Send individual emails via Gmail API (500ms delay between sends)
5. Record `group_email_sent` audit event (single event, not per recipient)
6. Return summary of sent/failed emails

**Response**:
```typescript
// Success (all sent):
{ success: true; emailsSent: number }

// Partial success (status 207):
{ success: true; emailsSent: number; failed: number }

// All failed (status 500):
{ error: 'All emails failed to send' }
```

**Security**:
- Admin-only endpoint
- Does not store email content in database
- Rate limited by Gmail API (500ms delay between sends)

---

### functions/admin/audit.ts

**Purpose**: Returns audit log with optional guest filter.

**Method**: GET

**Authentication**: Cloudflare Access JWT required

**Query Parameters**:
- `limit`: Max events to return (default: 100, min: 1, max: 500)
- `guest_id`: Filter by guest ID (optional)

Note: No `offset` or `type` filter parameters supported.

**Response**:
```typescript
// Returns array directly (no wrapper object):
Array<{
  id: number;
  guest_id: number | null;
  type: string;
  created_at: number;  // Unix timestamp
}>
```

**Event Types** (examples, not exhaustive):
- `email_sent`: Magic link email sent
- `link_clicked`: Guest clicked link
- `verify_ok`: Magic link verified successfully
- `verify_fail`: Magic link verification failed
- `rsvp_submit`: RSVP submitted
- `invite_sent`: Invitation email sent (admin resend)
- `invite_seeded`: Guest seeded via admin
- `invite_clicked`: Guest clicked tracking link in invite
- `event_visibility_updated`: Guest event visibility changed
- `event_attendance_updated`: Admin updated attendance
- `guest_deleted`: Guest deleted
- `event_updated`: Event configuration changed
- `group_email_sent`: Admin bulk email sent (global event)
- `contribution_completed`: Stripe contribution completed (from webhook)

**Security**:
- Admin-only endpoint
- No PII stored in audit events (only guest IDs and event types)
- Guest IDs can be null for global events or if guest deleted

---

### functions/admin/loadEventSummaries.ts

**Purpose**: Loads and normalizes `EventDetails`, returning a lightweight list of configured events.

**Not an HTTP endpoint** - internal utility function

**Used by**: `admin/guests.ts`, `admin/invite.ts`

**Returns**:
```typescript
{
  events: Array<{
    id: string;
    label: string;
    requiresMealSelection?: boolean;
    mealOptions?: string[];
  }>;
}
```

**Logic**:
- Reads singleton event record (id=1), decrypts `enc_details`, and runs `normalizeEventDetails`
- Persists normalized details if a legacy payload was migrated
- Maps `EventDetails.events` to `EventSummary[]` for admin UIs

---

### functions/admin/profileUtils.ts

**Purpose**: Shared helper functions for admin guest/profile operations.

**Not an HTTP endpoint** - internal utility module

**Key Exports**:
- `trimToString(value)`: Coerces and trims unknown values
- `normalizeEventSelection(raw, events, options)`: Normalizes event ID selection maps
- `buildPartyMembers(primary, companion, allowGuest, invitedEvents)`: Builds party member list (primary + optional companion/guest)
- `PRIMARY_ID`, `COMPANION_ID`, `GUEST_ID`: Reserved personId values for party member seeding

**Used by**: `admin/guests.ts`, `admin/invite.ts`

---

### functions/stripe/config.ts

**Purpose**: Returns the Stripe publishable key to authenticated guests so the browser SDK can initialize.

**Method**: GET

**Authentication**: Session cookie required + origin check

**Flow**:
1. Verify the request originated from `APP_BASE_URL` (prevents embedding on other domains)
2. Validate the session cookie via `validateSession`
3. Read `STRIPE_PUBLISHABLE_KEY` from environment
4. Return JSON with the publishable key

**Response**:
```json
{ "publishableKey": "pk_live_..." }
```

**Security**:
- Returns 401 if origin or session validation fails
- Returns 500 if the publishable key is not configured (logged via `logError`)
- Responses are `Cache-Control: no-store` to avoid leaking keys via shared caches

---

### functions/stripe/create-session.ts

**Purpose**: Creates Stripe Checkout session for honeymoon fund contribution.

**Method**: POST

**Authentication**: Session cookie required + origin check

**Rate Limit**: `STRIPE_CREATE_PER_HOUR` (default: 10)

**Request Body**:
```typescript
{
  amountUsd: number;  // Amount in dollars (converts to cents internally)
}
```

**Flow**:
1. Verify request origin matches `APP_BASE_URL`
2. Validate session cookie
3. Check rate limit (by guest ID)
4. Validate amount (min $1)
5. Create Stripe Checkout session with `ui_mode: 'custom'`
6. Return client secret and session ID

**Response** (status 201):
```typescript
{
  clientSecret: string; // Stripe client secret for Elements/embedded checkout
  sessionId: string;    // Stripe Checkout session ID
}
```

**Stripe Metadata**:
- `app`: Friendly project label (update to your own project name)
- `contribution_dollars`: String amount used for reporting
- `guest_id`: Guest database ID (used by webhooks to reconcile payments)

**Security**:
- Origin validation prevents embedding on other domains
- Rate limited per guest
- Amount validated (minimum $1)
- Stripe session IDs are single-use

---

### functions/stripe/session-status.ts

**Purpose**: Checks status of Stripe Checkout session.

**Method**: GET

**Authentication**: Session cookie required + origin check

**Rate Limit**: `STRIPE_STATUS_PER_HOUR` (default: 30)

**Query Parameters**:
- `session_id`: Stripe Checkout session ID

**Response**:
```typescript
{
  status: 'complete' | 'expired' | 'open' | null;
  amountTotal: number | null; // Amount in cents
  currency: string | null;
  receiptUrl: string | null;
  email: string | null;
}
```

**Security**:
- Origin validation prevents embedding on other domains
- Rate limited per guest
- Only returns status for guest's own sessions (validates metadata)

---

### functions/stripe/webhook.ts

**Purpose**: Handles Stripe webhook events for payment confirmation.

**Method**: POST

**Authentication**: Stripe webhook signature verification

**Supported Events**:
- `checkout.session.completed`: Payment successful (records PII-free audit event when metadata contains guest_id)
- `checkout.session.async_payment_failed`: Async payment failed (logs failure)

**Flow**:
1. Verify webhook signature using `STRIPE_WEBHOOK_SECRET`
2. Extract event type and session data
3. If `checkout.session.completed` and `metadata.guest_id` is present, record `contribution_completed` audit event for that guest
4. If `checkout.session.async_payment_failed`, log the failure
5. Return 200 OK (errors are logged but do not trigger retries)

**Security**:
- Signature verification prevents spoofed webhooks

**Future Enhancements**:
- Send thank-you email on successful payment
- Display contribution / receipt details on guest profile
- Store contribution amounts (if you want more than audit presence)

---
