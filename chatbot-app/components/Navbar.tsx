"use client";

import React from 'react';
import { Button } from './ui/button';
import { useRouter } from 'next/navigation';

interface NavbarProps {
  onNavigate: (screen: string) => void;
  isLoggedIn: boolean;
}

export default function Navbar({ onNavigate, isLoggedIn }: NavbarProps) {
  const router = useRouter();

  const handleProfileClick = () => {
    router.push('/profile');
  };

  return (
    <nav className="flex items-center justify-between p-4 bg-white/80 backdrop-blur-sm border-b border-gray-100">
      <div className="flex items-center space-x-1">
        <span className="font-medium text-gray-700">Your Safe Chat Space</span>
      </div>
      
      <div className="flex items-center space-x-2">
        <Button
          onClick={() => onNavigate('welcome')}
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
        <Button
          onClick={handleProfileClick}
          variant="default"
          className="bg-gray-800 text-white hover:bg-gray-900 px-4 py-1 rounded-full text-sm"
        >
          View Profile
        </Button>
      </div>
    </nav>
  );
}