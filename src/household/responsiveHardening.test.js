import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const mainSource = readFileSync(new URL('../main.jsx', import.meta.url), 'utf8')
const responsiveCss = readFileSync(new URL('../ResponsiveHardening.css', import.meta.url), 'utf8')
const homeHqSource = readFileSync(new URL('../homehq/HomeHQ.jsx', import.meta.url), 'utf8')
const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8')
const mobileShellCss = readFileSync(new URL('../MobileShell.css', import.meta.url), 'utf8')
const financeSource = readFileSync(new URL('../finance/FinancePlanner.jsx', import.meta.url), 'utf8')
const dashboardFooterSource = readFileSync(new URL('../finance/DashboardFooter.jsx', import.meta.url), 'utf8')
const metricDrilldownCss = readFileSync(new URL('../finance/MetricDrilldown.css', import.meta.url), 'utf8')
const scenarioSource = readFileSync(new URL('../finance/ScenarioModeling.jsx', import.meta.url), 'utf8')
const familyCalendarSource = readFileSync(new URL('../family/FamilyCalendar.jsx', import.meta.url), 'utf8')

test('cross-module responsive safeguards load after feature styles', () => {
  const featureStyles = mainSource.indexOf("import './household/SpiritualLayoutFixes.css'")
  const responsiveStyles = mainSource.indexOf("import './ResponsiveHardening.css'")

  assert.ok(featureStyles >= 0, 'feature styles must be loaded by the entry point')
  assert.ok(responsiveStyles > featureStyles, 'responsive safeguards must load last')
})

test('Today and meal overlays remain above fixed navigation and respect safe areas', () => {
  assert.match(responsiveCss, /\.today-decision-overlay\s*\{[^}]*z-index:\s*1700\s*!important;/s)
  assert.match(responsiveCss, /\.today-decision-dialog\s*\{[^}]*100dvh[^}]*overscroll-behavior:\s*contain;/s)
  assert.match(responsiveCss, /\.meal-dialog-backdrop\s*\{[^}]*z-index:\s*1700\s*!important;/s)
  assert.match(responsiveCss, /\.meal-dialog\s*\{[^}]*100dvh/s)
  assert.match(responsiveCss, /safe-area-inset-bottom/)
})

