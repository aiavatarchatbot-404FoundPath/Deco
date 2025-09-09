"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import Navbar from '../../components/Navbar'; 
import AvatarBuilderScreen from '../../components/AvatarBuilderScreen';

export default function AvatarBuilderPage() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadUser() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const currentUser = session?.user;
        
        if (currentUser) {
          setIsLoggedIn(true);
          
          // Fetch user profile data including avatar
          const { data: profile, error } = await supabase
            .from("profiles")
            .select("id, username, full_name, avatar_url, session_mode, rpm_user_url, rpm_companion_url")
            .eq("id", currentUser.id)
            .maybeSingle();
            
          if (profile) {
            setUser(profile);
          }
        } else {
          setIsLoggedIn(false);
        }
      } catch (error) {
        console.error("Error loading user:", error);
      } finally {
        setLoading(false);
      }
    }

    loadUser();
  }, []);

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

  const handleSaveAvatar = (avatar: any) => {
    // Handle avatar saving if needed
    console.log('Save avatar:', avatar);
  };

  const handleSelectAvatar = (avatar: any) => {
    // Handle avatar selection
    console.log('Select avatar:', avatar);
  };

  const handleNavigateToChat = () => {
    router.push('/chat/avatar');
  };

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div>
      <Navbar 
        onNavigate={handleNavigation}
        isLoggedIn={isLoggedIn}
      />

      <AvatarBuilderScreen 
        onNavigate={handleNavigation}
        onNavigateToChat={handleNavigateToChat}
        user={user}
        onSaveAvatar={handleSaveAvatar}
        onSelectAvatar={handleSelectAvatar}
      />
    </div>
  );
}
