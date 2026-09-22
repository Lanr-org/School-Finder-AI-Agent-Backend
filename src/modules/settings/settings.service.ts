import { createError } from '../../common/errors/AppError.js'
import { slugify } from '../../common/utils/slugify.js'
import {
  Prisma,
  type SettingGroup,
  type SettingValue,
} from '../../generated/prisma/index.js'
import { SettingsRepo } from './settings.repository.js'
import type {
  CreateSettingValueDTO,
  UpdateSettingValueDTO,
} from './settings.types.js'

const toValueResponse = (value: SettingValue) => ({
  id: value.id,
  key: value.key,
  label: value.label,
  isActive: value.is_active,
  createdAt: value.created_at,
  updatedAt: value.updated_at,
})

const toGroupResponse = (group: SettingGroup & { values: SettingValue[] }) => ({
  key: group.key,
  label: group.label,
  values: group.values.map(toValueResponse),
})

const isUniqueConstraintError = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002'

export class SettingsService {
  private static getGroupOrThrow = async (groupKey: string) => {
    const group = await SettingsRepo.findGroupByKey(groupKey)
    if (!group) {
      throw createError('Setting group not found', 404, {}, 'NOT_FOUND')
    }
    return group
  }

  private static getValueOrThrow = async (
    groupKey: string,
    valueId: string,
  ) => {
    const group = await SettingsService.getGroupOrThrow(groupKey)
    const value = await SettingsRepo.findValueInGroup(group.id, valueId)
    if (!value) {
      throw createError('Setting value not found', 404, {}, 'NOT_FOUND')
    }
    return value
  }

  // ── GET /settings ────────────────────────────────────────────────────────
  static ListGroups = async () => {
    const groups = await SettingsRepo.findAllGroupsWithValues()
    return groups.map(toGroupResponse)
  }

  // ── GET /settings/:groupKey ──────────────────────────────────────────────
  static GetGroup = async (groupKey: string) => {
    const group = await SettingsRepo.findGroupByKeyWithValues(groupKey)
    if (!group) {
      throw createError('Setting group not found', 404, {}, 'NOT_FOUND')
    }
    return toGroupResponse(group)
  }

  // ── POST /settings/:groupKey/values ──────────────────────────────────────
  static CreateValue = async (groupKey: string, dto: CreateSettingValueDTO) => {
    const group = await SettingsService.getGroupOrThrow(groupKey)
    const key = slugify(dto.label)

    try {
      const value = await SettingsRepo.createValue(group.id, {
        key,
        label: dto.label,
      })
      return toValueResponse(value)
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw createError(
          'A value with this name already exists in this group',
          409,
          { label: dto.label },
          'CONFLICT',
        )
      }
      throw error
    }
  }

  // ── PATCH /settings/:groupKey/values/:valueId ────────────────────────────
  // Note: label edits never recompute `key` (it's immutable after creation),
  // so there's no unique-constraint path to catch here.
  static UpdateValue = async (
    groupKey: string,
    valueId: string,
    dto: UpdateSettingValueDTO,
  ) => {
    await SettingsService.getValueOrThrow(groupKey, valueId)
    const updated = await SettingsRepo.updateValue(valueId, dto)
    return toValueResponse(updated)
  }

  // ── DELETE /settings/:groupKey/values/:valueId ───────────────────────────
  static DeleteValue = async (groupKey: string, valueId: string) => {
    const value = await SettingsService.getValueOrThrow(groupKey, valueId)

    if (value.is_active) {
      throw createError(
        'Disable this value before deleting it',
        409,
        {},
        'CONFLICT',
      )
    }

    await SettingsRepo.deleteValue(valueId)
  }
}
