export const DAY1_SESSION_DATE='2026-09-16'
export const DAY1_DURATION_MINUTES=45
export const DAY1_BLOCKS=[{id:'reading-repair',minutes:10},{id:'math-retrieval',minutes:5},{id:'current-math',minutes:15},{id:'ela-content',minutes:10},{id:'mastery-challenge',minutes:5}]
export function day1Minutes(){return DAY1_BLOCKS.reduce((sum,b)=>sum+b.minutes,0)}
