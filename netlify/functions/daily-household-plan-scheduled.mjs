import { currentNewYorkHour } from '../lib/household-plan-generator.mjs';

export default async function handler() {
  const hour = currentNewYorkHour();
  if (hour !== 4) {
    console.log(`[daily-household-plan-scheduled] skipped because New York hour is ${hour}`);
    return;
  }

  const endpoint = 'https://brevityoflife.netlify.app/.netlify/functions/daily-household-plan-background';
  if (!process.env.BREVITY_AUTOMATION_KEY) throw new Error('BREVITY_AUTOMATION_KEY must be configured for scheduled plan generation.');
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-brevity-automation-key': process.env.BREVITY_AUTOMATION_KEY },
    body: JSON.stringify({ overwrite: false }),
  });

  if (!response.ok && response.status !== 202) {
    throw new Error(`Could not enqueue daily household plan generation (${response.status}).`);
  }
}

export const config = {
  schedule: '0 8,9 * * *',
};
