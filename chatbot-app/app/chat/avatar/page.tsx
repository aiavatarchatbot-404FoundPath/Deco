import { Suspense } from 'react';
import ClientAvatarChat from './ClientAvatarChat';
import { Loading } from "../../../components/ui/loading";

// Server-only exports are fine here:
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <ClientAvatarChat />
    </Suspense>
  );

}
