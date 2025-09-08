'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ChatInterfaceScreen } from '../../../components/ChatInterfaceScreen';

export default function AvatarChatPage() {
  const router = useRouter();

  // need to replace it with readyplayer me
  const mockUser = {
    id: '1',
    username: 'User123',
  };

  const mockAvatar = {
    name: 'Alex',
    type: 'custom',
  };

  const mockMood = {
    feeling: 'anxious',
    intensity: 4,
    reason: 'court date next week',
    support: 'need someone to talk to',
    timestamp: new Date(),
  };

  const handleNavigation = (screen: string) => {
    switch (screen) {
      case 'home':
        router.push('/');
        break;
      case 'profile':
        router.push('/profile');
        break;
      case 'settings':
        router.push('/settings');
        break;
      default:
        console.log(`Navigate to: ${screen}`);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-100 via-pink-50 to-blue-100">
      <ChatInterfaceScreen
        onNavigate={handleNavigation}
        chatMode="avatar"
        user={mockUser}
        currentAvatar={mockAvatar}
        currentMood={mockMood}
      />
    </div>
  );
}
