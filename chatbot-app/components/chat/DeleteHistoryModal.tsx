'use client';

import React from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Trash2 } from 'lucide-react';

type Props = {
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
};

export default function DeleteHistoryModal({ onClose, onConfirm }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <Card className="max-w-lg w-full trauma-safe shadow-2xl">
        <CardHeader>
          <div className="flex items-center space-x-3">
            <Trash2 className="w-6 h-6 text-red-600" />
            <CardTitle>Delete History</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This will permanently delete <strong>ALL of your conversations </strong>.
          </p>

          <div className="flex gap-3">
            <Button
              onClick={onConfirm}
              className="flex-1 bg-red-500 text-white hover:bg-red-600"
            >
              Yes, delete all
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
