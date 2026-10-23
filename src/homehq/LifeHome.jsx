import { useState } from 'react'
import { requestAssistantConversation } from '../assistant/actionEvents.js'
import { useDailyPlan } from '../household/useDailyPlan.js'

const destinations = {
  overview: [
    ['Schedule & routines', 'Make room for what matters.', 'ti-calendar-repeat', 'household-schedule'],
    ['Household operations', 'People, provisions and shared standards.', 'ti-home-heart', 'household-maintenance'],
    ['Maintenance & projects', 'Care for the home you are building.', 'ti-building-estate', 'malbec-estate'],
  ],
  manage: [
    ['Schedule & routines', 'Daily plans and recurring rhythms.', 'ti-calendar-repeat', 'household-schedule'],
    ['Family calendar', 'Appointments, preparation and coverage.', 'ti-calendar-event', 'family-calendar'],
    ['People & responsibilities', 'Assignments, checklists and completion review.', 'ti-users', 'household-maintenance'],
    ['Groceries', 'The shared shopping list.', 'ti-shopping-cart', 'grocery-list'],
    ['Supplies & inventory', 'What the household has and needs.', 'ti-package', 'household-supplies'],
    ['Policies & procedures', 'The standards that guide daily life.', 'ti-list-check', 'household-practices'],
  ],
  maintain: [
    ['Chores', 'Daily care, ownership and signoff.', 'ti-broom', 'household-maintenance'],
    ['Maintenance & repairs', 'Preventive care and issues to resolve.', 'ti-tool', 'malbec-estate'],
    ['Projects', 'Milestones, costs and approvals.', 'ti-building-estate', 'property'],
    ['Household intelligence', 'Review patterns and obstacles.', 'ti-chart-dots-3', 'household-intelligence'],
  ],
}

function Destination({ title, description, icon, image, onClick }) {
  return <button type="button" className={`life-destination${image?' life-destination--photo':''}`} onClick={onClick}>
    {image&&<img src={image} alt="" width="1672" height="941" loading="lazy" decoding="async"/>}
    <div className="life-destination-copy"><i className={`ti ${icon}`} aria-hidden="true"/><span><strong>{title}</strong><small>{description}</small></span><i className="ti ti-arrow-up-right" aria-hidden="true"/></div>
  </button>
}

export function HouseholdHome({ onNavigate, modules = [], initialSection = 'overview' }) {
  const [section, setSection] = useState(initialSection)
  const { plan, state } = useDailyPlan()
  const enabled = id => !modules.some(module => module.id === (id === 'household-supplies' ? 'household-maintenance' : id) && module.enabled === false)
  return <section className="life-workspace" aria-labelledby="household-heading">
    <header className="life-hero life-hero--household"><p className="life-eyebrow">Our shared life</p><h1 id="household-heading">Household</h1><p>A well cared for home. A family moving together.</p></header>
    <nav className="life-tabs" aria-label="Household sections">{['overview','manage','maintain'].map(id=><button type="button" key={id} aria-current={section === id ? 'page' : undefined} onClick={()=>setSection(id)}>{id[0].toUpperCase()+id.slice(1)}</button>)}</nav>
    {section==='overview'&&<section className="life-shared-focus"><p className="life-eyebrow">Our shared focus</p><h2>{state==='loading'?'Loading the household plan…':state==='error'?'The household plan is unavailable':plan.household?.keyFocus||'No household focus agreed yet.'}</h2><button type="button" onClick={()=>onNavigate('','today')}>Review the day <i className="ti ti-arrow-right" aria-hidden="true"/></button></section>}
    <div className="life-destinations">{destinations[section].filter(item=>enabled(item[3])).map(([title,description,icon,id],index)=><Destination key={id} image={section==='overview'?['/imagery/planning-desk.webp','/imagery/home-lounge.webp','/imagery/garden-path.webp'][index]:undefined} title={title} description={description} icon={icon} onClick={()=>onNavigate('household',id)}/>)}</div>
    <button type="button" className="life-concierge" onClick={()=>requestAssistantConversation('Review the household priorities, outstanding responsibilities, and schedule conflicts from our saved records. Identify what needs my attention and suggest the next step.')}><i className="ti ti-sparkles" aria-hidden="true"/><span>Hey Brevity, what needs our attention?</span><i className="ti ti-arrow-right" aria-hidden="true"/></button>
  </section>
}

export default function LifeHome({ currentMember, pillars, onNavigate, onOpenPillar, onOpenHistory }) {
  return <section className="life-workspace" aria-labelledby="life-home-heading">
    <header className="life-hero"><p className="life-eyebrow">Brevity of Life</p><h1 id="life-home-heading">Welcome home, {currentMember}.</h1><p>Live with intention. Make space for what matters.</p></header>
    <div className="life-destinations life-destinations--primary">
      <Destination image="/imagery/planning-desk.webp" title="My day" description="Your outcomes, meals, movement and appointments." icon="ti-sun" onClick={()=>onNavigate('','today')}/>
      {pillars.some(pillar=>pillar.id==='household')&&<Destination image="/imagery/home-lounge.webp" title="Our household" description="Shared responsibilities. A home in harmony." icon="ti-home-heart" onClick={()=>onOpenPillar('household')}/>}
      <Destination image="/imagery/garden-path.webp" title="Our seven pillars" description="The foundations of an intentional life." icon="ti-columns" onClick={()=>document.getElementById('life-pillars')?.scrollIntoView({block:'start',behavior:'smooth'})}/>
    </div>
    <button type="button" className="life-concierge" onClick={()=>requestAssistantConversation('Help me chart today’s course. Use my goals, unfinished work and appointments to propose three outcomes, explain why each matters today, and identify household conflicts. Preserve my existing decisions and ask me to review any proposed changes.')}><i className="ti ti-sparkles" aria-hidden="true"/><span>Chart the course for today</span><i className="ti ti-arrow-right" aria-hidden="true"/></button>
    <section id="life-pillars" className="life-pillars"><header><p className="life-eyebrow">An integrated life</p><h2>Our seven pillars</h2></header><div>{pillars.map(pillar=><Destination key={pillar.id} title={pillar.id==='finance'?'Finance & Stewardship':pillar.label} description={pillar.description} icon={pillar.icon} onClick={()=>onOpenPillar(pillar.id)}/>)}</div></section>
    <footer className="life-footer"><button type="button" onClick={onOpenHistory}>History & records <i className="ti ti-history" aria-hidden="true"/></button><button type="button" onClick={()=>onNavigate('','settings')}>Preferences & connections <i className="ti ti-settings" aria-hidden="true"/></button></footer>
  </section>
}
