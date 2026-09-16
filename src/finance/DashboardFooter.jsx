export default function DashboardFooter() {
  return (
    <div className="dash-footer">
      <i className="ti ti-quote" style={{ color:'var(--gold)', fontSize:18, flexShrink:0 }} aria-hidden="true" />
      <p style={{ margin:0, fontSize:12, color:'var(--muted)', fontStyle:'italic', flex:1 }}>
        “Wealth is not about having a lot of money; it&apos;s about having a lot of options.”
      </p>
      <span style={{ fontSize:10, color:'var(--gold-dark)', flexShrink:0, letterSpacing:'0.08em', textTransform:'uppercase' }}>Chris Rock</span>
      <div style={{ display:'flex', alignItems:'center', gap:14, paddingLeft:22, borderLeft:'1px solid var(--glass-border)', flexShrink:0 }}>
        <div>
          <div style={{ fontSize:9, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--muted)', marginBottom:4 }}>Net Worth Goal</div>
          <div style={{ display:'flex', alignItems:'baseline', gap:8 }}>
            <span style={{ fontSize:15, fontWeight:700, color:'var(--white)' }}>$3.00M</span>
            <span style={{ fontSize:11, color:'var(--gold)' }}>47%</span>
          </div>
          <div style={{ width:160, height:4, borderRadius:2, background:'rgba(255,255,255,0.08)', marginTop:6 }}>
            <div style={{ height:'100%', width:'47%', borderRadius:2, background:'linear-gradient(90deg, var(--gold-dark), var(--gold))' }} />
          </div>
        </div>
      </div>
    </div>
  )
}
