"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Navbar from "../../components/Navbar";
import AvatarBuilderScreen from "../../components/AvatarBuilderScreen";
import { Loading } from "../../components/ui/loading";
import { getOrCreateSessionId } from "@/lib/session";
import type { Persona } from "@/lib/personas";

type AvatarInput = { url: string; thumbnail?: string | null };

export default function AvatarBuilderPage() {
  const router = useRouter();
  const [personaChoice, setPersonaChoice] = useState<Persona>("adam");
const [customStyleText, setCustomStyleText] = useState("");
const [styleSaving, setStyleSaving] = useState(false);


  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [navigationLoading, setNavigationLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);

  const [conversationId, setConversationId] = useState<string | null>(null);

  // avatar + tone state
  const [companionChoice, setCompanionChoice] = useState<"ADAM" | "EVE">("ADAM");

  useEffect(() => {
    async function bootstrap() {
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
            // infer companion/persona from stored URL
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

        // ensure a conversation
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

  

  // keep persona in sync if user flips companion (but don't override custom)
  useEffect(() => {
    setPersonaChoice((prev) => (prev === "custom" ? "custom" : companionChoice === "EVE" ? "eve" : "adam"));
  }, [companionChoice]);

  const handleNavigation = (screen: string) => {
    if (navigationLoading) return;
    setNavigationLoading(true);
    const timeoutId = setTimeout(() => setNavigationLoading(false), 5000);

    try {
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
          clearTimeout(timeoutId);
          setNavigationLoading(false);
      }
    } catch (error) {
      console.error("Navigation error:", error);
      clearTimeout(timeoutId);
      setNavigationLoading(false);
    }
  };

  const handleSaveAvatar = useCallback(
    async (avatar: AvatarInput) => {
      if (saveLoading) return;
      setSaveLoading(true);
      try {
        const sid = getOrCreateSessionId();

        if (isLoggedIn && user?.id) {
          const { error } = await supabase.from("profiles").update({ rpm_user_url: avatar.url }).eq("id", user.id);
          if (error) throw error;
          setUser((prev: any) => (prev ? { ...prev, rpm_user_url: avatar.url } : prev));
        } else {
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
          setUser((prev: any) => (prev ? { ...prev, rpm_user_url: avatar.url } : { rpm_user_url: avatar.url }));
        }
      } catch (e) {
        console.error("Save avatar failed:", e);
      } finally {
        setSaveLoading(false);
      }
    },
    [isLoggedIn, user, conversationId, saveLoading]
  );

  const handleSelectCompanion = useCallback(
    async (key: "ADAM" | "EVE") => {
      setCompanionChoice(key);
      if (isLoggedIn && user?.id) {
        try {
          const companionUrl =
            key === "EVE"
              ? "https://models.readyplayer.me/68be6a2ac036016545747aa9.glb"
              : "https://models.readyplayer.me/68be69db5dc0cec769cfae75.glb";
          const { error } = await supabase.from("profiles").update({ rpm_companion_url: companionUrl }).eq("id", user.id);
          if (error) console.error("Failed to save companion choice:", error);
          else setUser((prev: any) => (prev ? { ...prev, rpm_companion_url: companionUrl } : prev));
        } catch (err) {
          console.error("Error saving companion choice:", err);
        }
      }
    },
    [isLoggedIn, user?.id]
  );



async function applyStyleToConversation() {
  if (!conversationId) return;
  setStyleSaving(true);
  try {
    const body: any = { persona: personaChoice };
    if (personaChoice === "custom" && customStyleText.trim()) {
      body.customStyleText = customStyleText.trim();
    }
    const res = await fetch(`/api/conversations/${conversationId}/style`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const debug = await res.text();
    console.log("[STYLE PATCH]", res.status, debug);
  } finally {
    setStyleSaving(false);
  }
}

  const handleNavigateToChat = useCallback(async () => {
  if (!conversationId) return;

  // 🔴 THIS SAVES PERSONA/STYLE INTO DB
  await applyStyleToConversation();

  const sid = getOrCreateSessionId();
  const params = new URLSearchParams();
  if (user?.rpm_user_url) params.set("userUrl", user.rpm_user_url);
  params.set("companionName", personaChoice === "eve" ? "EVE" : "ADAM"); // optional
  params.set("convo", conversationId);
  params.set("sid", sid);
  router.push(`/chat/avatar?${params.toString()}`);
}, [conversationId, personaChoice, user]);

  // initial small reset
  useEffect(() => {
    const timer = setTimeout(() => setNavigationLoading(false), 100);
    return () => clearTimeout(timer);
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
        onNavigateToChat={handleNavigateToChat}
        user={user}
        isLoggedIn={isLoggedIn}
        onSaveAvatar={handleSaveAvatar}
        onSelectCompanion={handleSelectCompanion}
        navigationLoading={navigationLoading}
        saveLoading={saveLoading}
        // NEW
       personaChoice={personaChoice}
  setPersonaChoice={setPersonaChoice}
  customStyleText={customStyleText}
  setCustomStyleText={setCustomStyleText}
  onApplyTone={applyStyleToConversation}
  applyToneLoading={styleSaving}
      />

      {navigationLoading && <Loading message="Starting your chat experience..." />}
    </div>
  );
}
