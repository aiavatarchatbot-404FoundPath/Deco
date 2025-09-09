"use client";

import React, { KeyboardEvent } from 'react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Switch } from '../ui/switch';
import { Send, Smile } from 'lucide-react';

interface MessageInputProps {
  value: string;                          // current text in the input
  onChange: (value: string) => void;      // called when input changes
  onSendMessage: (content: string) => void; // called when message is sent
  isAnonymous: boolean;                   // whether user is in anonymous mode
  onToggleAnonymous: (anonymous: boolean) => void; // toggles anonymous mode
  disabled?: boolean;                     // disable input during AI typing
}

export default function MessageInput({
  value,
  onChange,
  onSendMessage,
  isAnonymous,
  onToggleAnonymous,
  disabled = false
}: MessageInputProps) {
  
  /**
   * Handle Enter key press
   * - Enter = send message
   * - Shift+Enter = new line
   */
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /**
   * Handle clicking the Send button or pressing Enter
   * Only sends if value is not empty and not disabled
   */
  const handleSend = () => {
    if (value.trim() && !disabled) {
      onSendMessage(value);
      onChange(''); // clear the input after sending
    }
  };

  return (
    <div className="border-t border-gray-200 bg-white px-6 py-4">
      {/* Anonymous Mode Toggle */}
      <div className="flex items-center justify-end mb-3">
        <div className="flex items-center space-x-2 text-sm text-gray-600">
          <span>Anonymous mode:</span>
          <Switch
            checked={isAnonymous}
            onCheckedChange={onToggleAnonymous}
            className="data-[state=checked]:bg-green-500"
          />
        </div>
      </div>

      {/* Input Area */}
      <div className="flex items-end space-x-3">
        {/* Emoji Button (non-functional placeholder) */}
        <Button 
          variant="ghost" 
          size="sm" 
          className="mb-2 p-2 h-auto"
          disabled={disabled}
        >
          <Smile className="h-5 w-5 text-gray-500" />
        </Button>

        {/* Textarea for message input */}
        <div className="flex-1">
          <Textarea
            placeholder="Type your message here... (Press Enter to Send)"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            className="min-h-[44px] max-h-32 resize-none border-gray-300 focus:border-blue-500 focus:ring-blue-500"
          />
        </div>

        {/* Send Button */}
        <Button
          onClick={handleSend}
          disabled={!value.trim() || disabled}
          className="mb-2 bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-full"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>

      {/* Helper Text (shows shortcuts) */}
      <div className="mt-2 text-xs text-gray-500 text-center">
        Your messages are private and secure. Press Enter to send, Shift+Enter for new line.
      </div>
    </div>
  );
}
