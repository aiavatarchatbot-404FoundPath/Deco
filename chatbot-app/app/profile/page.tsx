import { Suspense } from "react";
import ProfileClient from "./ProfileClient";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6">Loading profile…</div>}>
      <ProfileClient />
    </Suspense>
  );
}
