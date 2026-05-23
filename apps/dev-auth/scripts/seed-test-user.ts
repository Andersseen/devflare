/**
 * Seed script to create a test user in the local D1 database.
 *
 * Run with the auth service already running:
 *   npx tsx apps/dev-auth/scripts/seed-test-user.ts
 *
 * Requires: Origin header (better-auth CSRF protection)
 */

const TEST_USER = {
  email: 'test@devflare.com',
  password: 'TestPass123',
  name: 'Test User',
};

const AUTH_URL = process.env['AUTH_URL'] ?? 'http://localhost:8787';

async function seed() {
  console.log('Creating test user...');
  console.log('Auth URL:', AUTH_URL);

  const response = await fetch(`${AUTH_URL}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: AUTH_URL,
    },
    body: JSON.stringify(TEST_USER),
  });

  const data = await response.json();

  if (response.ok) {
    console.log('✅ Test user created successfully!');
    console.log('');
    console.log('Credentials:');
    console.log('  Email:', TEST_USER.email);
    console.log('  Password:', TEST_USER.password);
    console.log('  User ID:', data.user?.id);
  } else if (
    data.error?.includes('already exists') ||
    data.message?.includes('already exists') ||
    data.message?.includes('already registered')
  ) {
    console.log('ℹ️  Test user already exists.');
    console.log('');
    console.log('Credentials:');
    console.log('  Email:', TEST_USER.email);
    console.log('  Password:', TEST_USER.password);
  } else {
    console.error('❌ Failed to create test user:', data.error || data.message);
    console.error('Full response:', JSON.stringify(data, null, 2));
    process.exit(1);
  }
}

seed().catch((err) => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});
