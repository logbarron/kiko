import type {
  AttendanceRecord,
  CeremonyGuideSections,
  LocalGuideSections,
  TransportationSections
} from '../../types';

export interface EventAttendeeViewModel {
  personId: string;
  name: string;
  role: 'primary' | 'companion' | 'guest';
  attendanceStatus: 'yes' | 'no' | 'pending';
  mealChoice?: string;
  dietaryNote?: string;
}

export interface EventEntryViewModel {
  id: string;
  label: string;
  dateLabel: string;
  timeLabel: string;
  locationName?: string;
  locationGeo?: string;
  locationAddress?: string[];
  mapUrl?: string;
  dressCode?: string;
  photoPolicy?: string;
  accessibility?: string;
  transportation?: string;
  foodNotes?: string;
  childPolicy?: string;
  additionalNotes?: string;
  requiresMealSelection: boolean;
  mealOptions?: string[];
  collectDietaryNotes: boolean;
  attendees: EventAttendeeViewModel[];
}

export interface EventPageViewModel {
  title: string;
  hero: {
    headline: string;
    dateText: string;
    rsvpDeadlineText?: string;
    locationText?: string;
  };
  guest: {
    greetingName: string;
    partySummary: string;
    members: Array<{
      personId: string;
      role: 'primary' | 'companion' | 'guest';
      displayName: string;
      invitedEvents: string[];
      attendance: Record<string, AttendanceRecord>;
      mealSelections?: Record<string, string>;
    }>;
  };
  navigation: {
    showCeremony: boolean;
    showSchedule: boolean;
    showTravel: boolean;
    showRegistry: boolean;
    showRsvp: boolean;
  };
  timeZoneLabel?: string;
  ceremonyGuide?: CeremonyGuideSections;
  localGuide?: LocalGuideSections;
  transportationGuide?: TransportationSections;
  events: EventEntryViewModel[];
  accommodations?: Array<{
    name: string;
    address: string;
    discountCode?: string;
    notes?: string;
  }>;
  registry?: Array<{
    label: string;
    url: string;
    description?: string;
  }>;
  rsvp: {
    deadlineText?: string;
    submittedAtText?: string;
    state: 'open' | 'closed';
    closedMessage?: string;
  };
}
