import crypto from 'node:crypto';
import { generateDailyPlanDraft } from '../lib/household-plan-generator.mjs';
import { productionAssistantActionRepository } from '../lib/assistant-action-repository.mjs';
import householdAuth from './household-auth.js';

const { readSession } = householdAuth;

function safeEqual(left, right) {
  const supplied = Buffer.from(String(left || ''));
  const expected = Buffer.from(String(right || ''));
  return supplied.length === expected.length && supplied.length > 0 && crypto.timingSafeEqual(supplied, expected);
}

async function authorized(request) {
  const cookie = request.headers.get('cookie') || '';
  const session = await readSession({ headers: { cookie } }).catch(() => null);
  if (session) return { session, automation:false };
  return safeEqual(request.headers.get('x-brevity-automation-key'), process.env.BREVITY_AUTOMATION_KEY)
    ? { session:null, automation:true }
    : null;
}

export default async function handler(request) {
  try {
    if (request.method !== 'POST') return new Response(JSON.stringify({ error:'Method not allowed.' }), { status:405, headers:{ 'content-type':'application/json' } });
    const authorization = await authorized(request);
    if (!authorization) return new Response(JSON.stringify({ error: 'Sign in to generate a household plan.' }), { status: 401, headers: { 'content-type': 'application/json' } });
    if (authorization.session?.role !== 'admin' && !authorization.automation) {
      const permissions = await productionAssistantActionRepository().getPermissions();
      const canPlan = permissions?.[authorization.session.member]?.planning === true;
      return new Response(JSON.stringify({ error:canPlan ? 'A generated daily-plan draft includes protected financial planning and requires household-administrator review.' : `Planning changes are not enabled for ${authorization.session.member}.`, domain:canPlan ? 'finance' : 'planning' }), { status:403, headers:{ 'content-type':'application/json' } });
    }
    let body = {};
    body = await request.json().catch(() => ({}));
    await generateDailyPlanDraft({
      targetDate: body.date,
      targetWeekday: body.weekday,
      requestId: String(body.requestId || ''),
    });
    return new Response(JSON.stringify({ accepted: true, authority:'draft-only' }), { status: 202, headers: { 'content-type': 'application/json' } });
  } catch (error) {
    console.error('[daily-household-plan-background]', error);
    const status = error.code === 'VERSION_CONFLICT' ? 409 : 500;
    return new Response(JSON.stringify({ error: error.message || 'Daily plan generation failed.' }), { status, headers: { 'content-type': 'application/json' } });
  }
}

export const config = {
  background: true,
  path: '/.netlify/functions/daily-household-plan-background',
};
