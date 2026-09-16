import crypto from "node:crypto";
import { getStore } from "@netlify/blobs";
import householdAuth from "./household-auth.js";
import { fetchCalendarList, fetchCalendarReport, firstDavPropertyHref, resolveAppleDavHref } from "../lib/icloud-calendar-report.mjs";
import { productionAssistantActionRepository } from "../lib/assistant-action-repository.mjs";
import { productionEstateRepository } from "../lib/estate-store.mjs";
import { isCalendarEligible, planItemToCalendarEvent } from "../../src/family/icloudCalendarApi.js";
import { projectCalendarEvent } from "../../src/homehq/projectData.js";
import { maintenanceCalendarEvent } from "../../src/estate/estateMaintenance.js";
import { MALBEC_PROPERTY_ID } from "../../src/estate/estateModel.js";

const { readSession } = householdAuth;

const CALDAV_ROOT = "https://caldav.icloud.com";
const HOUSEHOLD_ID = process.env.BREVITY_HOUSEHOLD_ID || "lslj-family";
const PLAN_STORE = "brevity-household";
const SHARED_STORE = "brevity-household-state";
const trustedActionRequest = event => {
  const expected = String(process.env.BREVITY_AUTOMATION_KEY || "");
  const supplied = String(event.headers?.["x-brevity-automation-key"] || event.headers?.["X-Brevity-Automation-Key"] || "");
  const expectedBytes=Buffer.from(expected),suppliedBytes=Buffer.from(supplied);
  if (!expected || expectedBytes.length !== suppliedBytes.length) return false;
  return crypto.timingSafeEqual(expectedBytes, suppliedBytes);
};
const SOURCE_DOMAINS = [
  [/^daily-/, "planning"],
  [/^household-(?:operation|schedule)-/, "planning"],
  [/^project-/, "projects"],
  [/^estate-maintenance-/, "projects"],
  [/^finance-action-/, "finance"],
];

export function calendarMutationDomain(item = {}) {
  const sourceId = String(item.sourceId || "");
  return SOURCE_DOMAINS.find(([pattern]) => pattern.test(sourceId))?.[1] || "calendar";
}

export function calendarMutationPermission({ session, permissions, method, item = {}, current = null, trustedAction = false }) {
  if (session?.role === "admin") return { allowed:true, domain:calendarMutationDomain(current || item) };
  const reference = current || item;
  const domain = calendarMutationDomain(reference);
  if (!permissions?.[domain]) return { allowed:false, domain, reason:`${domain} calendar publishing is not enabled for ${session?.member || "this member"}.` };

  // Source-managed events are reconciled by their authoritative Brevity
  // workflow. That workflow's planning/projects permission is the write gate;
  // ownership is enforced where the source record itself is edited.
  if (domain !== "calendar") return { allowed:true, domain };

  if (!trustedAction) {
    return { allowed:false, domain, reason:"Direct Family Calendar changes must use Brevity's reviewed Action Mode workflow." };
  }
  if (!String(reference.sourceId || "").startsWith("assistant-")) {
    return { allowed:false, domain, reason:"Native Apple Calendar records and unreviewed calendar writes are read-only in Brevity." };
  }

  const owners = [reference.owner, ...(reference.participants || [])].filter(Boolean);
  if (method === "DELETE") {
    const reviewedUndo=trustedAction&&/^undo-/.test(sourceField(item.actionId))&&owners.includes(session.member);
    return reviewedUndo
      ? { allowed:true, domain }
      : { allowed:false, domain, reason:"Deleting a direct Family Calendar event requires household-administrator access." };
  }
  if (method === "POST" && reference.owner && ![session.member, "Family"].includes(reference.owner)) {
    return { allowed:false, domain, reason:`${session.member} cannot create a Family Calendar event owned solely by another member.` };
  }
  if (method === "PUT" && owners.length && !owners.includes(session.member) && !owners.includes("Family")) {
    return { allowed:false, domain, reason:`${session.member} can update only Family Calendar events they own or participate in.` };
  }
  return { allowed:true, domain };
}

const sourceField = value => String(value || "").trim();
const sourceMembers = value => [...new Set((value || []).map(sourceField).filter(Boolean))].sort();
const canonicalSourceShape = item => ({
  sourceId:sourceField(item?.sourceId),
  title:sourceField(item?.title),
  date:sourceField(item?.date || item?.start).slice(0, 10),
  time:sourceField(item?.time || item?.startTime),
  allDay:Boolean(item?.allDay || !(item?.time || item?.startTime)),
  pillar:sourceField(item?.pillar || "household").toLowerCase(),
  owner:sourceField(item?.owner || "Family"),
  participants:sourceMembers(item?.participants || item?.members),
  priority:Boolean(item?.priority === true || ["high", "critical"].includes(sourceField(item?.priority).toLowerCase())),
  notes:sourceField(item?.notes),
});

