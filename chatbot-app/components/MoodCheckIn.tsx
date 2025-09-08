import React, { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Heart, Sparkles } from 'lucide-react';

interface MoodData {
  feeling: string;
  intensity: number;
  reason?: string;
  support?: string;
}

interface MoodCheckInProps {
  onComplete: (moodData: MoodData) => void;
  onSkip: () => void;
}

export default function MoodCheckIn({ onComplete, onSkip }: MoodCheckInProps) {
  const [selectedFeeling, setSelectedFeeling] = useState<string>('');

  const feelings = [
    { emoji: '😊', label: 'Happy', color: 'bg-gradient-to-r from-yellow-400 to-orange-400' },
    { emoji: '😌', label: 'Calm', color: 'bg-gradient-to-r from-blue-400 to-teal-400' },
    { emoji: '😔', label: 'Sad', color: 'bg-gradient-to-r from-blue-500 to-purple-500' },
    { emoji: '😰', label: 'Anxious', color: 'bg-gradient-to-r from-purple-400 to-pink-400' },
    { emoji: '😤', label: 'Frustrated', color: 'bg-gradient-to-r from-red-400 to-orange-400' },
    { emoji: '😴', label: 'Tired', color: 'bg-gradient-to-r from-gray-400 to-blue-400' },
    { emoji: '🤔', label: 'Confused', color: 'bg-gradient-to-r from-indigo-400 to-purple-400' },
    { emoji: '😐', label: 'Neutral', color: 'bg-gradient-to-r from-gray-400 to-gray-500' }
  ];

  const handleFeelingSelect = (feeling: string) => {
    setSelectedFeeling(feeling);
  };

  const handleStartChat = () => {
    // Create mood data with default values for intensity
    const moodData: MoodData = {
      feeling: selectedFeeling,
      intensity: 3, // Default moderate intensity
    };
    onComplete(moodData);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-lg trauma-safe border-2 border-teal-200 dark:border-teal-700">
        <CardHeader className="text-center bg-gradient-to-r from-teal-50 to-purple-50 dark:from-teal-900/20 dark:to-purple-900/20 rounded-t-lg">
          <div className="flex items-center justify-center space-x-2 mb-3">
            <Heart className="h-6 w-6 text-teal-600 dark:text-teal-400" />
            <CardTitle className="text-xl">How are you feeling today? 💙</CardTitle>
          </div>
        </CardHeader>

        <CardContent className="p-6">
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="font-medium mb-2">Choose how you're feeling right now</h3>
              <p className="text-sm text-muted-foreground mb-6">
                It's okay if you're feeling multiple things - just pick what feels strongest 🌟
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {feelings.map((feeling) => (
                <Button
                  key={feeling.label}
                  variant="outline"
                  onClick={() => handleFeelingSelect(feeling.label)}
                  className={`h-auto p-4 trauma-safe border-2 transition-all ${
                    selectedFeeling === feeling.label
                      ? 'border-teal-400 bg-teal-50 dark:bg-teal-900/20 scale-105'
                      : 'border-gray-200 dark:border-gray-700 hover:border-teal-200 dark:hover:border-teal-700'
                  }`}
                >
                  <div className="flex flex-col items-center space-y-2">
                    <span className="text-2xl">{feeling.emoji}</span>
                    <span className="text-sm font-medium">{feeling.label}</span>
                  </div>
                </Button>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-border">
            <Button
              variant="ghost"
              onClick={onSkip}
              className="trauma-safe gentle-focus text-muted-foreground"
            >
              Skip for now
            </Button>

            <Button
              onClick={handleStartChat}
              disabled={!selectedFeeling}
              className="trauma-safe calm-hover gradient-teal"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Start Chatting ✨
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}