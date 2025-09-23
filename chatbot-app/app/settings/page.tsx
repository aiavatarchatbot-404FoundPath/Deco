// app/settings/page.tsx
"use client";

export const dynamic = 'force-dynamic';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '../../components/Navbar'; 
import SettingsScreen from '../../components/SettingsScreen';

export default function SettingsPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function getStableSession() {
      for (let i = 0; i < 10; i++) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) return session;
        await new Promise((r) => setTimeout(r, 100));
      }
      return null;
    }

    async function load() {
      const session = await getStableSession();
      const u = session?.user;

      if (!u) {
        // match Profile behavior: send to login if not signed in
        router.replace(`/login?redirect=${encodeURIComponent("/settings")}`);
        return;
      }

      if (!cancelled) setChecking(false);
    }

    load();
    return () => { cancelled = true; };
  }, [router]);

  if (checking) {
    return <div className="p-6">Checking session…</div>;
  }

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

            // NEW:
            case 'profile?saved':
              router.push('/profile?tab=saved');
              break;
            case 'profile?settings':
              router.push('/profile?tab=settings');
              break;

            case 'avatarbuilder':
              router.push('/avatarbuilder');
              break;
            case 'welcome':
            case '/':
            case 'home':
            default:
              router.push('/');
          }
        }}
        isLoggedIn={true}
        currentPage="settings"
      />
      <SettingsScreen
        onNavigate={(screen) => {
            if (screen === "settings") router.push("/settings");
            else if (screen === "profile") router.push("/profile");
            else if (screen === "profile?saved") router.push("/profile?tab=saved");       // ← add this
            else if (screen === "profile?settings") router.push("/profile?tab=settings"); // ← and this
            else if (screen === "avatarbuilder") router.push("/avatarbuilder");
            else router.push("/");
          }}
      />
    </div>
  );
}
