import React, { useState } from 'react';
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

export default function TranscriptScreen({ onNavigate }: TranscriptScreenProps) {
  const [showFullTranscript, setShowFullTranscript] = useState(false);
  const [shareNote, setShareNote] = useState('');
  const [copied, setCopied] = useState(false);

  // Mock conversation data
  const conversationData = {
    date: new Date().toLocaleDateString(),
    duration: "23 minutes",
    messageCount: 12,
    summary: "Discussion about feelings of stress and anxiety related to upcoming court date. Explored coping strategies and identified support networks.",
    transcript: [
      { sender: 'ai', content: "Hi there! I'm Adam, your Avatar Companion. How are you feeling today?" },
      { sender: 'user', content: "I'm feeling really anxious about my court date next week." },
      { sender: 'ai', content: "That sounds really stressful. It's completely normal to feel anxious about court proceedings. Would you like to talk about what's worrying you most?" },
      { sender: 'user', content: "I'm worried about what will happen and if I'll say the wrong thing." },
      { sender: 'ai', content: "Those are very understandable concerns. Many people feel this way before court. Have you been able to talk to your lawyer or support worker about what to expect?" },
      { sender: 'user', content: "Yes, my lawyer explained the process but I'm still nervous." },
      { sender: 'ai', content: "It's great that you've prepared with your lawyer. Being nervous shows you care. What helps you feel calmer when you're anxious?" }
    ]
  };

  const handleCopyTranscript = async () => {
    const transcriptText = conversationData.transcript
      .map(msg => `${msg.sender === 'ai' ? 'Adam' : 'You'}: ${msg.content}`)
      .join('\n\n');
    
    try {
      await navigator.clipboard.writeText(transcriptText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy transcript');
    }
  };

  const handleDownload = () => {
    const transcriptContent = `
Avatar Companion Conversation Summary
Date: ${conversationData.date}
Duration: ${conversationData.duration}

Summary: ${conversationData.summary}

Conversation:
${conversationData.transcript.map(msg => 
  `${msg.sender === 'ai' ? 'Adam' : 'You'}: ${msg.content}`
).join('\n\n')}

---
This conversation was conducted in a safe, confidential environment with AI support.
`;

    const blob = new Blob([transcriptContent], { type: 'text/plain' });
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
                  {conversationData.summary}
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
      </div>
    </div>
  );
}