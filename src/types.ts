export interface Env {
  DB: D1Database;
  RATE_LIMIT_KV?: KVNamespace;
  KEK_B64: string;
  SESSION_IDLE_MIN: string;
  SESSION_ABSOLUTE_HOURS: string;
  MAGIC_LINK_TTL_MIN: string;
  TURNSTILE_SITE_KEY: string;
  TURNSTILE_SECRET_KEY: string;
  GMAIL_CLIENT_ID: string;
  GMAIL_CLIENT_SECRET: string;
  GMAIL_REFRESH_TOKEN: string;
  GMAIL_FROM: string;
  APP_BASE_URL: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_PUBLISHABLE_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  ACCESS_AUD?: string;
  ACCESS_JWT_ISS?: string;
  ACCESS_CERTS_CACHE_MIN?: string;
  RSVP_SUBMISSIONS_PER_10MIN?: string;
  INVITES_PER_EMAIL_PER_HOUR: string;
  INVITES_PER_IP_PER_10MIN: string;
  VERIFY_PER_IP_PER_10MIN: string;
  VERIFY_PER_TOKEN_PER_10MIN?: string;
  STRIPE_CREATE_PER_HOUR?: string;
  STRIPE_STATUS_PER_HOUR?: string;
  // Development mode flag (string 'true') to relax cookies for localhost
  DEV_MODE?: string;
  ENABLE_DEBUG_LOGS?: string;
}

export interface Guest {
  id: number;
  email_hash: string;
  enc_profile: string;
  created_at: number;
  updated_at: number;
}

export type EventAttendanceStatus = 'yes' | 'no' | 'pending';

export type AttendanceSource = 'guest' | 'admin' | 'system';

export interface AttendanceRecord {
  status: EventAttendanceStatus;
  updatedAt: number | null;
  source: AttendanceSource;
}

export type PartyRole = 'primary' | 'companion' | 'guest';

export type PartyAttendanceMap = Record<string, AttendanceRecord>;

export interface PartyMealSelectionMap {
  [eventId: string]: string | undefined;
}

export interface PartyMember {
  personId: string;
  role: PartyRole;
  firstName: string;
  lastName: string;
  invitedEvents: string[];
  attendance: PartyAttendanceMap;
  mealSelections?: PartyMealSelectionMap;
  dietaryNotes?: Record<string, string>;
  pendingMealSelections?: string[];
}

export const MAX_PARTY_SIZE = 2;

export interface GuestProfile {
  email: string;
  party: PartyMember[];
  phone?: string;
  notes?: string;
  vip?: boolean;
  inviteToken?: string;
  inviteSentAt?: number;
  inviteClickedAt?: number;
  registeredAt?: number;
  magic_link_sent_at?: number;
  rsvp?: RSVP;
}

export interface MagicLink {
  id: number;
  guest_id: number;
  token_hash: string;
  issued_at: number;
  expires_at: number;
  used_at?: number;
  issued_ip_hash?: string;
  issued_ua?: string;
}

export interface Session {
  id: number;
  guest_id: number;
  session_id_hash: string;
  created_at: number;
  expires_at: number;
  last_seen_at: number;
}

export interface PartyEventResponse {
  events: PartyAttendanceMap;
  mealSelections?: PartyMealSelectionMap;
  dietaryNotes?: Record<string, string>;
  pendingMealSelections?: string[];
}

export interface RSVP {
  partyResponses: Record<string, PartyEventResponse>;
  submittedAt?: string;
}

export interface EventDetails {
  // Schema metadata
  schemaVersion?: number;
  siteTitle: string;
  heroHeadline?: string;
  magicLinkEmailSubject?: string;
  inviteEmailSubject?: string;
  dateISO: string;
  timeZone: string;
  rsvpDeadlineISO?: string;
  rsvpStatus?: {
    mode: 'open' | 'closed';
    message?: string;
  };

  // Event-centric schedule with complete venue and logistics info
  events?: Array<{
    id: string;
    label: string;
    startISO?: string;
    endISO?: string;
    capacity?: number;

    // Complete venue information per event
    venue?: {
      name?: string;
      address?: string[];
      geo?: string;
      mapUrl?: string;
    };

    // Event-specific logistics and policies
    dressCode?: string;
    photoPolicy?: string;
    accessibility?: string;
    transportation?: string;
    foodNotes?: string;
    requiresMealSelection?: boolean;
    collectDietaryNotes?: boolean;
    mealOptions?: string[];
    childPolicy?: string;
    additionalNotes?: string;
  }>;

  // Accommodations (hotels, lodging)
  accommodations?: Array<{
    name: string;
    address: string;
    discountCode?: string;
    notes?: string;
  }>;

  // Gift registry
  registry?: Array<{
    label: string;
    url: string;
    description?: string;
  }>;

  // Local guide and recommendations (renamed from intro)
  localGuide?: LocalGuideSections;
  transportationGuide?: TransportationSections;
  ceremonyGuide?: CeremonyGuideSections;


  // Server-managed
  updatedAt?: number;
}
export interface LocalGuideSections {
  eat?: string;
  drink?: string;
  see?: string;
  do?: string;
}

export interface TransportationSections {
  planes?: string;
  trains?: string;
  automobiles?: string;
}

export interface CeremonyGuideSections {
  summary?: string;
  quickGuide?: string;
  stepByStep?: string;
  rolesObjects?: string;
  history?: string;
  etiquetteFaq?: string;
}

export interface AuditEvent {
  id: number;
  guest_id?: number;
  type:
    | 'email_sent'
    | 'link_clicked'
    | 'verify_ok'
    | 'verify_fail'
    | 'rsvp_submit'
    | 'invite_sent'
    | 'invite_seeded'
    | 'invite_clicked'
    | 'event_visibility_updated'
    | 'event_attendance_updated'
    | 'guest_deleted'
    | 'event_updated';
  created_at: number;
}

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  dek_wrapped: string;
  aad_hint: string;
}
