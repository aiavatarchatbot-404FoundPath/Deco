import { Suspense } from "react";
import ClientSimpleChat from "./ClientSimpleChat";
import { Loading } from "../../../components/ui/loading";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <ClientSimpleChat />
    </Suspense>
  );
}
