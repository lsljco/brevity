import { generateAndSaveDailyPlan } from '../lib/household-plan-generator.mjs';

export default async function handler(request) {
  try {
    let body = {};
    if (request.method === 'POST') body = await request.json().catch(() => ({}));
    await generateAndSaveDailyPlan({
      targetDate: body.date,
      targetWeekday: body.weekday,
      overwrite: Boolean(body.overwrite),
    });
  } catch (error) {
    console.error('[daily-household-plan-background]', error);
    throw error;
  }
}

export const config = {
  background: true,
  path: '/.netlify/functions/daily-household-plan-background',
};
