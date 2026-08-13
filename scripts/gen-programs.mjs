// Generates fake-but-plausible Program test data matching
// ProgramsSchemas.createProgramSchema, linked to the 50 schools already
// imported via scripts/import-schools.mjs (using their real SCH-#### IDs).
import { writeFileSync } from 'node:fs'

// name -> [publicId, country]
const schools = [
  ['University of Manchester', 'SCH-9085', 'United Kingdom'],
  ['University of Leeds', 'SCH-6101', 'United Kingdom'],
  ['University of Birmingham', 'SCH-1464', 'United Kingdom'],
  ['University of Sheffield', 'SCH-3789', 'United Kingdom'],
  ['University of Nottingham', 'SCH-7175', 'United Kingdom'],
  ['Coventry University', 'SCH-6577', 'United Kingdom'],
  ['University of Hertfordshire', 'SCH-7903', 'United Kingdom'],
  ['University of East London', 'SCH-4667', 'United Kingdom'],
  ['Aston University', 'SCH-6164', 'United Kingdom'],
  // University of Sunderland deliberately skipped — no programs yet
  ['University of Toronto', 'SCH-9037', 'Canada'],
  ['University of British Columbia', 'SCH-1633', 'Canada'],
  ['McGill University', 'SCH-8800', 'Canada'],
  ['University of Alberta', 'SCH-6567', 'Canada'],
  ['York University', 'SCH-1807', 'Canada'],
  ['Toronto Metropolitan University', 'SCH-5327', 'Canada'],
  ['Simon Fraser University', 'SCH-7877', 'Canada'],
  // Conestoga College deliberately skipped — no programs yet
  ['Arizona State University', 'SCH-7318', 'United States'],
  ['Purdue University', 'SCH-7638', 'United States'],
  ['University of Texas at Dallas', 'SCH-7132', 'United States'],
  ['Northeastern University', 'SCH-7564', 'United States'],
  ['University of Illinois Chicago', 'SCH-8532', 'United States'],
  // Cleveland State University deliberately skipped — no programs yet
  ['Southern New Hampshire University', 'SCH-5059', 'United States'],
  // University of Central Missouri deliberately skipped — no programs yet
  ['University of Melbourne', 'SCH-1626', 'Australia'],
  ['Monash University', 'SCH-6732', 'Australia'],
  ['University of Sydney', 'SCH-5458', 'Australia'],
  ['University of Queensland', 'SCH-7262', 'Australia'],
  ['Deakin University', 'SCH-4789', 'Australia'],
  // RMIT University deliberately skipped — no programs yet
  ['University College Dublin', 'SCH-6950', 'Ireland'],
  ['Trinity College Dublin', 'SCH-7712', 'Ireland'],
  ['Dublin City University', 'SCH-4542', 'Ireland'],
  // University of Limerick deliberately skipped — no programs yet
  ['Technical University of Munich', 'SCH-7049', 'Germany'],
  ['RWTH Aachen University', 'SCH-7931', 'Germany'],
  ['University of Stuttgart', 'SCH-2364', 'Germany'],
  ['Frankfurt School of Finance & Management', 'SCH-1997', 'Germany'],
  // SRH Hochschule Berlin deliberately skipped — no programs yet
  ['University of Amsterdam', 'SCH-2068', 'Netherlands'],
  ['Erasmus University Rotterdam', 'SCH-6879', 'Netherlands'],
  ['Delft University of Technology', 'SCH-6677', 'Netherlands'],
  // Maastricht University deliberately skipped — no programs yet
  ['University of Auckland', 'SCH-2421', 'New Zealand'],
  ['Victoria University of Wellington', 'SCH-1803', 'New Zealand'],
  // Massey University deliberately skipped — no programs yet
  ['University of Malaya', 'SCH-6815', 'Malaysia'],
  // Taylor's University deliberately skipped — no programs yet
]

