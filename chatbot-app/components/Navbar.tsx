
'use client';

import React from 'react';
import { Button } from '@/components/ui/button';

interface NavbarProps {
  onNavigate: (screen: string) => void;
  isLoggedIn?: boolean; 
}

export default function Navbar({ onNavigate, isLoggedIn }: NavbarProps) {
  return (
    <nav className="h-14 border-b bg-white flex items-center justify-between px-4">
      <button
        className="text-sm font-semibold"
        onClick={() => onNavigate('home')}
        aria-label="Go to home"
      >
        Adam • Companion
      </button>

      <div className="flex items-center gap-2">
        {isLoggedIn ? (
          <>
            <Button variant="ghost" size="sm" onClick={() => onNavigate('profile')}>
              Profile
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onNavigate('settings')}>
              Settings
            </Button>
          </>
        ) : (
          <Button size="sm" onClick={() => onNavigate('login')}>
            Log in
          </Button>
        )}
      </div>
    </nav>
  );
}
