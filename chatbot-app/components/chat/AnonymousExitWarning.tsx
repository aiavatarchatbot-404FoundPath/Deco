'use client';

import React from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { AlertTriangle, LogIn, MessageSquare } from 'lucide-react';

type Props = {
  onContinue: () => void;
  onCreateAccount: () => void;
  onClose: () => void;
};

export default function AnonymousExitWarning({
  onContinue,
  onCreateAccount,
  onClose,
}: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <Card className="max-w-lg w-full trauma-safe border-red-200 shadow-xl">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600">
            <AlertTriangle className="h-8 w-8" />
          </div>
          <CardTitle className="text-2xl text-red-700">End chat without an account?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground text-left">
            You&apos;re chatting anonymously. If you end this session now, you won&apos;t be able to revisit
            these messages later. To save your conversation history and pick up where you left off,
            please create an account first.
          </p>

          <div className="grid gap-3">
            <Button
              onClick={onCreateAccount}
              className="w-full gap-2 trauma-safe gentle-focus"
            >
              <LogIn className="h-4 w-4" />
              Create an account to save my chat
            </Button>

            <Button
              variant="outline"
              onClick={onContinue}
              className="w-full gap-2 border-red-200 text-red-600 hover:bg-red-50"
            >
              <MessageSquare className="h-4 w-4" />
              End chat without saving
            </Button>

            <Button variant="ghost" onClick={onClose} className="w-full">
              Keep chatting
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
