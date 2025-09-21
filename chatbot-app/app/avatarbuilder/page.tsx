"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import Navbar from '../../components/Navbar'; 
import AvatarBuilderScreen from '../../components/AvatarBuilderScreen';
import { Loading } from '../../components/ui/loading';

export default function AvatarBuilderPage() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [avatarUpdateMessage, setAvatarUpdateMessage] = useState<string | null>(null);

  useEffect(() => {
    // Check if we're loading due to an avatar update
    const updateMessage = localStorage.getItem('avatarUpdateLoading');
    if (updateMessage) {
      setAvatarUpdateMessage(updateMessage);
      localStorage.removeItem('avatarUpdateLoading');
    }
  }, []);

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

    // Listen for auth state changes and avatar updates
    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      loadUser();
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
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

  const handleSaveAvatar = async (avatar: any) => {
    // Handle avatar saving if needed
    console.log('Save avatar:', avatar);
    
    // Refresh user data after saving
    setRefreshing(true);
    await refreshUserData();
    setRefreshing(false);
  };

  const handleSelectAvatar = async (avatar: any) => {
    // Handle avatar selection
    console.log('Select avatar:', avatar);
    
    // Don't refresh for Ready Player Me avatars since saveAvatarToDB will handle the refresh
    if (avatar?.type === 'readyplayerme' && avatar?.isCustom) {
      return;
    }
    
    // Refresh user data after selecting (for non-Ready Player Me avatars)
    setRefreshing(true);
    await refreshUserData();
    setRefreshing(false);
  };

  const refreshUserData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const currentUser = session?.user;
      
      if (currentUser) {
        const { data: profile, error } = await supabase
          .from("profiles")
          .select("id, username, full_name, avatar_url, session_mode, rpm_user_url, rpm_companion_url")
          .eq("id", currentUser.id)
          .maybeSingle();
          
        if (profile) {
          setUser(profile);
        }
      }
    } catch (error) {
      console.error("Error refreshing user data:", error);
    }
  };

  const handleNavigateToChat = () => {
    router.push('/chat/avatar');
  };

  if (loading) {
    const loadingMessage = avatarUpdateMessage || "Loading avatar builder...";
    return <Loading message={loadingMessage} />;
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
      
      {/* Show loading overlay when refreshing user data */}
      {refreshing && <Loading message="Updating avatar data..." />}
    </div>
  );
}
