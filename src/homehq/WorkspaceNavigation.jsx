export default function WorkspaceNavigation({ pillar, activeView, onNavigate }) {
  if (!pillar || !pillar.items?.length) return null
  if (pillar.id==='finance') return null
  if (pillar.id==='household') {
    if (['pillar-analysis','household-manage','household-maintain'].includes(activeView)) return null
    const maintain=['property','malbec-estate','household-maintenance'].includes(activeView)
    return <nav className="life-workspace-nav" aria-label="Household workspaces"><button type="button" onClick={()=>onNavigate('household','pillar-analysis')}>Overview</button><button type="button" aria-current={!maintain?'page':undefined} onClick={()=>onNavigate('household','household-manage')}>Manage</button><button type="button" aria-current={maintain?'page':undefined} onClick={()=>onNavigate('household','household-maintain')}>Maintain</button></nav>
  }
  return <nav className="life-workspace-nav" aria-label={`${pillar.label} workspaces`}>
    <button type="button" aria-current={activeView==='pillar-analysis'?'page':undefined} onClick={()=>onNavigate(pillar.id,'pillar-analysis')}>Overview</button>
    {pillar.items.map(item=><button type="button" key={item.id} aria-current={activeView===item.id?'page':undefined} onClick={()=>onNavigate(pillar.id,item.id)}>{item.label}</button>)}
  </nav>
}
