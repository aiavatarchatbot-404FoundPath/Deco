// components/chat/MessageInput.tsx
"use client";

import React, { KeyboardEvent } from 'react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Switch } from '../ui/switch';
import { Send, Smile } from 'lucide-react';

interface MessageInputProps {
  value: string;
  onChange: (value: string) => void;
  onSendMessage: (content: string) => void;
  isAnonymous: boolean;
  onToggleAnonymous: (anonymous: boolean) => void;
  disabled?: boolean;
}

export default function MessageInput({
  value,
  onChange,
  onSendMessage,
  isAnonymous,
  onToggleAnonymous,
  disabled = false
}: MessageInputProps) {
  
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    if (value.trim() && !disabled) {
      onSendMessage(value);
      onChange(''); // Clear the input immediately after sending
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
        {/* Emoji Button */}
        <Button 
          variant="ghost" 
          size="sm" 
          className="mb-2 p-2 h-auto"
          disabled={disabled}
        >
          <Smile className="h-5 w-5 text-gray-500" />
        </Button>

        {/* Text Input */}
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

      {/* Helper Text */}
      <div className="mt-2 text-xs text-gray-500 text-center">
        Your messages are private and secure. Press Enter to send, Shift+Enter for new line.
      </div>
    </div>
  );
}