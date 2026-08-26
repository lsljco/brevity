import crypto from "node:crypto";
import householdAuth from "./household-auth.js";
import { fetchCalendarList, fetchCalendarReport, firstDavPropertyHref, resolveAppleDavHref } from "../lib/icloud-calendar-report.mjs";

const { readSession } = householdAuth;

const CALDAV_ROOT = "https://caldav.icloud.com";
const PREVIEW_DIAGNOSTIC_TOKEN = "d824bb1831d29ae7b07e93b7451f94cd96f0c4e377dc9973ed7834eaad308af7";

const json = (statusCode, body, extraHeaders = {}) => ({
  statusCode,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
    ...extraHeaders,
  },
  body: JSON.stringify(body),
});

const xmlDecode = value => String(value || "")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&amp;/g, "&");

const firstTag = (xml, name) => {
  const match = String(xml).match(new RegExp(`<(?:\\w+:)?${name}[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${name}>`, "i"));
  return match ? xmlDecode(match[1].replace(/<[^>]+>/g, "").trim()) : "";
};

const blocks = (xml, name) => [...String(xml).matchAll(new RegExp(`<(?:\\w+:)?${name}\\b[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${name}>`, "gi"))].map(m => m[1]);

const authHeader = () => {
  const email = process.env.ICLOUD_EMAIL;
  const password = process.env.ICLOUD_APP_PASSWORD;
  if (!email || !password) throw new Error("iCloud Calendar is not configured yet.");
  return `Basic ${Buffer.from(`${email}:${password.replace(/-/g, "")}`).toString("base64")}`;
};

const safeDavDiagnostic = value => String(value || "")
  .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
  .replace(/https?:\/\/[^\s<]+/gi, "[url]")
  .replace(/\b\d{5,}\b/g, "[id]")
  .slice(0, 500);

const isPreviewDiagnostic = event => {
  if (event.httpMethod !== "GET") return false;
  const supplied = String(event.headers?.["x-brevity-calendar-diagnostic"] || "");
  if (supplied.length !== PREVIEW_DIAGNOSTIC_TOKEN.length) return false;
  return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(PREVIEW_DIAGNOSTIC_TOKEN));
};

async function caldav(url, method, body = "", extraHeaders = {}, operation = "calendar request") {
  const response = await fetch(url, {
    method,
    headers: {
      authorization: authHeader(),
      "content-type": method === "PUT" ? "text/calendar; charset=utf-8" : "application/xml; charset=utf-8",
      ...extraHeaders,
    },
    body: body || undefined,
    redirect: "follow",
  });
  const text = await response.text();
  if (!response.ok && response.status !== 207) {
    const err = new Error(`Apple rejected the ${operation} (${response.status}).`);
    err.status = response.status;
    err.detail = text.slice(0, 300);
    err.operation = operation;
    err.requestHost = new URL(url).host;
    err.responseHost = new URL(response.url || url).host;
    err.responseType = response.headers.get("content-type") || "";
    err.diagnosticDetail = safeDavDiagnostic(text);
    throw err;
  }
  return { response, text };
}

