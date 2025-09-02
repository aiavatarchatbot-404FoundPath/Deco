// components/chat/Sidebar.tsx
"use client";

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
  Shield,
  MessageCircle
} from 'lucide-react';

interface SidebarProps {
  onNavigate: (screen: string) => void;
}

export default function Sidebar({ onNavigate }: SidebarProps) {
  const handleCrisisSupport = () => {
    // In a real app, this would open crisis support resources
    console.log('Opening crisis support...');
  };

  const handleFindCounselor = () => {
    // Navigate to counselor finder
    onNavigate('counselor');
  };

  const handlePreferences = () => {
    onNavigate('settings');
  };

  return (
    <div className="w-80 bg-gray-50 border-r border-gray-200 flex flex-col">
      <div className="p-4 flex-1">
        {/* Safety & Support Section */}
        <SafetyIndicators />
        
        <Separator className="my-4" />
        
        {/* Need More Help Section */}
        <div className="space-y-3">
          <h3 className="font-medium text-gray-900 flex items-center">
            <Heart className="h-4 w-4 mr-2 text-red-500" />
            Need More Help?
          </h3>
          
          {/* Crisis Support Button */}
          <Button
            onClick={handleCrisisSupport}
            variant="outline"
            className="w-full justify-start border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300"
          >
            <Phone className="h-4 w-4 mr-2" />
            Crisis Support
          </Button>
          
          {/* Find Counselor Button */}
          <Button
            onClick={handleFindCounselor}
            variant="outline" 
            className="w-full justify-start border-gray-200 text-gray-700 hover:bg-gray-100"
          >
            <User className="h-4 w-4 mr-2" />
            Find Counselor
          </Button>
          
          {/* Preferences Button */}
          <Button
            onClick={handlePreferences}
            variant="outline"
            className="w-full justify-start border-gray-200 text-gray-700 hover:bg-gray-100"
          >
            <Settings className="h-4 w-4 mr-2" />
            Preferences
          </Button>
        </div>
        
        <Separator className="my-4" />
        
        {/* Help Information */}
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4">
            <div className="flex items-start space-x-3">
              <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-medium text-blue-900 text-sm mb-1">
                  Remember
                </h4>
                <p className="text-xs text-blue-800 leading-relaxed">
                  If you're experiencing a mental health emergency, please contact emergency services or a crisis helpline immediately.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Separator className="my-4" />
        
        {/* Quick Stats */}
        <div className="space-y-2 text-xs text-gray-600">
          <div className="flex justify-between">
            <span>Session time:</span>
            <span>15 minutes</span>
          </div>
          <div className="flex justify-between">
            <span>Messages:</span>
            <span>12</span>
          </div>
          <div className="flex justify-between">
            <span>Status:</span>
            <span className="text-green-600">Secure</span>
          </div>
        </div>
      </div>
    </div>
  );
}