import crypto from 'node:crypto';
import { generateAndSaveDailyPlan } from '../lib/household-plan-generator.mjs';
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
  if (session) return true;
  return safeEqual(request.headers.get('x-brevity-automation-key'), process.env.BREVITY_AUTOMATION_KEY);
}

export default async function handler(request) {
  try {
    if (!(await authorized(request))) return new Response(JSON.stringify({ error: 'Sign in to generate a household plan.' }), { status: 401, headers: { 'content-type': 'application/json' } });
    let body = {};
    if (request.method === 'POST') body = await request.json().catch(() => ({}));
    await generateAndSaveDailyPlan({
      targetDate: body.date,
      targetWeekday: body.weekday,
      overwrite: Boolean(body.overwrite),
      requestId: String(body.requestId || ''),
    });
    return new Response(JSON.stringify({ accepted: true }), { status: 202, headers: { 'content-type': 'application/json' } });
  } catch (error) {
    console.error('[daily-household-plan-background]', error);
    return new Response(JSON.stringify({ error: error.message || 'Daily plan generation failed.' }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
}

export const config = {
  background: true,
  path: '/.netlify/functions/daily-household-plan-background',
};
