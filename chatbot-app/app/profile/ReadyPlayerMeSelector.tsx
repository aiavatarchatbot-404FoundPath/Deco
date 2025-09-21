"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "components/ui/card";
import { Badge } from "components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "components/ui/dialog";
import { Loading } from "components/ui/loading";
import { User, Bot, Sparkles, Crown, RefreshCw, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";

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

  // Try to extract avatar id and use the official PNG endpoint
  // examples:
  // - https://models.readyplayer.me/68ba6f6e....glb
  // - https://readyplayer.me/avatar/68ba6f6e....
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
  { id: "adam-professional", name: "Adam - Professional & Supportive", url: "https://models.readyplayer.me/68be69db5dc0cec769cfae75.glb", type: "companion", thumbnail: "https://models.readyplayer.me/68be69db5dc0cec769cfae75.png", isCustom: false },
  { id: "eve-caring", name: "Eve - Caring & Empathetic", url: "https://models.readyplayer.me/68be6a2ac036016545747aa9.glb", type: "companion", thumbnail: "https://models.readyplayer.me/68be6a2ac036016545747aa9.png", isCustom: false },
  { id: "jordan-neutral", name: "Jordan - Neutral & Balanced", url: "https://models.readyplayer.me/6507c69c05a3a4cdc04b9c4a.glb", type: "companion", thumbnail: "https://models.readyplayer.me/6507c69c05a3a4cdc04b9c4a.png", isCustom: false },
];

// Get companion background color based on avatar ID
function getCompanionBgColor(avatarId: string): string {
  switch (avatarId) {
    case "adam-professional":
      return "from-blue-300 to-indigo-400";
    case "eve-caring":
      return "from-pink-300 to-purple-400";
    case "jordan-neutral":
      return "from-green-300 to-teal-400";
    default:
      return "from-purple-500 to-pink-500"; // Custom/default color
  }
}

