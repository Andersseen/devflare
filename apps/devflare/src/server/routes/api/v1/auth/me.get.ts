import { defineEventHandler, createError, getHeader } from 'h3';
import { verifyToken } from '../../../../utils/auth';
import { db } from '../../../../db';

export default defineEventHandler(async (event) => {
  const authHeader = getHeader(event, 'authorization');
  
  if (!authHeader?.startsWith('Bearer ')) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    });
  }

  const token = authHeader.slice(7);
  const payload = verifyToken(token);

  if (!payload) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid token',
    });
  }

  try {
    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(payload.userId);

    if (!user) {
      throw createError({
        statusCode: 404,
        statusMessage: 'User not found',
      });
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
      },
    };
  } catch (error) {
    console.error('Get user error:', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal server error',
    });
  }
});
