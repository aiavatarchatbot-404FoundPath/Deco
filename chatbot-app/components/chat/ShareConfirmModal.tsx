'use client';

import React from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { FileText } from 'lucide-react';

type Props = {
  onCancel: () => void;
  onConfirm: () => void;
};

export default function ShareConfirmModal({ onCancel, onConfirm }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <Card className="max-w-lg w-full trauma-safe border-amber-200 shadow-2xl">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <FileText className="h-8 w-8" />
          </div>
          <CardTitle className="text-2xl text-amber-800">Share conversation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm text-left text-muted-foreground">
            Sharing your conversation will end the current chat. You’ll then see a summary you can
            review and share. Do you want to end this conversation now?
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <Button variant="ghost" onClick={onCancel} className="w-full">
              Keep Chatting
            </Button>
            <Button onClick={onConfirm} className="w-full bg-amber-600 text-white hover:bg-amber-700">
              End Conversation
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

