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
    <div className="w-full h-full flex items-center justify-center text-gray-300">
      <Icon className="w-20 h-20" />
    </div>
  );

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-4">
      <div className="w-full h-[85%] max-h-[450px] rounded-3xl overflow-hidden shadow-inner bg-white/15 border border-white/25 backdrop-blur-sm grid grid-cols-2 divide-x divide-white/20">
        <div className="relative min-w-0 h-full bg-white/6">
          {hasUser ? (
            <RpmViewer
              src={userAvatar?.url ?? null}
              singleYaw={Math.PI / 9}
              singleLookAt={[1.8, 1.35, 0]}
              talkOverride={assistantTalking}
              animation={userAnimation}
            />
          ) : (
            <Placeholder icon={User} />
          )}
        </div>

        <div className="relative min-w-0 h-full bg-white/6">
          {hasCompanion ? (
            <RpmViewer
              src={aiAvatar?.url ?? null}
              assistantTalking={assistantTalking}
              singleYaw={-Math.PI / 9}
              singleLookAt={[-1.8, 1.35, 0]}
              animation={companionAnimation}
            />
          ) : (
            <Placeholder icon={Bot} />
          )}
        </div>
      </div>

      <div className="w-full flex justify-between mt-3 text-sm font-medium text-gray-700">
        <p className="w-1/2 text-center">
          {userAvatar?.name ?? 'You'}
        </p>
        <p className="w-1/2 text-center">
          {aiAvatar?.name ?? 'Adam'}
        </p>
      </div>
    </div>
  );
}
