# Source Code - Libraries

Core utility modules for authentication, encryption, email, rate limiting, and request handling.

---

### src/lib/access-jwks.ts

**Purpose**: Fetches and caches Cloudflare Access public signing keys (JWKS) for JWT verification.

**Cryptographic Parameters**:
- Algorithm: RS256 (RSASSA-PKCS1-v1_5 with SHA-256)
- Key type: RSA public keys in JWK format
- Cache: In-memory with TTL

**Environment Variables**:
- `ACCESS_JWT_ISS` (required): Issuer URL for Cloudflare Access (e.g., `https://your-team.cloudflareaccess.com`)
- `ACCESS_CERTS_CACHE_MIN` (optional): Cache duration in minutes (default: 5)

**Key Functions**:
- `getSigningKey(env, kid)`: Fetches or retrieves cached public key by key ID

**API Endpoints**:
- Fetches from: `{ACCESS_JWT_ISS}/cdn-cgi/access/certs`

**Default Values**:
- Cache TTL: 5 minutes (to balance security and performance)

---

### src/lib/access.ts

**Purpose**: Validates Cloudflare Access JWT tokens from incoming requests.

**Cryptographic Parameters**:
- Algorithm: RS256 (RSASSA-PKCS1-v1_5 with SHA-256)
- Token format: JWT with header, payload, signature
- Verification: RSA signature verification with public key

**Environment Variables**:
- `ACCESS_AUD` (optional): Expected audience claim in JWT
- `ACCESS_JWT_ISS` (optional): Expected issuer claim in JWT
- `DEV_MODE` (optional): Set to `'true'` to bypass verification in development

**Key Functions**:
- `requireAccessAssertion(request, env)`: Extracts and validates JWT from `CF-Access-Jwt-Assertion` header

**Default Values**:
- Dev mode returns: `{ email: 'dev@localhost', sub: 'dev-mode' }`

**Notes**:
- Returns 401 for invalid/expired tokens
- Returns 503 if Access is not configured
- Validates audience, issuer, expiration (exp), and not-before (nbf) claims

---

### src/lib/cookies.ts

**Purpose**: Creates and validates secure session cookies with idle and absolute timeouts.

**Cryptographic Parameters**:
- Session IDs: 32-byte random tokens (256 bits)
- Hashing: HMAC-SHA256 for session ID storage

**Environment Variables**:
- `KEK_B64` (required): Base64-encoded 256-bit key encryption key for HMAC
- `SESSION_IDLE_MIN` (required): Idle timeout in minutes
- `SESSION_ABSOLUTE_HOURS` (required): Absolute session lifetime in hours
- `DEV_MODE` (optional): Set to `'true'` to allow HTTP cookies on localhost
- `DB` (required): D1 database binding

**Key Functions**:
- `createSession(guestId, env)`: Generates session cookie and hash
- `validateSession(cookieHeader, env)`: Validates session and updates last seen timestamp

**Default Values**:
- Cookie name: `__Host-s` (production) or `s` (dev mode)
- Cookie attributes: HttpOnly, SameSite=Lax, Secure (except dev mode)

**Notes**:
- Sessions expire after idle timeout OR absolute timeout
- Cookie uses `__Host-` prefix for additional security in production
- SameSite=Lax allows navigation after magic link redirects

---

### src/lib/crypto.ts

**Purpose**: Provides envelope encryption for sensitive data and cryptographic token generation.

**Cryptographic Parameters**:
- **Encryption**: AES-GCM-256 (256-bit key, 12-byte IV)
- **Key wrapping**: AES-KW (AES Key Wrap) with 256-bit KEK
- **Token generation**: 32-byte random values (256 bits)
- **HMAC**: HMAC-SHA256 for email and token hashing
- **AAD**: Additional Authenticated Data in format `table:recordId:purpose`

**Environment Variables**:
- `KEK_B64` (required): Base64-encoded 256-bit key encryption key

**Key Functions**:
- `generateToken()`: Creates 32-byte base64url-encoded random token
- `hashEmail(email, secret)`: HMAC-SHA256 hash of normalized email
- `hashToken(token, secret)`: HMAC-SHA256 hash of token
- `encryptJson(data, kekB64, table, recordId, purpose)`: Envelope encryption with AAD
- `decryptJson(encryptedData, kekB64, table, recordId, purpose)`: Decrypts envelope-encrypted data

**Encrypted Payload Structure**:
```typescript
{
  ciphertext: string;      // Base64-encoded AES-GCM ciphertext
  iv: string;              // Base64-encoded initialization vector (12 bytes)
  dek_wrapped: string;     // Base64-encoded wrapped DEK
  aad_hint: string;        // Format: "table:recordId:purpose"
}
```

