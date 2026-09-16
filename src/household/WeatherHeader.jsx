import { useDailyWeather } from './useDailyWeather.js'
import './WeatherHeader.css'

const temp=value=>Number.isFinite(value)?`${value}°`: '—'
const time=value=>value?new Date(value).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):'—'

export default function WeatherHeader({date,compact=false}){
  const {status,data,error,reload}=useDailyWeather(date)
  if(!data&&status==='loading')return <section className={`weather-header${compact?' weather-header--compact':''}`} aria-live="polite"><div className="weather-loading"><i className="ti ti-loader-2"/><span>Loading weather for this day…</span></div></section>
  if(!data?.location?.name||!data?.day||!Array.isArray(data?.periods))return <section className={`weather-header weather-header--error${compact?' weather-header--compact':''}`} role="status"><div><i className="ti ti-cloud-off"/><span><strong>Weather is unavailable</strong><small>{error||'Brevity will retry the forecast shortly.'}</small></span></div><button type="button" onClick={reload}>Retry</button></section>
  const current=data.current
  return <section className={`weather-header${compact?' weather-header--compact':''}`} aria-label={`Weather for ${data.location.name}`}>
    <div className="weather-summary">
      <div className="weather-summary-icon"><i className={`ti ti-${data.isCurrentDay?current?.icon:data.periods?.[1]?.icon||'cloud'}`}/></div>
      <div><span>{data.location.name} · {data.isCurrentDay?'Current conditions':'Daily forecast'}</span><strong>{data.isCurrentDay?temp(current?.temperature):`${temp(data.day.low)}–${temp(data.day.high)}`}</strong><p>{data.isCurrentDay?`${current?.condition} · Feels like ${temp(current?.apparentTemperature)}`:`High ${temp(data.day.high)} · Low ${temp(data.day.low)}`}</p></div>
    </div>
    <div className="weather-periods">{data.periods.map(period=><article key={period.label}><span>{period.label}</span><i className={`ti ti-${period.icon}`}/><strong>{temp(period.temperature)}</strong><small>{period.condition}</small><em><i className="ti ti-droplet"/>{period.precipitationProbability??0}%</em></article>)}</div>
    <div className="weather-details"><span><i className="ti ti-temperature"/>High {temp(data.day.high)} · Low {temp(data.day.low)}</span><span><i className="ti ti-umbrella"/>{data.day.precipitationProbability??0}% chance</span><span><i className="ti ti-sunrise"/>{time(data.day.sunrise)}</span><span><i className="ti ti-sunset"/>{time(data.day.sunset)}</span><small>{data.stale?'Forecast may be stale':`Updated ${time(data.updatedAt)}`}</small></div>
    {error&&<div className="weather-delay" role="status">{error} <button type="button" onClick={reload}>Retry</button></div>}
  </section>
}
