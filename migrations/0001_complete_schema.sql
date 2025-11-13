-- Complete schema for Wedding Website

-- guests: one row per email (household head)
-- enc_profile contains encrypted JSON: {
--   email,
--   party: [
--     {
--       personId,
--       role,
--       firstName,
--       lastName,
--       invitedEvents,
--       attendance: { [eventId]: { status, updatedAt, source } },
--       mealSelections?,
--       dietaryNotes?
--     }
--   ],
--   phone?, notes?, dietary?, vip?, inviteToken?, inviteSentAt?, inviteClickedAt?, registeredAt?, rsvp?
-- }
CREATE TABLE IF NOT EXISTS guests (
  id                 INTEGER PRIMARY KEY,
  email_hash         TEXT    NOT NULL UNIQUE,  -- HMAC-SHA256 hash of normalized email
  enc_profile        BLOB    NOT NULL,         -- Encrypted JSON profile data
  invite_token_hash  TEXT,                     -- Hash of unique invite tracking token
  invite_sent_at     INTEGER,                  -- When invitation was sent
  invite_clicked_at  INTEGER,                  -- When invite link was clicked
  registered_at      INTEGER,                  -- When guest completed registration
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_guests_email_hash ON guests(email_hash);
CREATE INDEX IF NOT EXISTS idx_guests_invite_token ON guests(invite_token_hash);

-- magic_links: single-use, short TTL authentication tokens
-- All tokens stored as hashes only, never plaintext
CREATE TABLE IF NOT EXISTS magic_links (
  id              INTEGER PRIMARY KEY,
  guest_id        INTEGER NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  token_hash      TEXT    NOT NULL UNIQUE,  -- SHA256/HMAC hash of the magic link token
  issued_at       INTEGER NOT NULL,
  expires_at      INTEGER NOT NULL,
  used_at         INTEGER,                  -- Timestamp when consumed (single-use enforcement)
  issued_ip_hash  TEXT,                     -- Hash of IP for rate limiting
  issued_ua       TEXT                      -- User agent for audit
);
CREATE INDEX IF NOT EXISTS idx_magic_links_guest_id ON magic_links(guest_id);
CREATE INDEX IF NOT EXISTS idx_magic_links_token_hash ON magic_links(token_hash);

-- sessions: HttpOnly cookie-backed sessions with dual expiry
-- Enforces both idle timeout and absolute timeout
CREATE TABLE IF NOT EXISTS sessions (
  id               INTEGER PRIMARY KEY,
  guest_id         INTEGER NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  session_id_hash  TEXT    NOT NULL UNIQUE,  -- Hash of session ID in cookie
  created_at       INTEGER NOT NULL,
  expires_at       INTEGER NOT NULL,          -- Absolute expiry (12 hours)
  last_seen_at     INTEGER NOT NULL           -- For idle timeout (30 min)
);
CREATE INDEX IF NOT EXISTS idx_sessions_guest_id ON sessions(guest_id);
CREATE INDEX IF NOT EXISTS idx_sessions_hash ON sessions(session_id_hash);

-- rsvps: one per guest (household), stores encrypted RSVP data
-- enc_rsvp contains: {
--   partyResponses: {
--     [personId]: {
--       events: { [eventId]: { status, updatedAt, source } },
--       mealSelections?,
--       dietaryNotes?
--     }
--   },
--   dietary?,
--   notes?,
--   submittedAt?
-- }
CREATE TABLE IF NOT EXISTS rsvps (
  guest_id     INTEGER PRIMARY KEY REFERENCES guests(id) ON DELETE CASCADE,
  enc_rsvp     BLOB    NOT NULL,  -- Encrypted JSON RSVP data
  updated_at   INTEGER NOT NULL
);

-- event: singleton row with encrypted event details
-- enc_details contains all event information (venue, schedule, registry, etc.)
CREATE TABLE IF NOT EXISTS event (
  id           INTEGER PRIMARY KEY CHECK (id = 1),
  enc_details  BLOB    NOT NULL,  -- Encrypted JSON event data
  updated_at   INTEGER NOT NULL
);

-- audit_events: PII-free event tracking for metrics
-- No personal data stored, only event types and associations
CREATE TABLE IF NOT EXISTS audit_events (
  id           INTEGER PRIMARY KEY,
  guest_id     INTEGER REFERENCES guests(id) ON DELETE SET NULL,
  type         TEXT    NOT NULL,  -- invite_sent, invite_clicked, invite_opened, email_sent, link_clicked, verify_ok, verify_fail, rsvp_submit
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_type_time ON audit_events(type, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_guest ON audit_events(guest_id, created_at);