export function sameAuthoritativeCalendarSource(expected, submitted) {
  return JSON.stringify(canonicalSourceShape(expected)) === JSON.stringify(canonicalSourceShape(submitted));
}

const sharedRecordValue = record => {
  if (!record?.value) return null;
  try { return JSON.parse(record.value); }
  catch { return null; }
};

export async function resolveAuthoritativeCalendarSource(sourceId, { planStore, sharedStore, estateRepository } = {}) {
  const value = sourceField(sourceId);
  const dailyMatch = value.match(/^daily-(\d{4}-\d{2}-\d{2})-(.+)$/);
  if (dailyMatch) {
    const plans = planStore || getStore({ name:PLAN_STORE, consistency:"strong", siteID:process.env.NETLIFY_SITE_ID, token:process.env.NETLIFY_TOKEN });
    const plan = await plans.get(`${HOUSEHOLD_ID}/daily-plans/${dailyMatch[1]}`, { type:"json" });
    const sources = [
      ["household", plan?.household?.appointments || []],
      ["ministry", plan?.ministry?.meetings || []],
      ["household", plan?.assignments || []],
    ];
    for (const [pillar, items] of sources) {
      const item = items.find(candidate => sourceField(candidate?.id) === dailyMatch[2]);
      if (item && isCalendarEligible(item)) return { supported:true, event:planItemToCalendarEvent(item, dailyMatch[1], pillar, value) };
    }
    return { supported:true, event:null };
  }

  if (value.startsWith("project-")) {
    const records = sharedStore || getStore({ name:SHARED_STORE, consistency:"strong", siteID:process.env.NETLIFY_SITE_ID, token:process.env.NETLIFY_TOKEN });
    const record = await records.get(`${HOUSEHOLD_ID}/records/homehq_items_v1`, { type:"json" });
    const items = sharedRecordValue(record);
    const project = Array.isArray(items) ? items.find(candidate => `project-${candidate?.id}` === value) : null;
    const event = project?.pushToFamilyCalendar ? projectCalendarEvent(project) : null;
    return { supported:true, event };
  }

  if (value.startsWith("estate-maintenance-")) {
    const repository = estateRepository || await productionEstateRepository();
    const workspace = await repository.getWorkspace(MALBEC_PROPERTY_ID);
    const event = (workspace?.maintenanceEvents || []).find(candidate => sourceField(candidate?.calendar?.sourceId) === value);
    const plan = event && (workspace?.maintenancePlans || []).find(candidate => candidate.id === event.maintenancePlanId);
    const workOrder = event && (workspace?.workOrders || []).find(candidate => candidate.id === event.workOrderId);
    return { supported:true, event:maintenanceCalendarEvent({ event, plan, workOrder, propertyName:workspace?.property?.name || "Estate" }) };
  }

  return { supported:false, event:null };
}

export async function authorizeUntrustedSourceMutation({ method, item = {}, current = null, resolver = resolveAuthoritativeCalendarSource }) {
  const submittedSourceId=sourceField(item?.sourceId);
  const currentSourceId=sourceField(current?.sourceId);
  const sourceId = method==='PUT'?submittedSourceId:sourceField((current||item)?.sourceId);
  const resolved = await resolver(sourceId);
  if (!resolved?.supported) return { allowed:false, reason:"This calendar source cannot be published until Brevity can verify its authoritative record." };
  if (method === "DELETE") {
    return resolved.event
      ? { allowed:false, reason:"This calendar item still exists in its authoritative Brevity source. Remove it there first." }
      : { allowed:true };
  }
  if (!resolved.event) return { allowed:false, reason:"The authoritative Brevity source for this calendar item was not found." };
  if (current && currentSourceId !== submittedSourceId) {
    const daily=submittedSourceId.match(/^daily-\d{4}-\d{2}-\d{2}-(.+)$/);
    if(!daily||daily[1]!==currentSourceId)return { allowed:false, reason:"A calendar item cannot be reassigned to a different source." };
  }
  return sameAuthoritativeCalendarSource(resolved.event, item)
    ? { allowed:true, event:canonicalSourceShape(resolved.event) }
    : { allowed:false, reason:"The proposed calendar item does not match its authoritative Brevity source. Refresh and try again." };
}

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

