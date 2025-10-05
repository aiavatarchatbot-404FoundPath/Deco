// app/chat/summary/page.tsx
import { Suspense } from "react";
import SummaryClient from "./SummaryClient";

// Optional, if you want to avoid static prerender for this route:
// export const dynamic = "force-dynamic";
// export const revalidate = 0;

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6">Loading summary…</div>}>
      <SummaryClient />
    </Suspense>
  );
}
