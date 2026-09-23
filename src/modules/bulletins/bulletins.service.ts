import { createError } from '../../common/errors/AppError.js'
import {
  createPublicBulletinId,
  withUniquePublicId,
} from '../../common/security/publicId.js'
import { normalizeCountry } from '../matching/matching.normalizers.js'
import { BulletinsRepo } from './bulletins.repository.js'
import type {
  CreateBulletinDTO,
  ListBulletinsQueryDTO,
  UpdateBulletinDTO,
} from './bulletins.types.js'
import type { IndustryBulletin } from '../../generated/prisma/index.js'

const toBulletinResponse = (bulletin: IndustryBulletin) => ({
  publicId: bulletin.public_id,
  title: bulletin.title,
  body: bulletin.body,
  sourcePartner: bulletin.source_partner,
  countries: bulletin.countries,
  publishedAt: bulletin.published_at,
  expiresAt: bulletin.expires_at,
  isActive: bulletin.is_active,
  createdAt: bulletin.created_at,
  updatedAt: bulletin.updated_at,
})

export class BulletinsService {
  private static getOrThrow = async (publicId: string) => {
    const bulletin = await BulletinsRepo.findByPublicId(publicId)
    if (!bulletin) {
      throw createError('Bulletin not found', 404, {}, 'NOT_FOUND')
    }
    return bulletin
  }

  // ── GET /bulletins ───────────────────────────────────────────────────────
  static List = async (query: ListBulletinsQueryDTO) => {
    const country =
      query.country !== undefined ? normalizeCountry(query.country) : undefined
    const { bulletins, total } = await BulletinsRepo.list({
      country,
      page: query.page,
      limit: query.limit,
    })

    return {
      bulletins: bulletins.map(toBulletinResponse),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    }
  }

  // ── POST /bulletins ──────────────────────────────────────────────────────
  static Create = async (dto: CreateBulletinDTO, createdBy: string) => {
    const bulletin = await withUniquePublicId(
      createPublicBulletinId,
      (publicId) =>
        BulletinsRepo.create({
          publicId,
          title: dto.title,
          body: dto.body,
          sourcePartner: dto.sourcePartner ?? null,
          countries: (dto.countries ?? []).map(normalizeCountry),
          publishedAt: dto.publishedAt,
          expiresAt: dto.expiresAt ?? null,
          createdBy,
        }),
    )
    return toBulletinResponse(bulletin)
  }

  // ── PATCH /bulletins/:bulletinId ─────────────────────────────────────────
  static Update = async (publicId: string, dto: UpdateBulletinDTO) => {
    const bulletin = await BulletinsService.getOrThrow(publicId)
    const updated = await BulletinsRepo.update(bulletin.id, {
      ...dto,
      countries: dto.countries?.map(normalizeCountry),
    })
    return toBulletinResponse(updated)
  }

  // ── DELETE /bulletins/:bulletinId ────────────────────────────────────────
  static Delete = async (publicId: string) => {
    const bulletin = await BulletinsService.getOrThrow(publicId)
    await BulletinsRepo.delete(bulletin.id)
  }
}