export function parseEvent(ics, href, etag, forceOccurrenceId = false) {
  const start = parseDate(icsValue(ics, "DTSTART"));
  if (!start) return null;
  const uid = icsValue(ics, "UID");
  const recurrenceId = icsValue(ics, "RECURRENCE-ID");
  return {
    id: recurrenceId || forceOccurrenceId ? `${uid}::${recurrenceId || icsValue(ics, "DTSTART")}` : uid,
    uid,
    sourceId: unescapeIcs(icsValue(ics, "X-BREVITY-SOURCE-ID")),
    actionId: unescapeIcs(icsValue(ics, "X-BREVITY-ACTION-ID")),
    title: unescapeIcs(icsValue(ics, "SUMMARY")) || "Untitled event",
    date: `${start.year}-${String(start.month).padStart(2, "0")}-${String(start.day).padStart(2, "0")}`,
    time: start.allDay ? "" : new Date(2000, 0, 1, start.hour, start.minute).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
    allDay: start.allDay,
    pillar: unescapeIcs(icsValue(ics, "CATEGORIES")).toLowerCase() || "household",
    priority: icsValue(ics, "PRIORITY") === "1" || icsValue(ics, "X-BREVITY-PRIORITY") === "TRUE",
    owner: unescapeIcs(icsValue(ics, "X-BREVITY-OWNER")) || "Family",
    participants: unescapeIcs(icsValue(ics, "X-BREVITY-PARTICIPANTS")).split("|").filter(Boolean),
    notes: unescapeIcs(icsValue(ics, "DESCRIPTION")),
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

export function makeIcs(item, uid) {
  const dates = formatIcsDate(item.date, item.time, item.allDay);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Brevity//Household OS//EN", "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT", `UID:${uid}`, `DTSTAMP:${stamp}`, dates.start, dates.end,
    `SUMMARY:${escapeIcs(item.title)}`, `CATEGORIES:${escapeIcs(item.pillar || "household")}`,
    `X-BREVITY-SOURCE-ID:${escapeIcs(item.sourceId || "")}`,
    `X-BREVITY-ACTION-ID:${escapeIcs(item.actionId || "")}`,
    `X-BREVITY-OWNER:${escapeIcs(item.owner || "Family")}`,
    `X-BREVITY-PARTICIPANTS:${escapeIcs((item.participants || []).join("|"))}`,
    `DESCRIPTION:${escapeIcs(item.notes || "")}`,
    `PRIORITY:${item.priority ? 1 : 0}`, `X-BREVITY-PRIORITY:${item.priority ? "TRUE" : "FALSE"}`,
    "END:VEVENT", "END:VCALENDAR", "",
  ].join("\r\n");
}

export function actionCalendarUid(item = {}) {
  const actionId=sourceField(item.actionId)
  if(!actionId)return""
  const digest=crypto.createHash("sha256").update(`${actionId}\0${sourceField(item.sourceId)}`).digest("hex").slice(0,40)
  return `brevity-action-${digest}@brevity-household`
}

const normalizedEventTime = value => {
  const match=sourceField(value).match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i)
  if(!match)return sourceField(value)
  let hour=Number(match[1])
  if(match[3]?.toUpperCase()==="PM"&&hour<12)hour+=12
  if(match[3]?.toUpperCase()==="AM"&&hour===12)hour=0
  return `${String(hour).padStart(2,"0")}:${match[2]}`
}

const sameCreatedEvent = (current, item, uid) => current?.uid===uid
  &&current.actionId===sourceField(item.actionId)
  &&current.sourceId===sourceField(item.sourceId)
  &&current.title===sourceField(item.title)
  &&current.date===sourceField(item.date)
  &&normalizedEventTime(current.time)===normalizedEventTime(item.time)
  &&current.allDay===Boolean(item.allDay||!item.time)
  &&current.pillar===sourceField(item.pillar||"household").toLowerCase()
  &&current.owner===sourceField(item.owner||"Family")
  &&JSON.stringify(current.participants||[])===JSON.stringify(item.participants||[])
  &&current.notes===sourceField(item.notes)
  &&current.priority===Boolean(item.priority)

const calendarResponsePath = (url, fallback) => {
  try{return new URL(url).pathname}catch{return new URL(fallback).pathname}
}

async function readVerifiedCalendarPut({item,uid,href,request}) {
  let existing
  try{existing=await request(href,"GET","",{},"calendar write verification request")}
  catch(readError){throw Object.assign(new Error("The Family Calendar write succeeded without a usable version marker and could not be verified."),{status:409,cause:readError})}
  const path=calendarResponsePath(existing.response.url,href)
  const current=parseEvent(existing.text,path,existing.response.headers.get("etag")||"")
  if(!sameCreatedEvent(current,item,uid)||!current.etag)throw Object.assign(new Error("The Family Calendar write did not return verifiable current contents and a version marker."),{status:409})
  return current
}

