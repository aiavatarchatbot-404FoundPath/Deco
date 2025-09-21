"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '../../components/Navbar'; 
import SettingsScreen from '../../components/SettingsScreen';
import { Loading } from '../../components/ui/loading';

export default function SettingsPage() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false); // Mocked login state
  const [isLoading, setIsLoading] = useState(false);

  const handleNavigation = async (screen: string) => {
    setIsLoading(true);
    
    switch (screen) {
      case 'settings':
        // Already on settings page
        setIsLoading(false);
        break;
      case 'profile':
        // Profile page has its own loading, no need for additional loading here
        router.push('/profile');
        setIsLoading(false);
        break;
      case 'home':
      case '/':
      case 'welcome':
        router.push('/');
        // Loading will be cleared when new page loads
        break;
      case 'chat':
        router.push('/chat/avatar');
        // Loading will be cleared when new page loads
        break;
      default:
        console.log('Navigate to:', screen);
        setIsLoading(false);
    }
  };

  return (
    <div>
      <Navbar 
        onNavigate={handleNavigation}
        isLoggedIn={isLoggedIn}
        currentPage="settings"
      />

      <SettingsScreen onNavigate={handleNavigation} />
      
      {/* Loading overlay */}
      {isLoading && <Loading />}
    </div>
  );
}
