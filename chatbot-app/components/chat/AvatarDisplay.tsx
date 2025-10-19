'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { User, Bot } from 'lucide-react';
// No local Canvas here; each avatar uses its own Canvas in RpmViewer.

const RpmViewer = dynamic(() => import('./RpmViewer'), { ssr: false });

type Avatar = {
  name?: string;
  url?: string | null;
};

const AvatarDisplay = React.memo(function AvatarDisplay({
  userAvatar,
  aiAvatar,
  assistantTalking = false,
  userTalking = false,
}: {
  userAvatar: Avatar;
  aiAvatar: Avatar;
  assistantTalking?: boolean;
  userTalking?: boolean;
}) {
  const hasUser = !!userAvatar?.url;
  const hasCompanion = !!aiAvatar?.url;

  const Placeholder = ({ icon: Icon }: { icon: React.ComponentType<{ className?: string }> }) => (
    <div className="absolute inset-0 flex items-center justify-center text-gray-300">
      <Icon className="w-20 h-20" />
    </div>
  );

  return (
    <div className="w-full h-full flex flex-col gap-3 p-4">
      <div className="relative grid grid-cols-2 gap-3 w-full flex-1 min-h-[420px] rounded-xl overflow-hidden">
        {/* Background image behind both panels */}
        <div className="absolute inset-0 z-0 pointer-events-none">
          <img
            src="/background/room.jpg"
            alt=""
            className="w-full h-full object-cover"
            draggable={false}
          />
        </div>
        {/* Transparent panels over shared background */}
        {/* Left panel (User) */}
        <div className="relative z-10 h-full overflow-hidden rounded-xl ring-1 ring-black/10">
          {hasUser ? (
            <div className="absolute inset-0">
              <RpmViewer
                src={userAvatar?.url ?? null}
                // Face forward toward the camera
                singleYaw={0}
                singleLookAt={null}
                talkOverride={userTalking}
                actor={'user'}
              />
            </div>
          ) : (
            <Placeholder icon={User} />
          )}
        </div>

        {/* Right panel (Companion) */}
        <div className="relative z-10 h-full overflow-hidden rounded-xl ring-1 ring-black/10">
          {hasCompanion ? (
            <div className="absolute inset-0">
              <RpmViewer
                src={aiAvatar?.url ?? null}
                // Face forward toward the camera
                singleYaw={0}
                singleLookAt={null}
                talkOverride={assistantTalking}
                actor={'ai'}
              />
            </div>
          ) : (
            <Placeholder icon={Bot} />
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 text-sm font-medium text-gray-700">
        <p className="text-center">{userAvatar?.name ?? 'You'}</p>
        <p className="text-center">{aiAvatar?.name ?? 'Adam'}</p>
      </div>
    </div>
  );
});

export default AvatarDisplay;