export function ReadyPlayerMeSelector({
  onAvatarSelect,
  currentUserAvatar,
  currentCompanionAvatar,
}: ReadyPlayerMeSelectorProps) {
  const [isCreatingUserAvatar, setIsCreatingUserAvatar] = useState(false);
  const [isCreatingCompanionAvatar, setIsCreatingCompanionAvatar] = useState(false);
  const [activeTab, setActiveTab] = useState<"user" | "companion">("user");
  const [isLoading, setIsLoading] = useState(false);
  const [isIframeLoading, setIsIframeLoading] = useState(false);

  // The URLs actually used for this signed-in user (from DB)
  const [userUrl, setUserUrl] = useState<string | null>(null);           // stored (likely .glb)
  const [companionUrl, setCompanionUrl] = useState<string | null>(null); // stored (likely .glb)
  const [customCompanionUrl, setCustomCompanionUrl] = useState<string | null>(null); // track custom companion
  const [isSignedIn, setIsSignedIn] = useState(false); // Track authentication state

  /* ----------------- load profile on mount & auth changes ----------------- */
  useEffect(() => {
    let mounted = true;

    async function fetchForCurrentUser() {
      const { data: auth } = await supabase.auth.getUser();
      const u = auth?.user;
      if (!u) {
        setUserUrl(null);
        setCompanionUrl(null);
        setIsSignedIn(false);
        return;
      }
      
      setIsSignedIn(true);
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
      
      // Check if there's a custom companion URL stored in localStorage
      const storedCustomCompanion = localStorage.getItem(`customCompanion_${u.id}`);
      if (storedCustomCompanion) {
        setCustomCompanionUrl(storedCustomCompanion);
      }
      
      // If current companion URL is custom (not prebuilt), store it
      if (data?.rpm_companion_url && !COMPANION_AVATARS.some(avatar => avatar.url === data.rpm_companion_url)) {
        setCustomCompanionUrl(data.rpm_companion_url);
        localStorage.setItem(`customCompanion_${u.id}`, data.rpm_companion_url);
      }
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

    // Update local state immediately for instant UI feedback
    if (type === "user") {
      setUserUrl(url);
    } else {
      setCompanionUrl(url);
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
      // Revert local state on error
      if (type === "user") {
        setUserUrl(null);
      } else {
        setCompanionUrl(null);
      }
      return;
    }

    // Confirm the update with the database response
    setUserUrl(data?.rpm_user_url ?? null);
    setCompanionUrl(data?.rpm_companion_url ?? null);
  }, []);

  /* --------------- ReadyPlayerMe --> -->  save to DB ---------------- */
  const handleReadyPlayerMeMessage = (event: MessageEvent) => {
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

    // build object for parent callback (optional)
    const parts = avatarUrl.split("/");
    const last = parts[parts.length - 1] ?? "";
    const avatarId = last.replace(".glb", "");
    const newAvatar: ReadyPlayerMeAvatar = {
      id: avatarId || `custom-${Date.now()}`,
      name: `Custom ${activeTab === "user" ? "Avatar" : "Companion"}`,
      url: avatarUrl,
      type: activeTab,
      thumbnail: toThumbnail(avatarUrl) ?? undefined,
      isCustom: true,
    };

    onAvatarSelect(newAvatar, activeTab);
    void saveAvatarToDB(activeTab, avatarUrl);

    // Track custom companion creation
    if (activeTab === "companion") {
      setCustomCompanionUrl(avatarUrl);
      // Store in localStorage for persistence
      supabase.auth.getUser().then(({ data: auth }) => {
        if (auth?.user?.id) {
          localStorage.setItem(`customCompanion_${auth.user.id}`, avatarUrl);
        }
      });
    }

    setIsCreatingUserAvatar(false);
    setIsCreatingCompanionAvatar(false);
    setIsIframeLoading(false); // Reset iframe loading instead of general loading

    toast.success(
      activeTab === "user" ? "🎉 Avatar saved!" : "🎉 Companion saved!",
      { description: isSignedIn ? "Your avatar is now active!" : "It will load automatically next time you sign in." }
    );
  };

  useEffect(() => {
    window.addEventListener("message", handleReadyPlayerMeMessage);
    return () => window.removeEventListener("message", handleReadyPlayerMeMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, saveAvatarToDB, isSignedIn]);

  const openReadyPlayerMe = (type: "user" | "companion") => {
    setActiveTab(type);
    setIsIframeLoading(true); // Use separate loading for iframe
    if (type === "user") setIsCreatingUserAvatar(true);
    else setIsCreatingCompanionAvatar(true);
  };

  const selectCompanionAvatar = async (avatar: ReadyPlayerMeAvatar) => {
    // Update local state immediately for instant UI feedback
    setCompanionUrl(avatar.url);
    
    onAvatarSelect(avatar, "companion");
    
    // Save to database
    try {
      await saveAvatarToDB("companion", avatar.url);
      toast.success("🎉 Companion selected!", { description: "Your companion is now active!" });
    } catch (error) {
      console.error("Failed to save companion:", error);
      // Revert on error
      setCompanionUrl(null);
    }
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
                        onError={(e) => {
                          console.log('User avatar image failed to load:', userImg);
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
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
                    <p className="text-sm text-muted-foreground">
                      {isSignedIn ? "Currently active for your account." : "Sign in to save your avatar."}
                    </p>
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
                    <Sparkles className="w-5 h-5 mr-2" />
                    {userUrl ? "🎨 Customize Avatar" : "✨ Create Your Avatar"}
                  </DialogTrigger>
                  <DialogContent className="max-w-[95vw] h-[95vh] trauma-safe">
                    <DialogHeader>
                      <DialogTitle>Create Your Avatar</DialogTitle>
                      <DialogDescription>Click “Export Avatar” to save.</DialogDescription>
                    </DialogHeader>
                    <div className="flex-1 relative">
                      {isIframeLoading && <Loading message="Loading Ready Player Me..." />}
                      <iframe
                        src="https://readyplayer.me/avatar?frameApi"
                        className="w-full h-full rounded-lg border"
                        allow="camera *; microphone *"
                        onLoad={() => setIsIframeLoading(false)}
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
              <CardDescription>Select from pre-designed companions or create your own</CardDescription>
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
                        onError={(e) => {
                          console.log('Companion avatar image failed to load:', companionImg);
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
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
                    <p className="text-sm text-muted-foreground">
                      {isSignedIn ? "Currently active for your account." : "Sign in to save your companion."}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-medium mb-4">💫 Choose a Companion</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {/* Custom Companion Card (show if user has ever created one) */}
                  {customCompanionUrl && (
                    <Card
                      className={`trauma-safe cursor-pointer border-2 transition-all duration-300 hover:border-purple-200 dark:hover:border-purple-700 ${
                        companionUrl === customCompanionUrl ? 'ring-2 ring-purple-200 dark:ring-purple-800' : ''
                      }`}
                      onClick={() => {
                        // Create custom companion avatar object
                        const customAvatar: ReadyPlayerMeAvatar = {
                          id: 'custom-companion',
                          name: 'Custom Companion',
                          url: customCompanionUrl,
                          type: 'companion',
                          thumbnail: toThumbnail(customCompanionUrl) ?? undefined,
                          isCustom: true,
                        };
                        selectCompanionAvatar(customAvatar);
                      }}
                    >
                      <CardContent className="p-6">
                        <div className="flex flex-col items-center space-y-4 text-center">
                          <div className="w-24 h-24 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg overflow-hidden">
                            {toThumbnail(customCompanionUrl) ? (
                              <img
                                src={toThumbnail(customCompanionUrl)!}
                                alt="Custom Companion"
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  console.log('Custom companion image failed to load:', toThumbnail(customCompanionUrl));
                                  (e.target as HTMLImageElement).style.display = "none";
                                }}
                              />
                            ) : (
                              <Bot className="w-12 h-12 text-white" />
                            )}
                          </div>
                          <div className="w-full">
                            <div className="flex items-center justify-center space-x-2 mb-2">
                              <h4 className="font-medium">Custom Companion</h4>
                              {companionUrl === customCompanionUrl ? (
                                <Badge variant="secondary" className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                                  <Check className="w-3 h-3 mr-1" />
                                  Active
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-300">
                                  <Crown className="w-3 h-3 mr-1" />
                                  Custom
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              🎨 Your personalized companion
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                  
                  {/* Prebuilt Companion Cards */}
                  {COMPANION_AVATARS.map((avatar) => (
                    <Card
                      key={avatar.id}
                      className={`trauma-safe cursor-pointer border-2 transition-all duration-300 hover:border-purple-200 dark:hover:border-purple-700 ${
                        companionUrl === avatar.url ? 'ring-2 ring-purple-200 dark:ring-purple-800' : ''
                      }`}
                      onClick={() => {
                        // Use the new async function for immediate updates
                        selectCompanionAvatar(avatar);
                      }}
                    >
                      <CardContent className="p-6">
                        <div className="flex flex-col items-center space-y-4 text-center">
                          <div className={`w-24 h-24 bg-gradient-to-br ${getCompanionBgColor(avatar.id)} rounded-full flex items-center justify-center flex-shrink-0 shadow-lg overflow-hidden`}>
                            {avatar.thumbnail ? (
                              <img
                                src={avatar.thumbnail}
                                alt={avatar.name}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  console.log('Avatar thumbnail failed to load:', avatar.thumbnail);
                                  (e.target as HTMLImageElement).style.display = "none";
                                }}
                              />
                            ) : (
                              <Bot className="w-12 h-12 text-white" />
                            )}
                          </div>
                          <div className="w-full">
                            <div className="flex items-center justify-center space-x-2 mb-2">
                              <h4 className="font-medium">{avatar.name}</h4>
                              {companionUrl === avatar.url && (
                                <Badge variant="secondary" className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                                  <Check className="w-3 h-3 mr-1" />
                                  Active
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {avatar.name.includes("Professional") && "💼 Supportive & understanding"}
                              {avatar.name.includes("Caring") && "� Friendly & encouraging"}
                              {avatar.name.includes("Neutral") && "⚖️ Balanced & thoughtful"}
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
                  <Dialog open={isCreatingCompanionAvatar} onOpenChange={setIsCreatingCompanionAvatar}>
                    <DialogTrigger
                      onClick={() => openReadyPlayerMe("companion")}
                      className="inline-flex items-center justify-center rounded-md text-xs font-medium h-8 px-3 py-1 border border-input bg-background hover:bg-accent hover:text-accent-foreground trauma-safe gentle-focus"
                    >
                      <Sparkles className="w-3 h-3 mr-1" />
                      🎨 Create Custom
                    </DialogTrigger>
                    <DialogContent className="max-w-[95vw] h-[95vh] trauma-safe">
                      <DialogHeader>
                        <DialogTitle>Create Custom Companion</DialogTitle>
                        <DialogDescription>Click “Export Avatar” to save.</DialogDescription>
                      </DialogHeader>
                      <div className="flex-1 relative">
                        {isIframeLoading && <Loading message="Loading Ready Player Me..." />}
                        <iframe
                          src="https://readyplayer.me/avatar?frameApi"
                          className="w-full h-full rounded-lg border"
                          allow="camera *; microphone *"
                          onLoad={() => setIsIframeLoading(false)}
                          title="ReadyPlayer.me Companion Creator"
                          style={{ minHeight: "700px" }}
                        />
                      </div>
                    </DialogContent>
                  </Dialog>
                  <p className="text-xs text-muted-foreground mt-2">Advanced option for unique companions</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      {/* General loading overlay for refresh and other operations */}
      {isLoading && !isCreatingUserAvatar && !isCreatingCompanionAvatar && !isIframeLoading && (
        <Loading message="Refreshing..." />
      )}
    </div>
  );
}
