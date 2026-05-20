/**
 * Superuser (operator) gate for /admin/* routes and pages.
 *
 * Authentication is already enforced by middleware.ts — every request reaching
 * an /admin/* route has a signed-in Supabase user. This module adds the second
 * check: is that user in the SUPERUSER_EMAILS allowlist?
 *
 * Set the env var as a comma-separated list of emails, e.g.
 *   SUPERUSER_EMAILS=jorgeluiscontrerasherrera@gmail.com,other@example.com
 *
 * If SUPERUSER_EMAILS is unset, nobody is a superuser — /admin/* returns 403 / 404.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function parseAllowlist(): Set<string> {
  const raw = process.env.SUPERUSER_EMAILS ?? '';
  return new Set(
    raw
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** Returns the signed-in user's email (lowercased) or null. */
export async function getCurrentUserEmail(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.email?.toLowerCase() ?? null;
}

/** True if the currently signed-in user's email is in SUPERUSER_EMAILS. */
export async function isSuperuser(): Promise<boolean> {
  const email = await getCurrentUserEmail();
  if (!email) return false;
  return parseAllowlist().has(email);
}

/**
 * Use in /api/admin/* route handlers. Returns null when allowed, or a 403
 * NextResponse to return early when not allowed.
 *
 *   const denied = await requireSuperuser();
 *   if (denied) return denied;
 */
export async function requireSuperuser(): Promise<NextResponse | null> {
  if (await isSuperuser()) return null;
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}
