import React, { useState, useCallback, useEffect } from 'react';
import { ArrowRight, User, RefreshCw, Sparkles, CheckCircle2, MessageSquare, ListChecks, HeartHandshake } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';
import type { Persona } from '@/lib/personas';

interface AvatarBuilderScreenProps {
  onNavigate: (screen: string) => void;
  onNavigateToChat: () => void;
  user?: any;
  onSaveAvatar: (avatar: any) => void;
  onSelectCompanion: (companion: 'ADAM' | 'EVE') => void;
  isLoggedIn?: boolean;
  navigationLoading?: boolean;
  saveLoading?: boolean;

  // NEW (optional) – if parent passes these, we’ll use them; else we fall back to local state
  personaChoice?: Persona;                            // 'adam' | 'eve' | 'custom' | 'neutral'
  setPersonaChoice?: (p: Persona) => void;
  customStyleText?: string;
  setCustomStyleText?: (s: string) => void;
  onApplyTone?: () => void | Promise<void>;
  applyToneLoading?: boolean;
}


// Convert a Ready Player Me URL (.glb) into a displayable PNG
function toThumbnail(url?: string | null): string | null {
  if (!url) return null;
  if (url.endsWith(".png")) return url;
  if (url.endsWith(".glb")) return url.replace(".glb", ".png");

  // extract avatar using png
  try {
    const last = url.split("/").pop() || "";
    const id = last.replace(".glb", "");
    if (id && id.length > 10) {
      return `https://api.readyplayer.me/v1/avatars/${id}.png`;
    }
  } catch {}
  return null;
}

// Ready Player Me avatar URLs
const readyPlayerMeAvatars = {
  adam: "https://models.readyplayer.me/68be69db5dc0cec769cfae75.glb",
  eve: "https://models.readyplayer.me/68be6a2ac036016545747aa9.glb"
};

function extractAvatarId(url?: string | null): string | null {
  if (!url) return null;
  try {
    const clean = url.split('?')[0];
    const segments = clean.split('/').filter(Boolean);
    const last = segments.pop();
    if (!last) return null;
    return last.replace('.glb', '');
  } catch {
    return null;
  }
}


