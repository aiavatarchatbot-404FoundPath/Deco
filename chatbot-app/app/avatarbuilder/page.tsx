/// app/avatarbuilder/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Navbar from "../../components/Navbar";
import AvatarBuilderScreen from "../../components/AvatarBuilderScreen";
import { Loading } from "../../components/ui/loading";
import { getOrCreateSessionId } from "@/lib/session";
import type { Persona } from "@/lib/personas";

type AvatarInput = { url: string; thumbnail?: string | null };

const LS_AVATAR_CONVO_KEY = "avatar:conversation_id";

export default function AvatarBuilderPage() {
  const router = useRouter();

  // persona/tone
  const [personaChoice, setPersonaChoice] = useState<Persona>("adam");
  const [customStyleText, setCustomStyleText] = useState("");
  const [styleSaving, setStyleSaving] = useState(false);

  // auth/profile
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState<any>(null);

  // ui
  const [loading, setLoading] = useState(true);
  const [navigationLoading, setNavigationLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);

  // current companion card
  const [companionChoice, setCompanionChoice] = useState<"ADAM" | "EVE">("ADAM");

  // guard to prevent double-create if user double-clicks
  const createInFlight = useRef(false);

  /** ---------- auth/profile ---------- */
  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const currentUser = session?.user ?? null;

        if (!currentUser) {
          setIsLoggedIn(false);
          setUser(null);
        } else {
          setIsLoggedIn(true);
          const { data: profile } = await supabase
            .from("profiles")
            .select("id, username, full_name, avatar_url, session_mode, rpm_user_url, rpm_companion_url")
            .eq("id", currentUser.id)
            .maybeSingle();

          if (profile) {
            setUser(profile);
            if (profile.rpm_companion_url) {
              if (profile.rpm_companion_url.includes("68be6a2ac036016545747aa9")) {
                setCompanionChoice("EVE");
                if (personaChoice !== "custom") setPersonaChoice("eve");
              } else if (profile.rpm_companion_url.includes("68be69db5dc0cec769cfae75")) {
                setCompanionChoice("ADAM");
                if (personaChoice !== "custom") setPersonaChoice("adam");
              }
            }
          } else {
            setUser({
              id: currentUser.id,
              username: currentUser.email?.split("@")[0] || "User",
              rpm_user_url: null,
              rpm_companion_url: null,
            });
          }
        }
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** ---------- persona sync with companion (unless custom) ---------- */
  useEffect(() => {
    setPersonaChoice((prev) =>
      prev === "custom" ? "custom" : companionChoice === "EVE" ? "eve" : "adam"
    );
  }, [companionChoice]);

  /** ---------- simple navbar navigation ---------- */
  const handleNavigation = (screen: string) => {
    if (navigationLoading) return;
    setNavigationLoading(true);
    const timeoutId = setTimeout(() => setNavigationLoading(false), 5000);

    try {
      switch (screen) {
        case "settings": router.push("/settings"); break;
        case "profile":  router.push("/profile"); break;
        case "home":
        case "/":
        case "welcome":  router.push("/"); break;
        case "chat":
          // prefer the Start button below, but keep a safe fallback
          handleNavigateToChat().catch(() => {});
          break;
        default:
          clearTimeout(timeoutId);
          setNavigationLoading(false);
      }
    } catch {
      clearTimeout(timeoutId);
      setNavigationLoading(false);
    }
  };

  /** ---------- save avatar (user or anon) ---------- */
  const handleSaveAvatar = useCallback(
    async (avatar: AvatarInput) => {
      if (saveLoading) return;
      setSaveLoading(true);
      try {
        const sid = getOrCreateSessionId();

        if (isLoggedIn && user?.id) {
          const { error } = await supabase
            .from("profiles")
            .update({ rpm_user_url: avatar.url })
            .eq("id", user.id);
          if (error) throw error;
          setUser((prev: any) => (prev ? { ...prev, rpm_user_url: avatar.url } : prev));
        } else {
          // store anon temp avatar against *latest* conversation if needed later
          const convoId = localStorage.getItem(LS_AVATAR_CONVO_KEY);
          if (!convoId) {
            console.warn("No conversation yet; will attach temp avatar after chat starts.");
          } else {
            const res = await fetch("/api/temp-avatars", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                conversationId: convoId,
                sessionId: sid,
                rpmUrl: avatar.url,
                thumbnail: avatar.thumbnail ?? null,
              }),
            });
            if (!res.ok) {
              const j = await res.json().catch(() => ({}));
              throw new Error(j?.error || "temp avatar save failed");
            }
          }
          setUser((prev: any) =>
            prev ? { ...prev, rpm_user_url: avatar.url } : { rpm_user_url: avatar.url }
          );
        }
      } catch (e) {
        console.error("Save avatar failed:", e);
      } finally {
        setSaveLoading(false);
      }
    },
    [isLoggedIn, user, saveLoading]
  );

  /** ---------- save companion when authed ---------- */
  const handleSelectCompanion = useCallback(
    async (key: "ADAM" | "EVE") => {
      setCompanionChoice(key);
      if (isLoggedIn && user?.id) {
        try {
          const companionUrl =
            key === "EVE"
              ? "https://models.readyplayer.me/68be6a2ac036016545747aa9.glb"
              : "https://models.readyplayer.me/68be69db5dc0cec769cfae75.glb";
          const { error } = await supabase
            .from("profiles")
            .update({ rpm_companion_url: companionUrl })
            .eq("id", user.id);
          if (error) console.error("Failed to save companion choice:", error);
          else setUser((prev: any) => (prev ? { ...prev, rpm_companion_url: companionUrl } : prev));
        } catch (err) {
          console.error("Error saving companion choice:", err);
        }
      }
    },
    [isLoggedIn, user?.id]
  );

  /** ---------- apply style to a specific conversation ---------- */
  async function applyStyleToConversationFor(convoId: string) {
    setStyleSaving(true);
    try {
      const body: any = { persona: personaChoice };
      if (personaChoice === "custom" && customStyleText.trim()) {
        body.customStyleText = customStyleText.trim();
      }
      await fetch(`/api/conversations/${convoId}/style`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } finally {
      setStyleSaving(false);
    }
  }

  /** ---------- Start Chat: create ONE conversation, then go ---------- */
  const handleNavigateToChat = useCallback(async () => {
    if (createInFlight.current) return;        // guard double-clicks
    createInFlight.current = true;
    setNavigationLoading(true);

    try {
      // 1) Create ONE new conversation
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Avatar Builder", chat_mode: "avatar" }),
      });
      const json = await res.json();
      if (!res.ok || !json?.id) throw new Error(json?.error || "Failed to create conversation");
      const convoId: string = json.id;

      // 2) persist newest id so anon temp avatar (if any) can attach
      localStorage.setItem(LS_AVATAR_CONVO_KEY, convoId);

      // 3) Apply style/persona to THIS conversation
      await applyStyleToConversationFor(convoId);

      // 4) Navigate to chat with this id (and new=1 so the chat page ignores any old local id)
      const sid = getOrCreateSessionId();
      const params = new URLSearchParams();
      if (user?.rpm_user_url) params.set("userUrl", user.rpm_user_url);
      params.set("companionName", personaChoice === "eve" ? "EVE" : "ADAM");
      params.set("convo", convoId);
      params.set("sid", sid);
      params.set("new", "1");
      router.push(`/chat/avatar?${params.toString()}`);
    } catch (e) {
      console.error("Start chat failed:", e);
      setNavigationLoading(false);
      createInFlight.current = false;
      return;
    }
    // don’t reset here; we’re leaving the page
  }, [personaChoice, customStyleText, user, router]);

  /** ---------- small reset ---------- */
  useEffect(() => {
    const t = setTimeout(() => setNavigationLoading(false), 100);
    return () => clearTimeout(t);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loading message="Loading" />
      </div>
    );
  }

  return (
    <div>
      <Navbar onNavigate={handleNavigation} isLoggedIn={isLoggedIn} isLoading={navigationLoading} />

      <AvatarBuilderScreen
        onNavigate={handleNavigation}
        onNavigateToChat={handleNavigateToChat}  // ⬅️ creates ONE convo then routes
        user={user}
        isLoggedIn={isLoggedIn}
        onSaveAvatar={handleSaveAvatar}
        onSelectCompanion={handleSelectCompanion}
        navigationLoading={navigationLoading}
        saveLoading={saveLoading}
        // tone controls
        personaChoice={personaChoice}
        setPersonaChoice={setPersonaChoice}
        customStyleText={customStyleText}
        setCustomStyleText={setCustomStyleText}
        onApplyTone={() => applyStyleToConversationFor(localStorage.getItem(LS_AVATAR_CONVO_KEY) || "")}
        applyToneLoading={styleSaving}
      />

      {navigationLoading && <Loading message="Starting your chat experience..." />}
    </div>
  );
}
