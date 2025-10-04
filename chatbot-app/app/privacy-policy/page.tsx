// app/privacy-policy/page.tsx
export const dynamic = 'force-dynamic';

import { Suspense } from "react";
import PrivacyClient from "./PrivacyClient";

export default function PrivacyPolicyPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading privacy policy…</div>}>
      <PrivacyClient />
    </Suspense>
  );
}
