import { createError } from '../../common/errors/AppError.js'
import {
  createPublicVisaRateId,
  withUniquePublicId,
} from '../../common/security/publicId.js'
import { normalizeCountry } from '../matching/matching.normalizers.js'
import { VisaRatesRepo } from './visaRates.repository.js'
import type {
  CreateVisaRateDTO,
  ListVisaRatesQueryDTO,
  UpdateVisaRateDTO,
} from './visaRates.types.js'
import type { VisaSuccessRate } from '../../generated/prisma/index.js'

const toRateResponse = (rate: VisaSuccessRate) => ({
  publicId: rate.public_id,
  country: rate.country,
  sourcePartner: rate.source_partner,
  periodLabel: rate.period_label,
  successRate: Number(rate.success_rate),
  sampleSize: rate.sample_size,
  publishedAt: rate.published_at,
  isActive: rate.is_active,
  createdAt: rate.created_at,
  updatedAt: rate.updated_at,
})

export class VisaRatesService {
  private static getOrThrow = async (publicId: string) => {
    const rate = await VisaRatesRepo.findByPublicId(publicId)
    if (!rate) {
      throw createError('Visa success rate not found', 404, {}, 'NOT_FOUND')
    }
    return rate
  }

  // ── GET /visa-success-rates ──────────────────────────────────────────────
  static List = async (query: ListVisaRatesQueryDTO) => {
    const country =
      query.country !== undefined ? normalizeCountry(query.country) : undefined
    const { rates, total } = await VisaRatesRepo.list({
      country,
      page: query.page,
      limit: query.limit,
    })

    return {
      rates: rates.map(toRateResponse),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    }
  }

  // ── POST /visa-success-rates ─────────────────────────────────────────────
  static Create = async (dto: CreateVisaRateDTO, createdBy: string) => {
    const rate = await withUniquePublicId(createPublicVisaRateId, (publicId) =>
      VisaRatesRepo.create({
        publicId,
        country: normalizeCountry(dto.country),
        sourcePartner: dto.sourcePartner ?? null,
        periodLabel: dto.periodLabel,
        successRate: dto.successRate,
        sampleSize: dto.sampleSize ?? null,
        publishedAt: dto.publishedAt,
        createdBy,
      }),
    )
    return toRateResponse(rate)
  }

  // ── PATCH /visa-success-rates/:rateId ────────────────────────────────────
  static Update = async (publicId: string, dto: UpdateVisaRateDTO) => {
    const rate = await VisaRatesService.getOrThrow(publicId)
    const updated = await VisaRatesRepo.update(rate.id, {
      ...dto,
      country:
        dto.country !== undefined ? normalizeCountry(dto.country) : undefined,
    })
    return toRateResponse(updated)
  }

  // ── DELETE /visa-success-rates/:rateId ───────────────────────────────────
  static Delete = async (publicId: string) => {
    const rate = await VisaRatesService.getOrThrow(publicId)
    await VisaRatesRepo.delete(rate.id)
  }
}
