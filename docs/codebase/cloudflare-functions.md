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

**Purpose**: Generates magic link and sends invitation email to guest.

**Method**: POST

**Authentication**: None (public endpoint, rate-limited)

**Rate Limits**:
- `INVITES_PER_EMAIL_PER_HOUR`: Max invites per email address
- `INVITES_PER_IP_PER_10MIN`: Max invites per IP address

**Request Body**:
```typescript
{
  email: string;           // Guest email address
  "cf-turnstile-response": string;  // CAPTCHA token
}
```

**Flow**:
1. Verify Turnstile CAPTCHA token
2. Check rate limits (by email and IP)
3. Lookup guest by email hash in database
4. Generate 32-byte magic link token
5. Store token hash in `magic_links` table with TTL
6. Send email via Gmail API with magic link URL
7. Record `invite_sent` audit event
8. Update `invite_sent_at` timestamp on guest record

**Response**:
- 200: `{ success: true }`
- 400: Missing fields or already registered
- 429: Rate limit exceeded
- 404: Email not in guest list
- 500: Server error

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
1. Validate session cookie from `__Host-s` cookie
2. Check session not expired (idle timeout OR absolute timeout)
3. Update `last_seen_at` timestamp (idle timeout refresh)
4. Lookup guest by ID from session
5. Decrypt guest profile from `enc_profile` blob
6. Lookup event details from singleton `event` table
7. Decrypt event details from `enc_details` blob
8. Normalize attendance records (ensure all invited events present)
9. Compute pending meal selections (events needing meals)
10. Return SSR HTML or JSON based on `Accept` header

**Response (JSON)**:
```typescript
{
  guest: {
    id: number;
    email: string;
    party: Array<{
      personId: string;
      role: string;
      firstName: string;
      lastName: string;
      invitedEvents: string[];
      attendance: { [eventId]: { status, updatedAt, source } };
      mealSelections?: { [eventId]: string };
      dietaryNotes?: string;
    }>;
  };
  event: {
    id: string;
    version: number;
    siteTitle: string;
    dateISO: string;
    timeZone: string;
    events: Array<{
      eventId: string;
      label: string;
      dateISO: string;
      startTime: string;
      endTime?: string;
      location: { name, address, city, state, zip, country };
      mealOptions?: string[];
    }>;
    registryLinks?: Array<{ url, name }>;
    accommodations?: { hotelName, address, bookingUrl };
  };
  pendingMealSelections: Array<{ eventId, personId, eventLabel }>;
}
```

**Response (HTML)**:
- Server-rendered React shell with event data
- CSP nonce injected for inline scripts
- Progressive enhancement: hydrates with React 19 if JavaScript enabled

**Security**:
- Session validation on every request
- Idle timeout enforced (default 30 minutes)
- Absolute timeout enforced (default 12 hours)
- Guest can only access their own profile (session binds guest ID)
- Decryption uses AAD binding (table: `guests`, recordId: guest_id, purpose: `profile`)

**Error Responses**:
- 401: Invalid/expired session (redirects to `/` with login prompt)
- 500: Server error (database or decryption failure)

---

### functions/rsvp.ts

**Purpose**: Accepts RSVP submission with attendance and meal selections.

**Method**: POST

**Authentication**: Session cookie required

**Request Body**:
```typescript
{
  partyResponses: {
    [personId: string]: {
      events: {
        [eventId: string]: {
          status: 'attending' | 'declined';
          updatedAt: number;
          source: 'guest';
        }
      };
      mealSelections?: { [eventId: string]: string };
      dietaryNotes?: string;
    }
  };
  dietary?: string;
  notes?: string;
}
```

