import dns from 'node:dns/promises'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'

const MAX_HTML_BYTES = 2 * 1024 * 1024
const MAX_REDIRECTS = 3
const REQUEST_TIMEOUT_MS = 15000

const fail = (message, status = 400) => Object.assign(new Error(message), { status })
const cleanText = (value, maximum = 1000) => String(value || '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&(?:nbsp|#160);/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#(?:39|x27);/gi, "'")
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&#(\d+);/g, (_, value) => String.fromCodePoint(Number(value)))
  .replace(/&#x([\da-f]+);/gi, (_, value) => String.fromCodePoint(Number.parseInt(value, 16)))
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, maximum)

const firstValue = value => Array.isArray(value) ? value.find(Boolean) : value

export function normalizeRecipeUrl(value, base) {
  let url
  try { url = base ? new URL(value, base) : new URL(value) } catch { throw fail('Enter a complete recipe website URL.') }
  if (!['http:', 'https:'].includes(url.protocol)) throw fail('Recipe imports support only http and https websites.')
  if (url.username || url.password) throw fail('Recipe website URLs cannot contain credentials.')
  if (!url.hostname || url.hostname === 'localhost' || url.hostname.endsWith('.localhost') || url.hostname.endsWith('.local')) throw fail('That recipe website address is not available for import.')
  if ((url.protocol === 'https:' && url.port && url.port !== '443') || (url.protocol === 'http:' && url.port && url.port !== '80')) throw fail('Recipe imports support standard website ports only.')
  url.hash = ''
  return url
}

export function isPublicAddress(address) {
  const version = net.isIP(address)
  if (version === 4) {
    const parts = address.split('.').map(Number)
    const [a, b] = parts
    return !(
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168)) ||
      (a === 198 && (b === 18 || b === 19 || b === 51)) ||
      (a === 203 && b === 0)
    )
  }
  if (version === 6) {
    const normalized = address.toLowerCase()
    if (normalized.startsWith('::ffff:')) return isPublicAddress(normalized.slice(7))
    return !(
      normalized === '::' || normalized === '::1' ||
      normalized.startsWith('fc') || normalized.startsWith('fd') ||
      /^fe[89ab]/.test(normalized) || normalized.startsWith('ff') ||
      normalized.startsWith('2001:db8:')
    )
  }
  return false
}

export async function resolvePublicAddress(url, lookup = dns.lookup) {
  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  if (net.isIP(hostname)) {
    if (!isPublicAddress(hostname)) throw fail('Private or local network addresses cannot be imported.')
    return { address:hostname, family:net.isIP(hostname) }
  }
  let addresses
  try { addresses = await lookup(hostname, { all:true, verbatim:true }) } catch { throw fail('The recipe website could not be found.', 502) }
  if (!addresses?.length || addresses.some(entry => !isPublicAddress(entry.address))) throw fail('The recipe website did not resolve to a public address.')
  return addresses[0]
}

const nodeRequest = (url, options) => new Promise((resolve, reject) => {
  const request = (url.protocol === 'https:' ? https : http).request(url, options, resolve)
  request.setTimeout(options.timeout, () => request.destroy(Object.assign(new Error('Timed out'), { code:'ETIMEDOUT' })))
  request.on('error', reject)
  request.end()
})

async function readBoundedBody(response, maximum = MAX_HTML_BYTES) {
  const declared = Number(response.headers?.['content-length'])
  if (Number.isFinite(declared) && declared > maximum) throw fail('The recipe page is too large to import.', 413)
  const chunks = []
  let size = 0
  for await (const chunk of response) {
    size += chunk.length
    if (size > maximum) {
      response.destroy()
      throw fail('The recipe page is too large to import.', 413)
    }
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf8')
}

export async function fetchRecipeHtml(input, { lookup = dns.lookup, requester = nodeRequest, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  let url = normalizeRecipeUrl(input)
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const resolved = await resolvePublicAddress(url, lookup)
    let response
    try {
      response = await requester(url, {
        method:'GET',
        headers:{ accept:'text/html,application/xhtml+xml', 'accept-encoding':'identity', 'user-agent':'BrevityRecipeImporter/1.0' },
        timeout:timeoutMs,
        lookup:(_hostname, _options, callback) => callback(null, resolved.address, resolved.family),
      })
    } catch (error) {
      if (error?.code === 'ETIMEDOUT') throw fail('The recipe website took too long to respond.', 504)
      throw fail('The recipe website could not be reached.', 502)
    }
    const status = Number(response.statusCode || response.status)
    const headers = response.headers || {}
    if (status >= 300 && status < 400 && headers.location) {
      response.destroy?.()
      if (redirect === MAX_REDIRECTS) throw fail('The recipe website redirected too many times.', 502)
      url = normalizeRecipeUrl(headers.location, url)
      continue
    }
    if (status < 200 || status >= 300) {
      response.destroy?.()
      throw fail(`The recipe website returned ${status || 'an error'}.`, 502)
    }
    if (!String(headers['content-type'] || '').toLowerCase().includes('text/html')) {
      response.destroy?.()
      throw fail('That URL does not point to an HTML recipe page.')
    }
    return { html:await readBoundedBody(response), sourceUrl:url.toString() }
  }
  throw fail('The recipe website could not be imported.', 502)
}

const recipeType = value => (Array.isArray(value) ? value : [value]).some(type => String(type || '').toLowerCase().split('/').pop() === 'recipe')

function findRecipe(value) {
  if (!value || typeof value !== 'object') return null
  if (recipeType(value['@type'])) return value
  if (Array.isArray(value)) {
    for (const child of value) { const found = findRecipe(child); if (found) return found }
  } else {
    for (const child of Object.values(value)) { const found = findRecipe(child); if (found) return found }
  }
  return null
}

const metaContent = (html, key) => {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, 'i'),
  ]
  return cleanText(patterns.map(pattern => html.match(pattern)?.[1]).find(Boolean) || '')
}

