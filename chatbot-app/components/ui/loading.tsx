"use client";

import React from "react";

interface LoadingProps {
  message?: string;
}

export function Loading({ message = "Loading..." }: LoadingProps) {
   return (
    <div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="flex flex-col items-center space-y-4">
        {/* Spinner */}
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-500"></div>
        
        {/* Loading message */}
        <p className="text-gray-600 font-medium">{message}</p>
      </div>
    </div>
  );
}