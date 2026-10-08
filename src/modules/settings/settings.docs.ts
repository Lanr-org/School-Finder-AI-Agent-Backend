import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import { SettingsSchemas } from './settings.schemas'
import {
  emptySuccessResponseSchema,
  errorContent,
  successEnvelope,
} from '../../docs/registry'

export const registerSettingsDocs = (registry: OpenAPIRegistry) => {
  // Mirrors toValueResponse / toGroupResponse (settings.service.ts).
  const valueSchema = z.object({
    id: z.string().uuid(),
    key: z.string().openapi({
      description: 'Slug derived from the label at creation; never changes.',
    }),
    label: z.string(),
    isActive: z.boolean(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  const groupSchema = z.object({
    key: z.enum(['countries', 'categories', 'study-levels']),
    label: z.string(),
    values: z.array(valueSchema),
  })

  const groupListResponseSchema = registry.register(
    'SettingGroupListResponse',
    successEnvelope(z.array(groupSchema)),
  )
  const groupResponseSchema = registry.register(
    'SettingGroupResponse',
    successEnvelope(groupSchema),
  )
  const valueResponseSchema = registry.register(
    'SettingValueResponse',
    successEnvelope(valueSchema),
  )

  const registeredGroupKeyParamsSchema = registry.register(
    'SettingGroupKeyParams',
    SettingsSchemas.groupKeyParamsSchema,
  )
  const registeredValueIdParamsSchema = registry.register(
    'SettingValueIdParams',
    SettingsSchemas.valueIdParamsSchema,
  )
  const registeredCreateValueSchema = registry.register(
    'CreateSettingValueRequest',
    SettingsSchemas.createValueSchema,
  )
  const registeredUpdateValueSchema = registry.register(
    'UpdateSettingValueRequest',
    SettingsSchemas.updateValueSchema,
  )

  const unauthorized = errorContent('Bearer token is missing or invalid.')
  const adminOnly = errorContent('Only ADMIN may manage setting values.')
  const READ_ROLES =
    'Requires a bearer access token. Allowed roles: ADMIN, ADVISOR, OPERATIONS (these lists populate dropdowns across the app).'
  const ADMIN_ONLY =
    'Requires a bearer access token. Allowed roles: ADMIN only.'

  registry.registerPath({
    method: 'get',
    path: '/api/v1/settings',
    tags: ['Settings'],
    security: [{ bearerAuth: [] }],
    summary: 'List setting groups and their values',
    description: `${READ_ROLES} Groups (countries, categories, study-levels) are fixed; only their values are managed. Includes disabled values.`,
    responses: {
      200: {
        description: 'Setting groups retrieved.',
        content: { 'application/json': { schema: groupListResponseSchema } },
      },
      401: unauthorized,
    },
  })

  registry.registerPath({
    method: 'get',
    path: '/api/v1/settings/{groupKey}',
    tags: ['Settings'],
    security: [{ bearerAuth: [] }],
    summary: 'Get one setting group',
    description: READ_ROLES,
    request: { params: registeredGroupKeyParamsSchema },
    responses: {
      200: {
        description: 'Setting group retrieved.',
        content: { 'application/json': { schema: groupResponseSchema } },
      },
      400: errorContent('Unknown group key.'),
      401: unauthorized,
      404: errorContent('Setting group not found.'),
    },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/v1/settings/{groupKey}/values',
    tags: ['Settings'],
    security: [{ bearerAuth: [] }],
    summary: 'Add a value to a setting group',
    description: `${ADMIN_ONLY} The key is slugified from the label. Audited as setting.value_created.`,
    request: {
      params: registeredGroupKeyParamsSchema,
      body: {
        required: true,
        content: {
          'application/json': { schema: registeredCreateValueSchema },
        },
      },
    },
    responses: {
      201: {
        description: 'Value created.',
        content: { 'application/json': { schema: valueResponseSchema } },
      },
      400: errorContent('Request validation failed.'),
      401: unauthorized,
      403: adminOnly,
      404: errorContent('Setting group not found.'),
      409: errorContent('A value with this name already exists in this group.'),
    },
  })

  registry.registerPath({
    method: 'patch',
    path: '/api/v1/settings/{groupKey}/values/{valueId}',
    tags: ['Settings'],
    security: [{ bearerAuth: [] }],
    summary: 'Rename, disable, or re-enable a value',
    description: `${ADMIN_ONLY} At least one of label or isActive is required. Renaming never changes the key. Audited as setting.value_updated.`,
    request: {
      params: registeredValueIdParamsSchema,
      body: {
        required: true,
        content: {
          'application/json': { schema: registeredUpdateValueSchema },
        },
      },
    },
    responses: {
      200: {
        description: 'Value updated.',
        content: { 'application/json': { schema: valueResponseSchema } },
      },
      400: errorContent('Request validation failed.'),
      401: unauthorized,
      403: adminOnly,
      404: errorContent('Setting group or value not found.'),
    },
  })

  registry.registerPath({
    method: 'delete',
    path: '/api/v1/settings/{groupKey}/values/{valueId}',
    tags: ['Settings'],
    security: [{ bearerAuth: [] }],
    summary: 'Delete a disabled value',
    description: `${ADMIN_ONLY} A value must be disabled first (isActive false) before it can be deleted. Audited as setting.value_deleted.`,
    request: { params: registeredValueIdParamsSchema },
    responses: {
      200: {
        description: 'Value deleted.',
        content: {
          'application/json': { schema: emptySuccessResponseSchema },
        },
      },
      400: errorContent('Path parameter validation failed.'),
      401: unauthorized,
      403: adminOnly,
      404: errorContent('Setting group or value not found.'),
      409: errorContent('Disable this value before deleting it.'),
    },
  })
}
