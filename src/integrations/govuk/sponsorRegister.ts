import axios from 'axios'

// The Home Office publishes the register of licensed student sponsors as a CSV attached to this
// GOV.UK page, replaced most working days. The content API gives the current attachment link.
const CONTENT_API_URL =
  'https://www.gov.uk/api/content/government/publications/register-of-licensed-sponsors-students'

export const UK_REGISTER_SOURCE = 'UK Home Office register of licensed student sponsors'

export type SponsorRegisterRow = {
  sponsorName: string
  town: string
  additionalLocations: string
  sponsorType: string
  status: string // "Student Sponsor", "Student Sponsor - Track Record", "Probationary Sponsor"
  route: string // "Student" or "Child Student"
  immigrationCompliance: string // "" or "Subject To Action Plan"
}

const REQUEST = { timeout: 30_000, maxContentLength: 10 * 1024 * 1024 }

// Quoted-CSV parser (fields may contain commas and doubled quotes). Same approach as
// scripts/import-programs.mjs.
export const parseCsv = (text: string): string[][] => {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (char === '"') {
        inQuotes = false
      } else {
        field += char
      }
      continue
    }
    if (char === '"') inQuotes = true
    else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (char !== '\r') field += char
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

const COLUMNS = {
  sponsorName: 'Sponsor Name',
  town: 'Town/City',
  additionalLocations: 'Additional Locations',
  sponsorType: 'Sponsor Type',
  status: 'Status',
  route: 'Route',
  immigrationCompliance: 'Immigration Compliance',
} as const satisfies Record<keyof SponsorRegisterRow, string>

// Throws if the file no longer has the columns we rely on, so a format change fails loudly
// instead of marking every school "not listed".
export const parseRegisterCsv = (text: string): SponsorRegisterRow[] => {
  const [header, ...rows] = parseCsv(text.replace(/^\uFEFF/, ''))
  if (!header) throw new Error('Sponsor register CSV is empty')
  const index = Object.fromEntries(
    Object.entries(COLUMNS).map(([key, column]) => {
      const position = header.findIndex((cell) => cell.trim() === column)
      if (position === -1) throw new Error(`Sponsor register CSV is missing the "${column}" column`)
      return [key, position]
    }),
  ) as Record<keyof SponsorRegisterRow, number>

  return rows
    .filter((cells) => cells.some((cell) => cell.trim() !== ''))
    .map((cells) => {
      const value = (key: keyof SponsorRegisterRow) => (cells[index[key]] ?? '').trim()
      return {
        sponsorName: value('sponsorName'),
        town: value('town'),
        additionalLocations: value('additionalLocations'),
        sponsorType: value('sponsorType'),
        status: value('status'),
        route: value('route'),
        immigrationCompliance: value('immigrationCompliance'),
      }
    })
}

// The page can carry other attachments; the register is the CSV whose name mentions "Student".
export const findRegisterCsvUrl = (contentApiJson: unknown): string => {
  const links = JSON.stringify(contentApiJson).match(
    /https:\/\/assets\.publishing\.service\.gov\.uk\/[^"\\]+\.csv/g,
  )
  const url = links?.find((link) => /student/i.test(link)) ?? links?.[0]
  if (!url) throw new Error('No sponsor register CSV found on the GOV.UK page')
  return url
}

export const fetchUkSponsorRegister = async () => {
  const page = await axios.get<unknown>(CONTENT_API_URL, REQUEST)
  const csvUrl = findRegisterCsvUrl(page.data)
  const csv = await axios.get<string>(csvUrl, { ...REQUEST, responseType: 'text' })
  return { csvUrl, rows: parseRegisterCsv(csv.data) }
}
