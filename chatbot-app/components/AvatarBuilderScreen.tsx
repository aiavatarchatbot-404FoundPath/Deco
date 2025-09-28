import React, { useState, useEffect, useCallback } from 'react';
import { ArrowRight, User } from 'lucide-react';
import { Button } from './ui/button';
import { useRouter } from 'next/navigation';
import { Loading } from './ui/loading';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';

interface AvatarBuilderScreenProps {
  onNavigate: (screen: string) => void;
  onNavigateToChat: () => void;
  user?: any;
  onSaveAvatar: (avatar: any) => void;
  onSelectCompanion: (companion: "ADAM" | "EVE") => void;
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

export default function AvatarBuilderScreen({ onNavigate, onNavigateToChat, user, onSaveAvatar, onSelectCompanion }: AvatarBuilderScreenProps) {
  const [selectedAvatar, setSelectedAvatar] = useState<string>('ready-adam');
  const router = useRouter();
  const [isCreatingAvatar, setIsCreatingAvatar] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleAvatarSelect = useCallback((avatarId: string) => {
    setSelectedAvatar(avatarId);
    if (avatarId === 'eve') {
      onSelectCompanion('EVE');
    } else if (avatarId === 'ready-adam') {
      onSelectCompanion('ADAM');
    }
  }, [onSelectCompanion]);

  // Set a default companion on initial render
  useEffect(() => {
    if (readyPlayerMeAvatars.adam) {
      handleAvatarSelect('ready-adam');
    }
  }, [handleAvatarSelect]);

  const handleCreateAvatar = () => {
    setIsCreatingAvatar(true);
    setIsLoading(true);
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
          src="https://readyplayer.me/avatar?frameApi"
          className="w-full h-full border-0"
          allow="camera *; microphone *"
          onLoad={() => setIsLoading(false)}
          title="ReadyPlayer.me Avatar Creator"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-100 via-blue-50 to-indigo-100 flex flex-col items-center justify-center p-4">
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
            onClick={() => user?.rpm_user_url ? handleAvatarSelect('custom') : handleCreateAvatar()}
            className={`bg-white rounded-2xl p-8 shadow-lg cursor-pointer transition-all ${
              selectedAvatar === 'custom' 
                ? 'ring-4 ring-blue-300 shadow-xl' 
                : 'hover:shadow-xl'
            }`}
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
                      // Fallback to icon if image fails to load
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
                {selectedAvatar === 'custom' && (
                  <div className="mt-2">
                    <span className="inline-block px-3 py-1 bg-green-100 text-green-800 text-sm rounded-full">
                      Selected
                    </span>
                  </div>
                )}
                {!user?.rpm_user_url && (
                  <div className="mt-3">
                    <span className="inline-block px-3 py-1 bg-purple-100 text-purple-700 text-xs rounded-full">
                      ✨ Create Your Own
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Ready-Made Avatars Section */}
        <div className="space-y-6">
          <h2 className="text-xl font-semibold text-gray-900">
            Select Your AI Companion
          </h2>
          
          <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {/* Adam */}
            <div 
              onClick={() => handleAvatarSelect('ready-adam')}
              className={`bg-white rounded-2xl p-6 shadow-lg cursor-pointer transition-all ${
                selectedAvatar === 'ready-adam'
                  ? 'ring-4 ring-blue-300 shadow-xl' 
                  : 'hover:shadow-xl'
              }`}
            >
              <div className="space-y-3">
                <div className="w-24 h-24 mx-auto bg-gradient-to-br from-blue-300 to-indigo-400 rounded-full overflow-hidden flex items-center justify-center">
                  <img 
                    src={toThumbnail(readyPlayerMeAvatars.adam) || ""}
                    alt="Adam Avatar"
                    className="w-full h-full object-cover rounded-full"
                    onError={(e) => {
                      // Fallback to icon if image fails to load
                      e.currentTarget.style.display = 'none';
                      const nextElement = e.currentTarget.nextElementSibling as HTMLElement;
                      if (nextElement) {
                        nextElement.style.display = 'block';
                      }
                    }}
                  />
                  <User className="w-12 h-12 text-blue-700 hidden" />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-gray-900">Adam</h3>
                  <p className="text-xs text-gray-500">Professional & Supportive</p>
                </div>
                {selectedAvatar === 'ready-adam' && (
                  <div className="mt-2">
                    <span className="inline-block px-3 py-1 bg-green-100 text-green-800 text-sm rounded-full">
                      Selected
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Eve */}
            <div 
              onClick={() => handleAvatarSelect('eve')}
              className={`bg-white rounded-2xl p-6 shadow-lg cursor-pointer transition-all ${
                selectedAvatar === 'eve' 
                  ? 'ring-4 ring-blue-300 shadow-xl' 
                  : 'hover:shadow-xl'
              }`}
            >
              <div className="space-y-3">
                <div className="w-24 h-24 mx-auto bg-gradient-to-br from-pink-300 to-purple-400 rounded-full overflow-hidden flex items-center justify-center">
                  <img 
                    src={toThumbnail(readyPlayerMeAvatars.eve) || ""}
                    alt="Eve Avatar"
                    className="w-full h-full object-cover rounded-full"
                    onError={(e) => {
                      // Fallback to icon if image fails to load
                      e.currentTarget.style.display = 'none';
                      const nextElement = e.currentTarget.nextElementSibling as HTMLElement;
                      if (nextElement) {
                        nextElement.style.display = 'block';
                      }
                    }}
                  />
                  <User className="w-12 h-12 text-pink-700 hidden" />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-gray-900">Eve</h3>
                  <p className="text-xs text-gray-500">Caring & Empathetic</p>
                </div>
                {selectedAvatar === 'eve' && (
                  <div className="mt-2">
                    <span className="inline-block px-3 py-1 bg-green-100 text-green-800 text-sm rounded-full">
                      Selected
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* About Ready Player Me */}
        <div className="bg-gradient-to-r from-purple-100 to-blue-100 rounded-2xl p-6 max-w-2xl mx-auto">
          <h3 className="text-lg font-semibold text-purple-800 mb-3">
            About Ready Player Me
          </h3>
          <p className="text-gray-700 text-sm mb-4">
            Ready Player Me provides cutting-edge 3D avatar technology. Create custom avatars with facial expressions, animations, and personalized features for an immersive chat experience.
          </p>
          <Button 
            onClick={handleCreateAvatar}
            className="bg-purple-500 hover:bg-purple-600 text-white px-6 py-2 rounded-full text-sm font-medium transition-colors"
          >
            Create Avatar
          </Button>
        </div>

        {/* Start Chatting Button */}
        <div className="pt-2">
           <Button 
            onClick={onNavigateToChat}
            className="bg-emerald-200 hover:bg-emerald-300 text-emerald-700 py-4 rounded-full text-lg font-semibold transition-all hover:shadow-lg flex items-center mx-auto h-10 w-50"
            // style={{ minWidth: '20px', paddingLeft: '100px', paddingRight: '100px' }}
          >
            Start Chatting
            <ArrowRight className="ml-0.5 h-6 w-5" />
          </Button>
        </div>
      </div>

      {isLoading && <Loading />}
    </div>
  );
}