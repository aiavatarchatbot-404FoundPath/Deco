"use client";

import React from "react";

interface LoadingProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
  overlay?: boolean;
}

export function Loading({ 
  message = "Loading...", 
  size = 'md',
  overlay = true 
}: LoadingProps) {
  const sizeClasses = {
    sm: 'h-6 w-6',
    md: 'h-12 w-12',
    lg: 'h-16 w-16'
  };

  const LoadingContent = () => (
    <div className="flex flex-col items-center space-y-4">
      {/* Spinner */}
      <div className={`animate-spin rounded-full border-b-2 border-teal-500 ${sizeClasses[size]}`}></div>
      
      {/* Loading message */}
      <p className="text-gray-600 font-medium text-center max-w-xs">{message}</p>
    </div>
  );

  if (!overlay) {
    return <LoadingContent />;
  }

  return (
    <div className="fixed inset-0 bg-white/90 backdrop-blur-sm z-50 flex items-center justify-center">
      <LoadingContent />
    </div>
  );
}