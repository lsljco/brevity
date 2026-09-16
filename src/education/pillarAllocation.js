export function educationPillarMinutes(session){return session?.completedAt?45:0}
export function householdEducationAllocation(session){if(!session?.completedAt)return[];const members=new Set(['Isaiah',session.assessor].filter(Boolean));return[...members].map(member=>({member,pillar:'education',minutes:45,source:`tutor-session:${session.id}`}))}
