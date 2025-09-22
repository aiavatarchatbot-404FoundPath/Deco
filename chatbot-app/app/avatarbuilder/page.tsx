"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import Navbar from '../../components/Navbar'; 
import AvatarBuilderScreen from '../../components/AvatarBuilderScreen';

export default function AvatarBuilderPage() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedAvatarUrl, setSelectedAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    async function loadUser() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const currentUser = session?.user;
        
        if (!currentUser) {
          setIsLoggedIn(false);
          setUser(null);
          return;
        }

        setIsLoggedIn(true);
        
        // Fetch user profile data including avatar
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, username, full_name, avatar_url, session_mode, rpm_user_url, rpm_companion_url")
          .eq("id", currentUser.id)
          .maybeSingle();
          
        if (profile) {
          setUser(profile);
        } else {
          // Create a user object from the session if no profile exists
          setUser({
            id: currentUser.id,
            username: currentUser.email?.split('@')[0] || 'User',
            rpm_user_url: null,
            rpm_companion_url: null,
          });
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

  const handleSaveAvatar = useCallback((avatar: any) => {
    console.log('Save avatar:', avatar);
    setUser((prevUser) => {
      if (prevUser) {
        // For logged-in users, update the existing profile
        return { ...prevUser, rpm_user_url: avatar.url };
      }
      // For anonymous users, create a temporary user object to hold the URL
      return { rpm_user_url: avatar.url };
    });
  }, []);

  const handleSelectAvatar = useCallback((avatar: any) => {
    console.log('Select avatar:', avatar);
    setSelectedAvatarUrl(avatar.url);
  }, []);

  const handleNavigateToChat = useCallback(() => {
    const params = new URLSearchParams();
    // The selected avatar is the COMPANION
    if (selectedAvatarUrl) {
      params.set('companionUrl', selectedAvatarUrl);
    }
    // The user's own avatar
    if (user?.rpm_user_url) {
      params.set('userUrl', user.rpm_user_url);
    }
    const queryString = params.toString();
    router.push(`/chat/avatar${queryString ? `?${queryString}` : ''}`);
  }, [selectedAvatarUrl, user, router]);

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
