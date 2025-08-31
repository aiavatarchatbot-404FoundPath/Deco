import React, { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Switch } from './ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

import { Search, MessageCircle, BookmarkCheck, Settings, Clock, Download, Trash2, ArrowLeft } from 'lucide-react';
//
interface ProfileScreenProps {
  onNavigate: (screen: any) => void;
  user?: {
    id: string;
    username: string;
  } | null;
}

interface Conversation {
  id: string;
  title: string;
  lastMessage: string;
  timestamp: string;
  status: 'ongoing' | 'completed';
}

interface SavedItem {
  id: string;
  title: string;
  content: string;
  timestamp: string;
  type: 'answer' | 'insight' | 'resource';
}

export default function ProfileScreen({ onNavigate, user }: ProfileScreenProps) {
  const [activeTab, setActiveTab] = useState('conversations');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [defaultModel, setDefaultModel] = useState('gpt-4o-mini');

  // Mock data for conversations
  const conversations: Conversation[] = [
    {
      id: '1',
      title: 'Chat with Mentor',
      lastMessage: 'Yesterday · 14:05',
      timestamp: '2025-08-29T14:05:00Z',
      status: 'ongoing'
    },
    {
      id: '2',
      title: 'Anxiety Support Session',
      lastMessage: 'Aug 28 · 16:30',
      timestamp: '2025-08-28T16:30:00Z',
      status: 'completed'
    },
    {
      id: '3',
      title: 'Career Guidance Chat',
      lastMessage: 'Aug 27 · 10:15',
      timestamp: '2025-08-27T10:15:00Z',
      status: 'ongoing'
    },
    {
      id: '4',
      title: 'Mindfulness Practice',
      lastMessage: 'Aug 25 · 19:45',
      timestamp: '2025-08-25T19:45:00Z',
      status: 'completed'
    }
  ];

  // Mock data for saved items
  const savedItems: SavedItem[] = [
    {
      id: '1',
      title: 'Pinned Answer — Data pipeline explanation',
      content: 'Detailed explanation about setting up data pipelines with best practices...',
      timestamp: '2025-08-20T00:00:00Z',
      type: 'answer'
    },
    {
      id: '2',
      title: 'Coping Strategies for Stress',
      content: 'Five effective techniques for managing stress in challenging situations...',
      timestamp: '2025-08-18T00:00:00Z',
      type: 'insight'
    },
    {
      id: '3',
      title: 'Career Resources List',
      content: 'Comprehensive list of career development resources and tools...',
      timestamp: '2025-08-15T00:00:00Z',
      type: 'resource'
    }
  ];

  const filteredConversations = conversations.filter(conv =>
    conv.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    conv.lastMessage.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDeleteAccount = () => {
    // This would typically handle account deletion
    console.log('Account deletion requested');
  };

  const handleExportData = () => {
    // This would typically export user data
    console.log('Data export requested');
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6">
        {/* Back Button */}
        <Button
          variant="ghost"
          onClick={() => onNavigate('welcome')}
          className="mb-6 trauma-safe gentle-focus"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Home
        </Button>

        {/* Profile Header */}
        <div className="bg-card rounded-lg border border-border p-6 mb-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-4 sm:space-y-0 sm:space-x-6">
            {/* Avatar */}
            <Avatar className="w-20 h-20">
              <AvatarImage src="/api/placeholder/80/80" alt="User Avatar" />
              <AvatarFallback className="bg-gradient-to-br from-soft-teal to-soft-lilac text-white text-xl">
                {user?.username?.charAt(0).toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>

            {/* User Info */}
            <div className="flex-1">
              <h1 className="mb-1">{user?.username || 'Arun Kumar'}</h1>
              <p className="text-muted-foreground mb-2">
                <Clock className="w-4 h-4 inline mr-1" />
                Last active: Aug 30, 2025
              </p>
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                <span>12 conversations</span>
                <span>•</span>
                <span>3 saved chats</span>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Tabs */}
          <div className="lg:col-span-2">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-3 trauma-safe">
                <TabsTrigger value="conversations" className="trauma-safe gentle-focus">
                  <MessageCircle className="w-4 h-4 mr-2" />
                  Conversations
                </TabsTrigger>
                <TabsTrigger value="saved" className="trauma-safe gentle-focus">
                  <BookmarkCheck className="w-4 h-4 mr-2" />
                  Saved
                </TabsTrigger>
                <TabsTrigger value="settings" className="trauma-safe gentle-focus">
                  <Settings className="w-4 h-4 mr-2" />
                  Settings
                </TabsTrigger>
              </TabsList>

              {/* Conversations Tab */}
              <TabsContent value="conversations" className="mt-6">
                <div className="space-y-4">
                  {/* Search Input */}
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="Search chats…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 trauma-safe gentle-focus"
                    />
                  </div>

                  {/* Conversations List */}
                  <div className="space-y-3">
                    {filteredConversations.map((conversation) => (
                      <Card 
                        key={conversation.id} 
                        className="trauma-safe calm-hover cursor-pointer transition-all duration-200"
                        onClick={() => setSelectedConversation(conversation)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center space-x-3 mb-2">
                                <h3>{conversation.title}</h3>
                                <Badge 
                                  variant={conversation.status === 'ongoing' ? 'default' : 'secondary'}
                                  className="trauma-safe"
                                >
                                  {conversation.status === 'ongoing' ? 'Ongoing' : 'Completed'}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                Last message: {conversation.lastMessage}
                              </p>
                            </div>
                            <Button 
                              size="sm" 
                              onClick={(e) => {
                                e.stopPropagation();
                                onNavigate('chat');
                              }}
                              className="trauma-safe gentle-focus"
                            >
                              Continue
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              </TabsContent>

              {/* Saved Tab */}
              <TabsContent value="saved" className="mt-6">
                <div className="space-y-4">
                  {savedItems.map((item) => (
                    <Card key={item.id} className="trauma-safe calm-hover">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="mb-2">{item.title}</h3>
                            <p className="text-sm text-muted-foreground mb-2">
                              {item.content}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Saved on {new Date(item.timestamp).toLocaleDateString('en-US', { 
                                month: 'short', 
                                day: 'numeric', 
                                year: 'numeric' 
                              })}
                            </p>
                          </div>
                          <Badge variant="outline" className="ml-3 trauma-safe">
                            {item.type}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              {/* Settings Tab */}
              <TabsContent value="settings" className="mt-6">
                <div className="space-y-6">
                  {/* Appearance Settings */}
                  <Card className="trauma-safe">
                    <CardHeader>
                      <CardTitle>Appearance</CardTitle>
                      <CardDescription>Customize how your app looks and feels</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <label className="font-medium">Dark mode</label>
                          <p className="text-sm text-muted-foreground">Toggle between light and dark themes</p>
                        </div>
                        <Switch
                          checked={isDarkMode}
                          onCheckedChange={setIsDarkMode}
                          className="trauma-safe"
                        />
                      </div>
                    </CardContent>
                  </Card>

                  {/* AI Settings */}
                  <Card className="trauma-safe">
                    <CardHeader>
                      <CardTitle>AI Preferences</CardTitle>
                      <CardDescription>Configure your chat experience</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <label className="font-medium">Default model</label>
                        <Select value={defaultModel} onValueChange={setDefaultModel}>
                          <SelectTrigger className="trauma-safe gentle-focus">
                            <SelectValue placeholder="Select AI model" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="gpt-4o-mini">GPT-4o mini</SelectItem>
                            <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                            <SelectItem value="claude-3">Claude 3</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-sm text-muted-foreground">
                          Choose which AI model to use by default for conversations
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Data Management */}
                  <Card className="trauma-safe">
                    <CardHeader>
                      <CardTitle>Data Management</CardTitle>
                      <CardDescription>Manage your personal data and account</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <Button 
                        variant="outline" 
                        onClick={handleExportData}
                        className="w-full sm:w-auto trauma-safe gentle-focus"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Export my data
                      </Button>

                      <div>
                        <Button 
                          variant="destructive" 
                          onClick={() => {
                            const confirmed = window.confirm(
                              "Are you absolutely sure?\n\nThis action cannot be undone. This will permanently delete your account and remove all your data from our servers, including conversations and saved items."
                            );
                            if (confirmed) {
                              handleDeleteAccount();
                            }
                          }}
                          className="w-full sm:w-auto trauma-safe gentle-focus"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete account
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* Right Column - Session Summary */}
          {selectedConversation && (
            <div className="lg:col-span-1">
              <Card className="trauma-safe sticky top-6">
                <CardHeader>
                  <CardTitle>Session Summary</CardTitle>
                  <CardDescription>{selectedConversation.title}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm">
                    {selectedConversation.id === '1' && 
                      "Discussed project database schema and Supabase setup. Explored best practices for data modeling and API design patterns."
                    }
                    {selectedConversation.id === '2' && 
                      "Worked through anxiety management techniques and developed personalized coping strategies for challenging situations."
                    }
                    {selectedConversation.id === '3' && 
                      "Explored career development opportunities and created an action plan for skill building and networking."
                    }
                    {selectedConversation.id === '4' && 
                      "Practiced mindfulness exercises and discussed the benefits of regular meditation for mental wellbeing."
                    }
                  </p>
                  
                  <div className="flex flex-col space-y-2">
                    <Badge variant="outline" className="w-fit trauma-safe">
                      {selectedConversation.status}
                    </Badge>
                    <p className="text-xs text-muted-foreground">
                      Last activity: {selectedConversation.lastMessage}
                    </p>
                  </div>

                  <Button 
                    className="w-full trauma-safe gentle-focus"
                    onClick={() => onNavigate('chat')}
                  >
                    Resume Conversation
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}