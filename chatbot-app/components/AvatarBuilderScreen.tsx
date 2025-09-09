import React, { useState } from 'react';
import { ArrowRight, User } from 'lucide-react';
import { Button } from './ui/button';
import { useRouter } from 'next/navigation';

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

  // Try to extract avatar id and use the official PNG endpoint
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
  const [selectedAvatar, setSelectedAvatar] = useState<string>('custom');
  const router = useRouter();

  // Debug: Log user data to see what we're getting
  console.log('AvatarBuilderScreen user data:', user);
  console.log('User rpm_user_url:', user?.rpm_user_url);

  // Ready Player Me avatar URLs - Replace these with your actual avatar links
  const readyPlayerMeAvatars = {
    adam: "https://models.readyplayer.me/68be69db5dc0cec769cfae75.glb",
    eve: "https://models.readyplayer.me/68be6a2ac036016545747aa9.glb"
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
    } else if (avatarId === 'ready-adam') {
      avatarData = {
        id: 'ready-adam',
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

  const handleCreateAvatar = () => {
    // Navigate to Ready Player Me selector
    onNavigate('profile/ReadyPlayerMeSelector');
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

          {/* AI Assistant Adam */}
          <div 
            onClick={() => handleAvatarSelect('adam')}
            className={`bg-white rounded-2xl p-8 shadow-lg cursor-pointer transition-all ${
              selectedAvatar === 'adam' 
                ? 'ring-4 ring-blue-300 shadow-xl' 
                : 'hover:shadow-xl'
            }`}
          >
            <div className="space-y-4">
              {/* Avatar Image Placeholder */}
              <div className="w-24 h-24 mx-auto bg-gradient-to-br from-blue-300 to-indigo-400 rounded-full flex items-center justify-center">
                {/* Male avatar placeholder */}
                <div className="w-20 h-20 bg-blue-200 rounded-full flex items-center justify-center">
                  <User className="w-12 h-12 text-blue-600" />
                </div>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  AI Assistance Adam
                </h3>
                {selectedAvatar === 'adam' && (
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

        {/* Ready-Made Avatars Section */}
        <div className="space-y-6">
          <h2 className="text-xl font-semibold text-gray-900">
            Choose from Ready-Made Avatars:
          </h2>
          
          <div className="grid md:grid-cols-2 gap-6 max-w-2xl mx-auto">
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
                <div className="w-32 h-32 mx-auto bg-gradient-to-br from-blue-300 to-indigo-400 rounded-full overflow-hidden flex items-center justify-center">
                  {/* You can replace this with an actual Ready Player Me preview image */}
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
                  <p className="text-xs text-gray-500">Ready Player Me Avatar</p>
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
                <div className="w-32 h-32 mx-auto bg-gradient-to-br from-pink-300 to-purple-400 rounded-full overflow-hidden flex items-center justify-center">
                  {/* You can replace this with an actual Ready Player Me preview image */}
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
                  <p className="text-xs text-gray-500">Ready Player Me Avatar</p>
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
            onClick={() => router.push('/chat/avatar')}
            className="bg-emerald-200 hover:bg-emerald-300 text-emerald-700 py-4 rounded-full text-lg font-semibold transition-all hover:shadow-lg flex items-center mx-auto h-10 w-50"
            // style={{ minWidth: '20px', paddingLeft: '100px', paddingRight: '100px' }}
          >
            Start Chatting
            <ArrowRight className="ml-0.5 h-6 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}