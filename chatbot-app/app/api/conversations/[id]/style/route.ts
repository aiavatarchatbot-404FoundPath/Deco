import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  ADAM_DEFAULT, EVE_DEFAULT, NEUTRAL_DEFAULT,
  compileStyleFromText, type Persona, type StyleTokens
} from "@/lib/personas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // avoid any caching

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!   // SERVER ONLY
);

export async function PATCH(req: NextRequest, { params }: { params: { id: string }}) {
  try {
    const convoId = params.id;
    const { persona, customStyleText } =
      (await req.json().catch(() => ({}))) as { persona?: Persona; customStyleText?: string };

    if (!convoId) return NextResponse.json({ error: "Missing conversation id" }, { status: 400 });

    const { data: convo, error: selErr } = await supabase
      .from("conversations")
      .select("id, persona, style_json")
      .eq("id", convoId)
      .maybeSingle();
    if (selErr) throw selErr;
    if (!convo) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

    let base: StyleTokens =
      persona === "adam" ? ADAM_DEFAULT :
      persona === "eve"  ? EVE_DEFAULT  :
      (convo.style_json as StyleTokens | null) ?? NEUTRAL_DEFAULT;

    const tokens: StyleTokens =
      persona === "custom" && customStyleText?.trim()
        ? compileStyleFromText(customStyleText, base)
        : base;

    const { error: updErr } = await supabase
      .from("conversations")
      .update({
        persona: persona ?? (convo.persona ?? "neutral"),
        style_json: tokens,
      })
      .eq("id", convoId);
    if (updErr) throw updErr;

    return NextResponse.json({ ok: true, style: tokens });
  } catch (e: any) {
    console.error("style route error:", e);
    return NextResponse.json({ error: e?.message ?? "style error" }, { status: 400 });
  }
}