// Apple's create precondition is the serialization point for concurrent
// Action Mode workers. A losing worker directly reads the deterministic href
// and accepts it only when the immutable action marker and contents agree.
export async function putCalendarEventIdempotently({item,uid,href,trustedAction=false,request=caldav}) {
  try{
    const result=await request(href,"PUT",makeIcs(item,uid),{"if-none-match":"*"})
    const path=calendarResponsePath(result.response.url,href),headerEtag=result.response.headers.get("etag")||""
    const verified=headerEtag?null:await readVerifiedCalendarPut({item,uid,href,request})
    return{statusCode:201,payload:{ok:true,id:uid,sourceId:item.sourceId||"",actionId:item.actionId||"",href:verified?.href||path,etag:headerEtag||verified.etag}}
  }catch(error){
    if(error?.status!==412||!trustedAction||!item.actionId)throw error
    const current=await readVerifiedCalendarPut({item,uid,href,request})
    return{statusCode:200,payload:{ok:true,recovered:true,id:uid,sourceId:current.sourceId,actionId:current.actionId,href:current.href,etag:current.etag}}
  }
}

export async function putCalendarUpdateWithFreshEtag({item,uid,href,reviewedEtag,request=caldav}) {
  const result=await request(href,"PUT",makeIcs(item,uid),{"if-match":reviewedEtag})
  const headerEtag=result.response.headers.get("etag")||""
  const verified=headerEtag?null:await readVerifiedCalendarPut({item,uid,href,request})
  return{ok:true,sourceId:item.sourceId||"",actionId:item.actionId||"",etag:headerEtag||verified.etag}
}

