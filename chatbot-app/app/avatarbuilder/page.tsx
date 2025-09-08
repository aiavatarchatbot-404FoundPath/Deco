"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '../../components/Navbar'; 
import AvatarBuilderScreen from '../../components/AvatarBuilderScreen';

export default function AvatarBuilderPage() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false); // Mocked login state

  const handleNavigation = (screen: string) => {
    switch (screen) {
      case 'settings':
        router.push('/settings');
        break;
      case 'profile':
        router.push('/profile');
        break;
      case 'home':
      case '/':
      case 'welcome':
        router.push('/');
        break;
      case 'chat':
        // Add chat navigation if needed
        router.push('/chat/avatar');
        break;
      default:
        console.log('Navigate to:', screen);
    }
  };

  return (
    <div>
      <Navbar 
        onNavigate={handleNavigation}
        isLoggedIn={isLoggedIn}
        currentPage="settings"
      />

      <AvatarBuilderScreen onNavigate={handleNavigation} />
    </div>
  );
}
