'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ChatInterfaceScreen } from '../../../components/ChatInterfaceScreen';

export default function SimpleChatPage() {
  const router = useRouter();

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
        chatMode="standard"     // <- simple mode
        user={null}             // no signed-in user needed for simple mode
        currentAvatar={null}    // no avatar panel in simple mode
        currentMood={null}      // no preloaded mood check-in
      />
    </div>
  );
}
