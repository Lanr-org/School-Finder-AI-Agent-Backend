process.env.NODE_ENV ??= 'test'
process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/test'
process.env.COOKIE_SECRET ??= 'test-cookie-secret'
process.env.JWT_SECRET ??= 'test-jwt-secret'
process.env.DOCS_ENABLED ??= 'false'
process.env.FRONTEND_URL ??= 'http://localhost:5173'
process.env.EMAIL_FROM ??= 'Smetase <no-reply@example.com>'