export default function AvatarBuilderScreen({
  onNavigate,
  onNavigateToChat,
  user,
  onSaveAvatar,
  onSelectCompanion,
  isLoggedIn = false,
  navigationLoading = false,
  saveLoading = false,

  // NEW (optional)
  personaChoice,
  setPersonaChoice,
  customStyleText,
  setCustomStyleText,
  onApplyTone,
  applyToneLoading = false,
}: AvatarBuilderScreenProps) {
  const [selectedAvatar, setSelectedAvatar] = useState<string>('ready-adam');
  const [isCreatingAvatar, setIsCreatingAvatar] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [creatorSrc, setCreatorSrc] = useState<string>('https://readyplayer.me/avatar?frameApi');

  // Local fallbacks if parent didn’t pass tone props
  const [personaLocal, setPersonaLocal] = useState<Persona>('adam');
  const [customStyleLocal, setCustomStyleLocal] = useState<string>('');

  // Which “source of truth” should we use?
  const persona = (personaChoice ?? personaLocal);
  const setPersona = (p: Persona) => (setPersonaChoice ? setPersonaChoice(p) : setPersonaLocal(p));
  const customText = (customStyleText ?? customStyleLocal);
  const setCustomText = (s: string) => (setCustomStyleText ? setCustomStyleText(s) : setCustomStyleLocal(s));

  const handleAvatarSelect = useCallback((avatarId: string) => {
    setSelectedAvatar(avatarId);
    if (avatarId === 'eve' || avatarId === 'ready-eve') {
      onSelectCompanion('EVE');
      if (persona !== 'custom') setPersona('eve');
      if (customText) setCustomText('');
    } else if (avatarId === 'ready-adam' || avatarId === 'adam') {
      onSelectCompanion('ADAM');
      if (persona !== 'custom') setPersona('adam');
      if (customText) setCustomText('');
    }
  }, [onSelectCompanion, persona, customText]);
  

  const openCreator = useCallback(() => {
    const existingId = extractAvatarId(user?.rpm_user_url);
    if (existingId) {
      setCreatorSrc(`https://readyplayer.me/avatar?frameApi&avatarId=${encodeURIComponent(existingId)}`);
    } else {
      setCreatorSrc('https://readyplayer.me/avatar?frameApi');
    }
    setIsCreatingAvatar(true);
    setIsLoading(true);
  }, [user?.rpm_user_url]);

  // Set a default companion on initial render
  useEffect(() => {
    if (readyPlayerMeAvatars.adam) {
      handleAvatarSelect('ready-adam');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const existingId = extractAvatarId(user?.rpm_user_url);
    if (existingId) {
      setCreatorSrc(`https://readyplayer.me/avatar?frameApi&avatarId=${encodeURIComponent(existingId)}`);
    }
  }, [user?.rpm_user_url]);

  const handleCreateAvatar = () => {
    openCreator();
  };

  const saveAvatarToDB = useCallback(async (url: string) => {
    const { data: auth } = await supabase.auth.getUser();
    const u = auth?.user;
    if (!u) {
      // For anonymous users, we don't save to DB, but we still want to use the avatar for the session.
      onSaveAvatar({ url });
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .upsert({ id: u.id, rpm_user_url: url }, { onConflict: "id" });

    if (error) {
      console.error("upsert error:", error);
      toast.error("Couldn't save avatar. Try again.");
      return;
    }
    
    onSaveAvatar({ url });
  }, [onSaveAvatar]);
  

  const handleReadyPlayerMeMessage = useCallback((event: MessageEvent) => {
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

    void saveAvatarToDB(avatarUrl);

    const updatedId = extractAvatarId(avatarUrl);
    if (updatedId) {
      setCreatorSrc(`https://readyplayer.me/avatar?frameApi&avatarId=${encodeURIComponent(updatedId)}`);
    }

    setIsCreatingAvatar(false);
    setIsLoading(false);

    toast.success("🎉 Avatar saved!", {
      description: "It will now appear as your custom avatar.",
    });
  }, [saveAvatarToDB]);

  useEffect(() => {
    window.addEventListener("message", handleReadyPlayerMeMessage);
    return () => window.removeEventListener("message", handleReadyPlayerMeMessage);
  }, [handleReadyPlayerMeMessage]);

  

  if (isCreatingAvatar) {
    return (
      <div className="fixed inset-0 z-50 bg-white">
        {isLoading && (
          <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-10">
            <div className="text-center">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-primary" />
              <p>Loading ReadyPlayer.me…</p>
            </div>
          </div>
        )}
        <iframe
          src={creatorSrc}
          className="w-full h-full border-0"
          allow="camera *; microphone *"
          onLoad={() => setIsLoading(false)}
          title="ReadyPlayer.me Avatar Creator"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-100 via-pink-50 to-blue-100 flex flex-col items-center justify-center p-4">
      {/* Main Content */}
      <div className="w-full max-w-4xl text-center space-y-8">
        {/* Header */}
        <div className="space-y-4">
          <h1 className="text-3xl font-bold text-gray-900">
            Choose Your AI Avatar 🤖
          </h1>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Personalize your chat experience by selecting an avatar for your AI assistant using Ready Player Me technology! 🎮✨
          </p>
        </div>

        {/* Avatar Selection Grid */}
        <div className="flex justify-center max-w-2xl mx-auto">
          {/* Custom User Avatar - for creation, not selection */}
          <div
            onClick={handleCreateAvatar}
            className="bg-white rounded-2xl p-8 shadow-lg cursor-pointer transition-all hover:shadow-xl"
          >
            <div className="space-y-4">
              {/* Avatar Image - Show user's custom avatar if available */}
              <div className="w-32 h-32 mx-auto bg-gradient-to-br from-orange-300 to-red-400 rounded-full flex items-center justify-center overflow-hidden">
                {user?.rpm_user_url ? (
                  <img 
                    src={toThumbnail(user.rpm_user_url) || ""} 
                    alt="Your Custom Avatar"
                    className="w-full h-full object-cover rounded-full"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      const nextElement = e.currentTarget.nextElementSibling as HTMLElement;
                      if (nextElement) {
                        nextElement.style.display = 'flex';
                      }
                    }}
                  />
                ) : null}
                <div className={`w-28 h-28 bg-orange-200 rounded-full flex items-center justify-center ${user?.rpm_user_url ? 'hidden' : ''}`}>
                  <User className="w-16 h-16 text-orange-600" />
                </div>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {user?.rpm_user_url ? 'Your Custom Avatar' : 'Create Custom Avatar'}
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  {user?.rpm_user_url ? 'Ready Player Me Avatar' : 'Click to create with Ready Player Me'}
                </p>
                {!user?.rpm_user_url && (
                  <div className="mt-3">
                    <span className="inline-block px-3 py-1 bg-purple-100 text-purple-700 text-xs rounded-full">
                      ✨ Create Your Own
                    </span>
                  </div>
                )}
                {isLoggedIn && user?.rpm_user_url && (
                  <div className="mt-5">
                    <Button
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCreateAvatar();
                      }}
                      disabled={navigationLoading || saveLoading}
                      className="w-full border-purple-200 text-purple-600 hover:bg-purple-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {saveLoading ? (
                        <>
                          <RefreshCw className="animate-spin mr-2 h-4 w-4" />
                          Loading...
                        </>
                      ) : (
                        "Change Avatar"
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>

        {/* Ready-Made Avatars Section */}
        <div className="space-y-6">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Select Your AI Companion
            </h2>
            <p className="text-sm text-gray-600">
              Choose who you'd like to chat with. Your selection will appear in the chat. The tone affects <em>how</em> answers read, not the facts.
            </p>
          </div>   </div>
          
          <div className="grid md:grid-cols-2 gap-6 max-w-2xl mx-auto">id md:grid-cols-2 gap-6 max-w-2xl mx-auto">
            {/* Adam */}Adam */}
            <div  
              onClick={() => handleAvatarSelect('ready-adam')}    onClick={() => handleAvatarSelect('ready-adam')}
              className={`bg-white rounded-2xl p-6 shadow-lg cursor-pointer transition-all ${nter transition-all ${
                selectedAvatar === 'ready-adam' Avatar === 'ready-adam' 
                  ? 'ring-4 ring-blue-300 shadow-xl'  ? 'ring-4 ring-blue-300 shadow-xl' 
                  : 'hover:shadow-xl'
              }`}
            >
              <div className="space-y-3">
                {/* Avatar circle with gradient ring */}
                <div className="w-36 h-36 mx-auto rounded-full p-[3px] bg-gradient-to-br from-blue-300 via-indigo-300 to-purple-300">
                  <div className="w-full h-full rounded-full overflow-hidden bg-gradient-to-br from-indigo-200 to-blue-300 flex items-center justify-center">
                    <img 
                      src={toThumbnail(readyPlayerMeAvatars.adam) || ""}
                      alt="Adam Avatar"
                      className="w-full h-full object-cover rounded-full"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                        const next = (e.currentTarget.nextElementSibling as HTMLElement);
                        if (next) next.style.display = 'flex';
                      }}
                    />
                    <User className="w-12 h-12 text-blue-700 hidden" />
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-medium text-gray-900">Adam</h3>
                  <p className="text-xs text-gray-500">Ready Player Me Avatar</p>
                  {/* Graphic tone summary */}
                  <div className="mt-3 flex flex-wrap gap-2 justify-center">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs">
                      <Sparkles className="w-3.5 h-3.5" /> Direct Coach
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Clear next step
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-50 text-slate-700 text-xs">
                      <MessageSquare className="w-3.5 h-3.5" /> Minimal small talk
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 text-xs">
                      <ListChecks className="w-3.5 h-3.5" /> Bullet lists
                    </span>
                  </div>
                </div>
                {selectedAvatar === 'ready-adam' && (
                  <div className="mt-2">> handleAvatarSelect('ready-eve')}
                    <span className="inline-block px-3 py-1 bg-green-100 text-green-800 text-sm rounded-full">
                      Selected
                    </span> ring-blue-300 shadow-xl' 
                  </div>
                )}
              </div>
            </div>Name="space-y-3">
