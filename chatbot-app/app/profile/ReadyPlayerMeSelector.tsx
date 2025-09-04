"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "components/ui/card";
import { Badge } from "components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "components/ui/dialog";
import { User, Bot, Sparkles, Crown, RefreshCw, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";

type AvatarType = "user" | "companion";

interface ReadyPlayerMeAvatar {
  id: string;
  name: string;
  url: string;
  type: AvatarType;
  thumbnail?: string;
  isCustom?: boolean;
}

interface ReadyPlayerMeSelectorProps {
  onAvatarSelect?: (avatar: ReadyPlayerMeAvatar, type: AvatarType) => void; // optional now
  currentUserAvatar?: ReadyPlayerMeAvatar;
  currentCompanionAvatar?: ReadyPlayerMeAvatar;
}

/** Prebuilt companions (samples) */
const COMPANION_AVATARS: ReadyPlayerMeAvatar[] = [
  {
    id: "adam-gentle",
    name: "Adam - Gentle Guide",
    url: "https://models.readyplayer.me/64bfa617e1b2b2a3c7c8f4d1.glb",
    type: "companion",
    thumbnail: "https://api.readyplayer.me/v1/avatars/64bfa617e1b2b2a3c7c8f4d1.png",
    isCustom: false,
  },
  {
    id: "sarah-supportive",
    name: "Sarah - Supportive Friend",
    url: "https://models.readyplayer.me/64bfa617e1b2b2a3c7c8f4d2.glb",
    type: "companion",
    thumbnail: "https://api.readyplayer.me/v1/avatars/64bfa617e1b2b2a3c7c8f4d2.png",
    isCustom: false,
  },
  {
    id: "alex-confident",
    name: "Alex - Confident Ally",
    url: "https://models.readyplayer.me/64bfa617e1b2b2a3c7c8f4d3.glb",
    type: "companion",
    thumbnail: "https://api.readyplayer.me/v1/avatars/64bfa617e1b2b2a3c7c8f4d3.png",
    isCustom: false,
  },
  {
    id: "jordan-wise",
    name: "Jordan - Wise Mentor",
    url: "https://models.readyplayer.me/64bfa617e1b2b2a3c7c8f4d4.glb",
    type: "companion",
    thumbnail: "https://api.readyplayer.me/v1/avatars/64bfa617e1b2b2a3c7c8f4d4.png",
    isCustom: false,
  },
];

export function ReadyPlayerMeSelector({
  onAvatarSelect,
  currentUserAvatar,
  currentCompanionAvatar,
}: ReadyPlayerMeSelectorProps) {
  const [isCreatingUserAvatar, setIsCreatingUserAvatar] = useState(false);
  const [isCreatingCompanionAvatar, setIsCreatingCompanionAvatar] = useState(false);
  const [activeTab, setActiveTab] = useState<AvatarType>("user");
  const [isLoading, setIsLoading] = useState(false);

  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [sessionUsername, setSessionUsername] = useState<string | null>(null);

  // Load logged-in user and username (from profiles if you want)
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        console.warn("No auth user:", error?.message);
        return;
      }
      setSessionUserId(data.user.id);

      // Optional: fetch username from profiles
      const { data: profile } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", data.user.id)
        .maybeSingle();

      setSessionUsername(profile?.username ?? null);
    })();
  }, []);

  // ---------- DB helpers ----------

  const saveUserAvatar = useCallback(
    async (rpmUrl: string) => {
      if (!sessionUserId) {
        toast.error("You must be logged in to save your avatar.");
        return false;
      }
      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: rpmUrl, updated_at: new Date().toISOString() })
        .eq("id", sessionUserId);

      if (error) {
        console.error("Failed to save user avatar:", error.message);
        toast.error("Could not save your avatar.");
        return false;
      }
      toast.success("Your avatar has been saved.");
      return true;
    },
    [sessionUserId]
  );

  const upsertCompanionAndSetActive = useCallback(
    async (avatar: ReadyPlayerMeAvatar) => {
      if (!sessionUserId) {
        toast.error("You must be logged in to save your companion.");
        return false;
      }

      // Ensure a row exists for this companion id (prebuilt or custom).
      const { error: upsertErr } = await supabase.from("companion_avatars").upsert(
        {
          id: avatar.id,
          owner_id: sessionUserId,
          name: avatar.name,
          rpm_url: avatar.url,
          thumbnail: avatar.thumbnail ?? null,
          created_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );
      if (upsertErr) {
        console.error("Failed to upsert companion avatar:", upsertErr.message);
        toast.error("Could not save companion.");
        return false;
      }

      // Mark as active companion on profile
      const { error: profileErr } = await supabase
        .from("profiles")
        .update({ active_companion_id: avatar.id, updated_at: new Date().toISOString() })
        .eq("id", sessionUserId);

      if (profileErr) {
        console.warn("Companion saved but failed to set active:", profileErr.message);
        toast.error("Saved, but couldn’t set active companion.");
        return false;
      }

      toast.success("Companion set as active.");
      return true;
    },
    [sessionUserId]
  );

  // ---------- RPM postMessage handling ----------

  const toThumb = (url: string) =>
    (url.endsWith(".glb") || url.endsWith(".vrm")) ? url.replace(/\.(glb|vrm)$/, ".png") : undefined;

  const handleExportedAvatar = useCallback(
    async (avatarUrl: string) => {
      // Extract ID heuristically
      let avatarId: string | null = null;
      try {
        const parts = avatarUrl.split("/");
        avatarId = parts[parts.length - 1]?.replace(".glb", "").replace(".vrm", "") || null;
      } catch {}
      if (!avatarId) avatarId = `custom-${Date.now()}`;

      const newAvatar: ReadyPlayerMeAvatar = {
        id: avatarId,
        name: `${sessionUsername || "My"} ${activeTab === "companion" ? "Custom Companion" : "Custom Avatar"}`,
        url: avatarUrl,
        type: activeTab,
        thumbnail: toThumb(avatarUrl),
        isCustom: true,
      };

      if (activeTab === "user") {
        const ok = await saveUserAvatar(avatarUrl);
        if (ok) onAvatarSelect?.(newAvatar, "user");
        setIsCreatingUserAvatar(false);
      } else {
        const ok = await upsertCompanionAndSetActive(newAvatar);
        if (ok) onAvatarSelect?.(newAvatar, "companion");
        setIsCreatingCompanionAvatar(false);
      }
      setIsLoading(false);
    },
    [activeTab, onAvatarSelect, saveUserAvatar, upsertCompanionAndSetActive, sessionUsername]
  );

  const handleReadyPlayerMeMessage = useCallback(
    (event: MessageEvent) => {
      // Only trust RPM messages (but allow manual-calls which have no origin)
      const isRealEvent = typeof event.origin === "string";
      if (isRealEvent && !event.origin.endsWith("readyplayer.me")) return;

      const payload = event.data;
      if (!payload) return;

      // Known message shapes
      if (payload.eventName === "v1.ready" || payload.eventName === "v1.frame.ready") {
        setIsLoading(false);
        return;
      }

      // v1.avatar.exported
      if (payload.eventName === "v1.avatar.exported" && payload?.data?.url) {
        handleExportedAvatar(payload.data.url);
        return;
      }

      // Fallbacks: direct url in payload
      if (typeof payload.url === "string" && payload.url.includes("readyplayer.me")) {
        handleExportedAvatar(payload.url);
        return;
      }

      if (payload.avatar?.url) {
        handleExportedAvatar(payload.avatar.url);
        return;
      }

      if (typeof payload === "string" && payload.includes("readyplayer.me")) {
        handleExportedAvatar(payload);
        return;
      }
    },
    [handleExportedAvatar]
  );

  useEffect(() => {
    window.addEventListener("message", handleReadyPlayerMeMessage);
    return () => window.removeEventListener("message", handleReadyPlayerMeMessage);
  }, [handleReadyPlayerMeMessage]);

  // ---------- UI actions ----------

  const openReadyPlayerMe = (type: AvatarType) => {
    setActiveTab(type);
    setIsLoading(true);
    if (type === "user") setIsCreatingUserAvatar(true);
    else setIsCreatingCompanionAvatar(true);
  };

  const selectCompanionAvatar = async (avatar: ReadyPlayerMeAvatar) => {
    // Save & set active immediately
    const ok = await upsertCompanionAndSetActive(avatar);
    if (ok) onAvatarSelect?.(avatar, "companion");
  };

  const refreshAvatar = () => {
    setIsLoading(true);
    setTimeout(() => setIsLoading(false), 800);
  };

  // ---------- RENDER ----------

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="mb-2">🎭 Choose Your 3D Avatars</h2>
        <p className="text-muted-foreground">Create your personal avatar and choose a companion with ReadyPlayer.me</p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as AvatarType)} className="w-full">
        <TabsList className="grid w-full grid-cols-2 trauma-safe">
          <TabsTrigger value="user" className="trauma-safe gentle-focus">
            <User className="w-4 h-4 mr-2" />
            Your Avatar
          </TabsTrigger>
          <TabsTrigger value="companion" className="trauma-safe gentle-focus">
            <Bot className="w-4 h-4 mr-2" />
            Chat Companion
          </TabsTrigger>
        </TabsList>

        {/* USER AVATAR */}
        <TabsContent value="user" className="mt-6">
          <Card className="trauma-safe">
            <CardHeader className="text-center">
              <CardTitle className="flex items-center justify-center space-x-2">
                <User className="w-5 h-5" />
                <span>Your Personal Avatar</span>
              </CardTitle>
              <CardDescription>Create a 3D avatar that represents you.</CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              {currentUserAvatar ? (
                <div className="bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-lg p-6">
                  <div className="flex items-center space-x-4">
                    <div className="w-16 h-16 bg-gradient-to-br from-teal-500 to-blue-500 rounded-full flex items-center justify-center overflow-hidden">
                      {currentUserAvatar.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={currentUserAvatar.thumbnail}
                          alt={currentUserAvatar.name}
                          className="w-full h-full object-cover"
                          onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                        />
                      ) : (
                        <User className="w-8 h-8 text-white" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <h3 className="font-medium">{currentUserAvatar.name}</h3>
                        {currentUserAvatar.isCustom && (
                          <Badge variant="secondary" className="bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300">
                            <Crown className="w-3 h-3 mr-1" />
                            Custom
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">This avatar represents you in chats.</p>
                    </div>
                    <Button onClick={refreshAvatar} variant="outline" size="sm" className="trauma-safe gentle-focus" disabled={isLoading}>
                      <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="bg-muted/50 border-2 border-dashed border-muted-foreground/30 rounded-lg p-8 text-center">
                  <User className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="font-medium mb-2">No Avatar Yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">Create your personal 3D avatar to get started.</p>
                </div>
              )}

              <div className="text-center">
                <Dialog open={isCreatingUserAvatar} onOpenChange={setIsCreatingUserAvatar}>
                  <DialogTrigger asChild>
                    <Button
                      variant="secondary"
                      onClick={() => openReadyPlayerMe("user")}
                      className="inline-flex items-center h-11 px-8 trauma-safe gentle-focus gradient-teal text-white border-0"
                    >
                      <Sparkles className="w-5 h-5 mr-2" />
                      {currentUserAvatar ? "🎨 Customize Avatar" : "✨ Create Your Avatar"}
                    </Button>
                  </DialogTrigger>

                  <DialogContent className="max-w-4xl h-[80vh] trauma-safe">
                    <DialogHeader>
                      <DialogTitle>Create Your Avatar</DialogTitle>
                      <DialogDescription>Use ReadyPlayer.me. Click “Export Avatar” when done.</DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 relative">
                      {isLoading && (
                        <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-10">
                          <div className="text-center">
                            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2" />
                            <p>Loading ReadyPlayer.me…</p>
                          </div>
                        </div>
                      )}

                      <iframe
                        src="https://readyplayer.me/avatar?frameApi"
                        className="w-full h-full rounded-lg border"
                        allow="camera; microphone; clipboard-write"
                        onLoad={() => setIsLoading(false)}
                        title="ReadyPlayer.me Avatar Creator"
                      />

                      {/* Manual URL fallback */}
                      <ManualUrlFallback
                        accent="teal"
                        placeholder="Paste your ReadyPlayer.me avatar URL…"
                        onUse={(url) => handleExportedAvatar(url)}
                      />
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* COMPANION */}
        <TabsContent value="companion" className="mt-6">
          <Card className="trauma-safe">
            <CardHeader className="text-center">
              <CardTitle className="flex items-center justify-center space-x-2">
                <Bot className="w-5 h-5" />
                <span>Choose Your Chat Companion</span>
              </CardTitle>
              <CardDescription>Select a prebuilt companion or create a custom one.</CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              {currentCompanionAvatar && (
                <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-6">
                  <div className="flex items-center space-x-4">
                    <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center overflow-hidden">
                      {currentCompanionAvatar.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={currentCompanionAvatar.thumbnail}
                          alt={currentCompanionAvatar.name}
                          className="w-full h-full object-cover"
                          onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                        />
                      ) : (
                        <Bot className="w-8 h-8 text-white" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <h3 className="font-medium">{currentCompanionAvatar.name}</h3>
                        <Badge variant="secondary" className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                          <Check className="w-3 h-3 mr-1" />
                          Active
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">Your current chat companion.</p>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <h3 className="font-medium mb-4">💫 Choose a Companion</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {COMPANION_AVATARS.map((avatar) => (
                    <Card
                      key={avatar.id}
                      className={`trauma-safe cursor-pointer border-2 transition-all duration-300 ${
                        currentCompanionAvatar?.id === avatar.id
                          ? "border-purple-400 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 shadow-lg"
                          : "border-gray-200 dark:border-gray-700 hover:border-purple-200 dark:hover:border-purple-700 calm-hover"
                      }`}
                      onClick={() => selectCompanionAvatar(avatar)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center overflow-hidden">
                            {avatar.thumbnail ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={avatar.thumbnail}
                                alt={avatar.name}
                                className="w-full h-full object-cover"
                                onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                              />
                            ) : (
                              <Bot className="w-6 h-6 text-white" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium truncate">{avatar.name}</h4>
                          </div>
                          {currentCompanionAvatar?.id === avatar.id && <Check className="w-5 h-5 text-purple-600 dark:text-purple-400" />}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              <div className="border-t pt-6">
                <div className="text-center">
                  <Dialog open={isCreatingCompanionAvatar} onOpenChange={setIsCreatingCompanionAvatar}>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        onClick={() => openReadyPlayerMe("companion")}
                        className="inline-flex items-center h-10 px-4 py-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground trauma-safe gentle-focus"
                      >
                        <Sparkles className="w-4 h-4 mr-2" />
                        🎨 Create Custom Companion
                      </Button>
                    </DialogTrigger>

                    <DialogContent className="max-w-4xl h-[80vh] trauma-safe">
                      <DialogHeader>
                        <DialogTitle>Create Custom Companion</DialogTitle>
                        <DialogDescription>Click “Export Avatar” to finish.</DialogDescription>
                      </DialogHeader>

                      <div className="flex-1 relative">
                        {isLoading && (
                          <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-10">
                            <div className="text-center">
                              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2" />
                              <p>Loading ReadyPlayer.me…</p>
                            </div>
                          </div>
                        )}

                        <iframe
                          src="https://readyplayer.me/avatar?frameApi"
                          className="w-full h-full rounded-lg border"
                          allow="camera; microphone; clipboard-write"
                          onLoad={() => setIsLoading(false)}
                          title="ReadyPlayer.me Companion Creator"
                        />

                        <ManualUrlFallback
                          accent="purple"
                          placeholder="Paste your ReadyPlayer.me companion URL…"
                          onUse={(url) => handleExportedAvatar(url)}
                        />
                      </div>
                    </DialogContent>
                  </Dialog>
                  <p className="text-xs text-muted-foreground mt-2">Advanced option to create a unique companion.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** Manual URL fallback widget */
function ManualUrlFallback({
  placeholder,
  onUse,
  accent,
}: {
  placeholder: string;
  onUse: (url: string) => void | Promise<void>;
  accent: "teal" | "purple";
}) {
  const [value, setValue] = useState("");
  const ring = accent === "teal" ? "focus:ring-teal-500" : "focus:ring-purple-500";

  const tryUse = async () => {
    const url = value.trim();
    if (url && url.includes("readyplayer.me")) {
      await onUse(url);
      setValue("");
    } else {
      toast.error("Please paste a valid ReadyPlayer.me URL.");
    }
  };

  return (
    <div className="absolute bottom-4 left-4 right-4 bg-background/95 border rounded-lg p-3">
      <p className="text-sm font-medium mb-2">Having trouble? Add URL manually:</p>
      <div className="flex space-x-2">
        <input
          type="url"
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className={`flex-1 px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 ${ring} bg-background`}
          onKeyDown={async (e) => e.key === "Enter" && (await tryUse())}
        />
        <Button size="sm" onClick={tryUse} className="trauma-safe gentle-focus">
          Use URL
        </Button>
      </div>
      <p className="text-xs text-muted-foreground mt-1">Copy the avatar URL from ReadyPlayer.me and paste it here.</p>
    </div>
  );
}
