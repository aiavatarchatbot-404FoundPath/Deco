// components/chat/Sidebar.tsx
'use client';

import React from 'react';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { Separator } from '../ui/separator';
import SafetyIndicators from './SafetyIndicator';
import {
  Phone,
  User,
  Settings,
  AlertCircle,
  Heart,
} from 'lucide-react';

interface SidebarProps {
  onNavigate: (screen: string) => void;
  /** Optional explicit handlers (override onNavigate if provided) */
  onCrisisSupportClick?: () => void;
  onFindCounselorClick?: () => void;
  onPreferencesClick?: () => void;
}

/**
 * Calm, trauma-informed sidebar:
 * - Safety indicators
 * - Support CTAs (Crisis, Counselor, Preferences)
 * - Gentle reminder card (non-alarming)
 * - Tiny session stats
 */
export default function Sidebar({
  onNavigate,
  onCrisisSupportClick,
  onFindCounselorClick,
  onPreferencesClick,
}: SidebarProps) {
  // Default navigations if no explicit callbacks are passed
  const handleCrisisSupport = () => {
    onCrisisSupportClick?.() ?? onNavigate('crisis'); // implement this route or modal later
  };
  const handleFindCounselor = () => {
    onFindCounselorClick?.() ?? onNavigate('counselor');
  };
  const handlePreferences = () => {
    onPreferencesClick?.() ?? onNavigate('settings');
  };

  return (
    <aside
      className="w-80 bg-gray-50 border-r border-gray-200 flex flex-col"
      aria-label="Support sidebar"
    >
      <div className="p-4 flex-1">
        {/* --- Safety & Support signals (badges) --- */}
        <SafetyIndicators />

        <Separator className="my-4" />

        {/* --- Need more help --- */}
        <div className="space-y-3">
          <h3 className="font-medium text-gray-900 flex items-center">
            <Heart className="h-4 w-4 mr-2 text-pink-500" aria-hidden="true" />
            Need more help?
          </h3>

          {/* Crisis Support: calm amber, not alarming red */}
          <Button
            onClick={handleCrisisSupport}
            variant="outline"
            className="w-full justify-start border-amber-200 text-amber-700 hover:bg-amber-50 hover:border-amber-300"
            aria-label="Open crisis support resources"
            type="button"
          >
            <Phone className="h-4 w-4 mr-2" aria-hidden="true" />
            Crisis support
          </Button>

          {/* Counselor finder */}
          <Button
            onClick={handleFindCounselor}
            variant="outline"
            className="w-full justify-start border-gray-200 text-gray-700 hover:bg-gray-100"
            aria-label="Find a counselor"
            type="button"
          >
            <User className="h-4 w-4 mr-2" aria-hidden="true" />
            Find counselor
          </Button>

          {/* Preferences / settings */}
          <Button
            onClick={handlePreferences}
            variant="outline"
            className="w-full justify-start border-gray-200 text-gray-700 hover:bg-gray-100"
            aria-label="Open preferences"
            type="button"
          >
            <Settings className="h-4 w-4 mr-2" aria-hidden="true" />
            Preferences
          </Button>
        </div>

        <Separator className="my-4" />

        {/* --- Gentle reminder (non-alarmist) --- */}
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" aria-hidden="true" />
              <div>
                <h4 className="font-medium text-blue-900 text-sm mb-1">A quick note</h4>
                <p className="text-xs text-blue-800 leading-relaxed">
                  If you’re in immediate danger or need urgent help, consider contacting local
                  emergency services or a crisis helpline. You’re not alone.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Separator className="my-4" />

        {/* --- Quick session stats (placeholder) --- */}
        <div className="space-y-2 text-xs text-gray-600" aria-label="Session stats">
          <div className="flex justify-between">
            <span>Session time</span>
            <span>15 min</span>
          </div>
          <div className="flex justify-between">
            <span>Messages</span>
            <span>12</span>
          </div>
          <div className="flex justify-between">
            <span>Status</span>
            <span className="text-green-600">Secure</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
