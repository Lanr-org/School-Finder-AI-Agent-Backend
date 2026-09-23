import { normalizeCountry } from '../matching/matching.normalizers.js'
import { BulletinsRepo } from '../bulletins/bulletins.repository.js'
import { VisaRatesRepo } from '../visaRates/visaRates.repository.js'

export type GroundingContext = {
  bulletins: Awaited<ReturnType<typeof BulletinsRepo.findActiveForCountries>>
  visaRates: Awaited<
    ReturnType<typeof VisaRatesRepo.findLatestActiveForCountries>
  >
}

// AI-pipeline-only aggregator — not exposed over HTTP. Fetches fresh,
// ops-verified facts to ground the AI's replies, exactly like the Step-1
// program shortlist grounds recommendations: the model never invents these
// numbers, it only cites what's returned here.
export class IndustryContextService {
  static GetGroundingContext = async (
    rawDestinations: string[],
  ): Promise<GroundingContext> => {
    const countries = rawDestinations.map(normalizeCountry)

    const [bulletins, visaRates] = await Promise.all([
      BulletinsRepo.findActiveForCountries(countries),
      VisaRatesRepo.findLatestActiveForCountries(countries),
    ])

    return { bulletins, visaRates }
  }
}
