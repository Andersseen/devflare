import { defineEventHandler, readBody, createError } from 'h3';
import { hashPassword, generateToken } from '../../../../utils/auth';
import { randomUUID } from 'crypto';
import { db } from '../../../../db';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { email, password, name } = body;

  if (!email || !password || !name) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Email, password, and name are required',
    });
  }

  if (password.length < 8) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Password must be at least 8 characters',
    });
  }

  try {
    // Check if user exists
    const existingUser = await db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    if (existingUser) {
      throw createError({
        statusCode: 409,
        statusMessage: 'User already exists',
      });
    }

    // Hash password and create user
    const passwordHash = await hashPassword(password);
    const userId = randomUUID();

    await db.prepare(`
      INSERT INTO users (id, email, name, passwordHash, createdAt)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, email, name, passwordHash, new Date().toISOString());

    // Generate token
    const token = generateToken(userId);

    return {
      user: {
        id: userId,
        email,
        name,
        avatar: null,
      },
      token,
    };
  } catch (error) {
    console.error('Registration error:', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal server error',
    });
  }
});
