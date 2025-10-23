"use client";

import React from 'react';
import { Shield, Heart, Lock } from 'lucide-react';


 // Shows reassurance indicators (safety, confidentiality, trauma-informed)
 // Helps build trust in the chat experience

export default function SafetyIndicators() {
  // List of safety indicator items
  const indicators = [
    {
      icon: Shield,
      text: "Safety & Support",
      iconColor: "text-green-600"
    },
    {
      icon: Lock,
      text: "Confidential conversation", 
      iconColor: "text-orange-600"
    },
    {
      icon: Heart,
      text: "Trauma-informed responses",
      iconColor: "text-green-600"
    }
  ];

  return (
    <div className="space-y-2">
      {/* Loop through indicators and render each */}
      {indicators.map((indicator, index) => {
        const IconComponent = indicator.icon;
        return (
          <div 
            key={index} 
            className="flex items-center space-x-3"
          >
            {/* Icon with color */}
            <IconComponent className={`h-4 w-4 ${indicator.iconColor}`} />
            
            {/* Label text */}
            <span className="text-sm text-gray-700">
              {indicator.text}
            </span>
          </div>
        );
      })}
    </div>
  );
}