async function discoverCalendar() {
  const principalReq = `<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>`;
  const principalResult = await caldav(CALDAV_ROOT, "PROPFIND", principalReq, { depth: "0" }, "account discovery request");
  const principalXml = principalResult.text;
  const principal = firstDavPropertyHref(principalXml, "current-user-principal");
  if (!principal) throw new Error("Could not find the iCloud Calendar account.");

  const homeReq = `<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>`;
  const principalUrl = resolveAppleDavHref(principal, principalResult.response.url || CALDAV_ROOT);
  const homeResult = await caldav(principalUrl, "PROPFIND", homeReq, { depth: "0" }, "calendar-home discovery request");
  const homeXml = homeResult.text;
  const home = firstDavPropertyHref(homeXml, "calendar-home-set");
  if (!home) throw new Error("Could not find the iCloud calendar collection.");

  const homeUrl = resolveAppleDavHref(home, homeResult.response.url || principalUrl);
  const listResult = await fetchCalendarList({ homeUrl, request:caldav });
  const listXml = listResult.text;
  const candidates = blocks(listXml, "response").map(block => ({
    href: firstTag(block, "href"),
    name: firstTag(block, "displayname"),
    calendar: /<(?:\w+:)?calendar\b/i.test(block),
    events: /name=["']VEVENT["']/i.test(block) || !/supported-calendar-component-set/i.test(block),
  })).filter(item => item.calendar && item.events && !/(inbox|outbox|notification)/i.test(item.href));

  // Never silently synchronize with the first calendar returned by Apple. The
  // shared Family calendar is the default and deployments may override its
  // display name explicitly when Apple localizes or renames it.
  const targetName = (process.env.ICLOUD_CALENDAR_NAME || "Family").trim();
  const wanted = targetName.toLocaleLowerCase();
  const chosen = candidates.find(item => item.name.trim().toLocaleLowerCase() === wanted);
  if (!chosen) throw new Error(`The shared Apple calendar named “${targetName}” was not found. Set ICLOUD_CALENDAR_NAME to its exact name.`);
  return {
    url:resolveAppleDavHref(chosen.href, listResult.response.url || homeUrl),
    name:chosen.name || "iCloud Calendar",
    discoveryMode:listResult.discoveryMode,
  };
}

const unfold = ics => String(ics).replace(/\r?\n[ \t]/g, "");
const icsValue = (ics, key) => {
  const match = unfold(ics).match(new RegExp(`^${key}(?:;[^:]*)?:(.*)$`, "mi"));
  return match ? match[1].trim() : "";
};
const unescapeIcs = value => String(value || "").replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
const escapeIcs = value => String(value || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");

function parseDate(value) {
  const match = String(value).match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?/);
  if (!match) return null;
  return { year: +match[1], month: +match[2], day: +match[3], hour: +(match[4] || 0), minute: +(match[5] || 0), allDay: !match[4] };
}

function parseEvent(ics, href, etag, forceOccurrenceId = false) {
  const start = parseDate(icsValue(ics, "DTSTART"));
  if (!start) return null;
  const uid = icsValue(ics, "UID");
  const recurrenceId = icsValue(ics, "RECURRENCE-ID");
  return {
    id: recurrenceId || forceOccurrenceId ? `${uid}::${recurrenceId || icsValue(ics, "DTSTART")}` : uid,
    uid,
    sourceId: unescapeIcs(icsValue(ics, "X-BREVITY-SOURCE-ID")),
    title: unescapeIcs(icsValue(ics, "SUMMARY")) || "Untitled event",
    date: `${start.year}-${String(start.month).padStart(2, "0")}-${String(start.day).padStart(2, "0")}`,
    time: start.allDay ? "" : new Date(2000, 0, 1, start.hour, start.minute).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
    allDay: start.allDay,
    pillar: unescapeIcs(icsValue(ics, "CATEGORIES")).toLowerCase() || "household",
    priority: icsValue(ics, "PRIORITY") === "1" || icsValue(ics, "X-BREVITY-PRIORITY") === "TRUE",
    owner: unescapeIcs(icsValue(ics, "X-BREVITY-OWNER")) || "Family",
    participants: unescapeIcs(icsValue(ics, "X-BREVITY-PARTICIPANTS")).split("|").filter(Boolean),
    href,
    etag,
  };
}

function formatIcsDate(dateKey, time, allDay) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const ymd = `${year}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}`;
  if (allDay || !time) {
    const next = new Date(year, month - 1, day + 1);
    const nextYmd = `${next.getFullYear()}${String(next.getMonth() + 1).padStart(2, "0")}${String(next.getDate()).padStart(2, "0")}`;
    return { start: `DTSTART;VALUE=DATE:${ymd}`, end: `DTEND;VALUE=DATE:${nextYmd}` };
  }
  const parsed = String(time).match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
  let hour = parsed ? +parsed[1] : 9;
  const minute = parsed ? +parsed[2] : 0;
  const meridiem = parsed?.[3]?.toUpperCase();
  if (meridiem === "PM" && hour < 12) hour += 12;
  if (meridiem === "AM" && hour === 12) hour = 0;
  const start = new Date(year, month - 1, day, hour, minute);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const localStamp = d => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}00`;
  const timeZone = /^[A-Za-z0-9_+\-/]+$/.test(process.env.BREVITY_TIME_ZONE || "") ? process.env.BREVITY_TIME_ZONE : "America/New_York";
  return { start: `DTSTART;TZID=${timeZone}:${localStamp(start)}`, end: `DTEND;TZID=${timeZone}:${localStamp(end)}` };
}

function makeIcs(item, uid) {
  const dates = formatIcsDate(item.date, item.time, item.allDay);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Brevity//Household OS//EN", "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT", `UID:${uid}`, `DTSTAMP:${stamp}`, dates.start, dates.end,
    `SUMMARY:${escapeIcs(item.title)}`, `CATEGORIES:${escapeIcs(item.pillar || "household")}`,
    `X-BREVITY-SOURCE-ID:${escapeIcs(item.sourceId || "")}`,
    `X-BREVITY-OWNER:${escapeIcs(item.owner || "Family")}`,
    `X-BREVITY-PARTICIPANTS:${escapeIcs((item.participants || []).join("|"))}`,
    `PRIORITY:${item.priority ? 1 : 0}`, `X-BREVITY-PRIORITY:${item.priority ? "TRUE" : "FALSE"}`,
    "END:VEVENT", "END:VCALENDAR", "",
  ].join("\r\n");
}

async function listEvents(calendar) {
  const report = await fetchCalendarReport({ calendarUrl:calendar.url, request:caldav });
  const events = blocks(report.text, "response").flatMap(block => {
    const href = firstTag(block, "href");
    const etag = firstTag(block, "getetag");
    const raw = block.match(/<(?:\w+:)?calendar-data[^>]*>([\s\S]*?)<\/(?:\w+:)?calendar-data>/i)?.[1] || "";
    const decoded = xmlDecode(raw);
    const occurrences = [...decoded.matchAll(/BEGIN:VEVENT[\s\S]*?END:VEVENT/gi)].map(match => match[0]);
    const records = occurrences.length ? occurrences : [decoded];
    return records.map(record => parseEvent(record, href, etag, records.length > 1)).filter(Boolean);
  }).filter(Boolean);
  return { events, recurrenceMode:report.recurrenceMode };
}

export const handler = async event => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  const previewDiagnostic = isPreviewDiagnostic(event);
  const session = await readSession(event).catch(() => null);
  if (!session && !previewDiagnostic) return json(401, { error: "Sign in to access the family calendar." });
  if (event.httpMethod === "POST" && event.queryStringParameters?.action === "login") return json(200, { ok: true, member: session.member });

  try {
    const calendar = await discoverCalendar();
    if (previewDiagnostic) {
      const result = await listEvents(calendar);
      return json(200, {
        diagnostic:true,
        ok:true,
        calendar:calendar.name,
        discoveryMode:calendar.discoveryMode,
        recurrenceMode:result.recurrenceMode,
        eventCount:result.events.length,
      });
    }
    if (event.httpMethod === "GET") {
      const result = await listEvents(calendar);
      return json(200, { calendar:calendar.name, syncMode:"two-way", discoveryMode:calendar.discoveryMode, recurrenceMode:result.recurrenceMode, events:result.events });
    }
    const item = event.body ? JSON.parse(event.body) : {};

    if (event.httpMethod === "POST") {
      const uid = `${crypto.randomUUID()}@brevity-household`;
      const href = `${calendar.url.replace(/\/?$/, "/")}${encodeURIComponent(uid)}.ics`;
      const result = await caldav(href, "PUT", makeIcs(item, uid), { "if-none-match": "*" });
      return json(201, { ok: true, id: uid, sourceId: item.sourceId || "", href: new URL(result.response.url).pathname, etag: result.response.headers.get("etag") || "" });
    }

    if (!item.href || !String(item.href).startsWith("/")) return json(400, { error: "This event is not linked to iCloud." });
    const href = new URL(item.href, CALDAV_ROOT).href;

    if (event.httpMethod === "PUT") {
      const headers = item.etag ? { "if-match": item.etag } : {};
      const result = await caldav(href, "PUT", makeIcs(item, item.id), headers);
      return json(200, { ok: true, sourceId: item.sourceId || "", etag: result.response.headers.get("etag") || item.etag || "" });
    }

    if (event.httpMethod === "DELETE") {
      await caldav(href, "DELETE", "", item.etag ? { "if-match": item.etag } : {});
      return json(200, { ok: true });
    }

    return json(405, { error: "Method not allowed." });
  } catch (error) {
    console.error("Brevity iCloud Calendar error", error.message, error.detail || "");
    if (previewDiagnostic) return json(200, {
      diagnostic:true,
      ok:false,
      message:error.message,
      status:error.status || null,
      operation:error.operation || null,
      requestHost:error.requestHost || null,
      responseHost:error.responseHost || null,
      responseType:error.responseType || null,
      detail:error.diagnosticDetail || null,
    });
    const status = /not configured/i.test(error.message) ? 503 : error.status === 401 ? 401 : 500;
    return json(status, { error: status === 401 ? "iCloud rejected the account email or app-specific password." : error.message });
  }
};
