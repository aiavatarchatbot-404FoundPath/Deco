// app/api/conversations/ensure-ownership/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Server-only admin client (bypasses RLS). Make sure this file stays server-side.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // NEVER expose this to the client
  { auth: { persistSession: false } }
);

export async function POST(req: Request) {
  try {
    const { conversationId } = await req.json();
    const userId = req.headers.get("x-user-id"); // you already send this from the client

    if (!conversationId || !userId) {
      // Nothing to do for anon / missing info; importantly, do not insert anything.
      return new NextResponse(null, { status: 204 });
    }

    // Only UPDATE existing rows — do NOT insert (prevents empty “—” convos)
    const { data: existing, error: selErr } = await supabase
      .from("conversations")
      .select("id, created_by")
      .eq("id", conversationId)
      .maybeSingle();

    if (selErr) {
      return NextResponse.json({ error: selErr.message }, { status: 500 });
    }
    if (!existing) {
      // If the row doesn't exist yet, we don't create it here.
      return new NextResponse(null, { status: 204 });
    }

    if (!existing.created_by) {
      const { error: updErr } = await supabase
        .from("conversations")
        .update({ created_by: userId })
        .eq("id", conversationId);

      if (updErr) {
        return NextResponse.json({ error: updErr.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "unknown error" }, { status: 500 });
  }
}