const currencyByCountry = {
  'United Kingdom': 'GBP',
  Canada: 'CAD',
  'United States': 'USD',
  Australia: 'AUD',
  Ireland: 'EUR',
  Germany: 'EUR',
  Netherlands: 'EUR',
  'New Zealand': 'NZD',
  Malaysia: 'MYR',
}

const tuitionRangeByCountryLevel = {
  'United Kingdom': { UNDERGRADUATE: [15000, 25000], POSTGRADUATE: [18000, 32000], DOCTORATE: [16000, 26000], FOUNDATION: [12000, 18000] },
  Canada: { UNDERGRADUATE: [20000, 35000], POSTGRADUATE: [22000, 38000], DOCTORATE: [18000, 30000], FOUNDATION: [15000, 22000] },
  'United States': { UNDERGRADUATE: [25000, 45000], POSTGRADUATE: [30000, 60000], DOCTORATE: [25000, 45000], FOUNDATION: [18000, 28000] },
  Australia: { UNDERGRADUATE: [25000, 40000], POSTGRADUATE: [28000, 45000], DOCTORATE: [24000, 38000], FOUNDATION: [20000, 28000] },
  Ireland: { UNDERGRADUATE: [12000, 20000], POSTGRADUATE: [15000, 25000], DOCTORATE: [12000, 20000], FOUNDATION: [10000, 15000] },
  Germany: { UNDERGRADUATE: [1500, 4000], POSTGRADUATE: [3000, 20000], DOCTORATE: [1500, 4000], FOUNDATION: [2000, 6000] },
  Netherlands: { UNDERGRADUATE: [8000, 15000], POSTGRADUATE: [10000, 20000], DOCTORATE: [8000, 15000], FOUNDATION: [7000, 11000] },
  'New Zealand': { UNDERGRADUATE: [22000, 32000], POSTGRADUATE: [25000, 35000], DOCTORATE: [20000, 28000], FOUNDATION: [16000, 22000] },
  Malaysia: { UNDERGRADUATE: [8000, 15000], POSTGRADUATE: [10000, 18000], DOCTORATE: [8000, 14000], FOUNDATION: [6000, 10000] },
}

const durationByLevel = {
  UNDERGRADUATE: ['3 years', '4 years'],
  POSTGRADUATE: ['1 year', '2 years'],
  DOCTORATE: ['3-4 years'],
  FOUNDATION: ['1 year'],
}

const programTemplates = [
  { category: 'Computer Science', qualByLevel: { UNDERGRADUATE: 'BSc', POSTGRADUATE: 'MSc' } },
  { category: 'Data Science', qualByLevel: { POSTGRADUATE: 'MSc' } },
  { category: 'Artificial Intelligence', qualByLevel: { POSTGRADUATE: 'MSc' } },
  { category: 'Business Administration', qualByLevel: { UNDERGRADUATE: 'BBA', POSTGRADUATE: 'MBA' } },
  { category: 'Finance', qualByLevel: { UNDERGRADUATE: 'BSc', POSTGRADUATE: 'MSc' } },
  { category: 'Civil Engineering', qualByLevel: { UNDERGRADUATE: 'BEng', POSTGRADUATE: 'MEng' } },
  { category: 'Petroleum Engineering', qualByLevel: { UNDERGRADUATE: 'BEng', POSTGRADUATE: 'MSc' } },
  { category: 'Public Health', qualByLevel: { POSTGRADUATE: 'MPH' } },
  { category: 'Law', qualByLevel: { UNDERGRADUATE: 'LLB', POSTGRADUATE: 'LLM' } },
  { category: 'Nursing', qualByLevel: { UNDERGRADUATE: 'BSc' } },
  { category: 'International Relations', qualByLevel: { UNDERGRADUATE: 'BA', POSTGRADUATE: 'MA' } },
  { category: 'Architecture', qualByLevel: { UNDERGRADUATE: 'BArch', POSTGRADUATE: 'MArch' } },
  { category: 'Biomedical Science', qualByLevel: { UNDERGRADUATE: 'BSc', DOCTORATE: 'PhD' } },
  { category: 'Economics', qualByLevel: { UNDERGRADUATE: 'BSc', POSTGRADUATE: 'MSc' } },
  { category: 'Media & Communications', qualByLevel: { UNDERGRADUATE: 'BA', POSTGRADUATE: 'MA' } },
  { category: 'Environmental Science', qualByLevel: { UNDERGRADUATE: 'BSc', POSTGRADUATE: 'MSc' } },
  { category: 'Actuarial Science', qualByLevel: { UNDERGRADUATE: 'BSc' } },
  { category: 'Psychology', qualByLevel: { UNDERGRADUATE: 'BSc', POSTGRADUATE: 'MSc' } },
  { category: 'Education', qualByLevel: { POSTGRADUATE: 'MEd' } },
  { category: 'Foundation Studies', qualByLevel: { FOUNDATION: 'Foundation Certificate' } },
]