**Default Values**:
- IV size: 12 bytes (96 bits) for AES-GCM
- Random token size: 32 bytes (256 bits)
- DEK: Unique 256-bit AES key per encryption operation

**Notes**:
- Uses envelope encryption: data encrypted with ephemeral DEK, DEK wrapped with KEK
- AAD prevents ciphertext reuse across different contexts
- DEK is non-extractable after unwrapping for security

---

### src/lib/emailAssets.ts

**Purpose**: Inline base64-encoded header images for email templates.

**Environment Variables**: None

**Key Exports**:
- `MAGIC_HEADER_IMAGE`: Watercolor foliage for magic link emails (object with `base64`, `mimeType`, `fileName`, `contentId`)
- `INVITE_HEADER_IMAGE`: Wedding florals for invitation emails (object with `base64`, `mimeType`, `fileName`, `contentId`)

**Notes**:
- Images embedded as base64 to avoid external dependencies during email delivery
- Uses `content-id` (cid) references in HTML email templates
- File is large (~204KB) due to base64 encoding
- Replace these images with your own artwork by updating the base64 data

---

### src/lib/eventNormalization.ts

**Purpose**: Validates, normalizes, and migrates event details schema.

**Environment Variables**: None

**Key Functions**:
- `normalizeEventDetails(input, options)`: Validates and normalizes event configuration
- `isValidISODate(value)`: Validates ISO 8601 date strings
- `isValidTimeZone(tz)`: Validates IANA timezone identifiers
- `isHttpUrl(url)`: Validates HTTP/HTTPS URLs
- `sanitizeRegistryEntry(entry)`: Validates registry link entries

**Default Values**:
- Default timezone: `'UTC'`
- Current schema version: 6

**Notes**:
- Returns `{ details, didMutate }` to indicate if normalization changed data
- Migrates legacy fields (e.g., `title` → `siteTitle`)
- Generates event IDs using `crypto.randomUUID()` when missing
- Validates venue addresses, meal options, and accommodation data

---

### src/lib/gmail.ts

**Purpose**: Sends transactional emails via Gmail API using OAuth2.

**Environment Variables**:
- `GMAIL_CLIENT_ID` (required): Google OAuth2 client ID
- `GMAIL_CLIENT_SECRET` (required): Google OAuth2 client secret
- `GMAIL_REFRESH_TOKEN` (required): Long-lived refresh token
- `GMAIL_FROM` (required): From address (e.g., `"Name <email@example.com>"`)

**API Endpoints**:
- OAuth token refresh: `https://oauth2.googleapis.com/token`
- Send message: `https://gmail.googleapis.com/gmail/v1/users/me/messages/send`

**Key Functions**:
- `sendMagicLinkEmail(env, to, magicLink, subjectOverride)`: Sends login link
- `sendWeddingInvitation(env, to, party, trackingUrl, subjectOverride)`: Sends invitation
- `sendGroupEmail(env, to, subject, body)`: Sends custom message to multiple recipients
- `buildInviteGreeting(party)`: Formats party member names for greeting

**Email Templates**:
- Magic link: Button-based design with expiration warning
- Wedding invitation: Personalized greeting with tracking URL
- Group email: Generic template for bulk messaging

**Default Values**:
- Subject fallback: `"Set your [type] email subject in admin panel"` (shown until you customize subjects in the admin UI)
- Font: System font stack matching `BRAND_SANS`

**Notes**:
- Uses multipart/alternative (text + HTML) and multipart/related (inline images)
- Converts HTML to plain text with link preservation
- MIME boundaries are randomly generated per message
- Preheader text hidden for mobile preview

---

### src/lib/logger.ts

**Purpose**: Conditional logging that respects deployment environment.

**Environment Variables**:
- `NODE_ENV` (optional): Set to `'development'` to enable logs
- `ENABLE_DEBUG_LOGS` (optional): Set to `'true'` to force logging
- `__ENABLE_DEBUG_LOGS__` (optional): Global flag for runtime control

**Key Functions**:
- `logError(context, error)`: Safely logs errors without exposing sensitive details

**Default Values**:
- Logging disabled by default in production

**Notes**:
- Only logs error messages, not full stack traces, to prevent info leakage
- Checks multiple sources for log enablement

---

### src/lib/name-format.ts

**Purpose**: Formats party member names for display in UI and emails.

**Environment Variables**: None

**Key Functions**:
- `formatMemberNameWithInitial(member)`: Returns "First L." format
- `formatMemberDisplayName(member)`: Returns formatted name or "Guest"

**Default Values**:
- Companion without name: `"Companion"`
- Guest without name: `"Guest"`

