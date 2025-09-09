'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChatInterfaceScreen } from '../../../components/ChatInterfaceScreen';
import MoodCheckIn from '../../../components/MoodCheckIn';

export default function AvatarChatPage() {
  const router = useRouter();

  // Holds the user’s selected mood from MoodCheckIn (null until chosen or skipped)
  const [mood, setMood] = useState<{
    feeling: string;
    intensity: number;
    reason?: string;
    support?: string;
    timestamp: Date;
  } | null>(null);

  // TODO: replace with real user + ReadyPlayerMe avatar
  const mockUser = { id: '1', username: 'User123' };
  const mockAvatar = { name: 'Alex', type: 'custom' };

  // App-level navigation hook passed down into ChatInterfaceScreen & Sidebar
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
      case 'summary':
        router.push('/chat/summary'); // conversation summary page
        break;
      default:
        console.log(`Navigate to: ${screen}`);
    }
  };

  // MoodCheckIn → when completed we store mood (plus timestamp) which hides the overlay
  const handleMoodComplete = (moodData: {
    feeling: string;
    intensity: number;
    reason?: string;
    support?: string;
  }) => {
    setMood({
      ...moodData,
      timestamp: new Date(),
    });
  };

  // MoodCheckIn → user chose to skip (keep mood null)
  const handleSkip = () => {
    setMood(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-100 via-pink-50 to-blue-100">
      {/* Show the Mood Check-In overlay until user completes or skips */}
      {mood === null && (
        <MoodCheckIn onComplete={handleMoodComplete} onSkip={handleSkip} />
      )}

      {/* Main chat screen. Mood (if present) drives the greeting + header badge */}
      <ChatInterfaceScreen
        onNavigate={handleNavigation}
        chatMode="avatar"
        user={mockUser}
        currentAvatar={mockAvatar}
        currentMood={mood /* null means no mood chosen */}
      />
    </div>
  );
}
