// app/chat/summary/SummaryClient.tsx
"use client";

import React, { useState } from "react";
import { useRouter /*, useSearchParams*/ } from "next/navigation";
import TranscriptScreen from "@/components/TranscriptScreen";

/**
 * ConversationSummaryPage (client)
 * - Wraps the TranscriptScreen
 * - Handles navigation (Continue Chatting, Back to Home, etc.)
 */
export default function SummaryClient() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  // If you need a query param, uncomment:
  // const sp = useSearchParams();
  // const conversationId = sp.get("conversationId") ?? "";

  const handleNavigate = (screen: string) => {
    if (isLoading) return; // Prevent double clicks
    setIsLoading(true);

    try {
      switch (screen) {
        case "chat":
          router.push("/chat/avatar");
          break;
        case "welcome":
        case "home":
          router.push("/");
          break;
        default:
          console.log(`Navigate to: ${screen}`);
          setIsLoading(false);
      }
    } catch (error) {
      console.error("Navigation error:", error);
      setIsLoading(false);
    }
  };

  // If TranscriptScreen accepts extra props, you can pass them here (e.g., conversationId)
  return <TranscriptScreen onNavigate={handleNavigate} />;
}
