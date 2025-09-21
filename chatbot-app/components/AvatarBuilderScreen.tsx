import React, { useState, useEffect, useCallback } from 'react';
import { ArrowRight, User, Sparkles, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';
import { useRouter } from 'next/navigation';
import { Loading } from './ui/loading';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';

interface AvatarBuilderScreenProps {
  onNavigate: (screen: string) => void;
  onNavigateToChat: () => void;
  user?: any;
  onSaveAvatar: (avatar: any) => void;
  onSelectAvatar: (avatar: any) => void;
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

export default function AvatarBuilderScreen({ onNavigate, onNavigateToChat, user, onSaveAvatar, onSelectAvatar }: AvatarBuilderScreenProps) {
  const [selectedAvatar, setSelectedAvatar] = useState<string>('adam'); // Set Adam as default
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isIframeLoading, setIsIframeLoading] = useState(false);
  const [isCreatingUserAvatar, setIsCreatingUserAvatar] = useState(false);
  const [isCreatingCompanionAvatar, setIsCreatingCompanionAvatar] = useState(false);
  const [activeAvatarType, setActiveAvatarType] = useState<'user' | 'companion'>('user');

  // Debug: Log user data 
  console.log('AvatarBuilderScreen user data:', user);
  console.log('User rpm_user_url:', user?.rpm_user_url);

  // Navigation with loading
  const handleNavigation = async (screen: string) => {
    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 300));
    onNavigate(screen);
  };

  // Chat navigation with loading  
  const handleStartChat = async () => {
    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 300));
    router.push('/chat/avatar');
  };

  // Check for avatar save success message after page load
  useEffect(() => {
    const savedSuccess = localStorage.getItem('avatarSaveSuccess');
    if (savedSuccess) {
      try {
        const { message, description } = JSON.parse(savedSuccess);
        toast.success(message, { description });
        localStorage.removeItem('avatarSaveSuccess');
      } catch (error) {
        console.error('Error parsing saved success message:', error);
        localStorage.removeItem('avatarSaveSuccess');
      }
    }
  }, []);

  // Save avatar to database
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

    // Store success message for after page refresh
    const successMessage = type === "user" ? "🎉 Avatar saved!" : "🎉 Companion saved!";
    localStorage.setItem('avatarSaveSuccess', JSON.stringify({
      message: successMessage,
      description: "Your avatar is now active!"
    }));

    // Store loading message for the refresh
    const loadingMessage = type === "user" ? "Updating Avatar..." : "Updating Companion...";
    localStorage.setItem('avatarUpdateLoading', loadingMessage);

    // Trigger a page refresh
    if (window.location.pathname.includes('avatarbuilder')) {
      window.location.reload();
    }
  }, []);

  // Handle Ready Player Me message events
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

    // Build object for parent callback
    const parts = avatarUrl.split("/");
    const last = parts[parts.length - 1] ?? "";
    const avatarId = last.replace(".glb", "");
    const newAvatar = {
      id: avatarId || `custom-${Date.now()}`,
      name: `Custom ${activeAvatarType === "user" ? "Avatar" : "Companion"}`,
      url: avatarUrl,
      type: 'readyplayerme',
      thumbnail: toThumbnail(avatarUrl),
      isCustom: true,
    };

    onSelectAvatar(newAvatar);
    void saveAvatarToDB(activeAvatarType, avatarUrl);

    // Update selected avatar if it's a user avatar
    if (activeAvatarType === 'user') {
      setSelectedAvatar('custom');
    } else {
      setSelectedAvatar('custom-companion');
    }

    setIsCreatingUserAvatar(false);
    setIsCreatingCompanionAvatar(false);
  }, [activeAvatarType, onSelectAvatar, saveAvatarToDB]);

  // Set up message listener
  useEffect(() => {
    window.addEventListener("message", handleReadyPlayerMeMessage);
    return () => window.removeEventListener("message", handleReadyPlayerMeMessage);
  }, [handleReadyPlayerMeMessage]);

  // Open Ready Player Me dialog
  const openReadyPlayerMe = (type: 'user' | 'companion') => {
    setActiveAvatarType(type);
    setIsIframeLoading(true);
    if (type === 'user') {
      setIsCreatingUserAvatar(true);
    } else {
      setIsCreatingCompanionAvatar(true);
    }
  };

  // Ready Player Me avatar URLs
  const readyPlayerMeAvatars = {
    adam: "https://models.readyplayer.me/68be69db5dc0cec769cfae75.glb",
    eve: "https://models.readyplayer.me/68be6a2ac036016545747aa9.glb",
    jordan: "https://models.readyplayer.me/6507c69c05a3a4cdc04b9c4a.glb" // Adding Jordan neutral gender avatar
  };

  // Function to get current selected avatar details
  const getCurrentAvatarDisplay = () => {
    switch (selectedAvatar) {
      case 'adam':
        return {
          name: 'AI Assistant Adam',
          avatar: toThumbnail(readyPlayerMeAvatars.adam),
          fallback: { bg: 'from-blue-300 to-indigo-400', icon: 'text-blue-600' }
        };
      case 'eve':
        return {
          name: 'AI Assistant Eve',
          avatar: toThumbnail(readyPlayerMeAvatars.eve),
          fallback: { bg: 'from-pink-300 to-purple-400', icon: 'text-pink-600' }
        };
      case 'jordan':
        return {
          name: 'AI Assistant Jordan',
          avatar: toThumbnail(readyPlayerMeAvatars.jordan),
          fallback: { bg: 'from-green-300 to-teal-400', icon: 'text-green-600' }
        };
      case 'custom-companion':
        return {
          name: 'Custom AI Companion',
          avatar: user?.rpm_companion_url ? toThumbnail(user.rpm_companion_url) : null,
          fallback: { bg: 'from-purple-300 to-indigo-400', icon: 'text-purple-600' }
        };
      case 'custom':
      default:
        return {
          name: 'AI Assistant Adam', // Default back to Adam
          avatar: toThumbnail(readyPlayerMeAvatars.adam),
          fallback: { bg: 'from-blue-300 to-indigo-400', icon: 'text-blue-600' }
        };
    }
  };

  const handleAvatarSelect = (avatarId: string) => {
    setSelectedAvatar(avatarId);
    
    // Pass the appropriate avatar data based on selection
    let avatarData;
    
    if (avatarId === 'custom') {
      // Use user's custom avatar if available, otherwise prompt to create one
      avatarData = {
        id: 'custom',
        name: user?.rpm_user_url ? 'Custom Avatar' : 'Create Custom Avatar',
        type: 'readyplayerme',
        url: user?.rpm_user_url || null,
        isCustom: true
      };
    } else if (avatarId === 'eve') {
      avatarData = {
        id: 'eve',
        name: 'Eve',
        type: 'readyplayerme',
        url: readyPlayerMeAvatars.eve
      };
    } else if (avatarId === 'jordan') {
      avatarData = {
        id: 'jordan',
        name: 'Jordan',
        type: 'readyplayerme',
        url: readyPlayerMeAvatars.jordan
      };
    } else if (avatarId === 'custom-companion') {
      avatarData = {
        id: 'custom-companion',
        name: 'Custom',
        type: 'readyplayerme',
        url: user?.rpm_companion_url || null,
        isCustom: true
      };
    } else if (avatarId === 'adam') {
      avatarData = {
        id: 'adam',
        name: 'Adam',
        type: 'readyplayerme',
        url: readyPlayerMeAvatars.adam
      };
    } else {
      avatarData = {
        id: avatarId,
        name: avatarId,
        type: 'default',
        url: null
      };
    }
    
    onSelectAvatar(avatarData);
  };

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
        <div className="grid md:grid-cols-2 gap-6 max-w-2xl mx-auto">
          {/* Custom Avatar */}
          <div 
            onClick={() => user?.rpm_user_url ? handleAvatarSelect('custom') : openReadyPlayerMe('user')}
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
                {selectedAvatar === 'custom' && (
                  <div className="mt-2">
                    <span className="inline-block px-3 py-1 bg-green-100 text-green-800 text-sm rounded-full">
                      Selected
                    </span>
                  </div>
                )}
                <div className="mt-3">
                  <Button 
                    onClick={(e) => {
                      e.stopPropagation();
                      openReadyPlayerMe('user');
                    }}
                    size="sm"
                    className="bg-purple-500 hover:bg-purple-600 text-white"
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    {user?.rpm_user_url ? 'Customize Avatar' : 'Create Avatar'}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* AI Assistant - Dynamic based on selection */}
          <div 
            onClick={() => handleAvatarSelect('adam')}
            className={`bg-white rounded-2xl p-8 shadow-lg cursor-pointer transition-all ${
              selectedAvatar === 'adam' || selectedAvatar === 'eve' || selectedAvatar === 'jordan' || selectedAvatar === 'custom-companion'
                ? 'ring-4 ring-blue-300 shadow-xl' 
                : 'hover:shadow-xl'
            }`}
          >
            <div className="space-y-4">
              {/* Dynamic Avatar Image */}
              <div className={`w-32 h-32 mx-auto bg-gradient-to-br ${getCurrentAvatarDisplay().fallback.bg} rounded-full flex items-center justify-center overflow-hidden`}>
                {getCurrentAvatarDisplay().avatar ? (
                  <img 
                    src={getCurrentAvatarDisplay().avatar || ""}
                    alt={getCurrentAvatarDisplay().name}
                    className="w-full h-full object-cover rounded-full"
                  />
                ) : (
                  // Only show icon fallback for custom-companion, not for Adam/Eve/Jordan
                  selectedAvatar === 'custom-companion' && (
                    <div className="w-28 h-28 bg-opacity-50 bg-white rounded-full flex items-center justify-center">
                      <User className={`w-16 h-16 ${getCurrentAvatarDisplay().fallback.icon}`} />
                    </div>
                  )
                )}
              </div>
              
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {getCurrentAvatarDisplay().name}
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  Your selected AI companion
                </p>
                <div className="mt-2">
                  <span className="inline-block px-3 py-1 bg-green-100 text-green-800 text-sm rounded-full">
                    Current Selection
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Ready-Made Avatars Section */}
        <div className="space-y-6">
          <h2 className="text-xl font-semibold text-gray-900">
            Choose from Ready-Made Avatars:
          </h2>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {/* Adam */}
            <div 
              onClick={() => handleAvatarSelect('adam')}
              className={`bg-white rounded-2xl p-6 shadow-lg cursor-pointer transition-all ${
                selectedAvatar === 'adam'
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
                {selectedAvatar === 'adam' && (
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

            {/* Jordan */}
            <div 
              onClick={() => handleAvatarSelect('jordan')}
              className={`bg-white rounded-2xl p-6 shadow-lg cursor-pointer transition-all ${
                selectedAvatar === 'jordan' 
                  ? 'ring-4 ring-blue-300 shadow-xl' 
                  : 'hover:shadow-xl'
              }`}
            >
              <div className="space-y-3">
                <div className="w-24 h-24 mx-auto bg-gradient-to-br from-green-300 to-teal-400 rounded-full overflow-hidden flex items-center justify-center">
                  <img 
                    src={toThumbnail(readyPlayerMeAvatars.jordan) || ""}
                    alt="Jordan Avatar"
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
                  <User className="w-12 h-12 text-green-700 hidden" />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-gray-900">Jordan</h3>
                  <p className="text-xs text-gray-500">Neutral & Balanced</p>
                </div>
                {selectedAvatar === 'jordan' && (
                  <div className="mt-2">
                    <span className="inline-block px-3 py-1 bg-green-100 text-green-800 text-sm rounded-full">
                      Selected
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Customize Your Own Avatar Companion */}
            <div 
              onClick={() => user?.rpm_companion_url ? handleAvatarSelect('custom-companion') : openReadyPlayerMe('companion')}
              className={`bg-white rounded-2xl p-6 shadow-lg cursor-pointer transition-all ${
                selectedAvatar === 'custom-companion' 
                  ? 'ring-4 ring-blue-300 shadow-xl' 
                  : 'hover:shadow-xl'
              }`}
            >
              <div className="space-y-3">
                <div className="w-24 h-24 mx-auto bg-gradient-to-br from-purple-300 to-indigo-400 rounded-full overflow-hidden flex items-center justify-center">
                  {user?.rpm_companion_url ? (
                    <img 
                      src={toThumbnail(user.rpm_companion_url) || ""}
                      alt="Custom Companion Avatar"
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
                  <div className={`w-20 h-20 bg-purple-200 rounded-full flex items-center justify-center ${user?.rpm_companion_url ? 'hidden' : ''}`}>
                    <User className="w-8 h-8 text-purple-600" />
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-medium text-gray-900">
                    {user?.rpm_companion_url ? 'Custom' : 'Create Companion'}
                  </h3>
                  {selectedAvatar === 'custom-companion' && (
                    <div className="mt-2">
                      <span className="inline-block px-3 py-1 bg-green-100 text-green-800 text-sm rounded-full">
                        Selected
                      </span>
                    </div>
                  )}
                  <div className="mt-3">
                    <Button 
                      onClick={(e) => {
                        e.stopPropagation();
                        openReadyPlayerMe('companion');
                      }}
                      size="sm"
                      className="bg-purple-500 hover:bg-purple-600 text-white text-xs"
                    >
                      <Sparkles className="w-3 h-3 mr-1" />
                      {user?.rpm_companion_url ? 'Customize' : 'Create'}
                    </Button>
                  </div>
                </div>
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
            onClick={() => openReadyPlayerMe('user')}
            className="bg-purple-500 hover:bg-purple-600 text-white px-6 py-2 rounded-full text-sm font-medium transition-colors"
          >
            Create Avatar
          </Button>
          
        </div>

        {/* Start Chatting Button */}
        <div className="pt-2">
          <Button 
            onClick={handleStartChat}
            className="bg-emerald-200 hover:bg-emerald-300 text-emerald-700 py-4 rounded-full text-lg font-semibold transition-all hover:shadow-lg flex items-center mx-auto h-10 w-50"
            // style={{ minWidth: '20px', paddingLeft: '100px', paddingRight: '100px' }}
          >
            Start Chatting
            <ArrowRight className="ml-0.5 h-6 w-5" />
          </Button>
        </div>
      </div>

      {/* Ready Player Me Dialogs */}
      {/* User Avatar Creation Dialog */}
      <Dialog open={isCreatingUserAvatar} onOpenChange={setIsCreatingUserAvatar}>
        <DialogContent className="max-w-[95vw] h-[95vh]">
          <DialogHeader>
            <DialogTitle>Create Your Custom Avatar</DialogTitle>
            <DialogDescription>Use Ready Player Me to create your personalized 3D avatar. Click "Export Avatar" when you're done to save.</DialogDescription>
          </DialogHeader>
          <div className="flex-1 relative">
            {isIframeLoading && <Loading message="Loading Ready Player Me..." />}
            <iframe
              src="https://readyplayer.me/avatar?frameApi"
              className="w-full h-full rounded-lg border"
              allow="camera *; microphone *"
              onLoad={() => setIsIframeLoading(false)}
              title="Ready Player Me Avatar Creator"
              style={{ minHeight: "600px" }}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Companion Avatar Creation Dialog */}
      <Dialog open={isCreatingCompanionAvatar} onOpenChange={setIsCreatingCompanionAvatar}>
        <DialogContent className="max-w-[95vw] h-[95vh]">
          <DialogHeader>
            <DialogTitle>Create Custom Companion Avatar</DialogTitle>
            <DialogDescription>Design a unique companion avatar using Ready Player Me. Click "Export Avatar" when you're satisfied with your creation.</DialogDescription>
          </DialogHeader>
          <div className="flex-1 relative">
            {isIframeLoading && <Loading message="Loading Ready Player Me..." />}
            <iframe
              src="https://readyplayer.me/avatar?frameApi"
              className="w-full h-full rounded-lg border"
              allow="camera *; microphone *"
              onLoad={() => setIsIframeLoading(false)}
              title="Ready Player Me Companion Creator"
              style={{ minHeight: "600px" }}
            />
          </div>
        </DialogContent>
      </Dialog>

      {isLoading && <Loading />}
    </div>
  );
}