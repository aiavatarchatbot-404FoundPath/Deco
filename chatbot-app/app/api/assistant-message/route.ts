// app/api/assistant-message/route.ts
// app/api/assistant-message/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,               // same URL
  process.env.SUPABASE_SERVICE_ROLE_KEY!               // 🔒 service role — bypasses RLS
);

const BOT_USER_ID = process.env.BOT_USER_ID!;

export async function POST(req: Request) {
  try {
    const { conversationId, content } = await req.json();

    if (!conversationId || !content?.trim()) {
      return NextResponse.json({ error: "Missing conversationId or content" }, { status: 400 });
    }

    // ⚠️ sender_id must match your schema (uuid?). Use a fixed “assistant user” id, or allow NULL.
    // Easiest: make sender_id nullable in messages, or create an ASSISTANT_USER_ID env var.
    const row = {
      conversation_id: conversationId,
      role: "assistant",
      content,
      sender_id: BOT_USER_ID,   
    };

    const { data, error } = await supabase
      .from("messages")
      .insert(row)
      .select("*")
      .single();

    if (error) {
      console.error("assistant insert fail:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (e: any) {
    console.error("assistant route error:", e);
    return NextResponse.json({ error: e?.message ?? "unknown" }, { status: 500 });
  }
}
