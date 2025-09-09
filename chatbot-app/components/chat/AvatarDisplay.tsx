// components/chat/AvatarDisplay.tsx
'use client';

import React from 'react';

interface AvatarDisplayProps {
  aiAvatar?: { name?: string; url?: string };
  userAvatar?: { name?: string; url?: string };
}

/**
 * AvatarDisplay
 * Shows the AI avatar (left) and the user's avatar (right)
 */
export default function AvatarDisplay({
  aiAvatar = { name: 'Adam' },
  userAvatar = { name: 'You' },
}: AvatarDisplayProps) {
  const AI_NAME = aiAvatar?.name || 'Adam';
  const USER_NAME = userAvatar?.name || 'You';

  return (
    <aside
      className="
        hidden lg:flex       /* only show on large screens */
        w-[32rem] max-w-[36rem]
        bg-white
        border border-gray-200
        rounded-2xl
        p-6
        mr-4
        self-stretch
        flex-col
      "
      aria-label="Avatar display"
    >
      {/* Avatar stage */}
      <div className="flex-1 flex items-center justify-center">
        <div className="grid grid-cols-2 items-center w-full">
          {/* AI avatar (left) */}
          <figure className="flex flex-col items-center justify-center">
            <div
              className="
                w-44 h-44 md:w-48 md:h-48
                rounded-full overflow-hidden
                bg-gradient-to-br from-blue-100 to-purple-100
                border border-gray-200
                flex items-center justify-center
              "
            >
              {aiAvatar?.url ? (
                <img
                  src={aiAvatar.url}
                  alt={AI_NAME}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-4xl" aria-hidden="true">🧑‍💼</span>
              )}
            </div>
            <figcaption className="mt-3 text-sm text-gray-700">{AI_NAME}</figcaption>
          </figure>

          {/* User avatar (right) */}
          <figure className="flex flex-col items-center justify-center">
            <div
              className="
                w-44 h-44 md:w-48 md:h-48
                rounded-full overflow-hidden
                bg-gradient-to-br from-teal-100 to-blue-100
                border border-gray-200
                flex items-center justify-center
              "
            >
              {userAvatar?.url ? (
                <img
                  src={userAvatar.url}
                  alt={USER_NAME}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-4xl" aria-hidden="true">🧑‍🎤</span>
              )}
            </div>
            <figcaption className="mt-3 text-sm text-gray-700">You</figcaption>
          </figure>
        </div>
      </div>

      {/* divider line */}
      <div className="mt-6 border-t border-gray-200" />
    </aside>
  );
}
