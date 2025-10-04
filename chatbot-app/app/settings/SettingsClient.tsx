// app/settings/SettingsClient.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '../../components/Navbar';
import SettingsScreen from '../../components/SettingsScreen';
import { supabase } from "@/lib/supabaseClient";

export default function SettingsClient() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setIsLoggedIn(!!session?.user);
    };
    checkSession();
  }, []);

  return (
    <div>
      <Navbar
        onNavigate={(screen) => {
          switch (screen) {
            case 'settings':
              router.push('/settings');
              break;
            case 'profile':
              router.push('/profile');
              break;
            case 'profile?saved':
              router.push('/profile?tab=saved');
              break;
            case 'profile?settings':
              router.push('/profile?tab=settings');
              break;
            case 'avatarbuilder':
              router.push('/avatarbuilder');
              break;
            case 'login':
              router.push('/login');
              break;
            case 'welcome':
            case '/':
            case 'home':
            default:
              router.push('/');
          }
        }}
        isLoggedIn={isLoggedIn}
        currentPage="settings"
        isLoading={false}
      />
      <SettingsScreen
        onNavigate={(screen) => {
          if (screen === "settings") router.push("/settings");
          else if (screen === "profile") router.push("/profile");
          else if (screen === "profile?saved") router.push("/profile?tab=saved");
          else if (screen === "profile?settings") router.push("/profile?tab=settings");
          else if (screen === "avatarbuilder") router.push("/avatarbuilder");
          else if (screen === "chat") router.push("/chat/avatar");
          else router.push("/");
        }}
      />
    </div>
  );
}
