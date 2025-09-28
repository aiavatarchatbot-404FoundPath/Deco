"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Navbar from "../../components/Navbar";
import AvatarBuilderScreen from "../../components/AvatarBuilderScreen";
import { getOrCreateSessionId } from "@/lib/session";
import { Loading } from "../../components/ui/loading";

type AvatarInput = { url: string; thumbnail?: string | null };

export default function AvatarBuilderPage() {
  const router = useRouter();

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // user’s own avatar that gets saved (via Supabase or temp)
  const [conversationId, setConversationId] = useState<string | null>(null);

  // NEW: which AI companion did the user pick? (hardcoded URLs later)
  const [companionChoice, setCompanionChoice] = useState<"ADAM" | "EVE">("ADAM");

  useEffect(() => {
    async function bootstrap() {
      try {
        // ---- load session & profile (your original logic) ----
        const { data: { session } } = await supabase.auth.getSession();
        const currentUser = session?.user ?? null;

        if (!currentUser) {
          setIsLoggedIn(false);
          setUser(null);
        } else {
          setIsLoggedIn(true);
          const { data: profile } = await supabase
            .from("profiles")
            .select(
              "id, username, full_name, avatar_url, session_mode, rpm_user_url, rpm_companion_url"
            )
            .eq("id", currentUser.id)
            .maybeSingle();

          if (profile) {
            setUser(profile);
          } else {
            setUser({
              id: currentUser.id,
              username: currentUser.email?.split("@")[0] || "User",
              rpm_user_url: null,
              rpm_companion_url: null,
            });
          }
        }

        // ---- always ensure a conversation (works for both anon & logged-in) ----
        const res = await fetch("/api/conversations", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title: "Avatar Builder" }),
        });
        const json = await res.json();
        if (res.ok && json?.id) {
          setConversationId(json.id as string);
        } else {
          console.error("Failed to create conversation:", json?.error || res.statusText);
        }
      } catch (err) {
        console.error("Error bootstrapping avatar builder:", err);
      } finally {
        setLoading(false);
      }
    }

    bootstrap();
  }, []);

  const handleNavigation = (screen: string) => {
    switch (screen) {
      case "settings":
        router.push("/settings");
        break;
      case "profile":
        router.push("/profile");
        break;
      case "home":
      case "/":
      case "welcome":
        router.push("/");
        break;
      case "chat":
        router.push("/chat/avatar");
        break;
      default:
        console.log("Navigate to:", screen);
    }
  };

  // SAVE user avatar (not the companion):
  // - Logged-in → write to profile
  // - Anonymous → POST to /api/temp-avatars with { conversationId, sessionId, rpmUrl, thumbnail }
  const handleSaveAvatar = useCallback(
    async (avatar: AvatarInput) => {
      try {
        const sid = getOrCreateSessionId();

        if (isLoggedIn && user?.id) {
          // Persist to profile
          const { error } = await supabase
            .from("profiles")
            .update({ rpm_user_url: avatar.url })
            .eq("id", user.id);
          if (error) throw error;

          setUser((prev: any) => (prev ? { ...prev, rpm_user_url: avatar.url } : prev));
        } else {
          // Anonymous: store TEMP row server-side so it can be auto-purged on end-chat
          if (!conversationId) {
            console.warn("No conversation yet; cannot save temporary avatar.");
            return;
          }
          const res = await fetch("/api/temp-avatars", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              conversationId,
              sessionId: sid,
              rpmUrl: avatar.url,
              thumbnail: avatar.thumbnail ?? null,
            }),
          });
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            throw new Error(j?.error || "temp avatar save failed");
          }

          // echo for UI
          setUser((prev: any) =>
            prev ? { ...prev, rpm_user_url: avatar.url } : { rpm_user_url: avatar.url }
          );
        }
      } catch (e) {
        console.error("Save avatar failed:", e);
      }
    },
    [isLoggedIn, user, conversationId]
  );

  // If your builder lets the user tap "Adam" / "Eve", call this
  const handleSelectCompanion = useCallback((key: "ADAM" | "EVE") => {
    setCompanionChoice(key);
  }, []);

  // GO TO CHAT:
  // pass userUrl (from profile or temp), the companion *name* (ADAM/EVE), plus convo + sid.
  const handleNavigateToChat = useCallback(() => {
    const sid = getOrCreateSessionId();
    const params = new URLSearchParams();

    // User avatar (from profile or the local echo after temp save)
    if (user?.rpm_user_url) params.set("userUrl", user.rpm_user_url);

    // Tell chat which companion: ADAM or EVE (chat will map to a hardcoded URL)
    params.set("companionName", companionChoice);

    if (conversationId) params.set("convo", conversationId);
    params.set("sid", sid);

    const qs = params.toString();
    router.push(`/chat/avatar${qs ? `?${qs}` : ""}`);
  }, [user, companionChoice, conversationId, router]);

  if (loading) {
    return <Loading />;
  }

  return (
    <div>
      <Navbar onNavigate={handleNavigation} isLoggedIn={isLoggedIn} />

      <AvatarBuilderScreen
        onNavigate={handleNavigation}
        onNavigateToChat={handleNavigateToChat}
        user={user}
        onSaveAvatar={handleSaveAvatar}
        onSelectCompanion={handleSelectCompanion} // This now correctly matches the updated AvatarBuilderScreenProps
      />
    </div>
  );
}