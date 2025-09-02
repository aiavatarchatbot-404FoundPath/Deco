// components/chat/SafetyIndicators.tsx
"use client";

import React from 'react';
import { Badge } from '../ui/badge';
import { Shield, Heart, Lock } from 'lucide-react';

export default function SafetyIndicators() {
  const indicators = [
    {
      icon: Shield,
      text: "Safety & Support",
      color: "bg-green-100 text-green-800 border-green-200",
      iconColor: "text-green-600"
    },
    {
      icon: Lock,
      text: "Confidential conversation", 
      color: "bg-orange-100 text-orange-800 border-orange-200",
      iconColor: "text-orange-600"
    },
    {
      icon: Heart,
      text: "Trauma-informed responses",
      color: "bg-green-100 text-green-800 border-green-200",
      iconColor: "text-green-600"
    }
  ];

  return (
    <div className="space-y-2">
      {indicators.map((indicator, index) => {
        const IconComponent = indicator.icon;
        return (
          <div key={index} className="flex items-center space-x-3">
            <IconComponent className={`h-4 w-4 ${indicator.iconColor}`} />
            <span className="text-sm text-gray-700">{indicator.text}</span>
          </div>
        );
      })}
    </div>
  );
}