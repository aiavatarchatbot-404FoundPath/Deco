'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { User, Bot } from 'lucide-react';

const RpmViewer = dynamic(() => import('./RpmViewer'), { ssr: false });

type Avatar = { name?: string; url?: string | null };

export default function AvatarDisplay({
  userAvatar,
  aiAvatar,
  assistantTalking = false, // pass isTyping here if you want AI mouth to move
}: {
  userAvatar: Avatar;
  aiAvatar: Avatar;
  assistantTalking?: boolean;
}) {
  const hasAny = !!userAvatar?.url || !!aiAvatar?.url;

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-4">
      <div className="w-full h-[85%] max-h-[450px] rounded-lg overflow-hidden shadow-inner bg-black/5">
        {hasAny ? (
          <RpmViewer
            userUrl={userAvatar?.url ?? null}
            aiUrl={aiAvatar?.url ?? null}
            assistantTalking={assistantTalking}
          />
        ) : (
          <div className="w-full h-full bg-gray-200 flex items-center justify-center rounded-lg gap-8">
            <User className="w-24 h-24 text-gray-400" />
            <Bot className="w-24 h-24 text-gray-400" />
          </div>
        )}
      </div>

      <div className="w-full flex justify-around mt-2">
        <p className="w-1/2 text-center font-medium text-gray-700">
          {userAvatar?.name ?? 'You'}
        </p>
        <p className="w-1/2 text-center font-medium text-gray-700">
          {aiAvatar?.name ?? 'Adam'}
        </p>
      </div>
    </div>
  );
}
