import React, { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { 
  MessageCircle, 
  User, 
  Shield, 
  Heart, 
  Lock, 
  Users, 
  Bot, 
  MessageSquare,
  UserPlus,
  Settings,
  Sparkles,
  Crown,
  Star,
  Zap
} from 'lucide-react';

interface MoodData {
  feeling: string;
  intensity: number;
  reason?: string;
  support?: string;
  timestamp: Date;
}

interface WelcomeScreenProps {
  onNavigate: (screen: any) => void;
  onNavigateToChat: () => void;
  chatMode: 'avatar' | 'standard';
  onChatModeChange: (mode: 'avatar' | 'standard') => void;
  user: any;
  isLoggedIn: boolean;
  onLogout: () => void;
  currentMood?: MoodData | null;
}

export default function WelcomeScreen({ 
  onNavigate, 
  onNavigateToChat,
  chatMode, 
  onChatModeChange, 
  user, 
  isLoggedIn,
  onLogout,
  currentMood
}: WelcomeScreenProps) {
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-purple-50 to-blue-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      <div className="max-w-6xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        
        {/* User Welcome (if logged in) */}
        {isLoggedIn && (
          <div className="mb-8">
            <Card className="trauma-safe border-2 border-teal-200 dark:border-teal-700 bg-gradient-to-r from-white to-teal-50 dark:from-gray-800 dark:to-teal-900/20">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 gradient-teal rounded-full flex items-center justify-center">
                      <User className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold">Welcome back, {user?.username}! 👋</h3>
                      <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                        <span>Ready to continue your journey</span>
                        {currentMood && (
                          <Badge variant="secondary" className="bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300">
                            Currently feeling {currentMood.feeling.toLowerCase()} 😊
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Hero Section */}
        <div className="text-center mb-12">
          <div className="mb-6">
            <div className="inline-flex items-center space-x-2 bg-teal-100 dark:bg-teal-900/30 px-4 py-2 rounded-full mb-6">
              <Shield className="h-4 w-4 text-teal-600 dark:text-teal-400" />
              <span className="text-sm font-medium text-teal-800 dark:text-teal-300">
                Safe & Confidential Space
              </span>
            </div>
          </div>
          
          <div className="space-y-4 mb-8">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 dark:text-white">
              Meet Your
              <span className="bg-gradient-to-r from-teal-600 via-purple-600 to-blue-600 bg-clip-text text-transparent block">
                Avatar Companion ✨
              </span>
            </h1>
            
            <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto leading-relaxed">
              A supportive AI companion designed to listen, understand, and help you navigate challenges. 
              Safe, welcoming, and just for you! 🌟
            </p>
          </div>

          {/* Trust Indicators with emojis */}
          <div className="flex flex-wrap justify-center gap-4 mb-10">
            <Badge variant="secondary" className="px-4 py-2 text-sm trauma-safe calm-hover">
              🔒 Private & Secure
            </Badge>
            <Badge variant="secondary" className="px-4 py-2 text-sm trauma-safe calm-hover">
              💚 Trauma-Informed
            </Badge>
            <Badge variant="secondary" className="px-4 py-2 text-sm trauma-safe calm-hover">
              👥 Youth-Focused
            </Badge>
          </div>

          {/* Primary CTA */}
          <div className="mb-8">
            <Button
              onClick={onNavigateToChat}
              size="lg"
              className="h-16 px-12 text-xl trauma-safe gamify-bounce gradient-teal hover:shadow-2xl text-white border-0 rounded-2xl"
            >
              <Sparkles className="h-7 w-7 mr-4" />
              ✨ Start Chat Anonymously
            </Button>
            <div className="mt-4 space-y-2">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                No registration required • Completely private • Start immediately
              </p>
              {!currentMood && (
                <p className="text-sm text-teal-600 dark:text-teal-400 font-medium">
                  💙 We'll ask how you're feeling first to provide better support
                </p>
              )}
              <div className="flex items-center justify-center space-x-4 text-xs text-muted-foreground">
                <span className="flex items-center space-x-1">
                  <span className={`w-2 h-2 rounded-full ${chatMode === 'avatar' ? 'bg-teal-500' : 'bg-gray-300'}`}></span>
                  <span>Current: {chatMode === 'avatar' ? 'Avatar Mode 🎭' : 'Text Mode 💬'}</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Choice Cards */}
        <div className="max-w-4xl mx-auto mb-16">
          <h2 className="text-2xl font-semibold text-center mb-8 text-gray-900 dark:text-white">
            Choose Your Chat Experience 🎯
          </h2>
          
          <div className="grid md:grid-cols-2 gap-8">
            {/* Avatar Chat Mode Card */}
            <Card 
              className={`trauma-safe cursor-pointer border-2 transition-all duration-300 ${
                chatMode === 'avatar' 
                  ? 'border-teal-400 bg-gradient-to-br from-teal-50 to-purple-50 dark:from-teal-900/20 dark:to-purple-900/20 shadow-lg' 
                  : 'border-gray-200 dark:border-gray-700 hover:border-teal-200 dark:hover:border-teal-700'
              } ${hoveredCard === 'avatar' ? 'gamify-card' : ''}`}
              onClick={() => onChatModeChange('avatar')}
              onMouseEnter={() => setHoveredCard('avatar')}
              onMouseLeave={() => setHoveredCard(null)}
            >
              <CardContent className="p-8">
                <div className="text-center">
                  <div className="w-20 h-20 mx-auto mb-6 gradient-teal rounded-full flex items-center justify-center shadow-lg floating-element">
                    <span className="text-3xl">🎭</span>
                  </div>
                  
                  <h3 className="text-xl font-semibold mb-3 text-gray-900 dark:text-white">
                    Avatar Chat Mode 🎭
                  </h3>
                  
                  <p className="text-gray-600 dark:text-gray-300 mb-6 leading-relaxed">
                    Create your own avatar and chat with Adam in a visual, face-to-face environment. 
                    More engaging and personalized! ✨
                  </p>
                  
                  <div className="space-y-3 mb-6">
                    <div className="flex items-center justify-center space-x-2 text-sm">
                      <span className="w-2 h-2 bg-teal-500 rounded-full"></span>
                      <span>Visual avatar interaction 👥</span>
                    </div>
                    <div className="flex items-center justify-center space-x-2 text-sm">
                      <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
                      <span>Personalized companion 🎨</span>
                    </div>
                    <div className="flex items-center justify-center space-x-2 text-sm">
                      <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                      <span>Split-screen layout 📱</span>
                    </div>
                  </div>

                  {/* Avatar Status */}
                  {isLoggedIn && user?.currentAvatar && user.currentAvatar.type !== 'default' ? (
                    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-4">
                      <div className="flex items-center justify-center space-x-2 mb-2">
                        <Crown className="h-4 w-4 text-gamify-gold" />
                        <span className="font-medium text-green-800 dark:text-green-300 text-sm">
                          Your Avatar Ready! 👑
                        </span>
                      </div>
                      <p className="text-xs text-green-700 dark:text-green-400">
                        <strong>{user.currentAvatar.name}</strong> is waiting to chat
                      </p>
                    </div>
                  ) : (
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
                      <div className="flex items-center justify-center space-x-2 mb-2">
                        <Zap className="h-4 w-4 text-blue-500" />
                        <span className="font-medium text-blue-800 dark:text-blue-300 text-sm">
                          Quick Start Available! ⚡
                        </span>
                      </div>
                      <p className="text-xs text-blue-700 dark:text-blue-400">
                        Start immediately with a default avatar, or customize later
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        onChatModeChange('avatar');
                        onNavigateToChat();
                      }}
                      className="w-full trauma-safe calm-hover gradient-teal text-white border-0"
                    >
                      <MessageCircle className="h-4 w-4 mr-2" />
                      🎭 Start Avatar Chat
                    </Button>
                    
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        onChatModeChange('avatar');
                        onNavigate('avatar-builder');
                      }}
                      variant="outline"
                      size="sm"
                      className="w-full trauma-safe gentle-focus text-xs"
                    >
                      🎨 Customize Avatar First
                    </Button>
                    
                    {!isLoggedIn && (
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          onNavigate('login');
                        }}
                        variant="ghost"
                        size="sm"
                        className="w-full trauma-safe gentle-focus text-xs"
                      >
                        🔑 Login to Save Avatars
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Simple Chat Mode Card */}
            <Card 
              className={`trauma-safe cursor-pointer border-2 transition-all duration-300 ${
                chatMode === 'standard' 
                  ? 'border-blue-400 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 shadow-lg' 
                  : 'border-gray-200 dark:border-gray-700 hover:border-blue-200 dark:hover:border-blue-700'
              } ${hoveredCard === 'standard' ? 'gamify-card' : ''}`}
              onClick={() => onChatModeChange('standard')}
              onMouseEnter={() => setHoveredCard('standard')}
              onMouseLeave={() => setHoveredCard(null)}
            >
              <CardContent className="p-8">
                <div className="text-center">
                  <div className="w-20 h-20 mx-auto mb-6 gradient-lilac rounded-full flex items-center justify-center shadow-lg floating-element" style={{ animationDelay: '1s' }}>
                    <span className="text-3xl">💬</span>
                  </div>
                  
                  <h3 className="text-xl font-semibold mb-3 text-gray-900 dark:text-white">
                    Simple Chat Mode 💬
                  </h3>
                  
                  <p className="text-gray-600 dark:text-gray-300 mb-6 leading-relaxed">
                    Clean, distraction-free text chat. Perfect for when you want to focus purely 
                    on the conversation. Simple and effective! 🎯
                  </p>
                  
                  <div className="space-y-3 mb-6">
                    <div className="flex items-center justify-center space-x-2 text-sm">
                      <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                      <span>Clean, minimal interface ✨</span>
                    </div>
                    <div className="flex items-center justify-center space-x-2 text-sm">
                      <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
                      <span>Fast and lightweight ⚡</span>
                    </div>
                    <div className="flex items-center justify-center space-x-2 text-sm">
                      <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                      <span>Same supportive Adam 🤖</span>
                    </div>
                  </div>

                  <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4 mb-4">
                    <div className="flex items-center justify-center space-x-2 mb-2">
                      <Sparkles className="h-4 w-4 text-purple-500" />
                      <span className="font-medium text-purple-800 dark:text-purple-300 text-sm">
                        Instant Access! ✨
                      </span>
                    </div>
                    <p className="text-xs text-purple-700 dark:text-purple-400">
                      No setup required - jump straight into conversation
                    </p>
                  </div>

                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      onChatModeChange('standard');
                      onNavigateToChat();
                    }}
                    className="w-full trauma-safe calm-hover bg-gradient-to-r from-blue-500 to-purple-500 text-white border-0"
                  >
                    <MessageSquare className="h-4 w-4 mr-2" />
                    💬 Start Text Chat
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Consent Reminder */}
        <div className="max-w-2xl mx-auto mb-12">
          <Card className="trauma-safe bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 border-purple-200 dark:border-purple-700">
            <CardContent className="p-6 text-center">
              <div className="flex items-center justify-center space-x-2 mb-3">
                <Shield className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                <h3 className="font-medium text-purple-800 dark:text-purple-300">
                  🔒 You're Always Anonymous by Default
                </h3>
              </div>
              <p className="text-sm text-purple-700 dark:text-purple-400 leading-relaxed">
                Your privacy is our top priority. Every conversation is completely anonymous and secure. 
                You control what you share, always. ✨
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Features Grid with Gamification */}
        <div className="mb-16">
          <h2 className="text-2xl font-semibold text-center mb-12 text-gray-900 dark:text-white">
            Why Avatar Companion? 🌟
          </h2>
          
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center trauma-safe gamify-bounce">
              <div className="w-16 h-16 mx-auto mb-4 gradient-teal rounded-full flex items-center justify-center floating-element">
                <Shield className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">
                🛡️ Completely Safe
              </h3>
              <p className="text-gray-600 dark:text-gray-300 text-sm">
                Your conversations are private and secure. You control what you share, always.
              </p>
            </div>

            <div className="text-center trauma-safe gamify-bounce" style={{ animationDelay: '0.2s' }}>
              <div className="w-16 h-16 mx-auto mb-4 gradient-lilac rounded-full flex items-center justify-center floating-element" style={{ animationDelay: '1s' }}>
                <Heart className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">
                💚 Understanding
              </h3>
              <p className="text-gray-600 dark:text-gray-300 text-sm">
                Designed with trauma-informed principles for gentle, supportive interactions.
              </p>
            </div>

            <div className="text-center trauma-safe gamify-bounce" style={{ animationDelay: '0.4s' }}>
              <div className="w-16 h-16 mx-auto mb-4 gradient-gold rounded-full flex items-center justify-center floating-element" style={{ animationDelay: '2s' }}>
                <Users className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">
                👥 Just for You
              </h3>
              <p className="text-gray-600 dark:text-gray-300 text-sm">
                Built specifically for young people, understanding your unique experiences.
              </p>
            </div>
          </div>
        </div>

        {/* Quick Access */}
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-300 mb-6">
            Want to review privacy settings or learn more? 🔍
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Button
              onClick={() => onNavigate('settings')}
              variant="outline"
              className="trauma-safe gentle-focus"
            >
              <Settings className="h-4 w-4 mr-2" />
              ⚙️ Privacy & Settings
            </Button>
            <Button
              onClick={() => onNavigate("profile")}
              variant="default"
              className="trauma-safe gentle-focus"
            >
              👤 View Profile
            </Button>
            
            {!isLoggedIn && (
              <Button
                onClick={() => onNavigate('login')}
                variant="ghost"
                className="trauma-safe gentle-focus"
              >
                <UserPlus className="h-4 w-4 mr-2" />
                👤 Create Account (Optional)
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}