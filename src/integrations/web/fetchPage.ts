import axios from 'axios'
import { promises as dns } from 'node:dns'
import { BlockList, isIP } from 'node:net'

// Reads a public web page (a university course page) as plain text. Staff paste the link, so
// the server must never be steered into its own network: https only, and every address the
// host resolves to is checked at connect time (which also defeats DNS rebinding).

// Why a page couldn't be read: the watcher treats a blocked site, a removed page and a passing
// network failure differently.
export type PageFetchErrorKind = 'invalid' | 'blocked' | 'gone' | 'failed'

export class PageFetchError extends Error {
  constructor(
    message: string,
    readonly kind: PageFetchErrorKind = 'invalid',
  ) {
    super(message)
  }
}

const BLOCKED = new BlockList()
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  BLOCKED.addSubnet(network, prefix, 'ipv4')
}
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  BLOCKED.addSubnet(network, prefix, 'ipv6')
}

export const isPublicAddress = (address: string): boolean => {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)
  if (mapped) return isPublicAddress(mapped[1]!)
  const family = isIP(address)
  if (family === 0) return false
  return !BLOCKED.check(address, family === 4 ? 'ipv4' : 'ipv6')
}

// Throws unless the link is https and its host is not a private or local address.
export const assertFetchableUrl = (raw: string): URL => {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new PageFetchError('That is not a valid link.')
  }
  if (url.protocol !== 'https:')
    throw new PageFetchError('Only https:// links can be read.')
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.internal')
  ) {
    throw new PageFetchError('This address cannot be read.')
  }
  // Node skips the DNS lookup for IP literals, so check them here.
  if (isIP(host) !== 0 && !isPublicAddress(host)) {
    throw new PageFetchError('This address cannot be read.')
  }
  return url
}

// axios calls this instead of the default resolver for every connection.
const publicLookup = async (hostname: string) => {
  const addresses = await dns.lookup(hostname, { all: true })
  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => !isPublicAddress(address))
  ) {
    throw new PageFetchError('This address cannot be read.')
  }
  return addresses
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  pound: '£',
  euro: '€',
  dollar: '$',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  hellip: '…',
}

const decodeEntity = (match: string, entity: string) => {
  if (entity.startsWith('#')) {
    const code =
      entity[1]?.toLowerCase() === 'x'
        ? parseInt(entity.slice(2), 16)
        : parseInt(entity.slice(1), 10)
    return Number.isFinite(code) && code > 0 && code < 0x110000
      ? String.fromCodePoint(code)
      : match
  }
  return ENTITIES[entity.toLowerCase()] ?? match
}

// Good enough for course pages: keeps headings, paragraphs and table cells on their own lines.
// Navigation and footers are dropped; the page header is kept because course pages often put
// the title, duration and start date there.
export const htmlToText = (html: string): string =>
  html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(
      /<(script|style|noscript|svg|template|iframe|nav|footer)\b[\s\S]*?<\/\1\s*>/gi,
      ' ',
    )
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(
      /<\/?(p|div|section|article|main|aside|header|h[1-6]|li|ul|ol|tr|table|thead|tbody|dt|dd|dl|details|summary|blockquote)\b[^>]*>/gi,
      '\n',
    )
    .replace(/<\/(td|th)\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, decodeEntity)
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim()

const MAX_REDIRECTS = 3
const MIN_TEXT_LENGTH = 400

export const fetchPageText = async (
  rawUrl: string,
): Promise<{ url: string; text: string }> => {
  let url = assertFetchableUrl(rawUrl)

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let response
    try {
      response = await axios.get<string>(url.toString(), {
        timeout: 15_000,
        maxContentLength: 3 * 1024 * 1024,
        maxRedirects: 0,
        responseType: 'text',
        validateStatus: () => true,
        lookup: publicLookup,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; SmetaseBot/1.0; +https://smetase.com)',
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-GB,en;q=0.9',
        },
      })
    } catch (error) {
      if (error instanceof PageFetchError) throw error
      if (axios.isAxiosError(error) && error.cause instanceof PageFetchError)
        throw error.cause
      throw new PageFetchError(
        "We couldn't open this page. Paste the page text instead.",
        'failed',
      )
    }

    const { status } = response
    if (status >= 300 && status < 400) {
      const location = response.headers.location as string | undefined
      if (!location) break
      url = assertFetchableUrl(new URL(location, url).toString())
      continue
    }
    if (status === 401 || status === 403 || status === 429) {
      throw new PageFetchError(
        'This site blocked automatic reading. Paste the page text instead.',
        'blocked',
      )
    }
    if (status === 404 || status === 410) {
      throw new PageFetchError(
        'This page does not exist any more. Check the link.',
        'gone',
      )
    }
    if (status >= 400) {
      throw new PageFetchError(
        "We couldn't open this page. Paste the page text instead.",
        'failed',
      )
    }

    const contentType = String(response.headers['content-type'] ?? '')
    if (!/text\/html|application\/xhtml/i.test(contentType)) {
      throw new PageFetchError(
        'This link is not a web page. Paste the page text instead.',
        'blocked',
      )
    }
    const text = htmlToText(response.data)
    if (text.length < MIN_TEXT_LENGTH) {
      throw new PageFetchError(
        'This page loads its content with JavaScript, so it can’t be read automatically. Paste the page text instead.',
        'blocked',
      )
    }
    return { url: url.toString(), text }
  }
  throw new PageFetchError(
    'This link redirects too many times. Paste the page text instead.',
    'failed',
  )
}
