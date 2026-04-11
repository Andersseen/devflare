import { createHash, randomBytes, timingSafeEqual } from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const hash = createHash('sha256')
    .update(password + salt)
    .digest('hex');
  return `${salt}:${hash}`;
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const [salt, expectedHash] = hash.split(':');
  if (!salt || !expectedHash) return false;
  const actualHash = createHash('sha256')
    .update(password + salt)
    .digest('hex');
  try {
    return timingSafeEqual(Buffer.from(expectedHash), Buffer.from(actualHash));
  } catch {
    return false;
  }
}

export function generateToken(userId: string): string {
  const header = JSON.stringify({ alg: 'HS256', typ: 'JWT' });
  const payload = JSON.stringify({
    userId,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  const base64Header = Buffer.from(header).toString('base64url');
  const base64Payload = Buffer.from(payload).toString('base64url');
  const signature = createHash('sha256')
    .update(`${base64Header}.${base64Payload}.${JWT_SECRET}`)
    .digest('base64url');

  return `${base64Header}.${base64Payload}.${signature}`;
}

export function verifyToken(token: string): { userId: string } | null {
  try {
    const [header, payload, signature] = token.split('.');
    if (!header || !payload || !signature) return null;
    
    const expectedSignature = createHash('sha256')
      .update(`${header}.${payload}.${JWT_SECRET}`)
      .digest('base64url');

    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      return null;
    }

    const decodedPayload = JSON.parse(Buffer.from(payload, 'base64url').toString());
    
    if (decodedPayload.exp < Date.now()) {
      return null;
    }

    return { userId: decodedPayload.userId };
  } catch {
    return null;
  }
}