export function durationMinutes(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.round(value))
  const match = String(value || '').trim().match(/^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?)?$/i)
  if (!match) return null
  return Math.round((Number(match[1]) || 0) * 1440 + (Number(match[2]) || 0) * 60 + (Number(match[3]) || 0))
}

export function parseRecipeYield(value) {
  const text = cleanText(firstValue(value), 80)
  if (!text) return { yieldQuantity:null, yieldUnit:'' }
  const match = text.match(/(?:serves?|makes?|yields?|yield:?\s*)?\s*(\d+(?:\.\d+)?)(?:\s+(.+))?/i)
  if (!match) return { yieldQuantity:null, yieldUnit:'' }
  const quantity = Number(match[1])
  let unit = cleanText(match[2] || '', 40).replace(/^servings?\s*/i, '')
  if (/^serves?\b/i.test(text) || !unit) unit = 'servings'
  return { yieldQuantity:quantity, yieldUnit:unit || 'servings' }
}

const inferMealType = recipe => {
  const text = [recipe.recipeCategory, recipe.keywords, recipe.name].flat().join(' ').toLowerCase()
  if (/\b(breakfast|brunch)\b/.test(text)) return 'breakfast'
  if (/\blunch\b/.test(text)) return 'lunch'
  if (/\b(dinner|supper|main course|main dish|entrée|entree)\b/.test(text)) return 'dinner'
  return ''
}

const imageUrl = (value, sourceUrl) => {
  const selected = firstValue(value)
  const raw = typeof selected === 'object' ? selected?.url || selected?.contentUrl : selected
  if (!raw) return ''
  try {
    const url = new URL(raw, sourceUrl)
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : ''
  } catch { return '' }
}

export function parseRecipeHtml(html, sourceUrl) {
  const candidates = []
  const pattern = /<script\b[^>]*type=["']application\/ld\+json[^"']*["'][^>]*>([\s\S]*?)<\/script>/gi
  for (const match of html.matchAll(pattern)) {
    try { candidates.push(JSON.parse(match[1].replace(/<!--[\s\S]*?-->/g, '').trim())) } catch { /* Ignore malformed blocks and inspect the others. */ }
  }
  const recipe = candidates.map(findRecipe).find(Boolean)
  if (!recipe) throw fail('Brevity could not find structured recipe details on that page.', 422)
  const rawIngredients = Array.isArray(recipe.recipeIngredient) ? recipe.recipeIngredient : []
  if (rawIngredients.length > 30) throw fail('This recipe has more than 30 ingredient lines. Shorten the ingredient list before importing it.', 422)
  const ingredients = rawIngredients.map(value => cleanText(value, 240)).filter(Boolean)
  if (!cleanText(recipe.name) || !ingredients.length) throw fail('The page did not provide a usable recipe name and ingredient list.', 422)
  const parsedYield = parseRecipeYield(recipe.recipeYield)
  const prepMinutes = durationMinutes(recipe.prepTime)
  const cookMinutes = durationMinutes(recipe.cookTime)
  const declaredTotal = durationMinutes(recipe.totalTime)
  const totalMinutes = declaredTotal ?? (prepMinutes != null && cookMinutes != null ? prepMinutes + cookMinutes : null)
  const missingFields = []
  if (prepMinutes == null) missingFields.push('prep time')
  if (cookMinutes == null) missingFields.push('cook time')
  if (!parsedYield.yieldQuantity) missingFields.push('batch yield')
  return {
    mealType:inferMealType(recipe),
    name:cleanText(recipe.name, 160),
    description:cleanText(recipe.description, 1000),
    ingredients,
    prepMinutes,
    cookMinutes,
    totalMinutes,
    image:imageUrl(recipe.image || metaContent(html, 'og:image'), sourceUrl),
    ...parsedYield,
    sourceUrl,
    sourceName:new URL(sourceUrl).hostname.replace(/^www\./, ''),
    missingFields,
  }
}

export async function importRecipe(input, dependencies) {
  const { html, sourceUrl } = await fetchRecipeHtml(input, dependencies)
  return parseRecipeHtml(html, sourceUrl)
}
