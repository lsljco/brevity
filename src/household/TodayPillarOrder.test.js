import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('Today renders its primary content in the canonical seven-pillar order',async()=>{
  const source=await readFile(new URL('./TodayDashboard.jsx',import.meta.url),'utf8')
  const rendered=source.slice(source.lastIndexOf('return <div className="today-dashboard">'))
  const markers=['<TodayDevotionHero','<TodayMeals','pillar="fitness"','data-pillar="household"','pillar="education"','pillar="finance"','pillar="ministry"']
  const positions=markers.map(marker=>rendered.indexOf(marker))
  positions.forEach((position,index)=>assert.ok(position>=0,`missing ${markers[index]}`))
  for(let index=1;index<positions.length;index+=1)assert.ok(positions[index]>positions[index-1],`${markers[index]} should follow ${markers[index-1]}`)
  assert.match(source,/sermonDevotionImageUrl/)
  assert.match(source,/Pillar 1 · Spiritual Maturity/)
  assert.match(source,/Day \$\{devotion\.dayNumber\} of 7/)
})
