"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ChatInterfaceScreen } from "../../../components/ChatInterfaceScreen";
import MoodCheckIn from "../../../components/MoodCheckIn";

/**
 * SimpleChatPage
 * -----------------
 * This page renders the chat interface in "standard mode"
 * (no avatar panel) but still uses MoodCheckIn
 * so the user’s mood personalizes the greeting.
 */
export default function SimpleChatPage() {
  const router = useRouter();

  //Mood state (null until MoodCheckIn completes/skips)
  const [mood, setMood] = useState<{
    feeling: string;
    intensity: number;
    reason?: string;
    support?: string;
    timestamp: Date;
  } | null>(null);

  //Navigation handler (same as avatar page)
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
      router.push('/chat/summary');
      break;
    default:
      console.log(`Navigate to: ${screen}`);
  }
};

  //Handlers for MoodCheckIn
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

  const handleSkip = () => {
    setMood(null); 
  };

  /**
   * Render ChatInterfaceScreen in standard mode
   * - Uses MoodCheckIn overlay first
   * - Passes mood (or null if skipped) to ChatInterfaceScreen
   */
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-100 via-pink-50 to-blue-100">
      {/* MoodCheckIn modal appears on top until user chooses/skip */}
      {mood === null && (
        <MoodCheckIn onComplete={handleMoodComplete} onSkip={handleSkip} />
      )}

      {/* Main chat interface (no avatar panel) */}
      <ChatInterfaceScreen
        onNavigate={handleNavigation}
        chatMode="standard"
        currentMood={mood}
      />
    </div>
  );
}
