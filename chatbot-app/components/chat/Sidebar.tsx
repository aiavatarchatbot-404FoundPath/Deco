"use client";

import React from "react";
import { Button } from "../ui/button";
import SafetyIndicator from "./SafetyIndicator";

import { Toaster, toast } from "sonner";
import { Phone, User, Settings, FileText, LogOut, Heart } from "lucide-react";

import type { CounselorResource } from "./CounselorResourcesModal";

interface SidebarProps {
  onNavigate: (screen: string) => void;
  onInjectMessage?: (content: string) => void;
  isLoggedIn?: boolean;
  onShareRequiresLogin?: () => void;
  onShareConfirm?: () => void;
  onCrisisSupport?: () => void;
  onCounselorRequest?: () => void;
  stats?: { sessionSeconds: number; messageCount: number };
  savedResources?: CounselorResource[];
}

export default function Sidebar({
  onNavigate,
  onInjectMessage,
  isLoggedIn = false,
  onShareRequiresLogin,
  onShareConfirm,
  onCrisisSupport,
  onCounselorRequest,
  stats,
  savedResources,
  
}: SidebarProps) {
  // --- Support actions ---
  const handleCrisisSupport = () => {
    onCrisisSupport?.();
  };

  const handleFindCounselor = () => {
    onCounselorRequest?.();
  };

  const handlePreferences = () => {
    onNavigate("settings");
  };

  const handleShareConversation = () => {
    if (!isLoggedIn) {
      onShareRequiresLogin?.();
      return;
    }
    // Ask parent to show confirmation modal; fall back to old behavior if not provided
    if (onShareConfirm) {
      onShareConfirm();
    } else {
      toast("Opening summary", {
        description: "Preparing your conversation summary…",
      });
      setTimeout(() => onNavigate("summary"), 600);
    }
  };

  const handleEndChat = () => {
    toast("Chat ended", {
      description: "Thanks for chatting. Redirecting to Home…",
    });
    setTimeout(() => onNavigate("home"), 600);
  };
  // Session time and messages
  const sessionLabel = formatHMS(stats?.sessionSeconds ?? 0);

  const msgLabel = String(stats?.messageCount ?? 0);

  return (
    <aside className="w-80 shrink-0 bg-gray-50 border-r border-gray-200 flex flex-col min-h-0">
      <div className="p-5 space-y-6 flex-1 overflow-y-auto min-h-0">
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

        {/* tiny session stats */
        }
        <div className="border-t border-gray-200 pt-4 space-y-2 text-xs text-gray-600">
          <div className="flex items-center justify-between py-1">
            <span>Session time:</span>
            <span className="font-medium text-gray-900">{sessionLabel}</span>
          </div>
          <div className="flex items-center justify-between py-1">
            <span>Messages:</span>
            <span className="font-medium text-gray-900">{msgLabel}</span>
          </div>
          <div className="flex justify-between">
            <span>Status:</span>
            <span className="text-green-600">Secure</span>
          </div>
        </div>

        {/* Saved counselor resources */}
        {savedResources && savedResources.length > 0 && (
          <div className="mt-4 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-gray-800 font-semibold">Saved resources</span>
            </div>
            <div className="space-y-2">
              {savedResources.map((r) => (
                <div key={r.name} className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-3">
                  <p className="text-emerald-800 font-medium">{r.name}</p>
                  <p className="text-gray-700 mt-0.5">{r.description}</p>
                  <p className="text-emerald-700 mt-1 font-semibold">{r.contact}</p>
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    Visit website
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Mount sonner toasts (you can move this to app/layout.tsx if you prefer global) */}
      <Toaster position="bottom-center" richColors />
    </aside>
  );
}

function formatHMS(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "0s";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);

  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}
