"use client";

import React from "react";
import { Button } from "../ui/button";
// Make sure the filename matches: if your file is SafetyIndicators.tsx,
// this path should be "./SafetyIndicators"
import SafetyIndicator from "./SafetyIndicator";

import { Toaster, toast } from "sonner";
import { Phone, User, Settings, FileText, LogOut, Heart } from "lucide-react";

interface SidebarProps {
  onNavigate: (screen: string) => void;
  onInjectMessage?: (content: string) => void;
}

export default function Sidebar({ onNavigate, onInjectMessage }: SidebarProps) {
  // --- Support actions ---
  const handleCrisisSupport = () => {
    onInjectMessage?.(
      "If you’re in immediate danger, please contact emergency services (000) or Lifeline (13 11 14). I’m here with you — you’re not alone."
    );
  };

  const handleFindCounselor = () => {
    onInjectMessage?.(
      "Yes, connecting with a counselor could be helpful. Would you like me to share a few youth-friendly, trauma-informed contacts?"
    );
  };

  const handlePreferences = () => {
    onNavigate("settings");
  };

  const handleShareConversation = () => {
    toast("Opening summary", {
      description: "Preparing your conversation summary…",
    });
    setTimeout(() => onNavigate("summary"), 600);
  };

  const handleEndChat = () => {
    toast("Chat ended", {
      description: "Thanks for chatting. Redirecting to Home…",
    });
    setTimeout(() => onNavigate("home"), 600);
  };

  return (
    <aside className="w-80 shrink-0 bg-gray-50 border-r border-gray-200 flex flex-col">
      <div className="p-5 space-y-6">
        {/* Safety block */}
        <SafetyIndicator/>

        <div className="border-t border-gray-200" />

        {/* Need more help */}
        <div className="flex items-center text-gray-900">
          <Heart className="h-4 w-4 mr-2 text-rose-500" />
          <h3 className="font-semibold">Need more help?</h3>
        </div>

        <div className="space-y-3">
          <Button
            onClick={handleCrisisSupport}
            variant="outline"
            className="w-full justify-start border-red-200 text-red-600 hover:bg-red-50"
          >
            <Phone className="h-4 w-4 mr-2" />
            Crisis Support
          </Button>

          <Button
            onClick={handleFindCounselor}
            variant="outline"
            className="w-full justify-start"
          >
            <User className="h-4 w-4 mr-2" />
            Find Counselor
          </Button>

          <Button
            onClick={handlePreferences}
            variant="outline"
            className="w-full justify-start"
          >
            <Settings className="h-4 w-4 mr-2" />
            Preferences
          </Button>

          <Button
            onClick={handleShareConversation}
            variant="outline"
            className="w-full justify-start"
          >
            <FileText className="h-4 w-4 mr-2" />
            Share Conversation
          </Button>

          <Button
            onClick={() => onNavigate('endchat')}
            variant="outline"
            className="w-full justify-start border-red-200 text-red-600 hover:bg-red-50"
          >
            <LogOut className="h-4 w-4 mr-2" />
            End Chat
          </Button>
        </div>

        {/* tiny session stats */}
        <div className="border-t border-gray-200 pt-4 space-y-2 text-xs text-gray-600">
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

      {/* Mount sonner toasts (you can move this to app/layout.tsx if you prefer global) */}
      <Toaster position="bottom-center" richColors />
    </aside>
  );
}
