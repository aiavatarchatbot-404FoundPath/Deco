'use client';

import React, { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { User, Bot } from 'lucide-react';
import { type RpmAnimationConfig } from './RpmModel';

const RpmViewer = dynamic(() => import('./RpmViewer'), { ssr: false });

type Avatar = {
  name?: string;
  url?: string | null;
  animation?: RpmAnimationConfig;
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

  const userAnimation = useMemo<RpmAnimationConfig>(() => {
    if (userAvatar?.animation) return userAvatar.animation;
    return { profile: 'masculine' };
  }, [userAvatar?.animation]);

  const companionAnimation = useMemo<RpmAnimationConfig>(() => {
    if (aiAvatar?.animation) return aiAvatar.animation;
    return { profile: 'feminine' };
  }, [aiAvatar?.animation]);

  const Placeholder = ({ icon: Icon }: { icon: React.ComponentType<{ className?: string }> }) => (
    <div className="absolute inset-0 flex items-center justify-center text-gray-300">
      <Icon className="w-20 h-20" />
    </div>
  );

  return (
    <div className="w-full h-full flex flex-col gap-3 p-4">
      <div className="grid grid-cols-2 gap-3 w-full h-full max-h-[480px] min-h-[360px]">
        <div className="relative min-h-[320px] overflow-hidden">
          {hasUser ? (
            <div className="absolute inset-0">
              <RpmViewer
                src={userAvatar?.url ?? null}
                singleYaw={-Math.PI / 2}
                singleLookAt={[2.2, 1.3, 0]}
                talkOverride={assistantTalking}
                animation={userAnimation}
              />
            </div>
          ) : (
            <Placeholder icon={User} />
          )}
        </div>

        <div className="relative min-h-[320px] overflow-hidden">
          {hasCompanion ? (
            <div className="absolute inset-0">
              <RpmViewer
                src={aiAvatar?.url ?? null}
                singleYaw={Math.PI / 2}
                singleLookAt={[-2.2, 1.3, 0]}
                talkOverride={assistantTalking}
                animation={companionAnimation}
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
