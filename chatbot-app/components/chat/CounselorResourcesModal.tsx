'use client';

import React from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { BookOpen } from 'lucide-react';

export type CounselorResource = {
  name: string;
  description: string;
  contact: string;
  url: string;
};

type Props = {
  onClose: () => void;
  onConfirm: (resources: CounselorResource[]) => void;
};

export const COUNSELOR_RESOURCES: CounselorResource[] = [
  {
    name: 'Headspace',
    description: 'Youth mental health support with online and in-person counsellors.',
    contact: '1800 650 890',
    url: 'https://headspace.org.au/'
  },
  {
    name: 'Kids Helpline',
    description: '24/7 counselling for young people aged 5–25.',
    contact: '1800 55 1800',
    url: 'https://kidshelpline.com.au/'
  },
  {
    name: 'Beyond Blue',
    description: 'Confidential support from trained mental health professionals.',
    contact: '1300 22 4636',
    url: 'https://www.beyondblue.org.au/'
  },
];

export default function CounselorResourcesModal({ onClose, onConfirm }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <Card className="max-w-2xl w-full trauma-safe border-emerald-200 shadow-2xl">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <BookOpen className="h-8 w-8" />
          </div>
          <CardTitle className="text-2xl text-emerald-700">Counselor Resources</CardTitle>
          <p className="text-sm text-muted-foreground">
            Reach out to any of these trusted services when you feel ready.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4 text-left">
            {COUNSELOR_RESOURCES.map((resource) => (
              <div key={resource.name} className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-4">
                <p className="font-semibold text-emerald-800">{resource.name}</p>
                <p className="text-sm text-emerald-900 mt-1">{resource.description}</p>
                <p className="text-sm text-emerald-700 mt-2 font-medium">Phone: {resource.contact}</p>
                <a
                  href={resource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline"
                >
                  Visit website
                </a>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              onClick={() => {
                onConfirm(COUNSELOR_RESOURCES);
                onClose();
              }}
              className="flex-1 bg-emerald-500 text-white hover:bg-emerald-600"
            >
              Save these to sidebar
            </Button>
            <Button variant="ghost" onClick={onClose} className="flex-1">
              Close
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
