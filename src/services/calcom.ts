import axios, { type AxiosInstance, type AxiosRequestConfig } from "axios";
import { env } from "../config/env.js";
import type {
  CalComEventType,
  CalComBooking,
  CalComSlotsResponse,
  CalComSlot,
  CreateBookingPayload,
  RescheduleBookingPayload,
} from "../types/calcom.js";

/** Cal.com documents a different `cal-api-version` per resource; see https://cal.com/docs/api-reference/v2 */
const CAL_EVENT_TYPES_VERSION = "2024-06-14";
const CAL_SLOTS_VERSION = "2024-09-04";
const CAL_BOOKINGS_VERSION = "2026-02-25";

export function unwrapData<T>(body: unknown): T | undefined {
  if (body && typeof body === "object" && "data" in body) {
    return (body as { data: T }).data;
  }
  return undefined;
}

export function normalizeSlotEntry(item: unknown): CalComSlot {
  if (item && typeof item === "object" && "start" in item) {
    const o = item as { start: string; end?: string };
    return { start: o.start, end: o.end ?? o.start };
  }
  const s = String(item);
  return { start: s, end: s };
}

export function normalizeSlotsBody(body: unknown): Record<string, CalComSlot[]> {
  const map =
    unwrapData<Record<string, unknown>>(body) ??
    (body as Record<string, unknown>);
  if (!map || typeof map !== "object") {
    return {};
  }
  const out: Record<string, CalComSlot[]> = {};
  for (const [date, slots] of Object.entries(map)) {
    if (!Array.isArray(slots)) continue;
    out[date] = slots.map(normalizeSlotEntry);
  }
  return out;
}

export function normalizeBookingV2(raw: unknown): CalComBooking {
  const b = raw as CalComBooking & { start?: string; end?: string };
  return {
    ...b,
    startTime: b.startTime ?? b.start ?? "",
    endTime: b.endTime ?? b.end ?? "",
  };
}

class CalComService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: env.CALCOM_BASE_URL,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.CALCOM_API_KEY}`,
      },
    });
  }

  private eventTypesConfig(extra?: AxiosRequestConfig): AxiosRequestConfig {
    return {
      ...extra,
      headers: {
        ...extra?.headers,
        "cal-api-version": CAL_EVENT_TYPES_VERSION,
      },
    };
  }

  private bookingsConfig(extra?: AxiosRequestConfig): AxiosRequestConfig {
    return {
      ...extra,
      headers: {
        ...extra?.headers,
        "cal-api-version": CAL_BOOKINGS_VERSION,
      },
    };
  }

  // ─── Event Types ──────────────────────────────────────────

  async getEventTypes(): Promise<CalComEventType[]> {
    const { data } = await this.client.get(
      "/v2/event-types",
      this.eventTypesConfig(),
    );
    const list = unwrapData<CalComEventType[]>(data);
    return (
      list ?? (data as { event_types?: CalComEventType[] }).event_types ?? []
    );
  }

  async getEventTypeById(id: number): Promise<CalComEventType> {
    const { data } = await this.client.get(
      `/v2/event-types/${id}`,
      this.eventTypesConfig(),
    );
    const inner = unwrapData<CalComEventType>(data);
    return (
      inner ??
      (data as { event_type?: CalComEventType }).event_type ??
      (data as CalComEventType)
    );
  }

  async createEventType(
    payload: Record<string, unknown>,
  ): Promise<CalComEventType> {
    const { data } = await this.client.post(
      "/v2/event-types",
      payload,
      this.eventTypesConfig(),
    );
    const inner = unwrapData<CalComEventType>(data);
    return (
      inner ??
      (data as { event_type?: CalComEventType }).event_type ??
      (data as CalComEventType)
    );
  }

  async updateEventType(
    id: number,
    payload: Record<string, unknown>,
  ): Promise<CalComEventType> {
    const { data } = await this.client.patch(
      `/v2/event-types/${id}`,
      payload,
      this.eventTypesConfig(),
    );
    const inner = unwrapData<CalComEventType>(data);
    return (
      inner ??
      (data as { event_type?: CalComEventType }).event_type ??
      (data as CalComEventType)
    );
  }

  async deleteEventType(id: number): Promise<void> {
    await this.client.delete(`/v2/event-types/${id}`, this.eventTypesConfig());
  }

  // ─── Bookings ────────────────────────────────────────────

  async getBookings(params?: Record<string, string>): Promise<CalComBooking[]> {
    const { data } = await this.client.get(
      "/v2/bookings",
      this.bookingsConfig({ params }),
    );
    const inner = unwrapData<unknown[]>(data);
    const list =
      inner ??
      (data as { bookings?: unknown[] }).bookings ??
      (Array.isArray(data) ? data : []);
    return list.map(normalizeBookingV2);
  }

  async getBooking(uid: string): Promise<CalComBooking | CalComBooking[]> {
    const { data } = await this.client.get(
      `/v2/bookings/${encodeURIComponent(uid)}`,
      this.bookingsConfig(),
    );
    const inner = unwrapData<CalComBooking | CalComBooking[]>(data);
    const raw = inner ?? (data as { booking?: CalComBooking }).booking ?? data;
    if (Array.isArray(raw)) {
      return raw.map(normalizeBookingV2);
    }
    return normalizeBookingV2(raw);
  }

  async createBooking(payload: CreateBookingPayload): Promise<CalComBooking> {
    // Add Zoom as the default location for all sessions
    const bookingPayload = {
      ...payload,
      location: {
        type: "integration",
        integration: "zoom",
      },
    };

    const { data } = await this.client.post(
      "/v2/bookings",
      bookingPayload,
      this.bookingsConfig(),
    );
    const inner = unwrapData<CalComBooking>(data);
    const raw = inner ?? (data as { booking?: CalComBooking }).booking ?? data;
    return normalizeBookingV2(raw);
  }

  async rescheduleBooking(
    uid: string,
    payload: RescheduleBookingPayload,
  ): Promise<CalComBooking> {
    const { data } = await this.client.post(
      `/v2/bookings/${encodeURIComponent(uid)}/reschedule`,
      payload,
      this.bookingsConfig(),
    );
    const inner = unwrapData<CalComBooking>(data);
    const raw = inner ?? (data as { booking?: CalComBooking }).booking ?? data;
    return normalizeBookingV2(raw);
  }

  async cancelBooking(uid: string, reason?: string): Promise<void> {
    await this.client.post(
      `/v2/bookings/${encodeURIComponent(uid)}/cancel`,
      reason ? { cancellationReason: reason } : {},
      this.bookingsConfig(),
    );
  }

  // ─── Availability / Slots (API v2) ───────────────────────

  async getAvailableSlots(
    eventTypeId: number,
    startTime: string,
    endTime: string,
    timeZone?: string,
  ): Promise<CalComSlotsResponse> {
    const { data } = await this.client.get("/v2/slots", {
      params: {
        eventTypeId,
        start: startTime,
        end: endTime,
        timeZone: timeZone ?? "Europe/Bucharest",
        format: "range",
      },
      headers: {
        "cal-api-version": CAL_SLOTS_VERSION,
      },
    });

    const slots = normalizeSlotsBody(data);
    return { slots };
  }
}

export const calcomService = new CalComService();
