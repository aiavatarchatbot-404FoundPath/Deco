// components/chat/ChatHeader.tsx
'use client';

import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { MoreHorizontal, Star } from 'lucide-react';

/**
 * Props for ChatHeader
 * - currentMood: optional mood chip (shows emoji + color)
 * - chatMode: 'avatar' | 'standard' (title/subtitle)
 * - paused: optional control state for Pause/Resume
 * - pace: 'slow' | 'normal' (optional, controls reply pacing)
 * - motionSafe: optional flag for reduced motion preference
 * - onTogglePaused / onPaceChange / onToggleMotion: optional handlers
 *   If you don't pass them, the buttons will be hidden.
 */
interface ChatHeaderProps {
  currentMood?: {
    feeling: string;
    intensity: number;
    reason?: string;
    support?: string;
    timestamp: Date;
  } | null;
  chatMode: 'avatar' | 'standard';

  // ↓ Optional control props (pass them if you want the controls to appear)
  paused?: boolean;
  pace?: 'slow' | 'normal';
  motionSafe?: boolean;
  onTogglePaused?: () => void;
  onPaceChange?: (pace: 'slow' | 'normal') => void;
  onToggleMotion?: () => void;
}

/** Map feeling → badge color classes */
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

/** Map feeling → emoji */
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

export default function ChatHeader({
  currentMood,
  chatMode,

  // Controls (optional)
  paused,
  pace = 'normal',
  motionSafe = true,
  onTogglePaused,
  onPaceChange,
  onToggleMotion,
}: ChatHeaderProps) {
  // Whether to show the right-side control group
  const showControls = typeof onTogglePaused === 'function'
    || typeof onPaceChange === 'function'
    || typeof onToggleMotion === 'function';

  return (
    <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200 sticky top-0 z-10">
      {/* === Left: Companion identity & status === */}
      <div className="flex items-center space-x-3">
        {/* Presence dot (gentle pulse unless motionSafe) */}
        <span
          aria-hidden
          className={`w-2.5 h-2.5 rounded-full bg-emerald-500 ${motionSafe ? '' : 'animate-pulse'}`}
        />

        <Avatar className="h-10 w-10">
          <AvatarImage src="/adam-avatar.png" alt="Adam" />
          <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-500 text-white">
            A
          </AvatarFallback>
        </Avatar>

        <div>
          <h2 className="font-semibold text-gray-900">
            Adam — Your AI Companion
          </h2>
          <div className="flex items-center space-x-2 text-sm text-gray-500">
            <span>{chatMode === 'avatar' ? 'Avatar Chat Mode' : 'Standard Chat Mode'}</span>
            <span>•</span>
            <span>Safe & Private</span>
          </div>
        </div>
      </div>

      {/* === Right: Mood chip + (optional) controls + actions === */}
      <div className="flex items-center gap-3">

        {/* Mood badge (if provided) */}
        {currentMood && (
          <Badge
            className={`px-3 py-1 ${getMoodColor(currentMood.feeling)}`}
            variant="outline"
            aria-label={`Current mood: ${currentMood.feeling}`}
            title={currentMood.reason || 'Mood'}
          >
            <span className="mr-2">{getMoodIcon(currentMood.feeling)}</span>
            {currentMood.feeling}
          </Badge>
        )}

        {/* Trauma-informed controls (render only if handlers are provided) */}
        {showControls && (
          <div className="hidden sm:flex items-center gap-2">
            {/* Pause/Resume */}
            {onTogglePaused && (
              <Button
                size="sm"
                variant="secondary"
                onClick={onTogglePaused}
                aria-pressed={!!paused}
                aria-label={paused ? 'Resume assistant' : 'Pause assistant'}
              >
                {paused ? 'Resume AI' : 'Pause AI'}
              </Button>
            )}

            {/* Pace: Slow / Normal */}
            {onPaceChange && (
              <div className="text-xs border rounded-lg px-2 py-1 flex items-center gap-2">
                <span className="whitespace-nowrap">Pace:</span>
                <Button
                  size="sm"
                  variant={pace === 'slow' ? 'default' : 'ghost'}
                  onClick={() => onPaceChange('slow')}
                >
                  Slow
                </Button>
                <Button
                  size="sm"
                  variant={pace === 'normal' ? 'default' : 'ghost'}
                  onClick={() => onPaceChange('normal')}
                >
                  Normal
                </Button>
              </div>
            )}

            {/* Reduce Motion */}
            {onToggleMotion && (
              <Button
                size="sm"
                variant={motionSafe ? 'default' : 'secondary'}
                onClick={onToggleMotion}
                aria-pressed={motionSafe}
                aria-label="Toggle reduced motion"
              >
                {motionSafe ? 'Reduce Motion: On' : 'Reduce Motion'}
              </Button>
            )}
          </div>
        )}

        {/* Optional action icons (keep from your original) */}
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="Star conversation">
          <Star className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="More options">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
