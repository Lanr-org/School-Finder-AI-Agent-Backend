import { OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi'
import { registry } from './registry'
import { registerAuthDocs } from '../modules/auth/auth.docs'
import { registerTeamDocs } from '../modules/team/team.docs'
import { registerSchoolsDocs } from '../modules/schools/schools.docs'
import { registerProgramsDocs } from '../modules/programs/programs.docs'
import { registerStudentsDocs } from '../modules/students/students.docs'
import { registerNotesDocs } from '../modules/students/notes.docs'
import { registerFollowUpsDocs } from '../modules/followUps/followUps.docs'
import { registerAdvisorsDocs } from '../modules/advisors/advisors.docs'
import { registerConversationsDocs } from '../modules/conversations/conversations.docs'
import { registerRecommendationsDocs } from '../modules/recommendations/recommendations.docs'
import { registerSettingsDocs } from '../modules/settings/settings.docs'
import { registerBulletinsDocs } from '../modules/bulletins/bulletins.docs'
import { registerVisaRatesDocs } from '../modules/visaRates/visaRates.docs'
import { registerTelegramDocs } from '../integrations/telegram/telegram.docs'
import { registerApplicationsDocs } from '../modules/applications/applications.docs'
import { registerAuditDocs } from '../modules/audit/audit.docs'
import { registerHealthDocs } from '../modules/health/health.docs'

// Every feature documents its own routes in src/modules/<feature>/<feature>.docs.ts.
// Order is fixed here; features that share a registered component receive it
// from the feature that registers it.
registerAuthDocs(registry)
registerTeamDocs(registry)
const { registeredSchoolIdParamsSchema } = registerSchoolsDocs(registry)
registerProgramsDocs(registry, { registeredSchoolIdParamsSchema })
const { registeredStudentIdParamsSchema, studentListResponseSchema } =
  registerStudentsDocs(registry)
registerNotesDocs(registry, { registeredStudentIdParamsSchema })
const { followUpListResponseSchema, registeredListFollowUpsQuerySchema } =
  registerFollowUpsDocs(registry, { registeredStudentIdParamsSchema })
registerApplicationsDocs(registry, { registeredStudentIdParamsSchema })
registerAdvisorsDocs(registry, {
  studentListResponseSchema,
  followUpListResponseSchema,
  registeredListFollowUpsQuerySchema,
})
registerConversationsDocs(registry)
registerRecommendationsDocs(registry, { registeredStudentIdParamsSchema })
registerSettingsDocs(registry)
registerBulletinsDocs(registry)
registerVisaRatesDocs(registry)
registerAuditDocs(registry)
registerHealthDocs(registry)
registerTelegramDocs(registry)

export const openApiDocument = new OpenApiGeneratorV31(
  registry.definitions,
).generateDocument({
  openapi: '3.1.0',
  info: {
    title: 'School Finder Backend API',
    version: '1.0.0',
  },
  servers: [
    {
      url: '/api/v1',
      description: 'Current API version',
    },
  ],
})
