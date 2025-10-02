"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChatInterfaceScreen } from "../../../components/ChatInterfaceScreen";
import MoodCheckIn from "../../../components/MoodCheckIn";
import AnonymousExitWarning from "../../../components/chat/AnonymousExitWarning";
import { supabase } from "@/lib/supabaseClient";

type MoodData = {
  feeling: string;
  intensity: number;
  reason?: string;
  support?: string;
};

type MoodState = (MoodData & { timestamp: Date }) | null;

/**
 * SimpleChatPage
 * -----------------
 * This page renders the chat interface in "standard mode"
 * (no avatar panel) but still uses MoodCheckIn
 * so the user’s mood personalizes the greeting.
 */
export default function SimpleChatPage() {
  const router = useRouter();

  const [entryMood, setEntryMood] = useState<MoodState>(null);
  const [showEntryMoodCheck, setShowEntryMoodCheck] = useState(true);
  const [showExitMoodCheck, setShowExitMoodCheck] = useState(false);
  const [pendingNavigate, setPendingNavigate] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showAnonymousWarning, setShowAnonymousWarning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!mounted) return;
      setIsAuthenticated(!!user);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  //Navigation handler (same as avatar page)
  const handleNavigation = (screen: string) => {
    if (isLoading) return; // Prevent double clicks
    
    if (screen === "home" || screen === "endchat") {
      setPendingNavigate("/");
      if (!isAuthenticated) {
        setShowAnonymousWarning(true);
        return;
      }
      setShowExitMoodCheck(true);
      return;
    }
    
    setIsLoading(true);
    
    try {
      switch (screen) {
        case "/":
          router.push("/");
          break;
        case "profile":
          router.push("/profile");
          break;
        case "settings":
          router.push("/settings");
          break;
        case "summary":
          router.push("/chat/summary");
          break;
        default:
          console.log(`Navigate to: ${screen}`);
          setIsLoading(false);
      }
    } catch (error) {
      console.error('Navigation error:', error);
      setIsLoading(false);
    }
  };

  // Entry mood check handlers
  const handleMoodComplete = (moodData: MoodData) => {
    setEntryMood({ ...moodData, timestamp: new Date() });
    setShowEntryMoodCheck(false);
  };

  const handleSkip = () => {
    setEntryMood(null);
    setShowEntryMoodCheck(false);
  };

  // Exit mood check handlers
  const handleExitMoodComplete = (moodData: MoodData) => {
    setShowExitMoodCheck(false);
    // TODO: capture comparison analytics if needed
    router.push((pendingNavigate ?? "/") as any);
    setPendingNavigate(null);
  };

  const handleExitSkip = () => {
    setShowExitMoodCheck(false);
    router.push((pendingNavigate ?? "/") as any);
    setPendingNavigate(null);
  };

  const handleAnonymousContinue = () => {
    setShowAnonymousWarning(false);
    setShowExitMoodCheck(true);
  };

  const handleAnonymousClose = () => {
    setShowAnonymousWarning(false);
  };

  const handleAnonymousCreateAccount = () => {
    setShowAnonymousWarning(false);
    const current = typeof window !== "undefined"
      ? `${window.location.pathname}${window.location.search}`
      : "/chat/simple";
    router.push(`/login?redirect=${encodeURIComponent(current)}`);
  };

  /**
   * Render ChatInterfaceScreen in standard mode
   * - Uses MoodCheckIn overlay first
   * - Passes mood (or null if skipped) to ChatInterfaceScreen
   */
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-100 via-pink-50 to-blue-100">
      {showAnonymousWarning && (
        <AnonymousExitWarning
          onContinue={handleAnonymousContinue}
          onCreateAccount={handleAnonymousCreateAccount}
          onClose={handleAnonymousClose}
        />
      )}

      {/* MoodCheckIn modal appears on top until user chooses/skip */}
      {showEntryMoodCheck && (
        <MoodCheckIn onComplete={handleMoodComplete} onSkip={handleSkip} />
      )}

      {showExitMoodCheck && (
        <MoodCheckIn
          title="How are you feeling now? ✨"
          previousMood={entryMood ? { feeling: entryMood.feeling, intensity: entryMood.intensity } : null}
          confirmLabel="Save & End Chat"
          onComplete={handleExitMoodComplete}
          onSkip={handleExitSkip}
        />
      )}

      {/* Main chat interface (no avatar panel) */}
      <ChatInterfaceScreen
        onNavigate={handleNavigation}
        chatMode="standard"
        currentMood={entryMood}
        onSend={() => {}}
      />
    </div>
  );
}
