"use client";

import { useEffect, useState } from "react";
import { Button } from '@/components/ui/button';
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

interface NavbarProps {
  onNavigate: (screen: string) => void;
  isLoggedIn: boolean;
  currentPage?: string;
}

export default function Navbar({ onNavigate, isLoggedIn: propIsLoggedIn }: { onNavigate: (s: string) => void; isLoggedIn?: boolean }) {
  const [isLoggedIn, setIsLoggedIn] = useState(propIsLoggedIn || false);
    const router = useRouter();
  
    useEffect(() => {
      supabase.auth.getUser().then(({ data }) => {
        setIsLoggedIn(!!data.user);
      });
  
      const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
        setIsLoggedIn(!!session?.user);
      });
  
      return () => subscription.subscription.unsubscribe();
    }, []);

  return (
    // <nav className="h-14 border-b bg-white flex items-center justify-between px-4">
    //   <button
    //     className="text-sm font-semibold"
    //     onClick={() => onNavigate('home')}
    //     aria-label="Go to home"
    //   >
    //     Adam • Companion
    //   </button>
    <nav className="flex items-center justify-between p-4 bg-white/80 backdrop-blur-sm border-b border-gray-100">
      <div className="flex items-center space-x-1">
        <span className="font-medium text-gray-700">Your Safe Chat Space</span>
      </div>
      
      <div className="flex items-center space-x-2">
        <Button
          onClick={() => onNavigate('/')}
          variant="ghost"
          size="sm"
          className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 px-4 py-1 rounded-full text-sm"
        >
          Home
        </Button>
        <Button
          onClick={() => onNavigate('settings')}
          variant="ghost"
          size="sm"
          className="text-gray-600 hover:bg-gray-100 px-4 py-1 rounded-full text-sm"
        >
          Preferences
        </Button>
        
       <nav className="flex justify-end p-4 bg-gray-100">
      
        {isLoggedIn ? (
          <Button onClick={() => router.push("/profile")} size="sm" variant="ghost">
            Profile
          </Button>
        ) : (
          <Button size="sm" onClick={() => router.push("/login")} variant="ghost">
            Log in
          </Button>
        )}
      </nav>

      </div>
    </nav>
  );
}