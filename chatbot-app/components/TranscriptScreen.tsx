"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { 
  FileText, 
  Download, 
  Share, 
  Eye, 
  EyeOff, 
  Copy, 
  Mail, 
  User, 
  Calendar,
  Shield,
  AlertCircle,
  Check
} from 'lucide-react';

interface TranscriptScreenProps {
  onNavigate: (screen: string) => void;
}

type TranscriptMsg = { sender: 'ai' | 'user'; content: string };
type ConversationData = {
  date: string;
  duration: string;
  messageCount: number; // For user-only
  summary: string;
  transcript: TranscriptMsg[];
};

function formatHMS(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(ss).padStart(2, "0")}s`;
  if (m > 0) return `${m}m ${String(ss).padStart(2, "0")}s`;
  return `${ss}s`;
}

export default function TranscriptScreen({ onNavigate }: TranscriptScreenProps) {
  const params = useSearchParams();
  const convoFromUrl = params.get('convo'); 

  const [showFullTranscript, setShowFullTranscript] = useState(false);
  const [shareNote, setShareNote] = useState('');
  const [copied, setCopied] = useState(false);

  const [conversationId, setConversationId] = useState<string | null>(convoFromUrl);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [conversationData, setConversationData] = useState<ConversationData>({
    date: '',
    duration: '0s',
    messageCount: 0,
    summary: '',
    transcript: [],
  });

  // Determine conversation ID
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (convoFromUrl) {
        setConversationId(convoFromUrl);
        return;
      }
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return;
      const { data, error } = await supabase
        .from('conversations')
        .select('id')
        .eq('user_id', uid)
        .eq('status', 'ended')
        .order('ended_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled && data?.id) setConversationId(data.id);
    })();
    return () => { cancelled = true; };
  }, [convoFromUrl]);

  // Load conversation + messages
  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setErr(null);

      // 1) Conversation meta
      const { data: convo, error: convoErr } = await supabase
        .from('conversations')
        .select('created_at, ended_at, accumulated_seconds, active_since')
        .eq('id', conversationId)
        .single();

      if (convoErr) {
        if (!cancelled) {
          setErr(convoErr.message || 'Failed to load conversation');
          setLoading(false);
        }
        return;
      }

      const endDate = convo?.ended_at ? new Date(convo.ended_at) : new Date(convo.created_at);
      const seconds =
        (convo?.accumulated_seconds ?? 0) > 0
          ? convo.accumulated_seconds
          : convo?.ended_at
          ? Math.max(0, Math.floor((new Date(convo.ended_at).getTime() - new Date(convo.created_at).getTime()) / 1000))
          : 0;

      // 2) Transcript (messages)
      const { data: msgs, error: msgErr } = await supabase
        .from('messages')
        .select('id, role, content, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true });

      if (msgErr) {
        if (!cancelled) {
          setErr(msgErr.message || 'Failed to load messages');
          setLoading(false);
        }
        return;
      }

      const transcript: TranscriptMsg[] = (msgs ?? [])
        .filter((m) => m.role !== 'system')
        .map((m) => ({
          sender: m.role === 'assistant' ? 'ai' : 'user',
          content: m.content,
        }));

      const messageCount = (msgs ?? []).filter((m) => m.role === 'user').length;

      if (!cancelled) {
        setConversationData({
          date: endDate.toLocaleDateString(),
          duration: formatHMS(seconds),
          messageCount,
          summary: '', 
          transcript,
        });
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [conversationId]);

  const transcriptText = useMemo(
    () => conversationData.transcript
      .map(msg => `${msg.sender === 'ai' ? 'Adam' : 'You'}: ${msg.content}`)
      .join('\n\n'),
    [conversationData.transcript]
  );

  const handleCopyTranscript = async () => {
    try {
      await navigator.clipboard.writeText(transcriptText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy transcript');
    }
  };

  const handleDownload = () => {
    const txt = `
Avatar Companion Conversation Summary
Date: ${conversationData.date}
Duration: ${conversationData.duration}

Summary: ${conversationData.summary || '(no saved summary)'}

Conversation:
${transcriptText}

