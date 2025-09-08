import React, { useState } from 'react';
import { ArrowRight, User } from 'lucide-react';

interface AvatarBuilderScreenProps {
  onNavigate: (screen: string) => void;
  onNavigateToChat: () => void;
  user?: any;
  onSaveAvatar: (avatar: any) => void;
  onSelectAvatar: (avatar: any) => void;
}

export default function AvatarBuilderScreen({ onNavigate, onNavigateToChat, user, onSaveAvatar, onSelectAvatar }: AvatarBuilderScreenProps) {
  const [selectedAvatar, setSelectedAvatar] = useState<string>('custom');

  const handleAvatarSelect = (avatarId: string) => {
    setSelectedAvatar(avatarId);
    onSelectAvatar({ id: avatarId });
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
            onClick={() => handleAvatarSelect('custom')}
            className={`bg-white rounded-2xl p-8 shadow-lg cursor-pointer transition-all ${
              selectedAvatar === 'custom' 
                ? 'ring-4 ring-blue-300 shadow-xl' 
                : 'hover:shadow-xl'
            }`}
          >
            <div className="space-y-4">
              {/* Avatar Image Placeholder */}
              <div className="w-24 h-24 mx-auto bg-gradient-to-br from-orange-300 to-red-400 rounded-full flex items-center justify-center">
                {/* Female avatar placeholder */}
                <div className="w-20 h-20 bg-orange-200 rounded-full flex items-center justify-center">
                  <User className="w-12 h-12 text-orange-600" />
                </div>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Your Custom Avatar
                </h3>
                {selectedAvatar === 'custom' && (
                  <div className="mt-2">
                    <span className="inline-block px-3 py-1 bg-green-100 text-green-800 text-sm rounded-full">
                      Selected
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
                <div className="w-20 h-20 mx-auto bg-gradient-to-br from-teal-300 to-cyan-400 rounded-full flex items-center justify-center">
                  <User className="w-10 h-10 text-teal-700" />
                </div>
                <h3 className="text-lg font-medium text-gray-900">Eve</h3>
              </div>
            </div>

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
                <div className="w-20 h-20 mx-auto bg-gradient-to-br from-gray-300 to-gray-500 rounded-full flex items-center justify-center">
                  <User className="w-10 h-10 text-gray-700" />
                </div>
                <h3 className="text-lg font-medium text-gray-900">Adam</h3>
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
          <button 
            onClick={handleCreateAvatar}
            className="bg-purple-500 hover:bg-purple-600 text-white px-6 py-2 rounded-full text-sm font-medium transition-colors"
          >
            Create Avatar
          </button>
        </div>

        {/* Start Chatting Button */}
        <div className="pt-8">
          <button 
            onClick={onNavigateToChat}
            className="bg-green-500 hover:bg-green-600 text-white px-8 py-3 rounded-full font-medium transition-all hover:shadow-lg flex items-center mx-auto"
          >
            Start Chatting
            <ArrowRight className="ml-2 h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}