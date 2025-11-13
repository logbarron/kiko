# Database & Migrations

SQLite database schema via Cloudflare D1 with envelope encryption for all PII fields.

---

### migrations/0001_complete_schema.sql

**Purpose**: Complete database schema with all tables and indexes.

**Tables**:

#### guests
- **Purpose**: One row per email address (household head)
- **Columns**:
  - `id`: Primary key (auto-increment)
  - `email_hash`: HMAC-SHA256 hash of normalized email (unique)
  - `enc_profile`: Encrypted JSON blob containing guest profile
  - `invite_token_hash`: Hash of unique invite tracking token
  - `invite_sent_at`: Timestamp when invitation was sent
  - `invite_clicked_at`: Timestamp when invite link was clicked
  - `registered_at`: Timestamp when guest completed registration (first login)
  - `created_at`, `updated_at`: Row timestamps

**Encrypted Profile Schema**:
```typescript
{
  email: string;
  party: Array<{
    personId: string;
    role: 'primary' | 'companion' | 'child';
    firstName: string;
    lastName?: string;
    invitedEvents: string[];  // Event IDs
    attendance: {
      [eventId: string]: {
        status: 'attending' | 'declined' | 'pending';
        updatedAt: number;
        source: 'guest' | 'admin' | 'system';
      }
    };
    mealSelections?: { [eventId: string]: string };
    dietaryNotes?: string;
  }>;
  phone?: string;
  notes?: string;
  dietary?: string;
  vip?: boolean;
  inviteToken?: string;
  inviteSentAt?: number;
  inviteClickedAt?: number;
  registeredAt?: number;
  rsvp?: boolean;
}
```

**Indexes**:
- `idx_guests_email_hash`: Lookup by email hash
- `idx_guests_invite_token`: Lookup by invite token hash

---

#### magic_links
- **Purpose**: Single-use, short-lived authentication tokens
- **Columns**:
  - `id`: Primary key (auto-increment)
  - `guest_id`: Foreign key to `guests.id` (CASCADE DELETE)
  - `token_hash`: HMAC-SHA256 hash of magic link token (unique)
  - `issued_at`: Timestamp when token was generated
  - `expires_at`: Timestamp when token expires
  - `used_at`: Timestamp when token was consumed (single-use enforcement)
  - `issued_ip_hash`: Hash of IP address (for rate limiting)
  - `issued_ua`: User agent string (for audit)

**Token Lifecycle**:
1. Generated via `/invite` endpoint
2. Sent via email to guest
3. Verified via `/auth/verify` endpoint
4. Marked as used (`used_at` set)
5. Expired tokens deleted by cleanup job

**Indexes**:
- `idx_magic_links_guest_id`: Lookup by guest
- `idx_magic_links_token_hash`: Lookup by token hash

---

#### sessions
- **Purpose**: HttpOnly cookie-backed sessions with dual expiry
- **Columns**:
  - `id`: Primary key (auto-increment)
  - `guest_id`: Foreign key to `guests.id` (CASCADE DELETE)
  - `session_id_hash`: HMAC-SHA256 hash of session ID in cookie (unique)
  - `created_at`: Session creation timestamp
  - `expires_at`: Absolute expiry timestamp (12 hours default)
  - `last_seen_at`: Last activity timestamp (for idle timeout, 30 min default)

**Session Lifecycle**:
1. Created after magic link verification
2. Cookie sent to client (`__Host-s` prefix)
3. Validated on every request to authenticated endpoints
4. `last_seen_at` updated on each request (idle timeout refresh)
5. Expired via idle timeout OR absolute timeout
6. Expired sessions deleted by cleanup job

**Indexes**:
- `idx_sessions_guest_id`: Lookup by guest
- `idx_sessions_hash`: Lookup by session ID hash

---

#### rsvps
- **Purpose**: One row per guest (household), stores encrypted RSVP data
- **Columns**:
  - `guest_id`: Primary key, foreign key to `guests.id` (CASCADE DELETE)
  - `enc_rsvp`: Encrypted JSON blob containing RSVP data
  - `updated_at`: Last update timestamp

