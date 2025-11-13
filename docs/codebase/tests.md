# Test Suite

A comprehensive testing strategy organized by category to ensure system reliability, security, and correctness.

---

### Testing Philosophy

**Coverage Strategy**:
- **Concurrency**: Race conditions that only appear under load
- **Crypto**: Cryptographic primitives that must be mathematically correct
- **Security**: Attack vectors (XSS, SQL injection, CSRF, replay attacks)
- **Integration**: Real flows with real crypto (not mocked)
- **Unit**: Individual functions in isolation
- **Meta**: Code quality enforcement

**Why This Matters**:
1. **LLM Safety Net**: Catches mistakes LLMs commonly make (missing await, race conditions, type errors)
2. **Cryptographic Correctness**: Encryption tests prevent catastrophic security failures
3. **Concurrency Safety**: Ensures system handles parallel requests without corruption
4. **Security Hardening**: Validates defense against common attack vectors
5. **Regression Prevention**: Integration tests catch schema/KEK drift
6. **Code Quality**: Meta tests enforce standards automatically

---

### Concurrency Tests

**Location**: `/tests/concurrency/`

#### concurrent-rsvp.test.ts
- **What it tests**: Parallel RSVP submissions by the same guest
- **Why it matters**: Ensures no data corruption when 10+ simultaneous RSVP submissions hit the system
- **Key scenarios**:
  - All concurrent requests correctly persist attendance records
  - Pending meal selections tracked separately per request
  - Session expiration mid-request handled gracefully (5 succeed, 5 fail with 401)
  - Database operations (guest updates, RSVP inserts, audit events) execute expected number of times

#### concurrent-magic-links.test.ts
- **What it tests**: Parallel verification of the same magic link token
- **Why it matters**: Prevents single-use tokens from being consumed multiple times (replay attack protection)
- **Key scenarios**:
  - Only first concurrent request succeeds (1 success, 4 failures with 400)
  - Used links immediately reject subsequent attempts
  - Session creation only happens once
  - Expired/invalid links never create sessions

---

### Cryptography Tests

**Location**: `/tests/crypto/`

#### aad-enforcement.test.ts
- **What it tests**: Additional Authenticated Data (AAD) binding in envelope encryption
- **Why it matters**: Prevents ciphertext from being moved between tables, records, or purposes
- **Key scenarios**:
  - Decryption fails when table name differs
  - Decryption fails when record ID differs
  - Decryption fails when purpose differs
  - AAD is case-sensitive and whitespace-sensitive
  - Empty strings in AAD are distinct values
  - Attacker cannot use Guest A's encrypted profile for Guest B

#### iv-uniqueness.test.ts
- **What it tests**: Initialization Vector (IV) uniqueness for AES-GCM encryption
- **Why it matters**: Prevents catastrophic nonce reuse attacks that break AES-GCM security
- **Key scenarios**:
  - Every encryption generates unique 12-byte (96-bit) IV
  - Identical inputs with identical AAD produce different IVs
  - IVs are not all zeros, not sequential, and have high entropy
  - 64 consecutive encryptions produce 64 unique IVs

#### token-randomness.test.ts
- **What it tests**: Token and hash generation for magic links and sessions
- **Why it matters**: Ensures tokens cannot be predicted or brute-forced
- **Key scenarios**:
  - 1000 consecutive tokens are all unique (no collisions)
  - Tokens are 43 characters (32 bytes base64url, URL-safe)
  - Token hashing is deterministic for same input
  - Email hashing normalizes casing and whitespace before hashing
  - Hash output is 43-character URL-safe base64

---

### Security Tests

**Location**: `/tests/security/`

