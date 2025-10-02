'use client';

import React from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { LifeBuoy } from 'lucide-react';

type Props = {
  onClose: () => void;
};

export default function CrisisSupportModal({ onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <Card className="max-w-lg w-full trauma-safe border-red-200 shadow-2xl">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600">
            <LifeBuoy className="h-8 w-8" />
          </div>
          <CardTitle className="text-2xl text-red-700">Need immediate help?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3 text-sm text-left text-muted-foreground">
            <p>If you’re in immediate danger, please call emergency services (000) right away.</p>
            <p>
              Lifeline is available 24/7 on <strong>13 11 14</strong> and offers confidential crisis support.
            </p>
            <p>
              For mental health support, you can also reach Beyond Blue on <strong>1300 22 4636</strong>.
            </p>
            <p>We’re here with you, and you’re not alone.</p>
          </div>

          <Button onClick={onClose} className="w-full bg-red-500 text-white hover:bg-red-600">
            Okay, keep chatting
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
