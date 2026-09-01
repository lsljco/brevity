import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const mainSource = readFileSync(new URL('../main.jsx', import.meta.url), 'utf8')
const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8')
const mobileShellSource = readFileSync(new URL('../MobileShell.css', import.meta.url), 'utf8')
const themeCoverageSource = readFileSync(new URL('../ThemeCoverage.css', import.meta.url), 'utf8')
const financePlannerSource = readFileSync(new URL('../finance/FinancePlanner.jsx', import.meta.url), 'utf8')

test('phone drawer styles load after the general app shell styles', () => {
  const appStyles = mainSource.indexOf("import './App.css'")
  const mobileStyles = mainSource.indexOf("import './MobileShell.css'")

  assert.ok(appStyles >= 0, 'App.css must be imported by the entry point')
  assert.ok(mobileStyles > appStyles, 'MobileShell.css must load after App.css')
  assert.equal(appSource.includes("import './MobileShell.css'"), false)
})

test('phone drawer remains above its backdrop when open', () => {
  assert.match(mobileShellSource, /\.app-sidebar\s*\{[^}]*position:\s*fixed;[^}]*z-index:\s*1400;/s)
  assert.match(mobileShellSource, /\.mobile-sidebar-backdrop\s*\{[^}]*z-index:\s*1350;/s)
  assert.match(mobileShellSource, /\.app-sidebar\.is-expanded\s*\{[^}]*transform:\s*translateX\(0\);/s)
})

test('phone drawer uses the visual viewport and keeps footer controls reachable', () => {
  assert.match(mobileShellSource, /\.app-sidebar\s*\{[^}]*height:\s*100dvh\s*!important;[^}]*overflow:\s*hidden\s*!important;/s)
  assert.match(mobileShellSource, /\.sidebar-nav\s*\{[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto\s*!important;/s)
  assert.match(mobileShellSource, /\.sidebar-footer\s*\{[^}]*flex:\s*0 0 auto;[^}]*safe-area-inset-bottom/s)
})

test('app-wide theme coverage loads last and includes every native tab family', () => {
  const mobileStyles = mainSource.indexOf("import './MobileShell.css'")
  const themeStyles = mainSource.indexOf("import './ThemeCoverage.css'")
  assert.ok(themeStyles > mobileStyles, 'ThemeCoverage.css must be the final shell stylesheet')

  for (const selector of ['.today-dashboard', '.household-maintenance', '.family-calendar', '.finance-root', '.meal-planner', '.home-hq', '.estate-workspace', '.settings-page']) {
    assert.ok(themeCoverageSource.includes(selector), `${selector} must participate in app-wide light mode`)
  }
})

test('Finance appearance overrides do not replace the app drawer positioning', () => {
  const selector = '#primary-navigation-drawer.app-sidebar {'
  const blockStart = financePlannerSource.indexOf(selector)
  const blockEnd = financePlannerSource.indexOf('}', blockStart)

  assert.ok(blockStart >= 0, 'Finance sidebar appearance block must remain identifiable')
  assert.doesNotMatch(financePlannerSource.slice(blockStart, blockEnd), /position:\s*relative\s*!important/)
})

test('Finance appearance styles cannot target every sidebar descendant or replace app theme variables', () => {
  assert.doesNotMatch(financePlannerSource, /:where\(aside,[^)]+\)/)
  assert.doesNotMatch(financePlannerSource, /\[class\*="sidebar"\]/)
  assert.doesNotMatch(financePlannerSource, /const LUXURY_CSS = `\s*:root\s*\{/)
  assert.match(financePlannerSource, /#primary-navigation-drawer\.app-sidebar::before/)
})

test('mobile Menu button identifies the navigation drawer it controls', () => {
  assert.match(appSource, /id="primary-navigation-drawer"/)
  assert.match(appSource, /aria-controls="primary-navigation-drawer"/)
})

test('desktop sidebar state is explicit, persistent, and unaffected by module navigation', () => {
  assert.match(appSource, /useState\(initialSidebarExpanded\)/)
  assert.match(appSource, /const closeSidebarAfterNavigation=\(\)=>\{if\(isCompactNavigation\(\)\)setSidebarExpanded\(false\)\}/)
  assert.match(appSource, /const navigateTo=.*closeSidebarAfterNavigation\(\)/)
  assert.doesNotMatch(appSource, /<aside[^>]+onBlur=/)
  assert.match(appSource, /localStorage\.setItem\(SIDEBAR_STATE_KEY,next\?'expanded':'collapsed'\)/)
})

test('collapsed desktop rail keeps its toggle, brand, and navigation icons visible', () => {
  const appCssSource = readFileSync(new URL('../App.css', import.meta.url), 'utf8')
  assert.match(appCssSource, /\.sidebar-collapse-toggle\s*\{[^}]*z-index:\s*10;[^}]*visibility:\s*visible;/s)
  assert.match(appCssSource, /\.app-sidebar:not\(\.is-expanded\) \.sidebar-collapse-toggle\s*\{[^}]*bottom:\s*8px;[^}]*transform:\s*translateX\(50%\);/s)
  assert.match(appCssSource, /#primary-navigation-drawer\.app-sidebar:not\(\.is-expanded\) \.sidebar-brand-logo\s*\{[^}]*width:\s*40px\s*!important;/s)
  assert.match(appCssSource, /#primary-navigation-drawer\.app-sidebar:not\(\.is-expanded\) :is\([^}]+> i:first-child\s*\{[^}]*opacity:\s*1\s*!important;[^}]*visibility:\s*visible\s*!important;/s)
})

test('expanded desktop navigation protects readable labels and a visible toggle icon', () => {
  const appCssSource = readFileSync(new URL('../App.css', import.meta.url), 'utf8')
  assert.match(appCssSource, /#primary-navigation-drawer\.app-sidebar \.sidebar-collapse-toggle > i\s*\{[^}]*font-size:\s*18px\s*!important;/s)
  assert.match(appCssSource, /#primary-navigation-drawer\.app-sidebar \.sidebar-nav-item,[^}]+color:\s*var\(--white\)\s*!important;[^}]+opacity:\s*1\s*!important;/s)
  assert.match(appCssSource, /#primary-navigation-drawer\.app-sidebar \.pillar-header\s*\{[^}]*color:\s*var\(--soft-white\)\s*!important;[^}]+opacity:\s*1\s*!important;/s)
})

test('mobile refresh status stays in the page flow instead of covering page controls', () => {
  assert.match(mobileShellSource, /\.app-refresh-status\s*\{[^}]*position:\s*relative;[^}]*width:\s*calc\(100% - 24px\);[^}]*margin:\s*10px 12px 0;/s)
})