test('project workspace avoids fixed-width overflow at phone and tablet widths', () => {
  assert.match(homeHqSource, /repeat\(auto-fill,\s*minmax\(min\(320px,\s*100%\),\s*1fr\)\)/)
  assert.match(homeHqSource, /\.hq-project-calendar-scroll\s*\{[^}]*overflow-x:\s*auto;/s)
  assert.match(homeHqSource, /\.hq-project-calendar-grid\s*\{\s*min-width:\s*680px;/s)
  assert.match(homeHqSource, /@media \(max-width:\s*640px\)[\s\S]*?\.hq-modal-form\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*!important;/)
  assert.match(homeHqSource, /\.hq-modal-backdrop\s*\{\s*z-index:\s*1700\s*!important;/)
  assert.match(homeHqSource, /className="hq-project-calendar-scroll"[^>]*tabIndex="0"[^>]*aria-label=/)
})

test('narrow operations, estate, settings, and assistant layouts stack instead of clipping', () => {
  assert.match(responsiveCss, /@media \(max-width:\s*480px\)[\s\S]*?\.schedule-command,[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s*!important;/)
  assert.match(responsiveCss, /\.estate-command-grid,[\s\S]*?\.estate-maintenance-metrics\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*!important;/)
  assert.match(responsiveCss, /\.household-account-grid\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\);/)
  assert.match(responsiveCss, /\.brevity-action-review footer\s*\{[^}]*flex-direction:\s*column-reverse;/s)
  assert.match(responsiveCss, /\.brevity-assistant-composer\s*\{[^}]*safe-area-inset-bottom/s)
})

test('interactive controls keep usable touch targets on compact screens', () => {
  for (const selector of [
    '.household-operations-tabs button',
    '.meal-planner-controls button',
    '.estate-command-grid > button',
    '.brevity-action-review footer button',
    '.sermon-rescue-steps button',
  ]) {
    const start = responsiveCss.indexOf(selector)
    assert.ok(start >= 0, `${selector} must be covered by responsive safeguards`)
  }

  assert.match(responsiveCss, /min-height:\s*44px/)
  assert.match(homeHqSource, /\.hq-modal-close\s*\{\s*width:\s*44px\s*!important;\s*height:\s*44px\s*!important;/)
})

test('390px finance layouts stack, expose a forecast agenda, and keep the full content width', () => {
  assert.match(responsiveCss, /@media \(max-width:\s*720px\)[\s\S]*?\.finance-root \.finance-inner\s*\{[^}]*width:\s*calc\(100% - 24px\)\s*!important;/)
  assert.match(responsiveCss, /@media \(max-width:\s*520px\)[\s\S]*?\.finance-budget-summary,[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s*!important;/)
  assert.match(responsiveCss, /\.finance-calendar-month-head,[\s\S]*?\.finance-calendar-month-grid\s*\{\s*display:\s*none\s*!important;/)
  assert.match(responsiveCss, /\.finance-calendar-mobile-agenda\s*\{\s*display:\s*grid;/)
  assert.match(financeSource, /className="finance-calendar-mobile-agenda"/)
  assert.match(financeSource, /mobileAgendaDays\.length > 0/)
  assert.match(financeSource, /No planned or bank activity for this month/)
})

test('Budget, Reporting, Cash Flow, Accounts, and dashboard footer have responsive hooks', () => {
  for (const className of [
    'finance-budget-summary',
    'finance-budget-category-header',
    'finance-budget-category-metrics',
    'finance-budget-line',
    'finance-budget-plan-header',
    'finance-budget-plan-actions',
    'finance-report-tabs',
    'finance-cashflow-summary',
    'finance-cashflow-breakdowns',
    'finance-accounts-forecast',
    'dash-footer',
  ]) {
    assert.match(`${financeSource}\n${dashboardFooterSource}`, new RegExp(`className="${className}"`), `${className} must be present in Finance`)
    assert.ok(responsiveCss.includes(`.${className}`), `${className} must be covered by responsive safeguards`)
  }
  assert.match(responsiveCss, /@media \(max-width:\s*520px\)[\s\S]*?\.finance-budget-line\s*\{[^}]*display:\s*grid\s*!important;/)
  assert.match(responsiveCss, /\.finance-report-tabs\s*\{[^}]*overflow-x:\s*auto;/s)
  assert.match(responsiveCss, /@media \(max-width:\s*1100px\)[\s\S]*?\.finance-cashflow-breakdowns\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*!important;/)
  assert.match(responsiveCss, /\.finance-accounts-forecast\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*!important;/)
})

test('768px expanded navigation overlays the workspace instead of crushing it', () => {
  assert.match(appSource, /MOBILE_NAVIGATION_QUERY\s*=\s*'\(max-width:\s*900px\)'/)
  assert.match(mobileShellCss, /@media \(min-width:\s*641px\) and \(max-width:\s*900px\)[\s\S]*?\.app-sidebar\.is-expanded\s*\{[^}]*margin-right:\s*-180px;/)
  assert.match(mobileShellCss, /@media \(min-width:\s*641px\) and \(max-width:\s*900px\)[\s\S]*?\.mobile-sidebar-backdrop\s*\{[^}]*z-index:\s*1350;/)
})

test('finance sheets and feedback remain above fixed navigation with safe-area spacing', () => {
  assert.match(metricDrilldownCss, /\.metric-drilldown-backdrop\{[^}]*z-index:1700;/)
  assert.match(metricDrilldownCss, /safe-area-inset-bottom/)
  assert.match(responsiveCss, /\.finance-insight-overlay,[\s\S]*?\.finance-calendar-move-overlay\s*\{\s*z-index:\s*1700\s*!important;/)
  assert.match(responsiveCss, /\.finance-root \.toast,[\s\S]*?z-index:\s*1750\s*!important;/)
  assert.match(responsiveCss, /\.finance-root \.toast\s*\{[^}]*bottom:\s*calc\(92px \+ env\(safe-area-inset-bottom\)\)\s*!important;/s)
  assert.match(financeSource, /className="finance-insight-overlay"/)
  assert.match(financeSource, /className="finance-calendar-editor-overlay"/)
  assert.match(financeSource, /className="finance-calendar-move-overlay"/)
})

test('finance scope and calendar empty states explain the next safe action', () => {
  assert.match(scenarioSource, /Account scope:\s*Operating Account/)
  assert.match(scenarioSource, /Renovation \/ Projects and Savings are intentionally excluded/)
  assert.match(familyCalendarSource, /className="family-calendar-empty"/)
  assert.match(familyCalendarSource, /className="family-calendar-add" onClick=\{openCreate\}/)
  assert.doesNotMatch(familyCalendarSource, /No calendar commitments[^']*Morning Alignment/)
})
