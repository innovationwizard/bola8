/**
 * /admin/usage — operator dashboard.
 *
 * Server shell. Verifies the requester is in SUPERUSER_EMAILS via isSuperuser()
 * before rendering anything. Non-superusers get a 404 (we deliberately don't
 * reveal that the page exists). Data fetching + pagination live in the client
 * component below.
 */

import { notFound }       from 'next/navigation';
import { isSuperuser }    from '@/lib/superuser';
import UsageDashboard     from './UsageDashboard';

export const dynamic = 'force-dynamic';

export default async function AdminUsagePage() {
  if (!(await isSuperuser())) notFound();
  return <UsageDashboard />;
}
