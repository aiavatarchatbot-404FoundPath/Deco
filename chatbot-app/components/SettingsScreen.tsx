'use client';

import React, { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { Separator } from './ui/separator';
import { Badge } from './ui/badge';
import { Loading } from './ui/loading';

import {
  Shield,
  Eye,
  FileText,
  Trash2,
  Download,
  Info,
  Lock,
  Globe,
  UserX,
  Clock,
  AlertTriangle,
  ArrowLeft,
} from 'lucide-react';

interface SettingsScreenProps {
  onNavigate: (screen: string) => void;
}

export default function SettingsScreen({ onNavigate }: SettingsScreenProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromChatConvoId = searchParams.get('convo');

  const [settings, setSettings] = useState({
    anonymousMode: true,
    transcriptStorage: false,
    dataSharing: false,
    analytics: false,
    notifications: true,
    autoDelete: true,
  });

  const [isLoading, setIsLoading] = useState(false);

  // Navigation with loading
  const handleNavigation = async (screen: string) => {
    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 300));
    onNavigate(screen);
  };

  const updateSetting = (key: keyof typeof settings) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleBackToChat = () => {
    if (fromChatConvoId) {
      router.push(`/chat/avatar?convo=${fromChatConvoId}`);
    }
  };

  const privacyFeatures = [
    {
      icon: UserX,
      title: 'Anonymous by Default',
      description: 'No personal information is required or stored',
      status: 'Always Active',
    },
    {
      icon: Lock,
      title: 'End-to-End Security',
      description: 'Your conversations are encrypted and secure',
      status: 'Always Active',
    },
    {
      icon: Clock,
      title: 'Auto-Delete',
      description: 'Conversations are automatically deleted after 30 days',
      status: settings.autoDelete ? 'Active' : 'Disabled',
    },
    {
      icon: Globe,
      title: 'No Third-Party Sharing',
      description: 'Your data stays private and is never sold or shared',
      status: 'Guaranteed',
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-100 via-pink-50 to-blue-100">
      <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Privacy &amp; Settings
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            You&apos;re in control of your privacy. Review and adjust your settings to feel safe and comfortable.
          </p>
        </div>

        <div className="space-y-6">
          {/* Privacy Features Overview */}
          <Card className="trauma-safe">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Shield className="h-5 w-5 mr-2 text-green-600" />
                Your Privacy Protection
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-4">
                {privacyFeatures.map((feature, idx) => (
                  <div
                    key={idx}
                    className="flex items-start space-x-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg"
                  >
                    <div className="w-8 h-8 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                      <feature.icon className="h-4 w-4 text-green-600 dark:text-green-400" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="font-medium text-sm">{feature.title}</h4>
                        <Badge variant="outline" className="text-xs">
                          {feature.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-300">{feature.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Privacy Controls */}
          <Card className="trauma-safe">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Eye className="h-5 w-5 mr-2" />
                Privacy Controls
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Anonymous Mode */}
              <div className="flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-1">
                    <Label htmlFor="anonymous-mode" className="font-medium">
                      Anonymous Mode
                    </Label>
                    <Badge variant="secondary" className="text-xs">
                      Recommended
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Chat without providing any personal information. Your conversations remain completely anonymous.
                  </p>
                </div>
                <Switch
                  id="anonymous-mode"
                  checked={settings.anonymousMode}
                  onCheckedChange={() => updateSetting('anonymousMode')}
                  className="trauma-safe ml-4"
                />
              </div>

              <Separator />

              {/* Transcript Storage */}
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-1">
                    <Label htmlFor="transcript-storage" className="font-medium">
                      Save Conversation History
                    </Label>
                    <Info className="h-4 w-4 text-gray-400" />
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Allow saving conversations to review later or share with trusted adults. Requires your explicit consent.
                  </p>
                </div>
                <Switch
                  id="transcript-storage"
                  checked={settings.transcriptStorage}
                  onCheckedChange={() => updateSetting('transcriptStorage')}
                  className="trauma-safe ml-4"
                />
              </div>

              <Separator />

              {/* Auto-Delete */}
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <Label htmlFor="auto-delete" className="font-medium mb-1 block">
                    Auto-Delete Conversations
                  </Label>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Automatically delete all conversation data after 30 days for your protection.
                  </p>
                </div>
                <Switch
                  id="auto-delete"
                  checked={settings.autoDelete}
                  onCheckedChange={() => updateSetting('autoDelete')}
                  className="trauma-safe ml-4"
                />
              </div>

              <Separator />

              {/* Analytics */}
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <Label htmlFor="analytics" className="font-medium mb-1 block">
                    Anonymous Usage Analytics
                  </Label>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Help improve the app by sharing anonymous usage statistics. No personal data is included.
                  </p>
                </div>
                <Switch
                  id="analytics"
                  checked={settings.analytics}
                  onCheckedChange={() => updateSetting('analytics')}
                  className="trauma-safe ml-4"
                />
              </div>
            </CardContent>
          </Card>

          {/* Consent Information */}
          <Card className="trauma-safe">
            <CardHeader>
              <CardTitle className="flex items-center">
                <FileText className="h-5 w-5 mr-2" />
                Understanding Your Rights
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-amber-800 dark:text-amber-300 mb-2">
                      Important: This app is not for emergencies
                    </h4>
                    <p className="text-sm text-amber-700 dark:text-amber-400">
                      If you&apos;re in immediate danger or having thoughts of self-harm, please contact emergency services (000) or Lifeline (13 11 14) immediately.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium">Your Rights:</h4>
                <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
                  <li className="flex items-start space-x-2">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2 flex-shrink-0" />
                    <span>You can stop using this app at any time without consequences</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2 flex-shrink-0" />
                    <span>You control what information you share</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2 flex-shrink-0" />
                    <span>You can request deletion of any stored data</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2 flex-shrink-0" />
                    <span>This AI is not a replacement for professional mental health support</span>
                  </li>
                </ul>
              </div>

              <div className="pt-4 border-t border-border">
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button variant="outline" 
                   className="trauma-safe gentle-focus" 
                    onClick={() => onNavigate('privacy')} >
                    <FileText className="h-4 w-4 mr-2" />
                    Full Privacy Policy
                  </Button>
                  <Button variant="outline" className="trauma-safe gentle-focus" onClick={() => onNavigate('profile?saved')}>
                    <Download className="h-4 w-4 mr-2" />
                    Download My Data
                  </Button>
                  <Button
                    variant="outline"
                    className="trauma-safe gentle-focus text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/20"
                    onClick={() => onNavigate('profile?settings')}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete All Data
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <div className="text-center pt-8">
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              Ready to start a safe, supportive conversation?
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto">
              {fromChatConvoId ? (
                <Button onClick={handleBackToChat} className="trauma-safe calm-hover">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Chat
                </Button>
              ) : (
                <Button onClick={() => onNavigate('avatarbuilder')} className="trauma-safe calm-hover">
                  Start Chatting
                </Button>
              )}
              <Button onClick={() => onNavigate('welcome')} variant="outline" className="trauma-safe gentle-focus">
                Back to Home
              </Button>
            </div>
          </div>
        </div>
      </div>
      {isLoading && <Loading />}
    </div>
  );
}
