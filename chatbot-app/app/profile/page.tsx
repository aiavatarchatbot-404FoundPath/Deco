"use client";

export const dynamic = 'force-dynamic';

import React, { useEffect, useMemo, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import ConversationList from '@/components/conversation';
import Navbar from "@/components/Navbar";
import { ReadyPlayerMeSelector } from "./ReadyPlayerMeSelector";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Search,
  MessageCircle,
  BookmarkCheck,
  Settings as SettingsIcon,
  Clock,
  Download,
  Trash2,
  ArrowLeft,
  User,
  Check,
  Crown,
} from "lucide-react";
// at top of your Profile page file:
//import { useEffect, useMemo, useState } from 'react';
//import { supabase } from '@/lib/supabaseClient';
import { getSessionUserId } from '@/lib/auth';
//import { useRouter } from 'next/navigation';

type ConversationRow = {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
};

type LastByConvo = Record<string, { content: string; created_at: string }>;

interface ReadyPlayerMeAvatar {
  id: string;
  name: string;
  url: string;
  type: "user" | "companion";
  thumbnail?: string; 
  isCustom?: boolean;
}


// GLB --> Png
function toThumbnail(url?: string | null): string | null {
  if (!url) return null;
  if (url.endsWith(".png")) return url;
  if (url.endsWith(".glb")) return url.replace(".glb", ".png");

  // Try to extract avatar id and use the official PNG endpoint
  try {
    const last = url.split("/").pop() || "";
    const id = last.replace(".glb", "");
    if (id && id.length > 10) {
      return `https://api.readyplayer.me/v1/avatars/${id}.png`;
    }
  } catch {}
  return null;
}

function idFromUrl(url: string): string {
  const last = url.split("/").pop() || "";
  return last.replace(".glb", "") || `custom-${Date.now()}`;
}

// JUST FOR NOW ITS THE mock data
type Conversation = {
  id: string;
  title: string;
  status: "ongoing" | "completed";
  lastMessage: string;
};

type SavedItem = {
  id: string;
  title: string;
  content: string;
  timestamp: number;
  type: "note" | "clip" | "snippet";
};

type Profile = {
  id: string;
  username: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
  session_mode?: string | null;

  
  rpm_user_url?: string | null;
  rpm_companion_url?: string | null;
};

const MOCK_CONVERSATIONS: Conversation[] = [
  { id: "1", title: "Chat with Mentor", status: "ongoing", lastMessage: "Yesterday · 14:05" },
  { id: "2", title: "Anxiety Support Session", status: "completed", lastMessage: "Aug 28 · 16:30" },
  { id: "3", title: "Career Guidance Chat", status: "ongoing", lastMessage: "Aug 27 · 10:15" },
  { id: "4", title: "Mindfulness Practice", status: "completed", lastMessage: "Aug 25 · 19:45" },
];

const MOCK_SAVED: SavedItem[] = [
  {
    id: "s1",
    title: "Pinned Answer — Data pipeline explanation",
    content: "Detailed explanation about setting up data pipelines with best practices...",
    timestamp: Date.now() - 1000 * 60 * 60 * 24 * 2,
    type: "note",
  },
  {
    id: "s2",
    title: "Coping Strategies for Stress",
    content: "Five effective techniques for managing stress in challenging situations...",
    timestamp: Date.now() - 1000 * 60 * 60 * 24 * 5,
    type: "snippet",
  },
  {
    id: "s3",
    title: "Career Resources List",
    content: "Comprehensive list of career development resources and tools...",
    timestamp: Date.now() - 1000 * 60 * 60 * 24 * 10,
    type: "clip",
  },
];

// This component should be defined outside of the ProfilePageSupabase component
// to prevent it from being recreated on every render.
function ProfileConversationsTab() {
  const router = useRouter();
  return (
    <Suspense fallback={<div className="p-6">Loading profile…</div>}>
      <ProfileClient />
    </Suspense>
  );
}

// If ProfileClient is defined elsewhere, import it:
// import ProfileClient from "@/components/ProfileClient";

// Otherwise, define a stub for demonstration:
function ProfileClient() {
  return <div>Profile content goes here.</div>;
}