#### xss-prevention.test.ts
- **What it tests**: Cross-Site Scripting (XSS) prevention through HTML escaping
- **Why it matters**: Prevents malicious scripts from executing when user input is rendered
- **Key scenarios**:
  - Escapes all HTML special characters (&lt;, &gt;, &amp;, &quot;, &#039;)
  - Blocks 20+ OWASP XSS evasion techniques (script tags, img onerror, SVG onload, etc.)
  - Prevents stored XSS in guest profiles
  - Prevents reflected XSS in error messages
  - Handles unicode, entities, and double-escaping safely

#### sql-injection.test.ts
- **What it tests**: Production handlers with malicious SQL injection payloads
- **Why it matters**: Ensures all user input is properly parameterized in D1 queries
- **Key scenarios**:
  - Invite endpoint parameterizes email lookups with `'OR'1'='1` payload
  - Verify endpoint binds token with `'; DROP TABLE magic_links; --` payload
  - Admin audit endpoint keeps guest_id filters parameterized
  - No queries contain raw malicious input
  - All placeholders (?) match parameter count

#### csp-headers.test.ts
- **What it tests**: Content Security Policy headers and nonce generation
- **Why it matters**: Prevents inline script execution and clickjacking attacks
- **Key scenarios**:
  - Generates unique nonce per request
  - Replaces all {NONCE} placeholders in CSP headers
  - Applies default restrictive CSP (default-src 'none')
  - Sets X-Content-Type-Options, X-Frame-Options, Referrer-Policy
  - Sets Cache-Control: no-store for sensitive routes (/event, /admin, /auth/verify)
  - Blocks unsafe-inline scripts
  - Allows Turnstile domains
  - 100 requests generate 100 unique nonces

---

### Integration Tests

**Location**: `/tests/integration/`

#### crypto-roundtrip.test.ts
- **What it tests**: Real crypto helpers across admin event handlers
- **Why it matters**: Catches schema or KEK drift when data encrypted by one handler is decrypted by another
- **Key scenarios**:
  - Event details encrypted on POST decrypt correctly on GET
  - Ciphertext doesn't contain plaintext (site title, event labels)
  - Real encryption/decryption (not mocked)

#### session-lifecycle.test.ts
- **What it tests**: Session creation, validation, refresh, and expiration
- **Why it matters**: Ensures cookies.ts interacts correctly with sessions table
- **Key scenarios**:
  - Create session generates cookie with sessionIdHash
  - Validate active session succeeds
  - Refresh updates last_seen_at within idle timeout
  - Sessions expire after idle timeout (deleted from DB)

#### rate-limiting.test.ts
- **What it tests**: Request rate limiting by email and IP address
- **Why it matters**: Prevents abuse and brute-force attacks
- **Key scenarios covered in other integration tests**

#### guest/* (invite.test.ts, rsvp-route.test.ts, event-route.test.ts, auth-verify.test.ts)
- **What they test**: Full request/response flows for guest-facing endpoints
- **Why it matters**: Validates business logic and error handling paths
- **Key scenarios**:
  - Magic link generation and verification
  - RSVP submission with meal selection validation
  - Event details rendering with session authentication
  - Auth verification with session creation

#### admin/* (guests.test.ts, event.test.ts, audit.test.ts, access-enforcement.test.ts)
- **What they test**: Admin operations with Cloudflare Access enforcement
- **Why it matters**: Ensures admin operations require valid JWT assertions
- **Key scenarios**:
  - Access token validation
  - Guest list retrieval and updates
  - Event configuration persistence
  - Audit log queries

---

### Unit Tests

**Location**: `/tests/unit/lib/`, `/tests/unit/functions/`

#### crypto-envelope.test.ts
- **What it tests**: Envelope encryption roundtrip integrity
- **Why it matters**: Core encryption primitives must preserve data perfectly
- **Key scenarios**:
  - Round-trip structured payloads with matching metadata
  - Fail when AAD mismatches (table, record ID, purpose)
  - Fail when using different KEK
  - Reject tampered ciphertext

#### request-limit.test.ts
- **What it tests**: JSON payload size validation
- **Why it matters**: Prevents memory exhaustion from oversized payloads
- **Key scenarios**:
  - Rejects payloads exceeding byte limit
  - Accepts payloads within limit
  - Counts multibyte characters correctly
  - Allows payloads exactly at limit

#### cookies.test.ts, turnstile.test.ts, gmail.test.ts, access.test.ts
- **What they test**: Individual helper functions in isolation
- **Why it matters**: Unit-level validation of utilities before integration testing

#### middleware.test.ts, audit-limit.test.ts
- **What they test**: Middleware behavior and audit log limiting
- **Why it matters**: Ensures cross-cutting concerns work correctly

---

### Meta Tests

**Location**: `/tests/meta/`

#### anti-patterns.test.ts
- **What it tests**: Common code smells and LLM-introduced mistakes
- **Why it matters**: Enforces code quality standards automatically
- **Violations detected**:
  - console.log in production code (use logger instead)
  - Unjustified `any` types without `// OK: any` comments
  - TODO/FIXME comments in production
  - console.error without proper error handling
  - Empty catch blocks without justification
  - Hardcoded credentials (password, api_key, secret, token patterns)

#### type-safety.test.ts
- **What it tests**: TypeScript compilation with strict checks
- **Why it matters**: Catches missing await, wrong return types, type errors
- **Key scenarios**:
  - Runs `tsc --noEmit --skipLibCheck`
  - Extracts and reports all TS errors
  - Fails if any type errors exist

#### dead-code.test.ts, code-duplication.test.ts, unused-styles.test.ts
- **What they test**: Static analysis for maintainability issues
- **Why it matters**: Keeps codebase clean and prevents technical debt

---

### Test Helpers

**Location**: `/tests/helpers/`

#### mock-d1.test.ts, in-memory-kv.test.ts, session-db.test.ts
- **What they test**: Test infrastructure itself
- **Why it matters**: Ensures mocks behave like real Cloudflare services
- **Key helpers**:
  - `createMockD1`: In-memory D1 database with query interception
  - `createInMemoryKV`: KV namespace simulation
  - `createSessionDb`: Session-specific D1 mock with snapshot capability

---

### Running Tests

**Commands**:
- **All tests**: `npm run test`
- **Unit only**: `npm run test:unit`
- **Integration only**: `npm run test:integration`
- **Crypto tests**: `npm run test:crypto`
- **Security tests**: `npm run test:security`
- **Concurrency tests**: `npm run test:concurrency`
- **Meta tests**: `npm run test:meta`
- **Watch mode**: `npm run test:watch`
- **Type check**: `npm run test:types`
- **Dead code**: `npm run test:dead-code`
- **Duplication**: `npm run test:duplication`
- **All checks**: `npm run test:all` (types + tests + duplication + dead code)