**Flow**:
1. Validate session cookie
2. Verify session not expired
3. Lookup guest by session guest_id
4. Decrypt guest profile
5. Validate RSVP data (Zod schema)
6. Verify person IDs match guest party members
7. Verify event IDs exist in event configuration
8. Validate meal selections (must match event's `mealOptions`)
9. Update guest profile with new attendance records
10. Encrypt updated profile
11. Upsert RSVP record with encrypted RSVP data
12. Record `rsvp_submit` audit event
13. Return success response

**Rate Limit**:
- `RSVP_SUBMISSIONS_PER_10MIN` (default: 20 submissions per 10 minutes, keyed by guest ID + client IP)

**Validation Rules**:
- All person IDs must belong to guest's party
- All event IDs must exist in event configuration
- Meal selections required if event has `mealOptions` and status is `attending`
- Meal selection must be one of event's `mealOptions`
- Cannot select meal if status is `declined`

**Response**:
- 200: `{ success: true }`
- 400: Validation error (missing fields, invalid meal selection, etc.)
- 401: Invalid/expired session
- 500: Server error

**Security**:
- Guest can only RSVP for their own party
- Meal selection validation prevents injection of arbitrary values
- Encrypted RSVP data uses AAD binding (table: `rsvps`, recordId: guest_id, purpose: `rsvp`)
- Timestamp validation ensures updatedAt is present and recent

---

### functions/admin/index.ts

**Purpose**: Serves admin dashboard with guest list, event config, and audit logs.

**Method**: GET

**Authentication**: Cloudflare Access JWT required (admin only)

**Flow**:
1. Validate Cloudflare Access JWT from `CF-Access-Jwt-Assertion` header
2. Verify JWT signature, audience, issuer, expiration
3. Extract admin email from JWT claims
4. Fetch all guests from database
5. Decrypt all guest profiles
6. Fetch RSVP records and decrypt
7. Fetch event configuration and decrypt
8. Fetch recent audit events
9. Compute stats (total guests, attending, declined, pending)
10. Return SSR HTML with admin dashboard

**Response (HTML)**:
- Server-rendered React admin dashboard
- Tabs: Guest Management, Event Configuration, Group Email, Audit Log
- CSP nonce injected for inline scripts

**Security**:
- Requires valid Cloudflare Access JWT (enforced by Cloudflare Access application)
- JWT signature verified with Cloudflare Access public keys (JWKS)
- Admin email logged in audit events
- Access to all guest data (PII) - admin privilege required

**Dev Mode**:
- If `DEV_MODE=true`, bypasses Access validation and returns mock admin email

**Error Responses**:
- 401: Invalid/expired JWT
- 503: Cloudflare Access not configured
- 500: Server error

---

### functions/admin/guests.ts

**Purpose**: CRUD operations for guest list (add, update, delete guests).

**Methods**: GET, POST, PUT, DELETE

**Authentication**: Cloudflare Access JWT required

**GET /admin/guests**:
- Returns all guests with decrypted profiles
- Includes RSVP status and attendance summaries

**POST /admin/guests**:
- Creates new guest with encrypted profile
- Generates email hash
- Returns created guest with ID

**PUT /admin/guests**:
- Updates guest profile (party members, invited events, etc.)
- Re-encrypts profile with new data
- Validates person IDs are unique

**DELETE /admin/guests**:
- Deletes guest and cascades to related records (sessions, magic_links, rsvps, audit_events)
- Returns success response

**Request Body (POST/PUT)**:
```typescript
{
  id?: number;  // Required for PUT
  email: string;
  party: Array<{
    personId: string;
    role: 'primary' | 'companion' | 'child';
    firstName: string;
    lastName?: string;
    invitedEvents: string[];
    attendance?: { [eventId]: { status, updatedAt, source } };
  }>;
  phone?: string;
  notes?: string;
  vip?: boolean;
}
```

**Validation**:
- Email must be valid format
- Person IDs must be unique within party
- Invited events must exist in event configuration
- Primary role required for household head

**Security**:
- Admin-only endpoint (Cloudflare Access enforced)
- Encrypts all PII fields
- Uses AAD binding (table: `guests`, recordId: guest_id, purpose: `profile`)

---

### functions/admin/event.ts

**Purpose**: CRUD operations for event configuration (singleton record).

**Methods**: GET, POST, PUT

**Authentication**: Cloudflare Access JWT required

**GET /admin/event**:
- Returns decrypted event configuration from singleton row (id=1)

**POST /admin/event**:
- Creates event configuration (only if none exists)
- Validates and normalizes event data
- Encrypts and stores in database

**PUT /admin/event**:
- Updates existing event configuration
- Re-validates and normalizes
- Handles schema migrations (version bumps)

**Request Body**:
```typescript
{
  id: string;              // UUID
  version: number;         // Schema version (current: 6)
  siteTitle: string;
  dateISO: string;         // ISO 8601 date
  timeZone: string;        // IANA timezone
  events: Array<{
    eventId: string;
    label: string;
    dateISO: string;
    startTime: string;     // HH:MM format
    endTime?: string;
    location: {
      name: string;
      address: string;
      city: string;
      state: string;
      zip: string;
      country: string;
    };
    mealOptions?: string[];
  }>;
  registryLinks?: Array<{ url: string; name: string }>;
  accommodations?: {
    hotelName: string;
    address: string;
    bookingUrl: string;
  };
}
```

**Validation** (via `normalizeEventDetails`):
- Date validation: ISO 8601 format
- Timezone validation: IANA timezone database
- URL validation: HTTP/HTTPS only
- Time validation: HH:MM format
- Event IDs must be unique
- Generates UUID if missing

**Security**:
- Admin-only endpoint
- Encrypts all event data
- Uses AAD binding (table: `event`, recordId: `1`, purpose: `details`)
- Returns `{ details, didMutate }` to indicate if normalization changed data

---

### functions/admin/invite.ts

**Purpose**: Sends invitation email to one or more guests (admin-triggered).

**Method**: POST

**Authentication**: Cloudflare Access JWT required

**Request Body**:
```typescript
{
  guestIds: number[];       // Array of guest IDs to invite
  subjectOverride?: string; // Custom email subject
}
```

**Flow**:
1. Validate Cloudflare Access JWT
2. Lookup guests by IDs
3. For each guest:
   - Decrypt guest profile
   - Generate magic link token
   - Store token hash in `magic_links` table
   - Send invitation email via Gmail API
   - Record `invite_sent` audit event
   - Update `invite_sent_at` timestamp
4. Return summary of sent invitations

**Response**:
```typescript
{
  success: true;
  sent: number;  // Count of emails sent
}
```

**Email Template**:
- Personalized greeting (builds party member names)
- Magic link button
- Expiration warning (10 minutes default)
- Inline header image (base64-encoded)

**Security**:
- Admin-only endpoint
- Generates unique token per invitation
- Tokens single-use and time-limited

---

### functions/admin/group-email.ts

**Purpose**: Sends custom message to multiple guests (bulk email).

**Method**: POST

**Authentication**: Cloudflare Access JWT required

**Request Body**:
```typescript
{
  guestIds: number[];  // Array of guest IDs to email
  subject: string;     // Email subject
  body: string;        // Plain text email body
}
```

**Flow**:
1. Validate Cloudflare Access JWT
2. Lookup guests by IDs
3. Decrypt guest profiles to get email addresses
4. Send email via Gmail API with generic template
5. Record `email_sent` audit event for each recipient
6. Return summary of sent emails

**Response**:
```typescript
{
  success: true;
  sent: number;
}
```

**Email Template**:
- Generic layout with custom subject and body
- Plain text + HTML multipart
- No tracking or personalization

**Security**:
- Admin-only endpoint
- Does not store email content in database
- Audit log tracks recipients only (no message content)

---

### functions/admin/audit.ts

**Purpose**: Returns paginated audit log with optional filters.

**Method**: GET

**Authentication**: Cloudflare Access JWT required

**Query Parameters**:
- `limit`: Max events to return (default: 100, max: 500)
- `offset`: Skip N events (pagination)
- `type`: Filter by event type (e.g., `rsvp_submit`, `invite_sent`)
- `guestId`: Filter by guest ID

**Response**:
```typescript
{
  events: Array<{
    id: number;
    guest_id: number | null;
    type: string;
    created_at: number;  // Unix timestamp
  }>;
  total: number;  // Total matching events
}
```

**Event Types**:
- `invite_sent`: Invitation email sent
- `invite_clicked`: Guest clicked magic link (future)
- `invite_opened`: Guest opened invitation email (future)
- `email_sent`: Group email sent
- `link_clicked`: Guest clicked tracking link (future)
- `verify_ok`: Magic link verified successfully
- `verify_fail`: Magic link verification failed
- `rsvp_submit`: RSVP submitted

**Security**:
- Admin-only endpoint
- No PII stored in audit events (only guest IDs and event types)
- Guest IDs can be null if guest deleted

---

### functions/admin/loadEventSummaries.ts

**Purpose**: Helper function to compute attendance summaries per event.

**Not an HTTP endpoint** - internal utility function

**Used by**: `admin/index.ts`, `admin/guests.ts`

**Returns**:
```typescript
{
  [eventId: string]: {
    attending: number;
    declined: number;
    pending: number;
  }
}
```

**Logic**:
- Iterates all guests and party members
- Counts attendance status per event
- Handles missing attendance records (defaults to pending)

---

### functions/admin/profileUtils.ts

**Purpose**: Helper functions for guest profile management.

**Not an HTTP endpoint** - internal utility module

**Key Functions**:
- `validateGuestProfile(profile)`: Zod validation for guest profile schema
- `normalizeGuestProfile(profile)`: Ensures consistent data structure
- `computeAttendanceSummary(party)`: Aggregates attendance across party members

**Used by**: `admin/guests.ts`, `admin/event.ts`

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

**Authentication**: Session cookie required

**Rate Limit**: `STRIPE_CREATE_PER_HOUR` (default: 10)

**Request Body**:
```typescript
{
  amount: number;  // Amount in dollars (converts to cents)
}
```

**Flow**:
1. Validate session cookie
2. Check rate limit (by guest ID)
3. Lookup guest profile
4. Create Stripe Checkout session
5. Set success/cancel URLs
6. Return session ID for client redirect

**Response**:
```typescript
{
  clientSecret: string; // Stripe client secret for Elements/embedded checkout
  sessionId: string;    // Stripe Checkout session ID
}
```

**Stripe Metadata**:
- `app`: Friendly project label (update line 89 to your own project name)
- `contribution_dollars`: String amount used for reporting
- `guest_id`: Guest database ID (used by webhooks to reconcile payments)

**Security**:
- Rate limited per guest
- Amount validated (min $1, max $10,000)
- Stripe session IDs are single-use

---

### functions/stripe/session-status.ts

**Purpose**: Checks status of Stripe Checkout session.

**Method**: GET

**Authentication**: Session cookie required

**Rate Limit**: `STRIPE_STATUS_PER_HOUR` (default: 30)

**Query Parameters**:
- `session_id`: Stripe Checkout session ID

**Response**:
```typescript
{
  status: 'complete' | 'expired' | 'open';
  customer_email?: string;
}
```

**Security**:
- Rate limited per guest
- Only returns status for guest's own sessions (validates metadata)

---

### functions/stripe/webhook.ts

**Purpose**: Handles Stripe webhook events for payment confirmation.

**Method**: POST

**Authentication**: Stripe webhook signature verification

**Supported Events**:
- `checkout.session.completed`: Payment successful
- `checkout.session.expired`: Payment session expired

**Flow**:
1. Verify webhook signature using `STRIPE_WEBHOOK_SECRET`
2. Extract event type and session data
3. Log event (future: record in audit log or send confirmation email)
4. Return 200 OK

**Security**:
- Signature verification prevents spoofed webhooks
- Idempotent (can safely process duplicate events)

**Future Enhancements**:
- Send thank-you email on successful payment
- Record payment in audit log
- Display contribution on guest profile

---