**Encrypted RSVP Schema**:
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
  submittedAt?: number;
}
```

**Notes**:
- RSVP data also duplicated in guest profile for denormalized reads
- `enc_rsvp` is the source of truth for RSVP submissions

---

#### event
- **Purpose**: Singleton row with encrypted event configuration
- **Columns**:
  - `id`: Primary key (always 1, enforced by CHECK constraint)
  - `enc_details`: Encrypted JSON blob containing event details
  - `updated_at`: Last update timestamp

**Encrypted Event Schema**:
```typescript
{
  id: string;  // UUID
  version: number;  // Schema version (current: 6)
  siteTitle: string;
  dateISO: string;  // ISO 8601 date
  timeZone: string;  // IANA timezone
  events: Array<{
    eventId: string;
    label: string;
    dateISO: string;
    startTime: string;  // HH:MM
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

**Notes**:
- Singleton enforced by `CHECK (id = 1)` constraint
- Schema version tracks migrations (handled by `normalizeEventDetails`)

---

#### audit_events
- **Purpose**: PII-free event tracking for metrics and debugging
- **Columns**:
  - `id`: Primary key (auto-increment)
  - `guest_id`: Foreign key to `guests.id` (SET NULL on delete)
  - `type`: Event type string (e.g., `invite_sent`, `rsvp_submit`)
  - `created_at`: Event timestamp

**Event Types**:
- `invite_sent`: Invitation email sent to guest
- `invite_clicked`: Guest clicked invite tracking link (future)
- `invite_opened`: Guest opened invitation email (future)
- `email_sent`: Group email sent to guest
- `link_clicked`: Guest clicked tracking link in email (future)
- `verify_ok`: Magic link verified successfully
- `verify_fail`: Magic link verification failed
- `rsvp_submit`: RSVP submitted by guest

**Indexes**:
- `idx_audit_type_time`: Query by event type and time range
- `idx_audit_guest`: Query by guest and time range

**Privacy**:
- No PII stored (only guest IDs and event types)
- Guest IDs set to NULL when guest deleted
- Used for metrics, not debugging individual issues

---

### scripts/cleanup.ts

**Purpose**: Scheduled job to delete expired sessions, magic links, and old audit events.

**Schedule**: Nightly via cron (configured in `wrangler.cleanup.toml`)

**Operations**:
1. Delete sessions where `expires_at < now` OR `last_seen_at + idle_timeout < now`
2. Delete magic links where `expires_at < now`
3. Delete audit events older than 90 days (configurable)

**Configuration**:
- `wrangler.cleanup.toml`: Separate worker for scheduled jobs
- Shares same D1 database binding as main worker

**Execution**:
- Runs via Cloudflare Workers Scheduled Events
- Invoked by cron trigger (e.g., `0 2 * * *` for 2 AM daily)

**Error Handling**:
- Logs errors but does not fail (retries next scheduled run)
- Uses batch deletes for performance

---

### Migration Strategy

**Current Schema Version**: 6 (defined in `src/lib/eventNormalization.ts`)

**Migration Process**:
1. Create new `.sql` file in `migrations/` directory
2. Name format: `NNNN_description.sql` (e.g., `0002_add_column.sql`)
3. Apply locally: `npm run migrate:local`
4. Apply to production: `npm run migrate`

**Schema Versioning**:
- Event details include `version` field
- `normalizeEventDetails` migrates legacy formats
- Migrations applied on read (lazy migration)
- Prompts admin to save if mutation detected

**Backward Compatibility**:
- Decryption functions handle missing fields gracefully
- Defaults applied for new fields
- No breaking changes to existing data

---

### Encryption Strategy

**Envelope Encryption**:
- Each record encrypted with unique Data Encryption Key (DEK)
- DEK wrapped with Key Encryption Key (KEK) from environment
- AAD (Additional Authenticated Data) binds ciphertext to context

**AAD Format**: `table:recordId:purpose`
- Example: `guests:123:profile`
- Prevents ciphertext reuse across tables/records/purposes

**Key Rotation**:
- To rotate KEK: decrypt all records with old KEK, re-encrypt with new KEK
- DEKs automatically rotated on every write (ephemeral keys)

**Security Properties**:
- AES-GCM-256: Industry-standard AEAD cipher
- 12-byte IVs: Unique per encryption (tested in crypto tests)
- AAD binding: Prevents ciphertext substitution attacks
- HMAC-SHA256: For hashing emails, tokens, session IDs