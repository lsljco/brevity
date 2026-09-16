const DEFAULT_LOCATION = Object.freeze({
  name: process.env.BREVITY_WEATHER_LOCATION || 'Johns Creek, GA',
  latitude: Number(process.env.BREVITY_WEATHER_LATITUDE || 34.0289),
  longitude: Number(process.env.BREVITY_WEATHER_LONGITUDE || -84.1986),
  timezone: process.env.BREVITY_WEATHER_TIMEZONE || 'America/New_York',
})

const WEATHER_LABELS = {
  0:'Clear',1:'Mostly clear',2:'Partly cloudy',3:'Overcast',45:'Foggy',48:'Freezing fog',
  51:'Light drizzle',53:'Drizzle',55:'Heavy drizzle',56:'Freezing drizzle',57:'Heavy freezing drizzle',
  61:'Light rain',63:'Rain',65:'Heavy rain',66:'Freezing rain',67:'Heavy freezing rain',
  71:'Light snow',73:'Snow',75:'Heavy snow',77:'Snow grains',80:'Light showers',81:'Showers',82:'Heavy showers',
  85:'Snow showers',86:'Heavy snow showers',95:'Thunderstorms',96:'Thunderstorms with hail',99:'Severe thunderstorms with hail',
}

const iconForCode = code => {
  if (code === 0) return 'sun'
  if ([1,2].includes(code)) return 'cloud-sun'
  if ([3,45,48].includes(code)) return 'cloud'
  if ([71,73,75,77,85,86].includes(code)) return 'snowflake'
  if ([95,96,99].includes(code)) return 'cloud-storm'
  return 'cloud-rain'
}

const valueAt = (source, key, index) => source?.[key]?.[index]
const round = value => Number.isFinite(Number(value)) ? Math.round(Number(value)) : null
const isoDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : ''

export function localDateKey(now = new Date(), timezone = DEFAULT_LOCATION.timezone) {
  return new Intl.DateTimeFormat('en-CA', {timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now)
}

export function normalizeWeatherPayload(payload, targetDate, location = DEFAULT_LOCATION, now = new Date()) {
  const hourly = payload?.hourly || {}
  const daily = payload?.daily || {}
  const dayIndex = (daily.time || []).indexOf(targetDate)
  if (dayIndex < 0) throw new Error('The weather provider did not return the requested day.')
  const periodHours = [8,12,16,20]
  const periodLabels = ['Morning','Midday','Afternoon','Evening']
  const periods = periodHours.map((hour, periodIndex) => {
    const stamp = `${targetDate}T${String(hour).padStart(2,'0')}:00`
    const index = (hourly.time || []).indexOf(stamp)
    if (index < 0) return null
    const code = Number(valueAt(hourly,'weather_code',index))
    return {
      label:periodLabels[periodIndex],time:stamp,temperature:round(valueAt(hourly,'temperature_2m',index)),
      apparentTemperature:round(valueAt(hourly,'apparent_temperature',index)),
      precipitationProbability:round(valueAt(hourly,'precipitation_probability',index)),
      windSpeed:round(valueAt(hourly,'wind_speed_10m',index)),condition:WEATHER_LABELS[code] || 'Conditions unavailable',icon:iconForCode(code),
    }
  }).filter(Boolean)
  const currentCode = Number(payload?.current?.weather_code)
  return {
    location:{name:location.name,timezone:location.timezone},targetDate,
    isCurrentDay:targetDate === localDateKey(now, location.timezone),
    current:payload?.current ? {
      observedAt:payload.current.time,temperature:round(payload.current.temperature_2m),apparentTemperature:round(payload.current.apparent_temperature),
      humidity:round(payload.current.relative_humidity_2m),precipitation:round(payload.current.precipitation),windSpeed:round(payload.current.wind_speed_10m),
      condition:WEATHER_LABELS[currentCode] || 'Conditions unavailable',icon:iconForCode(currentCode),
    } : null,
    day:{
      high:round(valueAt(daily,'temperature_2m_max',dayIndex)),low:round(valueAt(daily,'temperature_2m_min',dayIndex)),
      precipitationProbability:round(valueAt(daily,'precipitation_probability_max',dayIndex)),
      sunrise:valueAt(daily,'sunrise',dayIndex) || '',sunset:valueAt(daily,'sunset',dayIndex) || '',
    },
    periods,updatedAt:now.toISOString(),source:'Open-Meteo',stale:false,
  }
}

export async function fetchWeatherForecast(targetDate, {fetchImpl = fetch, location = DEFAULT_LOCATION, now = new Date()} = {}) {
  const date = isoDate(targetDate)
  if (!date) throw new Error('A valid forecast date is required.')
  const today = localDateKey(now, location.timezone)
  const maxDate = new Date(`${today}T12:00:00Z`); maxDate.setUTCDate(maxDate.getUTCDate() + 6)
  if (date < today || date > maxDate.toISOString().slice(0,10)) throw new Error('Weather is available for today and the next six days.')
  const params = new URLSearchParams({
    latitude:String(location.latitude),longitude:String(location.longitude),timezone:location.timezone,
    temperature_unit:'fahrenheit',wind_speed_unit:'mph',precipitation_unit:'inch',start_date:date,end_date:date,
    current:'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m',
    hourly:'temperature_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m',
    daily:'temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset',
  })
  const response = await fetchImpl(`https://api.open-meteo.com/v1/forecast?${params}`, {headers:{accept:'application/json'}})
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload?.reason || `Weather provider returned ${response.status}.`)
  return normalizeWeatherPayload(payload,date,location,now)
}

export { DEFAULT_LOCATION, WEATHER_LABELS }