**Notes**:
- Normalizes whitespace and handles missing names gracefully
- Prefers first name + last initial format

---

### src/lib/origin.ts

**Purpose**: Validates request origin for CSRF protection.

**Environment Variables**: None

**Key Functions**:
- `isAllowedOrigin(request, baseUrl)`: Checks Origin, Referer, and Sec-Fetch-Site headers

**Default Values**:
- Accepts `Sec-Fetch-Site: same-origin` or `Sec-Fetch-Site: none`

**Notes**:
- Used to prevent cross-origin requests to sensitive endpoints
- Validates against configured base URL

---

### src/lib/pageStyles.ts

**Purpose**: Shared CSS and HTML utilities for server-rendered pages.

**Environment Variables**: None

**Key Exports**:
- `BRAND_SANS`: System font stack
- `pageStyles`: Color palette and typography configuration
- `getBaseStyles(nonce)`: Inlined CSS with optional CSP nonce
- `renderNotice(type, message)`: Styled alert boxes
- `escapeHtml(text)`: HTML entity escaping

**Default Values**:
- Font: System font stack (Apple System, Segoe UI, etc.)
- Colors: Neutral dark palette with teal accents
- Container: 480px max-width, 28px border-radius

**Notes**:
- Follows 8px baseline grid for spacing
- Supports dark mode via `html.dark` class
- Mobile responsive with breakpoint at 540px

---

### src/lib/party.ts

**Purpose**: Party member and attendance management utilities.

**Environment Variables**: None

**Key Functions**:
- `clonePartyMember(member)`: Deep clones party member with attendance
- `normalizeGuestProfileAttendance(profile)`: Ensures attendance records match invited events
- `computePendingMealSelections(...)`: Identifies events needing meal selection
- `clearMealSelection(member, eventId)`: Removes meal selection for event

**Default Values**:
- Attendance status: `'pending'` (when invalid)
- Attendance source: `'system'` (fallback)

**Notes**:
- Attendance records include status, source, and timestamp
- Meal selections are indexed by event ID
- Pending meal selections auto-computed from attendance

---

### src/lib/ratelimit.ts

**Purpose**: Sliding window rate limiting using Cloudflare KV.

**Environment Variables**:
- `RATE_LIMIT_KV` (optional): KV namespace binding for rate limit storage
- `DEV_MODE` (optional): Set to `'true'` to bypass rate limiting

**Key Functions**:
- `checkRateLimit(env, key, limit, windowSeconds)`: Returns true if under limit

**Default Values**:
- Returns false if KV not configured (unless dev mode)

**Notes**:
- Uses time-bucketed keys: `{key}:{floor(now/windowSeconds)}`
- Automatic expiration via KV TTL
- Increments count atomically

---

### src/lib/request.ts

**Purpose**: Request payload validation with size limits.

**Environment Variables**: None

**Key Functions**:
- `readJsonWithinLimit<T>(request, maxBytes)`: Parses JSON with size check

**Errors**:
- `PayloadTooLargeError`: Thrown when request exceeds max bytes

**Notes**:
- Measures payload in UTF-8 bytes, not characters
- Used to prevent memory exhaustion attacks

---

### src/lib/stripe.ts

**Purpose**: Creates configured Stripe client for payment processing.

**Environment Variables**:
- `STRIPE_SECRET_KEY` (required): Stripe secret key (starts with `sk_`)

**Key Functions**:
- `createStripeClient(secretKey)`: Returns configured Stripe instance

**Default Values**:
- HTTP client: Fetch-based (for Cloudflare Workers compatibility)

**Notes**:
- Uses official Stripe SDK with fetch adapter
- Throws if secret key missing

---

### src/lib/turnstile.ts

**Purpose**: Verifies Cloudflare Turnstile CAPTCHA tokens.

**Environment Variables**:
- `TURNSTILE_SECRET_KEY` (required): Turnstile secret key

**API Endpoints**:
- Verify: `https://challenges.cloudflare.com/turnstile/v0/siteverify`

**Key Functions**:
- `verifyTurnstile(token, secret, remoteIp)`: Returns true if token valid

**Default Values**:
- Returns false on verification failure or network error

**Notes**:
- Sends token, secret, and remote IP to Turnstile API
- Used to prevent bot submissions

---

### src/lib/utils.ts

**Purpose**: Tailwind CSS class merging utility.

**Environment Variables**: None

**Key Functions**:
- `cn(...inputs)`: Merges Tailwind classes with conflict resolution

**Notes**:
- Combines `clsx` (conditional classes) with `twMerge` (deduplication)
- Standard utility for React components using Tailwind