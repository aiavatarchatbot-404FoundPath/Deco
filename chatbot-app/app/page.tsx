"use client";

import React, { useEffect, useState } from 'react';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import Navbar from '../components/Navbar'; 
import { createConversation } from '@/lib/conversations'; 
import { getSessionUserId } from '@/lib/auth';
import { Loading } from '../components/ui/loading';
import { COMPANIONS } from '@/lib/companions';

import { 
  Shield, 
  Heart, 
  Users, 
  Settings,
  Sparkles,
  MessageCircle,
  MessageSquare,
  Crown,
  Zap
} from 'lucide-react';

interface MoodData {
  feeling: string;
  intensity: number;
  reason?: string;
  support?: string;
}

interface StoredMoodData extends MoodData {
  timestamp: Date;
}

const MOOD_SESSION_KEY = 'moodCheckedIn:v1';

interface User {
  username: string;
  rpm_user_url?: string | null;
  currentAvatar?: {
    name: string;
    type: string;
  };
}

// Convert a Ready Player Me URL (.glb) into a displayable PNG
function toThumbnail(url?: string | null): string | null {
  if (!url) return null;
  if (url.endsWith(".png")) return url;
  if (url.endsWith(".glb")) return url.replace(".glb", ".png");

  // extract avatar id and use the official PNG endpoint
  try {
    const last = url.split("/").pop() || "";
    const id = last.replace(".glb", "");
    if (id && id.length > 10) {
      return `https://api.readyplayer.me/v1/avatars/${id}.png`;
    }
  } catch {}
  return null;
}