export async function deleteCalendarEventWithIntent({item,current,href,repository,request=caldav,now=()=>new Date()}) {
  // Persist immutable proof of the reviewed deletion before making the
  // irreversible Apple call. A retry can then distinguish a completed delete
  // with a lost response from an unrelated missing event.
  if(item.actionId){
    await repository.saveCalendarMutationReceipt({
      id:item.actionId,kind:"delete",href:item.href,reviewedEtag:current.etag,
      sourceId:current.sourceId||"",recordedAt:now().toISOString(),
    })
  }
  await request(href,"DELETE","",{"if-match":current.etag},"calendar deletion request")
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

export const createICloudCalendarHandler = ({
  authenticate = readSession,
  isTrustedAction = trustedActionRequest,
  calendarDiscovery = discoverCalendar,
  eventLister = listEvents,
  actionRepositoryFactory = productionAssistantActionRepository,
  calendarTransport = caldav,
} = {}) => async event => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  const session = await authenticate(event).catch(() => null);
  if (!session) return json(401, { error: "Sign in to access the family calendar." });
  if (event.httpMethod === "POST" && event.queryStringParameters?.action === "login") return json(200, { ok: true, member: session.member });

  const trustedAction = isTrustedAction(event);
  if (["POST", "PUT", "DELETE"].includes(event.httpMethod) && !trustedAction) return json(423, {
    code:"ACTION_REVIEW_REQUIRED",
    error:"Direct Family Calendar changes are unavailable. Create, edit, or delete Brevity calendar records through Action Mode so the change receives review, permissions, audit history, safe Undo, and version-conflict protection. No Apple Calendar records were changed.",
  });

  try {
    const calendar = await calendarDiscovery();
    if (event.httpMethod === "GET") {
      const result = await eventLister(calendar);
      return json(200, { calendar:calendar.name, syncMode:"action-reviewed", discoveryMode:calendar.discoveryMode, recurrenceMode:result.recurrenceMode, events:result.events });
    }
    if (!["POST", "PUT", "DELETE"].includes(event.httpMethod)) return json(405, { error:"Method not allowed." });
    let item = {};
    try { item = event.body ? JSON.parse(event.body) : {}; }
    catch { return json(400, { error:"Invalid calendar request body." }); }
    // These fields are server-owned recovery markers. Browser callers may
    // still use their authorized source workflows, but cannot spoof a journal
    // completion or restore a deleted Apple identity.
    if (!trustedAction) { delete item.actionId; delete item._restoreDeleted; }
    const actionRepository=actionRepositoryFactory();
    const permissionMatrix = await actionRepository.getPermissions();
    const memberPermissions = permissionMatrix[session.member];

    if (event.httpMethod === "POST") {
      if (!trustedAction) {
        const sourceAuthorization = await authorizeUntrustedSourceMutation({ method:"POST", item });
        if (!sourceAuthorization.allowed) return json(403, { error:sourceAuthorization.reason });
        item = { ...item, ...sourceAuthorization.event };
      }
      const permission = calendarMutationPermission({ session, permissions:memberPermissions, method:"POST", item, trustedAction });
      if (!permission.allowed) return json(403, { error:permission.reason });
      if (!trustedAction) {
        const remote = await eventLister(calendar);
        if (remote.events.some(candidate => sourceField(candidate.sourceId) === sourceField(item.sourceId))) {
          return json(409, { error:"This authoritative Brevity item is already present in the Family Calendar. Refresh before updating it." });
        }
      }
      const restoreDeleted = item._restoreDeleted === true && item.href && (item.uid || item.id) && !String(item.id || item.uid).includes("::");
      const sourceUid = `${crypto.createHash("sha256").update(sourceField(item.sourceId)).digest("hex").slice(0, 32)}@brevity-household`;
      const uid = restoreDeleted ? String(item.uid || item.id) : trustedAction ? actionCalendarUid(item)||`${crypto.randomUUID()}@brevity-household` : sourceUid;
      const href = restoreDeleted
        ? resolveAppleDavHref(item.href, calendar.url)
        : `${calendar.url.replace(/\/?$/, "/")}${encodeURIComponent(uid)}.ics`;
      if (restoreDeleted && !href.startsWith(calendar.url.replace(/\/?$/, "/"))) return json(400, { error: "The deleted event is not linked to the configured Family Calendar." });
      const created=await putCalendarEventIdempotently({item,uid,href,trustedAction,request:calendarTransport});
      return json(created.statusCode,created.payload);
    }

    if (!item.href || !String(item.href).startsWith("/")) return json(400, { error: "This event is not linked to iCloud." });
    const href = resolveAppleDavHref(item.href, calendar.url);
    const calendarPrefix = calendar.url.replace(/\/?$/, "/");
    if (!href.startsWith(calendarPrefix)) return json(400, { error:"This event is not linked to the configured Family Calendar." });
    const remote = await eventLister(calendar);
    const current = remote.events.find(candidate => resolveAppleDavHref(candidate.href, calendar.url) === href) || null;
    if (!current) {
      if (trustedAction && event.httpMethod === "DELETE" && item.actionId) {
        const permission=calendarMutationPermission({session,permissions:memberPermissions,method:"DELETE",item,trustedAction});
        if(!permission.allowed)return json(403,{error:permission.reason});
        const receipt=await actionRepository.getCalendarMutationReceipt(item.actionId);
        if(receipt?.kind==='delete'&&receipt.href===item.href&&receipt.reviewedEtag===item.etag&&sourceField(receipt.sourceId)===sourceField(item.sourceId))return json(200,{ok:true,recovered:true});
      }
      return json(409, { error:"This Family Calendar event no longer exists, and Brevity has no matching receipt for the reviewed deletion." });
    }
    if (!trustedAction) {
      const sourceAuthorization = await authorizeUntrustedSourceMutation({ method:event.httpMethod, item, current });
      if (!sourceAuthorization.allowed) return json(403, { error:sourceAuthorization.reason });
      if (sourceAuthorization.event) item = { ...item, ...sourceAuthorization.event };
    }
    const permission = calendarMutationPermission({ session, permissions:memberPermissions, method:event.httpMethod, item, current, trustedAction });
    if (!permission.allowed) return json(403, { error:permission.reason });
    if (!item.etag || !current.etag || item.etag !== current.etag) return json(409, { error:"The Family Calendar event changed after it was loaded. Refresh and try again." });

    if (event.httpMethod === "PUT") {
      return json(200,await putCalendarUpdateWithFreshEtag({item,uid:current.uid||current.id,href,reviewedEtag:current.etag,request:calendarTransport}));
    }

    if (event.httpMethod === "DELETE") {
      await deleteCalendarEventWithIntent({item:trustedAction?item:{...item,actionId:""},current,href,repository:actionRepository,request:calendarTransport})
      return json(200, { ok: true });
    }

    return json(405, { error: "Method not allowed." });
  } catch (error) {
    console.error("Brevity iCloud Calendar error", error.message, error.detail || "");
    const status = /not configured/i.test(error.message) ? 503 : error.status === 401 ? 401 : error.status === 409 || error.status === 412 ? 409 : 500;
    return json(status, { error: status === 401 ? "iCloud rejected the account email or app-specific password." : status === 409 ? "The Family Calendar changed after review. Refresh and try again." : error.message });
  }
};

export const handler = createICloudCalendarHandler();
