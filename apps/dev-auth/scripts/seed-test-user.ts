/**
 * Seed script to create a test user in the local D1 database.
 * Run with: npx tsx apps/dev-auth/scripts/seed-test-user.ts
 */

const TEST_USER = {
  email: 'test@devflare.com',
  password: 'TestPass123',
  name: 'Test User',
};

async function seed() {
  console.log('Creating test user...');

  // Use wrangler to make a request to the local dev server
  const response = await fetch('http://127.0.0.1:8787/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(TEST_USER),
  });

  const data = await response.json();

  if (response.ok) {
    console.log('✅ Test user created successfully!');
    console.log('Email:', TEST_USER.email);
    console.log('Password:', TEST_USER.password);
    console.log('User ID:', data.user?.id);
  } else if (data.error?.includes('already exists') || data.message?.includes('already exists')) {
    console.log('ℹ️  Test user already exists.');
    console.log('Email:', TEST_USER.email);
    console.log('Password:', TEST_USER.password);
  } else {
    console.error('❌ Failed to create test user:', data.error || data.message);
    process.exit(1);
  }
}

seed().catch(console.error);
