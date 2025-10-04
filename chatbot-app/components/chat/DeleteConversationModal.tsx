'use client';

import React from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Trash2 } from 'lucide-react';

type Props = {
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  title?: string | null;
};

export default function DeleteConversationModal({ onClose, onConfirm, title }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <Card className="max-w-lg w-full trauma-safe shadow-2xl">
        <CardHeader>
          <div className="flex items-center space-x-3">
            <Trash2 className="w-6 h-6 text-red-600" />
            <CardTitle>Delete Conversation</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            You’re about to permanently delete this past conversation.
          </p>

          <div className="flex gap-3">
            <Button
              onClick={onConfirm}
              className="flex-1 bg-red-500 text-white hover:bg-red-600"
            >
              Yes, delete it
            </Button>
            <Button variant="ghost" onClick={onClose} className="flex-1">
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
