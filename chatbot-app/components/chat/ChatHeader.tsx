// components/chat/ChatHeader.tsx
"use client";

import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { MoreHorizontal, Star } from 'lucide-react';

interface ChatHeaderProps {
  currentMood?: {
    feeling: string;
    intensity: number;
    reason?: string;
    support?: string;
    timestamp: Date;
  } | null;
  chatMode: 'avatar' | 'standard';
}

export default function ChatHeader({ currentMood, chatMode }: ChatHeaderProps) {
  const getMoodColor = (feeling: string) => {
    switch (feeling.toLowerCase()) {
      case 'happy':
      case 'excited':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'anxious':
      case 'worried':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'sad':
      case 'depressed':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'angry':
      case 'frustrated':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'calm':
      case 'peaceful':
        return 'bg-green-100 text-green-800 border-green-200';
      default:
        return 'bg-purple-100 text-purple-800 border-purple-200';
    }
  };

  const getMoodIcon = (feeling: string) => {
    switch (feeling.toLowerCase()) {
      case 'happy':
      case 'excited':
        return '😊';
      case 'anxious':
      case 'worried':
        return '😰';
      case 'sad':
      case 'depressed':
        return '😢';
      case 'angry':
      case 'frustrated':
        return '😤';
      case 'calm':
      case 'peaceful':
        return '😌';
      default:
        return '💭';
    }
  };

  return (
    <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200">
      {/* AI Companion Info */}
      <div className="flex items-center space-x-3">
        <Avatar className="h-10 w-10">
          <AvatarImage 
            src="/adam-avatar.png" 
            alt="Adam" 
          />
          <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-500 text-white">
            A
          </AvatarFallback>
        </Avatar>
        
        <div>
          <h2 className="font-semibold text-gray-900">Adam - Your AI Companion</h2>
          <div className="flex items-center space-x-2 text-sm text-gray-500">
            <span>{chatMode === 'avatar' ? 'Avatar Chat Mode' : 'Standard Chat Mode'}</span>
            <span>•</span>
            <span>Safe & Private</span>
          </div>
        </div>
      </div>

      {/* Current Mood Indicator & Actions */}
      <div className="flex items-center space-x-3">
        {currentMood && (
          <Badge 
            className={`px-3 py-1 ${getMoodColor(currentMood.feeling)}`}
            variant="outline"
          >
            <span className="mr-2">{getMoodIcon(currentMood.feeling)}</span>
            {currentMood.feeling}
          </Badge>
        )}
        
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
          <Star className="h-4 w-4" />
        </Button>
        
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}