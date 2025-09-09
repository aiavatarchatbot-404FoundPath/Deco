"use client";

import React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Badge } from "../ui/badge";

interface ChatHeaderProps {
  currentMood?: {
    feeling: string;
    intensity: number;
    reason?: string;
    support?: string;
    timestamp: Date;
  } | null;
  chatMode: "avatar" | "standard";
}

// Subtle pastel styles for moods
const feelings = [
  { emoji: "😊", label: "Happy", color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  { emoji: "😌", label: "Calm", color: "bg-teal-100 text-teal-700 border-teal-200" },
  { emoji: "😔", label: "Sad", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { emoji: "😰", label: "Anxious", color: "bg-purple-100 text-purple-700 border-purple-200" },
  { emoji: "😤", label: "Frustrated", color: "bg-red-100 text-red-700 border-red-200" },
  { emoji: "😴", label: "Tired", color: "bg-gray-100 text-gray-700 border-gray-300" },
  { emoji: "🤔", label: "Confused", color: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  { emoji: "😐", label: "Neutral", color: "bg-gray-100 text-gray-700 border-gray-300" },
];

export default function ChatHeader({ currentMood, chatMode }: ChatHeaderProps) {
  const moodConfig = feelings.find(
    (f) => f.label.toLowerCase() === currentMood?.feeling.toLowerCase()
  );

  return (
    <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200">
      {/* Left side: AI Companion info */}
      <div className="flex items-center space-x-3">
        <Avatar className="h-10 w-10">
          <AvatarImage src="/adam-avatar.png" alt="Adam" />
          <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-500 text-white">
            A
          </AvatarFallback>
        </Avatar>

        <div>
          <h2 className="font-semibold text-gray-900">Adam - Your AI Companion</h2>
          <div className="flex items-center space-x-2 text-sm text-gray-500">
            <span>{chatMode === "avatar" ? "Avatar Chat Mode" : "Standard Chat Mode"}</span>
            <span>•</span>
            <span>Safe & Private</span>
          </div>
        </div>
      </div>

      {/* Right side: Mood badge */}
      <div className="flex items-center space-x-3">
        {currentMood && moodConfig && (
          <Badge
            className={`px-3 py-1 rounded-full ${moodConfig.color}`}
            variant="outline"
          >
            <span className="mr-1">{moodConfig.emoji}</span>
            {currentMood.feeling}
          </Badge>
        )}
      </div>
    </div>
  );
}
