'use client';

import React from 'react';
import { ShieldAlert, LogIn } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

type Props = {
  onCreateAccount: () => void;
  onClose: () => void;
};

export default function ShareLoginWarning({ onCreateAccount, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <Card className="max-w-lg w-full trauma-safe border-blue-200 shadow-2xl">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 text-blue-600">
            <ShieldAlert className="h-8 w-8" />
          </div>
          <CardTitle className="text-2xl text-blue-700">Create an account to share</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-left text-muted-foreground">
            Chat history is only saved for logged-in users. Sign in or create a free account to generate
            a shareable summary you can revisit later.
          </p>

          <div className="grid gap-3">
            <Button
              onClick={onCreateAccount}
              className="w-full gap-2 bg-blue-500 text-white hover:bg-blue-600 trauma-safe gentle-focus"
            >
              <LogIn className="h-4 w-4" />
              Create account & save my chat
            </Button>

            <Button variant="ghost" onClick={onClose} className="w-full">
              Keep chatting for now
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
