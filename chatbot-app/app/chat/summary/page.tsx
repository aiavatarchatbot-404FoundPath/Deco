'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import TranscriptScreen from '@/components/TranscriptScreen'; 
/**
 * ConversationSummaryPage
 * -----------------------
 * - Wraps the TranscriptScreen in a Next.js page
 * - Handles navigation (Continue Chatting, Back to Home, etc.)
 */
export default function ConversationSummaryPage() {
  const router = useRouter();

  /**
   * Handle navigation actions passed down from TranscriptScreen
   */
  const handleNavigate = (screen: string) => {
    switch (screen) {
      case 'chat':
        // 👇 decide whether to return user to avatar chat or simple chat
        router.push('/chat/avatar'); 
        break;
      case 'welcome':
      case 'home':
        router.push('/');
        break;
      default:
        console.log(`Navigate to: ${screen}`);
    }
  };

  return <TranscriptScreen onNavigate={handleNavigate} />;
}
