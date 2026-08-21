import { TIMEFRAME_PRESETS, resolveTimeframe, timeframeLabel } from './financeTimeframe.js'

export default function FinanceTimeframe({ value, onChange, compact = false, label = 'Dates / Timeframe' }) {
  const setPreset = preset => onChange(resolveTimeframe(preset, new Date(), value))
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: compact ? 14 : 20,
      padding: compact ? '10px 12px' : '12px 16px', borderRadius: 12, background: 'rgba(255,255,255,.035)', border: '1px solid var(--glass-border)' }}>
      <div>
        <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.12em', color: 'var(--gold)', fontWeight: 700 }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{timeframeLabel(value)}</div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select aria-label="Select financial timeframe" value={value.preset} onChange={e => setPreset(e.target.value)}
          style={{ minWidth: 160, padding: '8px 10px', borderRadius: 9, border: '1px solid rgba(255,255,255,.12)', background: '#171613', color: 'var(--soft-white)', fontFamily: 'inherit' }}>
          {TIMEFRAME_PRESETS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        {value.preset === 'custom' && <>
          <input aria-label="From date" type="date" value={value.from} onChange={e => onChange({ ...value, from: e.target.value })}
            style={{ padding: '7px 9px', borderRadius: 9, border: '1px solid rgba(255,255,255,.12)', background: '#171613', color: 'var(--soft-white)' }} />
          <input aria-label="To date" type="date" value={value.to} onChange={e => onChange({ ...value, to: e.target.value })}
            style={{ padding: '7px 9px', borderRadius: 9, border: '1px solid rgba(255,255,255,.12)', background: '#171613', color: 'var(--soft-white)' }} />
        </>}
      </div>
    </div>
  )
}
