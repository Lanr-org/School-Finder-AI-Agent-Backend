// One-off importer: reads a CSV and creates Programs via the real API
// (POST /api/v1/auth/login then POST /api/v1/programs per row).
//
// Usage:
//   node scripts/import-programs.mjs [path-to-csv]
// Defaults to ./programs-fake-data.csv in the project root.

import 'dotenv/config'
import { readFileSync } from 'node:fs'
import axios from 'axios'

const csvPath = process.argv[2] ?? 'programs-fake-data.csv'
const baseUrl = `http://localhost:${process.env.PORT ?? 4000}`

function parseCsv(text) {
  const rows = []
  let row = []
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

    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (char !== '\r') {
      field += char
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  const header = rows[0]
  return rows.slice(1).filter((r) => r.length > 1 || r[0] !== '').map((r) => {
    const record = {}
    header.forEach((key, idx) => {
      record[key] = r[idx] ?? ''
    })
    return record
  })
}

function toProgramPayload(record) {
  const payload = {
    name: record.name,
    studyLevel: record.studyLevel,
    qualification: record.qualification,
    category: record.category,
    duration: record.duration,
    schoolId: record.schoolId,
    tuitionAmount: Number(record.tuitionAmount),
    tuitionCurrency: record.tuitionCurrency,
  }

  if (record.scholarshipAvailability) payload.scholarshipAvailability = record.scholarshipAvailability
  if (record.intakePeriods) payload.intakePeriods = record.intakePeriods.split(';').filter(Boolean)
  if (record.applicationDeadline) payload.applicationDeadline = record.applicationDeadline
  if (record.primaryIntakeYear) payload.primaryIntakeYear = Number(record.primaryIntakeYear)
  if (record.academicRequirements) payload.academicRequirements = record.academicRequirements
  if (record.englishRequirements) payload.englishRequirements = record.englishRequirements
  if (record.operationNotes) payload.operationNotes = record.operationNotes

  return payload
}

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL
  const password = process.env.SEED_ADMIN_PASSWORD

  if (!email || !password) {
    console.error('SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD missing from .env')
    process.exit(1)
  }

  console.log(`Logging in as ${email} at ${baseUrl} ...`)
  const login = await axios.post(`${baseUrl}/api/v1/auth/login`, { email, password })
  const token = login.data?.data?.accessToken
  if (!token) {
    console.error('Login succeeded but no accessToken found in response:', login.data)
    process.exit(1)
  }

  const csvText = readFileSync(csvPath, 'utf-8')
  const records = parseCsv(csvText)
  console.log(`Read ${records.length} rows from ${csvPath}`)

  const created = []
  const failed = []

  for (const record of records) {
    const payload = toProgramPayload(record)
    try {
      const res = await axios.post(`${baseUrl}/api/v1/programs`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const publicId = res.data?.data?.publicId
      created.push({ name: record.name, publicId })
      console.log(`Created: ${record.name} (${record.schoolId}) -> ${publicId}`)
    } catch (error) {
      const message = error.response?.data?.message ?? error.message
      failed.push({ name: record.name, message })
      console.error(`Failed: ${record.name} -> ${message}`)
    }
  }

  console.log('\n--- Summary ---')
  console.log(`Created: ${created.length}`)
  console.log(`Failed:  ${failed.length}`)
  if (failed.length > 0) {
    console.log('\nFailures:')
    failed.forEach((f) => console.log(`  - ${f.name}: ${f.message}`))
  }
}

main().catch((error) => {
  console.error('Import script crashed:', error.response?.data ?? error.message)
  process.exit(1)
})
