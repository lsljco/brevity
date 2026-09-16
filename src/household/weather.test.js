import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { normalizeWeatherPayload } from '../../netlify/lib/weather-forecast.mjs'
import { fetchDailyWeather } from './weatherApi.js'

const fixture={
  current:{time:'2026-09-13T09:15',temperature_2m:74.4,apparent_temperature:75.2,relative_humidity_2m:61,precipitation:0,weather_code:1,wind_speed_10m:5.4},
  hourly:{
    time:['2026-09-13T08:00','2026-09-13T12:00','2026-09-13T16:00','2026-09-13T20:00'],
    temperature_2m:[70,79,82,73],apparent_temperature:[70,80,84,74],precipitation_probability:[5,10,35,20],weather_code:[1,2,61,2],wind_speed_10m:[3,5,8,4],
  },
  daily:{time:['2026-09-13'],temperature_2m_max:[82],temperature_2m_min:[66],precipitation_probability_max:[35],sunrise:['2026-09-13T07:18'],sunset:['2026-09-13T19:43']},
}

test('weather forecast preserves current conditions and four dayparts',()=>{
  const result=normalizeWeatherPayload(fixture,'2026-09-13',{name:'Johns Creek, GA',timezone:'America/New_York'},new Date('2026-09-13T14:00:00Z'))
  assert.equal(result.isCurrentDay,true)
  assert.equal(result.current.condition,'Mostly clear')
  assert.deepEqual(result.periods.map(item=>item.label),['Morning','Midday','Afternoon','Evening'])
  assert.equal(result.periods[2].condition,'Light rain')
  assert.deepEqual(result.day,{high:82,low:66,precipitationProbability:35,sunrise:'2026-09-13T07:18',sunset:'2026-09-13T19:43'})
})

test('weather header appears on Today and both daily alignment dates',()=>{
  const today=readFileSync(new URL('./TodayDashboard.jsx',import.meta.url),'utf8')
  const alignment=readFileSync(new URL('./MorningAlignment.jsx',import.meta.url),'utf8')
  const endpoint=readFileSync(new URL('../../netlify/functions/weather.mjs',import.meta.url),'utf8')
  assert.match(today,/<WeatherHeader date=\{dailyPlan\.date\}/)
  assert.match(alignment,/<WeatherHeader date=\{draft\.date\} compact/)
  assert.match(endpoint,/readSession/)
  assert.match(endpoint,/brevity-household/)
  assert.match(endpoint,/stale:true/)
})

test('client rejects an incomplete weather response instead of crashing Today',async()=>{
  const originalFetch=globalThis.fetch
  globalThis.fetch=async()=>({ok:true,json:async()=>({})})
  await assert.rejects(()=>fetchDailyWeather('2026-09-13'),/incomplete forecast/)
  globalThis.fetch=originalFetch
})
