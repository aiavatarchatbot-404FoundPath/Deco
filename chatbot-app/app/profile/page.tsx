// app/profile/page.tsx
export const dynamic = 'force-dynamic'; // named config ✅

import { Suspense } from "react";
import ProfileClient from "./ProfileClient"; // make sure filename & casing match

export default function ProfilePage() {        // ✅ default export is a component
  return (
    <Suspense fallback={<div className="p-6">Loading profile…</div>}>
      <ProfileClient />
    </Suspense>
  );
}
