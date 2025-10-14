"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "components/ui/card";
import { Badge } from "components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "components/ui/dialog";
import { User, Bot, Crown, RefreshCw, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import { COMPANIONS } from "@/lib/companions";

type AvatarType = "user" | "companion";

interface ReadyPlayerMeAvatar {
  id: string;
  name: string;
  url: string; // often .glb
  type: "user" | "companion";
  thumbnail?: string; // .png
  isCustom?: boolean;
}

interface ReadyPlayerMeSelectorProps {
  onAvatarSelect: (avatar: ReadyPlayerMeAvatar, type: "user" | "companion") => void;
  currentUserAvatar?: ReadyPlayerMeAvatar;        // optional fallback for UI text
  currentCompanionAvatar?: ReadyPlayerMeAvatar;   // optional fallback for UI text
  user?: { id: string; username: string } | null; // not relied on for saving
}

/* ---------- helpers: convert RPM URLs to image thumbnails ---------- */
function toThumbnail(url: string | null | undefined): string | null {
  if (!url) return null;

  // If we already have a .png, use it as-is
  if (url.endsWith(".png")) return url;

  // If it's a .glb from models.readyplayer.me, try the cheap swap
  if (url.endsWith(".glb")) return url.replace(".glb", ".png");

  try {
    const parts = url.split("/");
    const last = parts[parts.length - 1];
    const id = last?.replace(".glb", "");
    if (id && id.length > 10) {
      return `https://api.readyplayer.me/v1/avatars/${id}.png`;
    }
  } catch (_) {
    /* ignore */
  }
  return null;
}

/* --------------------- prebuilt companions list --------------------- */
const COMPANION_AVATARS: ReadyPlayerMeAvatar[] = [
  { 
    id: "adam", 
    name: "Adam", 
    url: COMPANIONS.ADAM.url, 
    type: "companion", 
    thumbnail: "https://models.readyplayer.me/68be69db5dc0cec769cfae75.png", 
    isCustom: false 
  },
  { 
    id: "eve", 
    name: "Eve", 
    url: COMPANIONS.EVE.url, 
    type: "companion", 
    thumbnail: "https://models.readyplayer.me/68be6a2ac036016545747aa9.png", 
    isCustom: false 
  },
];

export function ReadyPlayerMeSelector({
  onAvatarSelect,
  currentUserAvatar,
  currentCompanionAvatar,
}: ReadyPlayerMeSelectorProps) {
  const [isCreatingUserAvatar, setIsCreatingUserAvatar] = useState(false);
  const [activeTab, setActiveTab] = useState<"user" | "companion">("user");
  const [isLoading, setIsLoading] = useState(false);

  // The URLs actually used for this signed-in user (from DB)
  const [userUrl, setUserUrl] = useState<string | null>(null);           // stored (likely .glb)
  const [companionUrl, setCompanionUrl] = useState<string | null>(null); // stored (likely .glb)

  /* ----------------- load profile on mount & auth changes ----------------- */
  useEffect(() => {
    let mounted = true;

    async function fetchForCurrentUser() {
      const { data: auth } = await supabase.auth.getUser();
      const u = auth?.user;
      if (!u) {
        setUserUrl(null);
        setCompanionUrl(null);
        return;
      }
      const { data, error } = await supabase
        .from("profiles")
        .select("rpm_user_url, rpm_companion_url")
        .eq("id", u.id)
        .single();

      if (!mounted) return;
      if (error) {
        console.error("load profile error:", error);
        return;
      }
      setUserUrl(data?.rpm_user_url ?? null);
      setCompanionUrl(data?.rpm_companion_url ?? null);
    }

    // initial fetch
    fetchForCurrentUser();

    // refetch on auth change (login/logout/switch user)
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      fetchForCurrentUser();
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  
  const saveAvatarToDB = useCallback(async (type: "user" | "companion", url: string) => {
    const { data: auth } = await supabase.auth.getUser();
    const u = auth?.user;
    if (!u) {
      toast.error("Please sign in to save your avatar.");
      return;
    }

    const payload = type === "user"
      ? { id: u.id, rpm_user_url: url }
      : { id: u.id, rpm_companion_url: url };

    const { data, error } = await supabase
      .from("profiles")
      .upsert(payload, { onConflict: "id" })
      .select("rpm_user_url, rpm_companion_url")
      .single();

    if (error) {
      console.error("upsert error:", error);
      toast.error("Couldn't save avatar. Try again.");
      return;
    }

    
    setUserUrl(data?.rpm_user_url ?? null);
    setCompanionUrl(data?.rpm_companion_url ?? null);
  }, []);

  /* --------------- ReadyPlayerMe --> save user avatar to DB ---------------- */
  const handleReadyPlayerMeMessage = (event: MessageEvent) => {
    // Only handle user avatar creation, not companions
    if (activeTab !== "user") return;
    
    let avatarUrl: string | null = null;
    if (!event?.data) return;

    if (event.data.eventName && (event.data.eventName.includes("error") || event.data.type === "error")) {
      return;
    }

    if (event.data.eventName === "v1.avatar.exported" && event.data.url) {
      avatarUrl = event.data.url;
    } else if (event.data.url && typeof event.data.url === "string") {
      avatarUrl = event.data.url;
    } else if (event.data.avatar?.url) {
      avatarUrl = event.data.avatar.url;
    } else if (typeof event.data === "string" && event.data.includes("readyplayer.me")) {
      avatarUrl = event.data;
    }

    if (!avatarUrl) return;

    // build object for parent callback (user avatar only)
    const parts = avatarUrl.split("/");
    const last = parts[parts.length - 1] ?? "";
    const avatarId = last.replace(".glb", "");
    const newAvatar: ReadyPlayerMeAvatar = {
      id: avatarId || `custom-${Date.now()}`,
      name: "Custom Avatar",
      url: avatarUrl,
      type: "user",
      thumbnail: toThumbnail(avatarUrl) ?? undefined,
      isCustom: true,
    };

    onAvatarSelect(newAvatar, "user");
    void saveAvatarToDB("user", avatarUrl);

    setIsCreatingUserAvatar(false);
    setIsLoading(false);

    toast.success(
      "🎉 Avatar saved!",
      { description: "It will load automatically next time you sign in." }
    );
  };

  useEffect(() => {
    window.addEventListener("message", handleReadyPlayerMeMessage);
    return () => window.removeEventListener("message", handleReadyPlayerMeMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, saveAvatarToDB]);

  const openReadyPlayerMe = (type: "user") => {
    setActiveTab(type);
    setIsLoading(true);
    setIsCreatingUserAvatar(true);
  };

  const refreshAvatar = () => {
    setIsLoading(true);
    setTimeout(() => setIsLoading(false), 800);
  };

  // db
  const userImg = toThumbnail(userUrl) || currentUserAvatar?.thumbnail || null;
  const companionImg = toThumbnail(companionUrl) || currentCompanionAvatar?.thumbnail || null;

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="mb-2">🎭 Choose Your 3D Avatars</h2>
        <p className="text-muted-foreground">Create your personal avatar and choose a companion.</p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "user" | "companion")} className="w-full">
        <TabsList className="grid w-full grid-cols-2 trauma-safe">
          <TabsTrigger value="user" className="trauma-safe gentle-focus">
            <User className="w-4 h-4 mr-2" /> Your Avatar
          </TabsTrigger>
          <TabsTrigger value="companion" className="trauma-safe gentle-focus">
            <Bot className="w-4 h-4 mr-2" /> Chat Companion
          </TabsTrigger>
        </TabsList>

        {/* User Avatar Tab */}
        <TabsContent value="user" className="mt-6">
          <Card className="trauma-safe">
            <CardHeader className="text-center">
              <CardTitle className="flex items-center justify-center space-x-2">
                <User className="w-5 h-5" />
                <span>Your Personal Avatar</span>
              </CardTitle>
              <CardDescription>Create a 3D avatar that represents you</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-lg p-6">
                <div className="flex items-center space-x-4">
                  <div className="w-20 h-20 bg-gradient-to-br from-teal-500 to-blue-500 rounded-full flex items-center justify-center shadow-lg overflow-hidden">
                    {userImg ? (
                      <img
                        src={userImg}
                        alt="Your avatar"
                        className="w-full h-full object-cover"
                        onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                      />
                    ) : (
                      <User className="w-10 h-10 text-white" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-1">
                      <h3 className="font-medium">{currentUserAvatar?.name ?? "Your Avatar"}</h3>
                      {(userUrl || currentUserAvatar?.isCustom) && (
                        <Badge variant="secondary" className="bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300">
                          <Crown className="w-3 h-3 mr-1" />
                          Custom
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">Shown for your current login.</p>
                  </div>
                  <Button onClick={refreshAvatar} variant="outline" size="sm" className="trauma-safe gentle-focus" disabled={isLoading}>
                    <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
                  </Button>
                </div>
              </div>

              <div className="text-center">
                <Dialog open={isCreatingUserAvatar} onOpenChange={setIsCreatingUserAvatar}>
                  <DialogTrigger
                    onClick={() => openReadyPlayerMe("user")}
                    className="inline-flex items-center justify-center rounded-md text-sm font-medium
                               h-11 px-8 text-white bg-gradient-to-r from-teal-500 to-emerald-600
                               shadow-lg hover:shadow-xl hover:opacity-90 focus-visible:outline-none
                               focus-visible:ring-2 focus-visible:ring-teal-400 transition-all"
                  >
                    {userUrl ? "🎨 Customize Avatar" : "✨ Create Your Avatar"}
                  </DialogTrigger>
                  <DialogContent className="max-w-[95vw] h-[95vh] trauma-safe">
                    <DialogHeader>
                      <DialogTitle>Create Your Avatar</DialogTitle>
                      <DialogDescription>Click "Export Avatar" to save.</DialogDescription>
                    </DialogHeader>
                    <div className="flex-1 relative">
                      {isLoading && (
                        <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-10">
                          <div className="text-center">
                            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-primary" />
                            <p>Loading ReadyPlayer.me…</p>
                          </div>
                        </div>
                      )}
                      <iframe
                        src="https://readyplayer.me/avatar?frameApi"
                        className="w-full h-full rounded-lg border"
                        allow="camera *; microphone *"
                        onLoad={() => setIsLoading(false)}
                        title="ReadyPlayer.me Avatar Creator"
                        style={{ minHeight: "700px" }}
                      />
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Companion Avatar Tab */}
        <TabsContent value="companion" className="mt-6">
          <Card className="trauma-safe">
            <CardHeader className="text-center">
              <CardTitle className="flex items-center justify-center space-x-2">
                <Bot className="w-5 h-5" />
                <span>Choose Your Chat Companion</span>
              </CardTitle>
              <CardDescription>Select Adam or Eve - our carefully designed companions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-6">
                <div className="flex items-center space-x-4">
                  <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center shadow-lg overflow-hidden">
                    {companionImg ? (
                      <img
                        src={companionImg}
                        alt="Companion avatar"
                        className="w-full h-full object-cover"
                        onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                      />
                    ) : (
                      <Bot className="w-10 h-10 text-white" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-1">
                      <h3 className="font-medium">{currentCompanionAvatar?.name ?? "Companion"}</h3>
                      {(companionUrl || currentCompanionAvatar) && (
                        <Badge variant="secondary" className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                          <Check className="w-3 h-3 mr-1" />
                          Active
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">Shown for your current login.</p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-medium mb-4">💫 Choose a Companion</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {COMPANION_AVATARS.map((avatar) => (
                    <Card
                      key={avatar.id}
                      className={`trauma-safe cursor-pointer border-2 transition-all duration-300 hover:border-purple-200 dark:hover:border-purple-700`}
                      onClick={() => {
                        onAvatarSelect(avatar, "companion");
                        void saveAvatarToDB("companion", avatar.url);
                      }}
                    >
                      <CardContent className="p-6">
                        <div className="flex flex-col items-center space-y-4 text-center">
                          <div className="w-24 h-24 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg overflow-hidden relative">
                            <img
                              src={avatar.thumbnail}
                              alt={avatar.name}
                              className="w-full h-full object-cover absolute inset-0"
                              onLoad={(e) => {
                                // Hide the Bot icon when image loads successfully
                                const botIcon = (e.target as HTMLImageElement).parentElement?.querySelector('.bot-fallback') as HTMLElement;
                                if (botIcon) botIcon.style.display = 'none';
                              }}
                              onError={(e) => {
                                console.log(`Image failed to load for ${avatar.name}:`, avatar.thumbnail);
                                // Hide the failed image, Bot icon will show
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                            <Bot className="w-12 h-12 text-white bot-fallback" />
                          </div>
                          <div className="w-full">
                            <div className="flex items-center justify-center space-x-2 mb-2">
                              <h4 className="font-medium">{avatar.name}</h4>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {avatar.name === "Adam" && "🌱 Gentle and understanding companion"}
                              {avatar.name === "Eve" && "💚 Supportive and caring companion"}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              <div className="border-t pt-6">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">
                    Choose between Adam or Eve as your chat companion. Both are specially designed to provide caring, supportive conversations tailored to your needs.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}