---
This conversation was conducted in a safe, confidential environment with AI support.
`;
    const blob = new Blob([txt], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `avatar-companion-conversation-${conversationData.date.replace(/\//g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-100 via-pink-50 to-blue-100">
      <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Conversation Summary
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            Review your conversation and share it with trusted adults who can provide additional support.
          </p>
        </div>

        {loading ? (
          <div className="p-6 text-sm text-gray-600">Loading summary…</div>
        ) : err ? (
          <div className="p-6 text-sm text-red-600">Error: {err}</div>
        ) : (
        <div className="space-y-6">
          {/* Privacy Notice */}
          <Card className="trauma-safe border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20">
            <CardContent className="p-4">
              <div className="flex items-start space-x-3">
                <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-medium text-blue-800 dark:text-blue-300 mb-1">
                    Your Privacy is Protected
                  </h3>
                  <p className="text-sm text-blue-700 dark:text-blue-400">
                    This summary contains no personal identifying information. Only share with people you trust, 
                    like a counselor, mentor, or family member who can help support you.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Conversation Overview */}
          <Card className="trauma-safe">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Calendar className="h-5 w-5 mr-2" />
                Conversation Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-4 mb-6">
                <div className="text-center p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <p className="text-2xl font-semibold text-blue-600 dark:text-blue-400">
                    {conversationData.date}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-300">Date</p>
                </div>
                <div className="text-center p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <p className="text-2xl font-semibold text-purple-600 dark:text-purple-400">
                    {conversationData.duration}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-300">Duration</p>
                </div>
                <div className="text-center p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <p className="text-2xl font-semibold text-teal-600 dark:text-teal-400">
                    {conversationData.messageCount}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-300">Messages</p>
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
                <h4 className="font-medium mb-2">Conversation Summary:</h4>
                <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                  {conversationData.summary || 'No saved summary.'}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Transcript Preview */}
          <Card className="trauma-safe">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center">
                  <FileText className="h-5 w-5 mr-2" />
                  Conversation Transcript
                </CardTitle>
                <Button
                  onClick={() => setShowFullTranscript(!showFullTranscript)}
                  variant="outline"
                  size="sm"
                  className="trauma-safe gentle-focus"
                >
                  {showFullTranscript ? (
                    <>
                      <EyeOff className="h-4 w-4 mr-2" />
                      Hide Full Transcript
                    </>
                  ) : (
                    <>
                      <Eye className="h-4 w-4 mr-2" />
                      Show Full Transcript
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {showFullTranscript ? (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {conversationData.transcript.map((message, index) => (
                    <div key={index} className="flex space-x-3">
                      <div className="flex-shrink-0">
                        {message.sender === 'ai' ? (
                          <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                            <span className="text-white text-xs font-medium">A</span>
                          </div>
                        ) : (
                          <div className="w-8 h-8 bg-teal-500 rounded-full flex items-center justify-center">
                            <User className="h-4 w-4 text-white" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-1">
                          <span className="font-medium text-sm">
                            {message.sender === 'ai' ? 'Adam' : 'You'}
                          </span>
                        </div>
                        <p className="text-gray-600 dark:text-gray-300 text-sm">
                          {message.content}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <FileText className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-600 dark:text-gray-300 mb-2">
                    Transcript preview hidden for privacy
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Click "Show Full Transcript" to review your conversation
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sharing Options */}
          <Card className="trauma-safe">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Share className="h-5 w-5 mr-2" />
                Share with Trusted Support
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Note for recipient */}
              <div>
                <Label htmlFor="share-note" className="text-sm font-medium mb-2 block">
                  Add a note for the person you're sharing with (optional):
                </Label>
                <Textarea
                  id="share-note"
                  value={shareNote}
                  onChange={(e) => setShareNote(e.target.value)}
                  placeholder="e.g., 'Hi [Name], I had this conversation with my AI companion and thought it might help you understand what I've been going through...'"
                  className="trauma-safe gentle-focus"
                  rows={3}
                />
              </div>

              <Separator />

              {/* Action buttons */}
              <div className="grid sm:grid-cols-2 gap-4">
                <Button
                  onClick={handleDownload}
                  className="w-full trauma-safe calm-hover"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download for Me
                </Button>

                <Button
                  onClick={handleCopyTranscript}
                  variant="outline"
                  className="w-full trauma-safe gentle-focus"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 mr-2 text-green-600" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-2" />
                      Copy Text
                    </>
                  )}
                </Button>
              </div>

              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-amber-800 dark:text-amber-300 mb-1">
                      Sharing Reminder
                    </h4>
                    <p className="text-sm text-amber-700 dark:text-amber-400">
                      Only share this conversation with people you trust, like a counselor, mentor, or family member. 
                      This can help them better understand your experiences and provide appropriate support.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Navigation */}
          <div className="text-center pt-8">
            <div className="flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto">
              <Button
                onClick={() => onNavigate('welcome')}
                variant="outline"
                className="trauma-safe gentle-focus"
              >
                Back to Home
              </Button>
            </div>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}