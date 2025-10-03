// app/api/conversations/ensure-ownership/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// Service-role on the server
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const { conversationId } = await req.json();
    const userId = req.headers.get("x-user-id") || undefined;

    if (!conversationId || !userId) {
      return NextResponse.json(
        { error: "conversationId and x-user-id are required" },
        { status: 400 }
      );
    }

    // 1) Read existing conversation (if any)
    const { data: convo, error: selErr } = await supabase
      .from("conversations")
      .select("id, created_by")
      .eq("id", conversationId)
      .maybeSingle();

    if (selErr) {
      console.error("ensure-ownership select error:", selErr);
      return NextResponse.json({ error: "select failed" }, { status: 500 });
    }

    let created = false;
    let updatedOwner = false;

    // 2) Create or set owner if missing
    if (!convo) {
      const { error: insErr } = await supabase
        .from("conversations")
        .insert({ id: conversationId, created_by: userId, summary: "" });
      if (insErr) {
        console.error("ensure-ownership insert error:", insErr);
        return NextResponse.json({ error: "insert failed" }, { status: 500 });
      }
      created = true;
    } else if (!convo.created_by) {
      const { error: updErr } = await supabase
        .from("conversations")
        .update({ created_by: userId })
        .eq("id", conversationId);
      if (updErr) {
        console.error("ensure-ownership update owner error:", updErr);
        return NextResponse.json({ error: "update owner failed" }, { status: 500 });
      }
      updatedOwner = true;
    } else if (convo.created_by !== userId) {
      // Different owner already set — do not transfer here (use claim flow if needed)
      return NextResponse.json(
        { ok: false, reason: "owned_by_another_user", owner: convo.created_by },
        { status: 403 }
      );
    }

    // 3) Data clean-up: set sender_id on any user messages that were inserted with NULL
    // (harmless if none match)
    const { error: fixErr } = await supabase
      .from("messages")
      .update({ sender_id: userId })
      .eq("conversation_id", conversationId)
      .eq("role", "user")
      .is("sender_id", null); // only rows where sender_id is NULL

    if (fixErr) {
      // not fatal; log and continue
      console.warn("ensure-ownership message reattribute warn:", fixErr);
    }

    return NextResponse.json({
      ok: true,
      created,
      updatedOwner,
    });
  } catch (e: any) {
    console.error("ensure-ownership route error:", e);
    return NextResponse.json(
      { error: e?.message ?? "error" },
      { status: 400 }
    );
  }
}

