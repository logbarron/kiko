import type { Dispatch, SetStateAction } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardFooter } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { DatePicker } from '../ui/date-picker';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../ui/accordion';
import { Switch } from '../ui/switch';
import {
  Trash2,
  Plus,
  MapPin,
  CalendarDays,
  Info,
  Settings,
  Gift,
  Clock,
  FileText,
  Hotel,
  Users,
  Camera,
  Car,
  Utensils,
  MessageSquare,
  Heart
} from 'lucide-react';
import type {
  CeremonyGuideSections,
  EventDetails,
  LocalGuideSections,
  TransportationSections
} from '@/types';

const timeZoneOptions = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Phoenix', label: 'Arizona Time' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time' },
  { value: 'UTC', label: 'UTC' }
];

interface EventTabContentProps {
  eventDetails: EventDetails;
  eventForm: EventDetails;
  setEventForm: Dispatch<SetStateAction<EventDetails>>;
  saveEventDetails: () => void;
  isLoading: boolean;
}

const parseISODate = (iso?: string): Date | undefined => {
  if (!iso) {
    return undefined;
  }
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const getTimeValueFromISO = (iso?: string): string => {
  const date = parseISODate(iso);
  if (!date) {
    return '';
  }
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
};

const combineDateAndTime = (date: Date | undefined, time: string | undefined): string | undefined => {
  if (!date) {
    return undefined;
  }

  const [hourStr, minuteStr] = (time ?? '').split(':');
  const hours = Number(hourStr);
  const minutes = Number(minuteStr);

  const next = new Date(date);
  if (Number.isFinite(hours) && Number.isFinite(minutes)) {
    next.setHours(hours, minutes, 0, 0);
  } else {
    next.setHours(0, 0, 0, 0);
  }

  return Number.isNaN(next.getTime()) ? undefined : next.toISOString();
};


export function EventTabContent({ eventForm, setEventForm, saveEventDetails, isLoading }: EventTabContentProps) {
  return (
    <Card className="h-full shadow-none">
      <CardContent className="p-6">
        <div className="space-y-6">
          <Accordion type="multiple" defaultValue={[]} className="space-y-4">

            {/* Event Globals Section */}
            <AccordionItem value="event-globals" className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4" />
                  <span className="font-medium">Landing Page</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-6 pt-4">
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="siteTitle">Site Title</Label>
                    <Input
                      id="siteTitle"
                      value={eventForm.siteTitle}
                      onChange={(e) => setEventForm({ ...eventForm, siteTitle: e.target.value })}
                      placeholder="Alex & Jamie's Wedding"
                    />
                    <p className="text-xs text-muted-foreground">Appears in the browser title and shared links</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="heroHeadline">Hero Headline</Label>
                    <Input
                      id="heroHeadline"
                      value={eventForm.heroHeadline || ''}
                      onChange={(e) => setEventForm({ ...eventForm, heroHeadline: e.target.value })}
                      placeholder="Celebrate with Alex & Jamie"
                    />
                    <p className="text-xs text-muted-foreground">Displayed prominently in the center of the landing page</p>
                  </div>

                  <div className="space-y-2">
                    <Label>Event Date</Label>
                    <DatePicker
                      date={eventForm.dateISO ? new Date(eventForm.dateISO) : undefined}
                      onDateChange={(date) => setEventForm({ ...eventForm, dateISO: date?.toISOString() || '' })}
                      placeholder="Select wedding date"
                    />
                    <p className="text-xs text-muted-foreground">Main event date shown prominently</p>
                  </div>

                  <div className="space-y-2">
                    <Label>RSVP Deadline</Label>
                    <DatePicker
                      date={eventForm.rsvpDeadlineISO ? new Date(eventForm.rsvpDeadlineISO) : undefined}
                      onDateChange={(date) => setEventForm({ ...eventForm, rsvpDeadlineISO: date?.toISOString() })}
                      placeholder="Select RSVP deadline"
                    />
                    <p className="text-xs text-muted-foreground">Guests see this deadline on the RSVP form</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="rsvpToggle">RSVP</Label>
                    <div className="flex items-center gap-2">
                      <Button
                        id="rsvpToggle"
                        type="button"
                        variant={eventForm.rsvpStatus?.mode !== 'closed' ? 'default' : 'outline'}
                        onClick={() => {
                          setEventForm({
                            ...eventForm,
                            rsvpStatus: {
                              mode: 'open',
                              ...(eventForm.rsvpStatus?.message
                                ? { message: eventForm.rsvpStatus.message }
                                : {})
                            }
                          });
                        }}
                      >
                        RSVP ON
                      </Button>
                      <Button
                        type="button"
                        variant={eventForm.rsvpStatus?.mode === 'closed' ? 'default' : 'outline'}
                        onClick={() => {
                          setEventForm({
                            ...eventForm,
                            rsvpStatus: {
                              mode: 'closed',
                              message: eventForm.rsvpStatus?.message || 'RSVPs are closed'
                            }
                          });
                        }}
                      >
                        RSVP OFF
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="rsvpClosedMessage">RSVP Closed</Label>
                    <Input
                      id="rsvpClosedMessage"
                      value={eventForm.rsvpStatus?.message || ''}
                      onChange={(e) => {
                        const message = e.target.value;
                        setEventForm({
                          ...eventForm,
                          rsvpStatus: { mode: 'closed', message }
                        });
                      }}
                      placeholder="RSVPs are closed"
                      disabled={eventForm.rsvpStatus?.mode !== 'closed'}
                    />
                    <p className="text-xs text-muted-foreground">Displayed to guests when RSVPs are closed.</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="timeZone">Time Zone</Label>
                    <Select
                      value={eventForm.timeZone || undefined}
                      onValueChange={(value) => setEventForm({ ...eventForm, timeZone: value })}
                    >
                      <SelectTrigger id="timeZone" className="w-full">
                        <SelectValue placeholder="Select time zone..." />
                      </SelectTrigger>
                      <SelectContent>
                        {timeZoneOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Used for displaying all event times</p>
                  </div>
                </div>

              </AccordionContent>
            </AccordionItem>

            {/* Ceremony Guide Section */}
            <AccordionItem value="ceremony-guide" className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <Heart className="h-4 w-4" />
                  <span className="font-medium">Ceremony</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-6 pt-4">
                <div className="grid gap-4 md:grid-cols-2">
                  {[
                    { key: 'summary', label: 'Summary', placeholder: 'High-level overview of the ceremony flow' },
                    { key: 'quickGuide', label: 'Quick Guide', placeholder: 'Key times, attire, or quick tips' },
                    { key: 'stepByStep', label: 'Full Step-by-Step', placeholder: 'Detailed order of events for the ceremony' },
                    { key: 'rolesObjects', label: 'Roles & Objects', placeholder: 'Explain roles, rituals, or symbolic items' },
                    { key: 'history', label: 'History', placeholder: 'Share background or family significance' },
                    { key: 'etiquetteFaq', label: 'Etiquette & FAQ', placeholder: 'Helpful etiquette and frequently asked questions' }
                  ].map(({ key, label, placeholder }) => (
                    <div key={key} className="space-y-2">
                      <Label htmlFor={`ceremonyGuide-${key}`}>{label}</Label>
                      <Textarea
                        id={`ceremonyGuide-${key}`}
                        value={eventForm.ceremonyGuide?.[key as keyof CeremonyGuideSections] || ''}
                        onChange={(event) => setEventForm((prev) => ({
                          ...prev,
                          ceremonyGuide: {
                            ...(prev.ceremonyGuide ?? {}),
                            [key]: event.target.value.trim() ? event.target.value : undefined
                          }
                        }))}
                        placeholder={placeholder}
                        className="min-h-[140px] resize-none"
                      />
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Event Schedule Section */}
            <AccordionItem value="events" className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  <span className="font-medium">Events</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pt-4">
                <p className="text-sm text-muted-foreground">Each event contains all information guests need: venue, timing, dress code, policies, logistics</p>

                {(eventForm.events || []).map((event, idx) => (
                  <div key={event.id ?? idx} className="space-y-6 p-6 border rounded-lg bg-muted/20">
                    {(() => {
                      const timezone = eventForm.timeZone || 'UTC';
                      const eventStartDate = parseISODate(event.startISO) ?? parseISODate(eventForm.dateISO);
                      const timeValue = getTimeValueFromISO(event.startISO);

                      return (
                        <>
                          {/* Event Header */}
                          <div className="grid gap-4 md:grid-cols-4">
                            <div className="space-y-2">
                              <Label>Event Name</Label>
                              <Input
                                value={event.label}
                                onChange={(e) => {
                                  const next = [...(eventForm.events || [])];
                                  next[idx] = { ...event, label: e.target.value };
                                  setEventForm({ ...eventForm, events: next });
                                }}
                                placeholder="Welcome Cocktails"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Event Date</Label>
                              <DatePicker
                                date={eventStartDate}
                                onDateChange={(selectedDate) => {
                                  const next = [...(eventForm.events || [])];
                                  const nextEvent = { ...event };
                                  const iso = selectedDate
                                    ? combineDateAndTime(selectedDate, timeValue || '17:00')
                                    : undefined;

                                  nextEvent.startISO = iso;

                                  next[idx] = nextEvent;
                                  setEventForm({ ...eventForm, events: next });
                                }}
                                placeholder="Select event date"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Start Time</Label>
                              <Input
                                type="time"
                                value={timeValue}
                                onChange={(e) => {
                                  const next = [...(eventForm.events || [])];
                                  const nextEvent = { ...event };
                                  const newValue = e.target.value;
                                  const baseDate = parseISODate(nextEvent.startISO) ?? eventStartDate;
                                  const iso = newValue && baseDate
                                    ? combineDateAndTime(baseDate, newValue)
                                    : baseDate
                                      ? combineDateAndTime(baseDate, undefined)
                                      : undefined;

                                  nextEvent.startISO = iso;

                                  next[idx] = nextEvent;
                                  setEventForm({ ...eventForm, events: next });
                                }}
                                step="900"
                                placeholder="18:00"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Invited</Label>
                              <Input
                                type="number"
                                min="0"
                                value={typeof event.capacity === 'number' && !Number.isNaN(event.capacity) ? String(event.capacity) : ''}
                                onChange={(e) => {
                                  const next = [...(eventForm.events || [])];
                                  const nextEvent = { ...event };
                                  const rawValue = e.target.value;
                                  const parsed = rawValue === '' ? undefined : Math.max(0, Number.parseInt(rawValue, 10) || 0);
                                  nextEvent.capacity = parsed;
                                  next[idx] = nextEvent;
                                  setEventForm({ ...eventForm, events: next });
                                }}
                                placeholder="150"
                              />
                            </div>
                          </div>
                        </>
                      );
                    })()}

                    {/* Venue Information */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 mb-2">
                        <MapPin className="h-4 w-4" />
                        <span className="font-medium text-sm">Venue Information</span>
                      </div>
                      <div className="grid gap-4 md:grid-cols-3">
                        <div className="space-y-2">
                          <Label>Venue Name</Label>
                          <Input
                            value={event.venue?.name || ''}
                            onChange={(e) => {
                              const next = [...(eventForm.events || [])];
                              next[idx] = {
                                ...event,
                                venue: {
                                  ...(event.venue || {}),
                                  name: e.target.value
                                }
                              };
                              setEventForm({ ...eventForm, events: next });
                            }}
                            placeholder="The Garden Pavilion"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Geo</Label>
                          <Input
                            value={event.venue?.geo || ''}
                            onChange={(e) => {
                              const next = [...(eventForm.events || [])];
                              next[idx] = {
                                ...event,
                                venue: {
                                  ...(event.venue || {}),
                                  geo: e.target.value.trim() ? e.target.value : undefined
                                }
                              };
                              setEventForm({ ...eventForm, events: next });
                            }}
                            placeholder="Palm Beach, FL"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Map URL</Label>
                          <Input
                            value={event.venue?.mapUrl || ''}
                            onChange={(e) => {
                              const next = [...(eventForm.events || [])];
                              next[idx] = {
                                ...event,
                                venue: {
                                  ...(event.venue || {}),
                                  mapUrl: e.target.value
                                }
                              };
                              setEventForm({ ...eventForm, events: next });
                            }}
                            placeholder="https://maps.google.com/..."
                          />
                        </div>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Address</Label>
                          <Textarea
                            value={(event.venue?.address || []).join('\n')}
                            onChange={(e) => {
                              const lines = e.target.value.split('\n').map(line => line.replace(/\r/g, ''));
                              const normalized = lines.filter(line => line.trim().length > 0);
                              const next = [...(eventForm.events || [])];
                              next[idx] = {
                                ...event,
                                venue: {
                                  ...(event.venue || {}),
                                  address: normalized
                                }
                              };
                              setEventForm({ ...eventForm, events: next });
                            }}
                            placeholder="123 Event Plaza&#10;Jupiter, FL 33458"
                            className="min-h-[60px] resize-none"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Child Policy Notes</Label>
                          <Textarea
                            value={event.childPolicy || ''}
                            onChange={(e) => {
                              const next = [...(eventForm.events || [])];
                              next[idx] = { ...event, childPolicy: e.target.value };
                              setEventForm({ ...eventForm, events: next });
                            }}
                            placeholder="Adults-only celebration"
                            className="min-h-[60px] resize-none"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Event Details */}
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 mb-1">
                          <Users className="h-3 w-3" />
                          <Label className="text-sm">Dress Code</Label>
                        </div>
                        <Input
                          value={event.dressCode || ''}
                          onChange={(e) => {
                            const next = [...(eventForm.events || [])];
                            next[idx] = { ...event, dressCode: e.target.value };
                            setEventForm({ ...eventForm, events: next });
                          }}
                          placeholder="Cocktail attire"
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 mb-1">
                          <Camera className="h-3 w-3" />
                          <Label className="text-sm">Photo Policy</Label>
                        </div>
                        <Input
                          value={event.photoPolicy || ''}
                          onChange={(e) => {
                            const next = [...(eventForm.events || [])];
                            next[idx] = { ...event, photoPolicy: e.target.value };
                            setEventForm({ ...eventForm, events: next });
                          }}
                          placeholder="Photos encouraged"
                        />
                      </div>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 mb-1">
                            <Users className="h-3 w-3" />
                            <Label className="text-sm">Accessibility</Label>
                          </div>
                          <Input
                            value={event.accessibility || ''}
                            onChange={(e) => {
                              const next = [...(eventForm.events || [])];
                              next[idx] = { ...event, accessibility: e.target.value };
                              setEventForm({ ...eventForm, events: next });
                            }}
                            placeholder="Wheelchair accessible"
                          />
                        </div>
                        <div className="space-y-3">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 mb-1">
                              <Utensils className="h-3 w-3" />
                              <Label className="text-sm">Food Notes</Label>
                            </div>
                            <Input
                              value={event.foodNotes || ''}
                              onChange={(e) => {
                                const next = [...(eventForm.events || [])];
                                next[idx] = { ...event, foodNotes: e.target.value };
                                setEventForm({ ...eventForm, events: next });
                              }}
                              placeholder="Cocktails and heavy appetizers"
                            />
                          </div>
                          <div className="flex items-center space-x-2">
                            <Switch
                              id={`meal-required-${idx}`}
                              checked={event.requiresMealSelection || false}
                              onCheckedChange={(checked) => {
                                const next = [...(eventForm.events || [])];
                                const mealOptions = checked
                                  ? (event.mealOptions && event.mealOptions.length > 0
                                    ? [...event.mealOptions]
                                    : [''])
                                  : event.mealOptions;
                                next[idx] = { ...event, requiresMealSelection: checked, mealOptions };
                                setEventForm({ ...eventForm, events: next });
                              }}
                            />
                            <Label htmlFor={`meal-required-${idx}`} className="cursor-pointer text-sm">
                              Require meal selection for this event
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Switch
                              id={`dietary-collect-${idx}`}
                              checked={event.collectDietaryNotes || false}
                              onCheckedChange={(checked) => {
                                const next = [...(eventForm.events || [])];
                                next[idx] = { ...event, collectDietaryNotes: checked };
                                setEventForm({ ...eventForm, events: next });
                              }}
                            />
                            <Label htmlFor={`dietary-collect-${idx}`} className="cursor-pointer text-sm">
                              Allow allergies or restrictions for this event
                            </Label>
                          </div>
                          {event.requiresMealSelection ? (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <Label className="text-sm">Meal Options</Label>
                                <span className="text-xs text-muted-foreground">Shown when guests RSVP</span>
                              </div>
                              <div className="space-y-2">
                                {(event.mealOptions || []).map((option, optionIdx) => (
                                  <div key={optionIdx} className="flex gap-2">
                                    <Input
                                      value={option}
                                      onChange={(e) => {
                                        const next = [...(eventForm.events || [])];
                                        const mealOptions = [...(event.mealOptions || [])];
                                        mealOptions[optionIdx] = e.target.value;
                                        next[idx] = { ...event, mealOptions };
                                        setEventForm({ ...eventForm, events: next });
                                      }}
                                      placeholder="Grilled Salmon"
                                    />
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => {
                                        const next = [...(eventForm.events || [])];
                                        const mealOptions = [...(event.mealOptions || [])];
                                        mealOptions.splice(optionIdx, 1);
                                        next[idx] = { ...event, mealOptions };
                                        setEventForm({ ...eventForm, events: next });
                                      }}
                                      aria-label="Remove meal option"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                ))}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    const next = [...(eventForm.events || [])];
                                    const mealOptions = [...(event.mealOptions || []), ''];
                                    next[idx] = { ...event, mealOptions };
                                    setEventForm({ ...eventForm, events: next });
                                  }}
                                >
                                  <Plus className="w-4 h-4 mr-2" />
                                  Add Meal Option
                                </Button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 mb-1">
                          <Car className="h-3 w-3" />
                          <Label className="text-sm">Transportation</Label>
                        </div>
                        <Textarea
                          value={event.transportation || ''}
                          onChange={(e) => {
                            const next = [...(eventForm.events || [])];
                            next[idx] = { ...event, transportation: e.target.value };
                            setEventForm({ ...eventForm, events: next });
                          }}
                          placeholder="Valet available, Uber recommended"
                          className="min-h-[120px] resize-none"
                        />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <div className="flex items-center gap-2 mb-1">
                          <MessageSquare className="h-3 w-3" />
                          <Label className="text-sm">Additional Notes</Label>
                        </div>
                        <Textarea
                          value={event.additionalNotes || ''}
                          onChange={(e) => {
                            const next = [...(eventForm.events || [])];
                            next[idx] = { ...event, additionalNotes: e.target.value };
                            setEventForm({ ...eventForm, events: next });
                          }}
                          placeholder="Please arrive 15 minutes early. Light rain or shine event."
                          className="min-h-[80px] resize-none"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end pt-4 border-t">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const next = [...(eventForm.events || [])];
                          next.splice(idx, 1);
                          setEventForm({ ...eventForm, events: next });
                        }}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Remove Event
                      </Button>
                    </div>
                  </div>
                ))}

                <Button
                  variant="outline"
                  onClick={() => {
                    const next = [
                      ...(eventForm.events || []),
                      {
                        id: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
                          ? crypto.randomUUID()
                          : `event-${Date.now()}`,
                        label: '',
                        capacity: undefined,
                        venue: { name: '', geo: '', address: [] },
                        requiresMealSelection: false,
                        collectDietaryNotes: false
                      }
                    ];
                    setEventForm({ ...eventForm, events: next });
                  }}
                  className="w-full"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add New Event
                </Button>
              </AccordionContent>
            </AccordionItem>

            {/* Accommodations Section */}
            <AccordionItem value="accommodations" className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <Hotel className="h-4 w-4" />
                  <span className="font-medium">Accommodations</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pt-4">
                <p className="text-sm text-muted-foreground">Add hotel recommendations with discount codes and details</p>

                {(eventForm.accommodations || []).map((accommodation, idx) => (
                  <div key={idx} className="space-y-4 p-4 border rounded-lg">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Hotel Name</Label>
                        <Input
                          value={accommodation.name}
                          onChange={(e) => {
                            const next = [...(eventForm.accommodations || [])];
                            next[idx] = { ...accommodation, name: e.target.value };
                            setEventForm({ ...eventForm, accommodations: next });
                          }}
                          placeholder="Hampton Inn & Suites"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Discount Code</Label>
                        <Input
                          value={accommodation.discountCode || ''}
                          onChange={(e) => {
                            const next = [...(eventForm.accommodations || [])];
                            next[idx] = { ...accommodation, discountCode: e.target.value };
                            setEventForm({ ...eventForm, accommodations: next });
                          }}
                          placeholder="WEDDING2024"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Address</Label>
                      <Input
                        value={accommodation.address}
                        onChange={(e) => {
                          const next = [...(eventForm.accommodations || [])];
                          next[idx] = { ...accommodation, address: e.target.value };
                          setEventForm({ ...eventForm, accommodations: next });
                        }}
                        placeholder="123 Hotel Blvd, City, State 12345"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Notes</Label>
                      <Textarea
                        value={accommodation.notes || ''}
                        onChange={(e) => {
                          const next = [...(eventForm.accommodations || [])];
                          next[idx] = { ...accommodation, notes: e.target.value };
                          setEventForm({ ...eventForm, accommodations: next });
                        }}
                        placeholder="Shuttle to venue included. Pool and fitness center available."
                        className="min-h-[80px] resize-none"
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const next = [...(eventForm.accommodations || [])];
                          next.splice(idx, 1);
                          setEventForm({ ...eventForm, accommodations: next });
                        }}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Remove Hotel
                      </Button>
                    </div>
                  </div>
                ))}

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    const next = [
                      ...(eventForm.accommodations || []),
                      { name: '', address: '', discountCode: '', notes: '' }
                    ];
                    setEventForm({ ...eventForm, accommodations: next });
                  }}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Hotel
                </Button>
              </AccordionContent>
            </AccordionItem>

            {/* Registry Section */}
            <AccordionItem value="registry" className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <Gift className="h-4 w-4" />
                  <span className="font-medium">Gift Registry</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pt-4">
                <p className="text-sm text-muted-foreground">Add links to your gift registries</p>

                {(eventForm.registry || []).map((item, idx) => (
                  <div key={idx} className="grid gap-4 md:grid-cols-3 p-4 border rounded-lg">
                    <div className="space-y-2">
                      <Label>Registry Name</Label>
                      <Input
                        value={item.label}
                        onChange={(e) => {
                          const next = [...(eventForm.registry || [])];
                          next[idx] = { ...item, label: e.target.value };
                          setEventForm({ ...eventForm, registry: next });
                        }}
                        placeholder="Zola"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>URL</Label>
                      <Input
                        value={item.url}
                        onChange={(e) => {
                          const next = [...(eventForm.registry || [])];
                          next[idx] = { ...item, url: e.target.value };
                          setEventForm({ ...eventForm, registry: next });
                        }}
                        placeholder="https://..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Description</Label>
                      <Input
                        value={item.description || ''}
                        onChange={(e) => {
                          const next = [...(eventForm.registry || [])];
                          next[idx] = { ...item, description: e.target.value };
                          setEventForm({ ...eventForm, registry: next });
                        }}
                        placeholder="Optional note"
                      />
                    </div>
                    <div className="md:col-span-3 flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const next = [...(eventForm.registry || [])];
                          next.splice(idx, 1);
                          setEventForm({ ...eventForm, registry: next });
                        }}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}

                <Button
                  variant="outline"
                  onClick={() => setEventForm({
                    ...eventForm,
                    registry: [...(eventForm.registry || []), { label: '', url: '' }]
                  })}
                  className="w-full"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Registry Link
                </Button>
              </AccordionContent>
            </AccordionItem>

            {/* Transportation Section */}
            <AccordionItem value="transportation" className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <Car className="h-4 w-4" />
                  <span className="font-medium">Transportation</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-6 pt-4">
                <div className="grid gap-4 md:grid-cols-2">
                  {([
                    {
                      key: 'planes',
                      label: 'Planes',
                      placeholder: 'Share airport arrival tips and airline guidance.'
                    },
                    {
                      key: 'trains',
                      label: 'Trains',
                      placeholder: 'Highlight rail stations or routes guests should consider.'
                    },
                    {
                      key: 'automobiles',
                      label: 'Automobiles',
                      placeholder: 'Offer driving, rideshare, and parking advice.'
                    }
                  ] satisfies Array<{ key: keyof TransportationSections; label: string; placeholder: string }>)
                    .map(({ key, label, placeholder }) => (
                      <div key={key} className="space-y-2">
                        <Label htmlFor={`transportation-${key}`}>{label}</Label>
                        <Textarea
                          id={`transportation-${key}`}
                          value={eventForm.transportationGuide?.[key] || ''}
                          onChange={(event) => setEventForm((prev) => ({
                            ...prev,
                            transportationGuide: {
                              ...(prev.transportationGuide ?? {}),
                              [key]: event.target.value.trim() ? event.target.value : undefined
                            }
                          }))}
                          placeholder={placeholder}
                          className="min-h-[140px] resize-none"
                        />
                      </div>
                    ))}
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Local Guide Section */}
            <AccordionItem value="local-guide" className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  <span className="font-medium">Local Guide</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-6 pt-4">
                <div className="grid gap-4 md:grid-cols-2">
                  {[
                    { key: 'eat', label: 'Eat', placeholder: 'Dinner at Beacon Street Bistro' },
                    { key: 'drink', label: 'Drink', placeholder: 'Cocktails at The Gibson' },
                    { key: 'see', label: 'See', placeholder: 'Tour the Jupiter Lighthouse' },
                    { key: 'do', label: 'Do', placeholder: 'Morning golf at Bears Club' }
                  ].map(({ key, label, placeholder }) => (
                    <div key={key} className="space-y-2">
                      <Label htmlFor={`localGuide-${key}`}>{label}</Label>
                      <Textarea
                        id={`localGuide-${key}`}
                        value={eventForm.localGuide?.[key as keyof LocalGuideSections] || ''}
                        onChange={(event) => setEventForm((prev) => ({
                          ...prev,
                          localGuide: {
                            ...(prev.localGuide ?? {}),
                            [key]: event.target.value.trim() ? event.target.value : undefined
                          }
                        }))}
                        placeholder={placeholder}
                        className="min-h-[140px] resize-none"
                      />
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </CardContent>
      <CardFooter className="flex justify-end">
        <Button
          onClick={saveEventDetails}
          disabled={isLoading}
        >
          {isLoading ? 'Saving...' : 'Save Changes'}
        </Button>
      </CardFooter>
    </Card>
  );
}