ircle with gradient ring */}
            {/* Eve */}lassName="w-36 h-36 mx-auto rounded-full p-[3px] bg-gradient-to-br from-pink-300 via-rose-300 to-purple-300">
            <div ed-full overflow-hidden bg-gradient-to-br from-pink-200 to-purple-300 flex items-center justify-center">
              onClick={() => handleAvatarSelect('ready-eve')}
              className={`bg-white rounded-2xl p-6 shadow-lg cursor-pointer transition-all ${
                selectedAvatar === 'ready-eve' 
                  ? 'ring-4 ring-blue-300 shadow-xl' 
                  : 'hover:shadow-xl'
              }`}
            >
              <div className="space-y-3">
                {/* Avatar circle with gradient ring */}
                <div className="w-36 h-36 mx-auto rounded-full p-[3px] bg-gradient-to-br from-pink-300 via-rose-300 to-purple-300">
                  <div className="w-full h-full rounded-full overflow-hidden bg-gradient-to-br from-pink-200 to-purple-300 flex items-center justify-center">
                    <img 
                      src={toThumbnail(readyPlayerMeAvatars.eve) || ""}
                      alt="Eve Avatar"
                      className="w-full h-full object-cover rounded-full"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                        const next = (e.currentTarget.nextElementSibling as HTMLElement);
                        if (next) next.style.display = 'block';
                      }}
                    />
                    <User className="w-12 h-12 text-pink-700 hidden" />
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-medium text-gray-900">Eve</h3>
                  <p className="text-xs text-gray-500">Ready Player Me Avatar</p>
                  {/* Graphic tone summary */}
                  <div className="mt-3 flex flex-wrap gap-2 justify-center">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-pink-50 text-pink-700 text-xs">
                      <HeartHandshake className="w-3.5 h-3.5" /> Warm Guide
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 text-xs">
                      <MessageSquare className="w-3.5 h-3.5" /> Gentle questions
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Supportive
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-50 text-slate-700 text-xs">
                      <ListChecks className="w-3.5 h-3.5" /> Next steps
                    </span>
                  </div>
                </div>
                {selectedAvatar === 'ready-eve' && (
                  <div className="mt-2">
                    <span className="inline-block px-3 py-1 bg-green-100 text-green-800 text-sm rounded-full">
                      Selected
                    </span>
                  </div>n"
                )}}
              </div>full border bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            </div>
          </div>

          {/* NEW: Custom tone box under the cards */}
          <div className="mt-2 max-w-2xl mx-auto rounded-xl border p-4 bg-white/80 text-left">
            <label className="block text-sm font-medium mb-2">
              Prefer a custom tone? <span className="text-gray-500 font-normal">(optional)</span>
              <span className="ml-1 text-gray-400 align-super">*</span>
            </label>
            {/* Quick tone chips for a more visual picker */}
            <div className="flex flex-wrap gap-2 mb-2">
              <button
                type="button"
                onClick={() => { const t = 'warm, empathetic tone with gentle questions'; setCustomText(t); setPersona('custom'); }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border bg-pink-50 text-pink-700 hover:bg-pink-100"
              >
                <HeartHandshake className="w-3.5 h-3.5" /> Warm
              </button>
              <button
                type="button"
                onClick={() => { const t = 'very clear, easy to understand explanations'; setCustomText(t); setPersona('custom'); }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Clear
              </button>
              <button
                type="button"
                onClick={() => { const t = 'direct and concise responses with one clear next step'; setCustomText(t); setPersona('custom'); }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
              >
                <Sparkles className="w-3.5 h-3.5" /> Direct
              </button>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                placeholder={`e.g., "very clear and understanding, simple words, one action step"`}
                value={customText}
                onChange={(e) => {
                  const v = e.target.value;
                  setCustomText(v);
                  if (v.trim().length > 0) setPersona('custom');assName="pt-2">
                }}
              />NavigateToChat}
              <Button{navigationLoading || saveLoading}
                type="button"rald-200 hover:bg-emerald-300 text-emerald-700 py-4 rounded-full text-lg font-semibold transition-all hover:shadow-lg flex items-center mx-auto h-10 w-50 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => {
                  if (customText.trim().length > 0) setPersona('custom');
                  if (onApplyTone) onApplyTone();>
                }} w-5" />
                disabled={applyToneLoading}g Chat...
              >
                {applyToneLoading ? 'Applying…' : 'Apply tone to this chat'}
              </Button>
            </div>
            <p className="mt-2 text-xs text-gray-500">ame="ml-0.5 h-6 w-5" />
              We’ll compile your description into safe style settings (clarity, warmth, directness, etc.). Retrieval & safety rules stay the same.
              <span className="ml-1 text-gray-400">*</span> Future feature — coming soon
            </p>
          </div>
        </div>

        {/* Start Chatting Button */}
        <div className="pt-2">
          <Button             onClick={onNavigateToChat}            disabled={navigationLoading || saveLoading}            className="bg-emerald-200 hover:bg-emerald-300 text-emerald-700 py-4 rounded-full text-lg font-semibold transition-all hover:shadow-lg flex items-center mx-auto h-10 w-50 disabled:opacity-50 disabled:cursor-not-allowed"          >            {navigationLoading ? (              <>                <RefreshCw className="animate-spin mr-2 h-5 w-5" />                Starting Chat...              </>            ) : (              <>                Start Chatting                <ArrowRight className="ml-0.5 h-6 w-5" />              </>            )}          </Button>        </div>      </div>    </div>  );}