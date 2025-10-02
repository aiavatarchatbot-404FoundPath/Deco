'use client';

import React, { useState } from 'react';
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
  const [isLoading, setIsLoading] = useState(false);

  /**
   * Handle navigation actions passed down from TranscriptScreen
   */
  const handleNavigate = (screen: string) => {
    if (isLoading) return; // Prevent double clicks
    
    setIsLoading(true);
    
    try {
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
          setIsLoading(false);
      }
    } catch (error) {
      console.error('Navigation error:', error);
      setIsLoading(false);
    }
  };

  return <TranscriptScreen onNavigate={handleNavigate} />;
}
