"use client";

import { Button } from '@/components/ui/button';
import { useRouter } from "next/navigation";

interface NavbarProps {
  onNavigate: (screen: string) => void;
  isLoggedIn: boolean;
  currentPage?: string;
  isLoading?: boolean;
}

export default function Navbar({ onNavigate, isLoggedIn = false, currentPage, isLoading = false }: NavbarProps) {
  const router = useRouter();

  return (
    <nav className="flex items-center justify-between px-8 py-2 bg-white/80 backdrop-blur-sm border-b border-gray-100">
      <div className="flex items-center space-x-1">
        <span className="font-medium text-gray-700">Your Safe Chat Space</span>
      </div>
      
      <div className="flex items-center space-x-2">
        <Button
          onClick={() => onNavigate('/')}
          variant="ghost"
          size="sm"
          disabled={isLoading}
          className={`px-4 py-1 rounded-full text-sm disabled:opacity-50 disabled:cursor-not-allowed ${
            currentPage === 'home' || currentPage === '/' 
              ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' 
              : 'text-gray-600 hover:bg-emerald-100 hover:text-emerald-700'
          }`}
        >
          {isLoading ? (
            <>
              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-emerald-700 mr-1"></div>
              Loading...
            </>
          ) : (
            'Home'
          )}
        </Button>
        <Button
          onClick={() => onNavigate('settings')}
          variant="ghost"
          size="sm"
          disabled={isLoading}
          className={`px-4 py-1 rounded-full text-sm disabled:opacity-50 disabled:cursor-not-allowed ${
            currentPage === 'settings' 
              ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' 
              : 'text-gray-600 hover:bg-emerald-100 hover:text-emerald-700'
          }`}
        >
          {isLoading ? (
            <>
              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-emerald-700 mr-1"></div>
              Loading...
            </>
          ) : (
            'Preferences'
          )}
        </Button>
        
        {isLoggedIn ? (
          <Button 
            onClick={() => onNavigate('profile')} 
            size="sm" 
            variant="ghost"
            disabled={isLoading}
            className={`px-4 py-1 rounded-full text-sm disabled:opacity-50 disabled:cursor-not-allowed ${
              currentPage === 'profile' 
                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' 
                : 'text-gray-600 hover:bg-emerald-100 hover:text-emerald-700'
            }`}
          >
            {isLoading ? (
              <>
                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-emerald-700 mr-1"></div>
                Loading...
              </>
            ) : (
              'Profile'
            )}
          </Button>
        ) : (
          <Button 
            size="sm" 
            onClick={() => onNavigate('login')} 
            variant="ghost"
            disabled={isLoading}
            className="px-4 py-1 rounded-full text-sm text-gray-600 hover:bg-emerald-100 hover:text-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-600 mr-1"></div>
                Loading...
              </>
            ) : (
              'Log in'
            )}
          </Button>
        )}

      </div>
    </nav>
  );
}