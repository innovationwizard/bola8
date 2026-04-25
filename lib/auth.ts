/**
 * Simple authentication utilities
 * For internal tool - uses session-based auth with secure cookies
 */

import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { NextResponse } from 'next/server';
import { query } from './db';
import bcrypt from 'bcryptjs';

const SECRET_KEY = new TextEncoder().encode(
  process.env.AUTH_SECRET || 'your-secret-key-change-in-production-min-32-chars'
);

const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'designer' | 'viewer';
}

export interface Session {
  user: User;
  expires: number;
}

/**
 * Create a session token for a user
 */
export async function createSession(user: User): Promise<string> {
  const expires = Date.now() + SESSION_DURATION;
  
  const token = await new SignJWT({ user, expires })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(expires / 1000))
    .sign(SECRET_KEY);

  return token;
}

/**
 * Verify and decode a session token
 */
export async function verifySession(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET_KEY);
    
    if (Date.now() > (payload.expires as number)) {
      return null; // Token expired
    }

    return {
      user: payload.user as User,
      expires: payload.expires as number,
    };
  } catch {
    return null;
  }
}

/**
 * Get current session from cookies
 */
export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('session')?.value;

  if (!token) {
    return null;
  }

  return verifySession(token);
}

/**
 * Set session cookie (for API routes)
 */
export async function setSessionCookie(token: string, response: NextResponse) {
  response.cookies.set('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_DURATION / 1000,
    path: '/',
  });
}

/**
 * Clear session cookie (for API routes)
 */
export async function clearSessionCookie(response: NextResponse) {
  response.cookies.delete('session');
}

/**
 * Authenticate user with email and password
 */
export async function authenticate(
  email: string,
  password: string
): Promise<User | null> {
  try {
    // Query user from database
    const result = await query(
      `SELECT id, email, name, role, password_hash 
       FROM users 
       WHERE email = $1 AND active = true`,
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const user = result.rows[0];

    // Verify password (using bcrypt)
    const isValid = await bcrypt.compare(password, user.password_hash);

    if (!isValid) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  } catch (error) {
    console.error('Authentication error:', error);
    return null;
  }
}

/**
 * Check if user is authenticated
 */
export async function requireAuth(): Promise<User> {
  const session = await getSession();

  if (!session) {
    throw new Error('Unauthorized');
  }

  return session.user;
}

