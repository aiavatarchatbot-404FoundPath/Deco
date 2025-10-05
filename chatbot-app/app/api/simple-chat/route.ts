import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import OpenAI from "openai";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const CHAT_MODEL = process.env.CHAT_MODEL || "gpt-4o-mini";

type PostBody = {
  conversationId?: string;
  content: string;
};

async function ensureUserId(): Promise<string> {
  const store = cookies();
  let uid = store.get("uid")?.value;
  if (!uid) {
    uid = crypto.randomUUID();
    // Create a lightweight anonymous profile row (id only)
    await supabaseAdmin.from("profiles").upsert({ id: uid, is_anonymous: true });
    store.set("uid", uid, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365, // 1 year
      path: "/",
    });
  }
  return uid;
}

async function ensureConversation(userId: string, conversationId?: string) {
  if (conversationId) {
    // sanity check it belongs to the same user (optional, safe if service key)
    const { data, error } = await supabaseAdmin
      .from("conversations")
      .select("id, user_id")
      .eq("id", conversationId)
      .single();
    if (error) throw error;
    if (data?.user_id !== userId) {
      throw new Error("Conversation does not belong to this user.");
    }
    return conversationId;
  }

  const { data, error } = await supabaseAdmin
    .from("conversations")
    .insert({ user_id: userId, title: "New chat" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function insertUserMessage(conversationId: string, userId: string, content: string) {
  const { data, error } = await supabaseAdmin
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: userId,
      role: "user",
      content,
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id as string;
}

// ----- Optional RAG retrieval (stub calls RPC if you have one) -----
async function retrieveContext(userId: string, query: string): Promise<string> {
  // If you have an RPC like: match_file_chunks(query, user_id, match_count)
  try {
    const { data, error } = await supabaseAdmin.rpc("match_file_chunks", {
      query,
      user_id: userId,
      match_count: 5,
    });
    if (error || !Array.isArray(data) || data.length === 0) return "";
    const top = (data as any[])
      .map((r) => r.content || r.chunk || "")
      .filter(Boolean)
      .slice(0, 5)
      .join("\n---\n");
    return top;
  } catch {
    return ""; // safe no-context fallback
  }
}

async function insertAssistantMessage(conversationId: string, userId: string, content: string) {
  const { data, error } = await supabaseAdmin
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: userId, // you can also store a special assistant id if you have one
      role: "assistant",
      content,
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id as string;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as PostBody;
    if (!body.content || typeof body.content !== "string") {
      return NextResponse.json({ error: "Missing 'content'." }, { status: 400 });
    }

    const userId = await ensureUserId();
    const conversationId = await ensureConversation(userId, body.conversationId);

    // 1) store user message
    const userMessageId = await insertUserMessage(conversationId, userId, body.content);

    // 2) RAG context (optional)
    const context = await retrieveContext(userId, body.content);

    // 3) LLM call
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
    const sys = `You are a helpful assistant. If context is provided, prefer it. If not, answer normally. Keep replies concise.`;
    const prompt = context
      ? `Context:\n${context}\n\nUser: ${body.content}`
      : body.content;

    const chat = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
    });

    const assistant = chat.choices?.[0]?.message?.content?.trim() || "Sorry, I couldn't generate a response.";

    // 4) store assistant message
    const assistantMessageId = await insertAssistantMessage(conversationId, userId, assistant);

    return NextResponse.json({
      conversationId,
      userMessageId,
      assistantMessageId,
      assistant,
    });
  } catch (err: any) {
    console.error("simple-chat error:", err);
    return NextResponse.json(
      { error: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
