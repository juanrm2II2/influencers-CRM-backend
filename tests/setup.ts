// Set environment variables before any module imports
process.env.SUPABASE_URL = 'https://test-project.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_JWT_SECRET = 'test-jwt-secret-key-for-testing-purposes';
process.env.SCRAPECREATORS_API_KEY = 'test-scrape-api-key';
process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';
process.env.PORT = '0'; // Use random port in tests
