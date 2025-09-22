"use client";

import { Button } from '@/components/ui/button';
import { useRouter } from "next/navigation";

interface NavbarProps {
  onNavigate: (screen: string) => void;
  isLoggedIn: boolean;
  currentPage?: string;
}

export default function Navbar({ onNavigate, isLoggedIn = false, currentPage }: { onNavigate: (s: string) => void; isLoggedIn?: boolean; currentPage?: string }) {
  const router = useRouter();

  return (
    // <nav className="h-14 border-b bg-white flex items-center justify-between px-4">
    //   <button
    //     className="text-sm font-semibold"
    //     onClick={() => onNavigate('home')}
    //     aria-label="Go to home"
    //   >
    //     Adam • Companion
    //   </button>
    <nav className="flex items-center justify-between px-8 py-2 bg-white/80 backdrop-blur-sm border-b border-gray-100">
      <div className="flex items-center space-x-1">
        <span className="font-medium text-gray-700">Your Safe Chat Space</span>
      </div>
      
      <div className="flex items-center space-x-2">
        <Button
          onClick={() => onNavigate('/')}
          variant="ghost"
          size="sm"
          className={`px-4 py-1 rounded-full text-sm ${
            currentPage === 'home' || currentPage === '/' 
              ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' 
              : 'text-gray-600 hover:bg-emerald-100 hover:text-emerald-700'
          }`}
        >
          Home
        </Button>
        <Button
          onClick={() => onNavigate('settings')}
          variant="ghost"
          size="sm"
          className={`px-4 py-1 rounded-full text-sm ${
            currentPage === 'settings' 
              ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' 
              : 'text-gray-600 hover:bg-emerald-100 hover:text-emerald-700'
          }`}
        >
          Preferences
        </Button>
        
        {isLoggedIn ? (
          <Button 
            onClick={() => onNavigate('profile')}
            size="sm" 
            variant="ghost"
            className={`px-4 py-1 rounded-full text-sm ${
              currentPage === 'profile' 
                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' 
                : 'text-gray-600 hover:bg-emerald-100 hover:text-emerald-700'
            }`}
          >
            Profile
          </Button>
        ) : (
          <Button 
            size="sm" 
            onClick={() => router.push("/login")} 
            variant="ghost"
            className="px-4 py-1 rounded-full text-sm text-gray-600 hover:bg-emerald-100 hover:text-emerald-700"
          >
            Log in
          </Button>
        )}

      </div>
    </nav>
  );
}