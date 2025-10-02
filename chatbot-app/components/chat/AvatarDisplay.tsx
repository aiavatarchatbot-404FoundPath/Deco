'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { User, Bot } from 'lucide-react';

const RpmViewer = dynamic(() => import('./RpmViewer'), { ssr: false });

type Avatar = {
  name?: string;
  url?: string | null;
};

export default function AvatarDisplay({
  userAvatar,
  aiAvatar,
  assistantTalking = false, // pass isTyping here if you want AI mouth to move
}: {
  userAvatar: Avatar;
  aiAvatar: Avatar;
  assistantTalking?: boolean;
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
        {/* Panel background */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(1200px 600px at 50% 0%, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0) 60%), linear-gradient(180deg, #fde7f3 0%, #f3ecff 100%)',
          }}
        />
        <div className="relative h-full overflow-hidden">
          {hasUser ? (
            <div className="absolute inset-0">
              <RpmViewer
                src={userAvatar?.url ?? null}
                singleYaw={-Math.PI / 2}
                singleLookAt={[2.2, 1.3, 0]}
                talkOverride={assistantTalking}
              />
            </div>
          ) : (
            <Placeholder icon={User} />
          )}
        </div>

        <div className="relative h-full overflow-hidden">
          {hasCompanion ? (
            <div className="absolute inset-0">
              <RpmViewer
                src={aiAvatar?.url ?? null}
                singleYaw={Math.PI / 2}
                singleLookAt={[-2.2, 1.3, 0]}
                talkOverride={assistantTalking}
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
}
