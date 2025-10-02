"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Navbar from "../../components/Navbar";
import AvatarBuilderScreen from "../../components/AvatarBuilderScreen";
import { Loading } from "../../components/ui/loading"; // 
import { getOrCreateSessionId } from "@/lib/session";

type AvatarInput = { url: string; thumbnail?: string | null };

export default function AvatarBuilderPage() {
  const router = useRouter();

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [navigationLoading, setNavigationLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);

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
            // Set companion choice based on stored URL
            if (profile.rpm_companion_url) {
              if (profile.rpm_companion_url.includes('68be6a2ac036016545747aa9')) {
                setCompanionChoice('EVE');
              } else if (profile.rpm_companion_url.includes('68be69db5dc0cec769cfae75')) {
                setCompanionChoice('ADAM');
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
    if (navigationLoading) return; // Prevent double clicks
    
    setNavigationLoading(true);
    
    // Add timeout to reset loading state if navigation fails
    const timeoutId = setTimeout(() => {
      setNavigationLoading(false);
    }, 5000);
    
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
      console.error('Navigation error:', error);
      clearTimeout(timeoutId);
      setNavigationLoading(false);
    }
  };

  // SAVE user avatar (not the companion):
  // - Logged-in → write to profile
  // - Anonymous → POST to /api/temp-avatars with { conversationId, sessionId, rpmUrl, thumbnail }
  const handleSaveAvatar = useCallback(
    async (avatar: AvatarInput) => {
      if (saveLoading) return; // Prevent double saves
      
      setSaveLoading(true);
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
      } finally {
        setSaveLoading(false);
      }
    },
    [isLoggedIn, user, conversationId, saveLoading]
  );

  // If your builder lets the user tap "Adam" / "Eve", call this
  const handleSelectCompanion = useCallback(async (key: "ADAM" | "EVE") => {
    setCompanionChoice(key);
    
    // Save companion choice to database if user is logged in
    if (isLoggedIn && user?.id) {
      try {
        const companionUrl = key === 'EVE' 
          ? 'https://models.readyplayer.me/68be6a2ac036016545747aa9.glb'
          : 'https://models.readyplayer.me/68be69db5dc0cec769cfae75.glb';
          
        const { error } = await supabase
          .from('profiles')
          .update({ rpm_companion_url: companionUrl })
          .eq('id', user.id);
          
        if (error) {
          console.error('Failed to save companion choice:', error);
        } else {
          // Update local user state
          setUser((prev: any) => prev ? { ...prev, rpm_companion_url: companionUrl } : prev);
        }
      } catch (err) {
        console.error('Error saving companion choice:', err);
      }
    }
  }, [isLoggedIn, user?.id]);

  // GO TO CHAT:
  // pass userUrl (from profile or temp), the companion *name* (ADAM/EVE), plus convo + sid.
  const handleNavigateToChat = useCallback(() => {
    if (navigationLoading) return; // Prevent double clicks
    
    setNavigationLoading(true);
    
    // Add timeout to reset loading state if navigation fails
    const timeoutId = setTimeout(() => {
      setNavigationLoading(false);
    }, 5000);
    
    try {
      const sid = getOrCreateSessionId();
      const params = new URLSearchParams();

      // User avatar (from profile or the local echo after temp save)
      if (user?.rpm_user_url) params.set("userUrl", user.rpm_user_url);

      // Tell chat which companion: ADAM or EVE (chat will map to a hardcoded URL)
      params.set("companionName", companionChoice);

      if (conversationId) params.set("convo", conversationId);
      params.set("sid", sid);

      const qs = params.toString();
      router.push(`/chat/avatar${qs ? `?${qs}` : ""}` as any);
    } catch (error) {
      console.error('Navigation to chat error:', error);
      setNavigationLoading(false);
    }
  }, [user, companionChoice, conversationId, router, navigationLoading]);

  // Reset loading states when component mounts (to handle navigation from other pages)
  useEffect(() => {
    // Small delay to allow navigation to complete
    const timer = setTimeout(() => {
      setNavigationLoading(false);
    }, 100);
    
    return () => clearTimeout(timer);
  }, []);

  // Show loading during initial load
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
      />
      
      {/* Global loading overlay for navigation */}
      {navigationLoading && (
        <Loading message="Starting your chat experience..." />
      )}
    </div>
  );
}