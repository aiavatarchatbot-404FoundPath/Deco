'use client';

import React from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Users } from 'lucide-react';

type Props = {
  onClose: () => void;
  onShowResources: () => void;
};

export default function CounselorModal({ onClose, onShowResources }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <Card className="max-w-lg w-full trauma-safe border-emerald-200 shadow-2xl">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <Users className="h-8 w-8" />
          </div>
          <CardTitle className="text-2xl text-emerald-700">Let’s find extra support</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-left text-muted-foreground">
            We can suggest youth-friendly, trauma-informed counselors and helplines. Want us to share a few
            trusted options you can reach out to today?
          </p>

          <div className="grid gap-3">
            <Button
              onClick={() => {
                onClose();
                onShowResources();
              }}
              className="w-full bg-emerald-500 text-white hover:bg-emerald-600"
            >
              Yes, show me counselor resources
            </Button>

            <Button variant="ghost" onClick={onClose} className="w-full">
              Maybe later
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
