// components/chat/AvatarDisplay.tsx
"use client";

import React from 'react';

interface AvatarDisplayProps {
  userAvatar?: any;
  aiAvatar: {
    name: string;
    type: string;
  };
  isAISpeaking: boolean;
}

export default function AvatarDisplay({ userAvatar, aiAvatar, isAISpeaking }: AvatarDisplayProps) {
  return (
    <div className="w-80 bg-gradient-to-b from-purple-100 to-blue-100 flex flex-col items-center justify-center p-6 border-r border-gray-200">
      <div className="flex flex-col items-center space-y-8">
        {/* AI Avatar - Adam */}
        <div className="relative">
          <div className="w-32 h-32 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center shadow-lg">
            {/* Avatar representation - you can replace with actual 3D model or image */}
            <div className="w-28 h-28 rounded-full bg-white flex items-center justify-center">
              <div className="text-4xl">👨‍💼</div>
            </div>
          </div>
          {/* Speaking indicator */}
          {isAISpeaking && (
            <div className="absolute -bottom-2 -right-2">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          )}
          <div className="text-center mt-3">
            <p className="font-medium text-gray-800">{aiAvatar.name}</p>
          </div>
        </div>

        {/* User Avatar */}
        <div className="relative">
          <div className="w-32 h-32 rounded-full bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center shadow-lg">
            <div className="w-28 h-28 rounded-full bg-white flex items-center justify-center">
              {userAvatar ? (
                <div className="text-4xl">{userAvatar.emoji || '👤'}</div>
              ) : (
                <div className="text-4xl">👤</div>
              )}
            </div>
          </div>
          <div className="text-center mt-3">
            <p className="font-medium text-gray-800">You</p>
          </div>
        </div>
      </div>

      {/* Connection Line */}
      <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2">
        <div className="w-px h-16 bg-gradient-to-b from-purple-300 to-teal-300 opacity-50"></div>
      </div>
    </div>
  );
}