const scholarshipOptions = ['Full', '50%', '25%', '10%', 'None', 'None', '']
// Common global intake months — most schools cluster around Sept/Jan, with May as a secondary cycle
const intakeMonths = ['SEPTEMBER', 'JANUARY', 'JANUARY', 'MAY', 'FEBRUARY', 'OCTOBER']

let seed = 7
function rand() {
  seed = (seed * 1103515245 + 12345) % 2147483648
  return seed / 2147483648
}
function randInt(min, max) {
  return Math.floor(rand() * (max - min + 1)) + min
}
function pick(arr) {
  return arr[randInt(0, arr.length - 1)]
}

function pickStudyLevel(template) {
  const levels = Object.keys(template.qualByLevel)
  return pick(levels)
}

function pickIntakePeriods() {
  const count = randInt(1, 2)
  const unique = [...new Set(intakeMonths)]
  const shuffled = [...unique].sort(() => rand() - 0.5)
  return shuffled.slice(0, count)
}

const header = [
  'name',
  'studyLevel',
  'qualification',
  'category',
  'duration',
  'schoolId',
  'tuitionAmount',
  'tuitionCurrency',
  'scholarshipAvailability',
  'intakePeriods',
  'applicationDeadline',
  'primaryIntakeYear',
  'academicRequirements',
  'englishRequirements',
  'operationNotes',
]

function csvEscape(value) {
  const str = String(value ?? '')
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

const rows = []

for (const [schoolName, schoolId, country] of schools) {
  const programCount = randInt(1, 2)
  const usedCategories = new Set()

  for (let i = 0; i < programCount; i++) {
    let template = pick(programTemplates)
    let attempts = 0
    while (usedCategories.has(template.category) && attempts < 10) {
      template = pick(programTemplates)
      attempts++
    }
    usedCategories.add(template.category)

    const studyLevel = pickStudyLevel(template)
    const qualification = template.qualByLevel[studyLevel]
    const [tMin, tMax] = tuitionRangeByCountryLevel[country][studyLevel]
    const tuitionAmount = randInt(tMin, tMax)
    const currency = currencyByCountry[country]
    const duration = pick(durationByLevel[studyLevel])
    const intakePeriods = pickIntakePeriods()
    const primaryIntakeYear = 2026

    rows.push([
      `${qualification} ${template.category}`,
      studyLevel,
      qualification,
      template.category,
      duration,
      schoolId,
      tuitionAmount,
      currency,
      pick(scholarshipOptions),
      intakePeriods.join(';'),
      '2026-06-01',
      primaryIntakeYear,
      `Minimum GPA/degree classification requirements typical for ${studyLevel.toLowerCase()} entry in ${template.category}.`,
      'IELTS 6.5 overall (no band below 6.0) or equivalent.',
      `Test data generated for ${schoolName}.`,
    ])
  }
}

const csv = [header.join(','), ...rows.map((r) => r.map(csvEscape).join(','))].join('\n')
writeFileSync('programs-fake-data.csv', csv, 'utf-8')
console.log(`Wrote ${rows.length} rows to programs-fake-data.csv (across ${schools.length} schools)`)
