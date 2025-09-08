
'use client';

import React from 'react';
import { Button } from './ui/button';
import { useRouter } from 'next/navigation';

interface NavbarProps {
  onNavigate: (screen: string) => void;
  isLoggedIn: boolean;
  currentPage?: string;
}

export default function Navbar({ onNavigate, isLoggedIn, currentPage }: NavbarProps) {
  const router = useRouter();

  return (
    <nav className="flex items-center justify-center p-4 bg-white/80 backdrop-blur-sm border-b border-gray-100">
      <div className="flex items-center space-x-2">
        <Button
          onClick={() => onNavigate('/')}
          variant="ghost"
          size="sm"
          className={`px-4 py-1 rounded-full text-sm transition-colors ${
            currentPage === '/welcome' || currentPage === 'welcome' || currentPage === 'home'
              ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Home
        </Button>
        <Button
          onClick={() => onNavigate('settings')}
          variant="ghost"
          size="sm"
          className={`px-4 py-1 rounded-full text-sm transition-colors ${
            currentPage === 'settings'
              ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Preferences
        </Button>
      </div>
    </nav>
  );
}