export default function HomePage() {
  const router = useRouter();
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const [chatMode, setChatMode] = useState<'avatar' | 'standard'>('avatar');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [currentMood, setCurrentMood] = useState<StoredMoodData | null>(null);
  const [showMoodCheckIn, setShowMoodCheckIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleNavigateToChat = async (mode: 'avatar' | 'standard') => {
    if (isLoading) return; // Prevent double clicks
    
    setIsLoading(true);
    
    try {
      // Set session storage so the chat page knows the check-in was intentionally skipped.
      const skippedState = { skipped: true, timestamp: new Date() };
      sessionStorage.setItem(MOOD_SESSION_KEY, JSON.stringify(skippedState));

      // Navigate to chat without mood data
      if (mode === 'avatar') {
        const convoId = await maybeCreateConversation();
        router.push(convoId ? `/chat/avatar?convo=${convoId}` : '/chat/avatar');
      } else {
        router.push('/chat/simple');
      }
    } catch (error) {
      console.error('Navigation to chat error:', error);
      setIsLoading(false);
    }
  };

  const handleChatModeChange = (mode: 'avatar' | 'standard') => {
    setChatMode(mode);
  };

  // Navigation handler with loading
  const handleNavigation = async (screen: string) => {
    if (isLoading) return; // Prevent double clicks
    
    setIsLoading(true);
    
    try {
      switch (screen) {
        case 'welcome':
        case '/':
        case 'home':
          window.scrollTo({ top: 0, behavior: 'smooth' });
          setIsLoading(false);
          break;
        case 'settings':
          router.push('/settings');
          break;
        case 'profile':
          router.push('/profile');
          break;
        case 'avatarbuilder':
          router.push('/avatarbuilder');
          break;
        case 'login':
          router.push('/login');
          break;
        case 'privacy-policy':
          router.push('/privacy-policy');   // or your preferred path
          break;
        default:
          console.log(`Navigate to: ${screen}`);
          setIsLoading(false);
      }
    } catch (error) {
      console.error('Navigation error:', error);
      setIsLoading(false);
    }
  };

  async function maybeCreateConversation() {
  const uid = await getSessionUserId();          // null if anonymous
  if (!uid) return null;                         // skip DB write when not logged in
  const convoId = await createConversation('My chat');
  console.log('[chat] created conversation:', convoId);
  return convoId;
    }

  // Listen for global loading reset events
  useEffect(() => {
    const handleResetLoading = () => {
      setIsLoading(false);
    };

    window.addEventListener('resetGlobalLoading', handleResetLoading);
    
    return () => {
      window.removeEventListener('resetGlobalLoading', handleResetLoading);
    };
  }, []);

  // Load saved mood data and user data on mount
  useEffect(() => {
    // Load user authentication state
    const loadUserData = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const currentUser = session?.user;
        
        if (currentUser) {
          setIsLoggedIn(true);
          
          // Fetch user profile data
          const { data: profile, error } = await supabase
            .from("profiles")
            .select("id, username, full_name, avatar_url, session_mode, rpm_user_url, rpm_companion_url")
            .eq("id", currentUser.id)
            .maybeSingle();
            
          if (profile) {
            setUser({
              username: profile.username || profile.full_name || currentUser.email || 'User',
              rpm_user_url: profile.rpm_user_url,
              currentAvatar: profile.rpm_user_url ? {
                name: 'Custom Avatar',
                type: 'custom'
              } : undefined
            });
          } else {
            // Fallback user data if profile doesn't exist yet
            setUser({
              username: currentUser.email?.split('@')[0] || 'User'
            });
          }
        } else {
          setIsLoggedIn(false);
          setUser(null);
        }
      } catch (error) {
        console.error("Error loading user data:", error);
        setIsLoggedIn(false);
        setUser(null);
      }
    };

    loadUserData();

    
  

    // Load saved mood data
    const savedMood = sessionStorage.getItem(MOOD_SESSION_KEY);
    if (savedMood) {
      try {
        const moodData = JSON.parse(savedMood);
        // Check if mood data is recent and has required properties
        if (moodData && 
            moodData.feeling && 
            typeof moodData.feeling === 'string' &&
            new Date().getTime() - new Date(moodData.timestamp).getTime() < 4 * 60 * 60 * 1000) {
          setCurrentMood(moodData);
        } else {
          sessionStorage.removeItem(MOOD_SESSION_KEY);
        }
      } catch (error) {
        console.error('Error loading mood data:', error);
        sessionStorage.removeItem(MOOD_SESSION_KEY);
      }
    }
    

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        loadUserData();
      } else if (event === 'SIGNED_OUT') {
        setIsLoggedIn(false);
        setUser(null);
      }
    });

    // Cleanup subscription on unmount
    return () => {
      subscription?.unsubscribe?.();
    };
  }, []);


  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-100 via-pink-50 to-blue-100">
      {/* Use Navbar Component with correct props */}
      <Navbar 
        onNavigate={handleNavigation}
        isLoggedIn={isLoggedIn}
        currentPage="home"
        isLoading={isLoading}
      />
      
      <div className="max-w-6xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        
        {/* User Welcome (if logged in) */}
        {isLoggedIn && user && (
          <div className="mb-8 max-w-md mx-auto">
            <Card className="border-2 border-teal-200 bg-gradient-to-r from-white to-teal-50">
              <CardContent className="p-2">
                <div className="flex items-center space-x-4 text-center justify-center">
                  <div className="w-16 h-16 bg-teal-500 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0">
                    {user.rpm_user_url ? (
                      <img 
                        src={toThumbnail(user.rpm_user_url) || ""}
                        alt="Your Avatar"
                        className="w-18 h-18 object-cover rounded-full scale-120"
                        style={{ objectPosition: 'center top' }}
                        onError={(e) => {
                          // Fallback to initials if avatar image fails to load
                          e.currentTarget.style.display = 'none';
                          const nextElement = e.currentTarget.nextElementSibling as HTMLElement;
                          if (nextElement) {
                            nextElement.style.display = 'flex';
                          }
                        }}
                      />
                    ) : null}
                    <span className={`text-white font-semibold ${user.rpm_user_url ? 'hidden' : ''}`}>
                      {user.username.charAt(0)}
                    </span>
                  </div>
                  <div className="text-left">
                    <h3 className="font-semibold">Welcome back, {user.username}!</h3>
                    <div className="flex flex-col space-y-1 text-sm text-gray-600 mt-1">
                      <span>Ready to continue your journey?</span>
                      {currentMood && currentMood.feeling && (
                        <Badge className="bg-teal-50 text-teal-700 border-teal-200 w-fit">
                          Currently feeling {currentMood.feeling.toLowerCase()}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Safe Space Badge */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center space-x-2 bg-teal-100 px-4 py-2 rounded-full mb-6">
            <Shield className="h-4 w-4 text-teal-600" />
            <span className="text-sm font-medium text-teal-800">
              Safe & Confidential Space
            </span>
          </div>
        </div>

        {/* Hero Section */}
        <div className="text-center mb-12 relative">
          {/* Static Decorative Avatars */}
          <div className="hidden md:block absolute inset-0 pointer-events-none">
      
            <div className="absolute left-16 lg:left-55 -top-4">
              <img
                src={toThumbnail(COMPANIONS.ADAM.url) || ""}
                alt="Adam"
                className="w-24 h-24 lg:w-28 lg:h-28 object-cover"
                onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
              />
            </div>
            
            
            <div className="absolute right-16 lg:right-55 -top-4">
              <img
                src={toThumbnail(COMPANIONS.EVE.url) || ""}
                alt="Eve"
                className="w-24 h-24 lg:w-28 lg:h-28 object-cover"
                onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
              />
            </div>
          </div>

          <div className="space-y-6 mb-10 relative z-10">
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-gray-900 leading-tight">
              Meet your
              <br />
              <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-500 bg-clip-text text-transparent">
                Avatar Companion
              </span>
              <span className="text-6xl">✨</span>
            </h1>
            
            <p className="text-lg text-gray-600 max-w-2xl mx-auto leading-relaxed">
              A supportive AI companion designed to listen, understand, and help you 
              navigate challenges. Safe, welcoming, and just for you!
            </p>
          </div>
        

          {/* Trust Indicators */}
          <div className="flex flex-wrap justify-center gap-4 mb-10">
            <Badge className="px-4 py-2 text-sm bg-yellow-100 text-yellow-800 border-yellow-200">
              Private & Secure
            </Badge>
            <Badge className="px-4 py-2 text-sm bg-green-100 text-green-800 border-green-200">
              Trauma-informed
            </Badge>
            <Badge className="px-4 py-2 text-sm bg-blue-100 text-blue-800 border-blue-200">
              Youth-Focused
            </Badge>
          </div>

          {/* Privacy Reminder */}
        <div className="max-w-2xl mx-auto mb-16">
          <Card className="bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200">
            <CardContent className="p-6 text-center">
              <div className="flex items-center justify-center space-x-2 mb-3">
                <Shield className="h-5 w-5 text-purple-600" />
                <h3 className="font-medium text-purple-800">
                  You're Always Anonymous by Default
                </h3>
              </div>
              <p className="text-sm text-purple-700 leading-relaxed">
                Your privacy is our top priority. Every conversation is completely anonymous and secure. 
                <br />You control what you share, always.
              </p>
            </CardContent>
          </Card>
        </div>
        </div>
           
        {/* Chat Mode Selection */}
        <div className="max-w-4xl mx-auto mb-16">
          <h2 className="text-2xl font-semibold text-center mb-8 text-gray-900">
            Choose Your Chat Experience
          </h2>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Avatar Chat Mode Card */}
            <Card 
              className={`border-2 transition-all duration-300 cursor-pointer ${
                chatMode === 'avatar' 
                  ? 'border-teal-400 bg-gradient-to-br from-teal-50 to-purple-50 shadow-lg' 
                  : 'border-gray-100 hover:border-teal-200'
              } ${hoveredCard === 'avatar' ? 'transform scale-105' : ''} bg-white`}
              onClick={() => handleChatModeChange('avatar')}
              onMouseEnter={() => setHoveredCard('avatar')}
              onMouseLeave={() => setHoveredCard(null)}
            >
              <CardContent className="p-8">
                <div className="text-center">
                  <div className="w-20 h-20 mx-auto mb-6 bg-teal-100 rounded-full flex items-center justify-center">
                    <span className="text-3xl">🎭</span>
                  </div>
                  
                  <h3 className="text-xl font-semibold mb-3 text-gray-900">
                    Avatar Chat Mode
                  </h3>
                  
                  <p className="text-gray-600 mb-6 leading-relaxed text-sm">
                    Create your own avatar and chat with Adam or Eve in a visual, more engaging and personalized!
                  </p>
                  
                  <div className="space-y-3 mb-6 text-sm">
                    <div className="flex items-center justify-start space-x-2">
                      <span className="text-yellow-500">✨</span>
                      <span>Visual avatar interaction</span>
                    </div>
                    <div className="flex items-center justify-start space-x-2">
                      <span className="text-orange-500">🧡</span>
                      <span>Personalized companion</span>
                    </div>
                    <div className="flex items-center justify-start space-x-2">
                      <span className="text-blue-500">⚡</span>
                      <span>No downloads needed</span>
                    </div>
                  </div>

                  {isLoggedIn && user?.currentAvatar && user.currentAvatar.type !== 'default' ? (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                      <div className="flex items-center justify-center space-x-2 mb-2">
                        <Crown className="h-4 w-4 text-yellow-600" />
                        <span className="font-medium text-green-800 text-sm">
                          Your Avatar Ready!
                        </span>
                      </div>
                      <p className="text-xs text-green-700">
                        <strong>{user.currentAvatar.name}</strong> is waiting to chat
                      </p>
                    </div>
                  ) : (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                      <div className="flex items-center justify-center space-x-2 mb-2">
                        <Zap className="h-4 w-4 text-blue-500" />
                        <span className="font-medium text-blue-800 text-sm">
                          Quick Start Available!
                        </span>
                      </div>
                      <p className="text-xs text-blue-700">
                        Start with a default avatar or customize later
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Button
                      onClick={(e) => { 
                        e.preventDefault();
                        e.stopPropagation(); 
                        if (isLoading) return;
                        // Use a timeout to prevent rapid clicks during state changes
                        setTimeout(() => {
                          setChatMode("avatar");
                          handleNavigation("avatarbuilder"); 
                        }, 50);
                      }}
                      disabled={isLoading}
                      className="w-full bg-teal-500 hover:bg-teal-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isLoading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Starting chat...
                        </>
                      ) : (
                        <>
                          <MessageCircle className="h-4 w-4 mr-2" />
                          Start Avatar Chat
                        </>
                      )}
                    </Button>
                  
                    
                    {!isLoggedIn && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-xs text-gray-500 hover:bg-gray-50"
                        onClick={() => {
                        handleNavigation('login');
                      }}
                      >
                        Login to Save Avatars
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Simple Chat Mode Card */}
            <Card 
              className={`border-2 transition-all duration-300 cursor-pointer ${
                chatMode === 'standard' 
                  ? 'border-blue-400 bg-gradient-to-br from-blue-50 to-purple-50 shadow-lg' 
                  : 'border-gray-100 hover:border-blue-200'
              } ${hoveredCard === 'standard' ? 'transform scale-105' : ''} bg-white`}
              onClick={() => handleChatModeChange('standard')}
              onMouseEnter={() => setHoveredCard('standard')}
              onMouseLeave={() => setHoveredCard(null)}
            >
              <CardContent className="p-8">
                <div className="text-center">
                  <div className="w-20 h-20 mx-auto mb-6 bg-blue-100 rounded-full flex items-center justify-center">
                    <span className="text-3xl">💬</span>
                  </div>
                  
                  <h3 className="text-xl font-semibold mb-3 text-gray-900">
                    Simple Chat Mode
                  </h3>
                  
                  <p className="text-gray-600 mb-6 leading-relaxed text-sm">
                    Enjoy a distraction-free chat experience built for focus. Clean design, effortless flow, better conversations
                  </p>
                  
                  <div className="space-y-3 mb-6 text-sm">
                    <div className="flex items-center justify-start space-x-2">
                      <span className="text-yellow-500">✨</span>
                      <span>Clean, minimal interface</span>
                    </div>
                    <div className="flex items-center justify-start space-x-2">
                      <span className="text-yellow-500">⚡</span>
                      <span>Fast and lightweight</span>
                    </div>
                    <div className="flex items-center justify-start space-x-2">
                      <span className="text-yellow-500">🤖</span>
                      <span>Same supportive Adam</span>
                    </div>
                  </div>

                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-4">
                    <div className="flex items-center justify-center space-x-2 mb-2">
                      <Sparkles className="h-4 w-4 text-purple-500" />
                      <span className="font-medium text-purple-800 text-sm">
                        Instant Access!
                      </span>
                    </div>
                    <p className="text-xs text-purple-700">
                    </p>
                  </div>

                   <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleChatModeChange('standard');
                      handleNavigateToChat('standard');
                    }}
                    disabled={isLoading}
                    className="w-full bg-gradient-to-r from-blue-500 to-purple-500 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Starting chat...
                      </>
                    ) : (
                      <>
                        <MessageSquare className="h-4 w-4 mr-2" />
                        Start Text Chat
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Features Section */}
        <div className="mb-16">
          <h2 className="text-3xl font-semibold text-center mb-12 text-gray-900">
            Why Avatar Companion?
          </h2>
          
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-20 h-20 mx-auto mb-6 bg-teal-100 rounded-full flex items-center justify-center shadow-lg">
                <Shield className="h-10 w-10 text-teal-600" />
              </div>
              <h3 className="text-xl font-semibold mb-3 text-gray-900">
                Completely Safe
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Your conversations are private and secure. You control what you share, always.
              </p>
            </div>

            <div className="text-center">
              <div className="w-20 h-20 mx-auto mb-6 bg-purple-100 rounded-full flex items-center justify-center shadow-lg">
                <Heart className="h-10 w-10 text-purple-600" />
              </div>
              <h3 className="text-xl font-semibold mb-3 text-gray-900">
                Understanding
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Designed with trauma-informed principles for gentle, supportive interactions.
              </p>
            </div>

            <div className="text-center">
              <div className="w-20 h-20 mx-auto mb-6 bg-yellow-100 rounded-full flex items-center justify-center shadow-lg">
                <Users className="h-10 w-10 text-yellow-600" />
              </div>
              <h3 className="text-xl font-semibold mb-3 text-gray-900">
                Just for You
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Built specifically for young people, understanding your unique experiences.
              </p>
            </div>
          </div>
        </div>

        {/* Bottom Actions */}
        <div className="text-center">
          <p className="text-gray-600 mb-6">
            Want to review preferences?
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Button
              variant="outline"
              className="bg-white text-gray-800 border-green-200 hover:bg-green-100 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => handleNavigation('settings')}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-800 mr-2"></div>
                  Loading...
                </>
              ) : (
                <>
                  <Settings className="h-4 w-4 mr-2" />
                  Preferences
                </>
              )}
            </Button>

          </div>
        </div>
      </div>
      
      {/* Loading overlay */}
      {isLoading && <Loading />}
    </div>
  );

}