'use client';

import React from 'react';
import { Badge } from '../ui/badge';
import { Shield, Heart, Lock } from 'lucide-react';

/**
 * A small list of trauma-informed "safety signals"
 * shown on login, header, or intro screens.
 * 
 * By default shows 3 indicators: Safety, Confidential, Trauma-informed.
 * You can override via props if needed.
 */
export interface SafetyIndicator {
  icon: React.ElementType;
  text: string;
  color: string;     // Tailwind color classes for badge
  iconColor: string; // Tailwind color classes for icon
}

interface SafetyIndicatorsProps {
  indicators?: SafetyIndicator[];
}

export default function SafetyIndicators({ indicators }: SafetyIndicatorsProps) {
  // Default set if none passed in
  const defaults: SafetyIndicator[] = [
    {
      icon: Shield,
      text: 'Safety & Support',
      color: 'bg-green-100 text-green-800 border-green-200',
      iconColor: 'text-green-600',
    },
    {
      icon: Lock,
      text: 'Confidential conversation',
      color: 'bg-orange-100 text-orange-800 border-orange-200',
      iconColor: 'text-orange-600',
    },
    {
      icon: Heart,
      text: 'Trauma-informed responses',
      color: 'bg-purple-100 text-purple-800 border-purple-200',
      iconColor: 'text-purple-600',
    },
  ];

  const list = indicators ?? defaults;

  return (
    <div className="flex flex-wrap gap-2">
      {list.map((indicator, idx) => {
        const Icon = indicator.icon;
        return (
          <Badge
            key={idx}
            variant="outline"
            className={`flex items-center gap-1.5 px-2 py-1 text-xs font-medium ${indicator.color}`}
          >
            <Icon className={`h-3.5 w-3.5 ${indicator.iconColor}`} aria-hidden="true" />
            {indicator.text}
          </Badge>
        );
      })}
    </div>
  );
}
