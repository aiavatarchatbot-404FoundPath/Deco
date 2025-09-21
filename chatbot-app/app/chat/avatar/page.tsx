import { Suspense } from 'react';
import ClientAvatarChat from './ClientAvatarChat';

// Server-only exports are fine here:
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6">Loading chat…</div>}>
      <ClientAvatarChat />
    </Suspense>
  );
}
