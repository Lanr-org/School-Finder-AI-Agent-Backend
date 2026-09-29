-- Telegram students are now found through student_identities, like Google ones.
-- Separate from add_student_linking: Postgres can't use a new enum value in the
-- transaction that added it.
INSERT INTO "student_identities" ("id", "student_id", "provider", "subject", "email", "created_at")
SELECT gen_random_uuid(), s."id", 'TELEGRAM', c."provider_user_id", NULL, now()
FROM "students" s
JOIN "contacts" c ON c."id" = s."contact_id"
WHERE c."provider_type" = 'TELEGRAM'
ON CONFLICT DO NOTHING;
