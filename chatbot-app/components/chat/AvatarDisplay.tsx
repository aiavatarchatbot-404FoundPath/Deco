'use client';

import React from 'react';
import { motion } from 'framer-motion';  // used for smooth speaking indicator animation

// Define the props the component can accept
export interface AvatarDisplayProps {
  aiAvatar?: { name: string; url?: string };   // The AI companion avatar info
  userAvatar?: { name: string; url?: string }; // The user's avatar info
  speaking?: boolean;                          // Whether the AI is "speaking/typing"
  motionSafe?: boolean;                        // If true, use gentler animation
}

// AvatarDisplay component renders the AI avatar (and optionally the user avatar)
export function AvatarDisplay({
  aiAvatar = { name: 'Companion' },  // default fallback if no AI avatar is passed
  userAvatar = { name: 'You' },      // default fallback if no user avatar is passed
  speaking = false,                  // default: bot not speaking
  motionSafe = true,                 // default: motion reduced
}: AvatarDisplayProps) {
  return (
    <div className="flex flex-col items-center gap-6 p-4">
      
      {/* ============== AI Avatar (Companion) ============== */}
      <div className="flex flex-col items-center">
        <div className="relative w-28 h-28 rounded-full 
                        bg-gradient-to-br from-teal-200 to-purple-200 
                        dark:from-neutral-800 dark:to-neutral-700 
                        overflow-hidden flex items-center justify-center">
          
          {/* Show AI avatar image if url is provided, otherwise show their name */}
          {aiAvatar.url ? (
            <img
              src={aiAvatar.url}
              alt={aiAvatar.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
              {aiAvatar.name}
            </span>
          )}

          {/* Speaking indicator (small green dot at bottom of avatar) */}
          {speaking && (
            <motion.div
              initial={{ opacity: 0 }}                       // start invisible
              animate={{ opacity: [0.4, 1, 0.4] }}           // pulse effect
              transition={{ repeat: Infinity, duration: motionSafe ? 2 : 1 }}
              className="absolute bottom-2 w-3 h-3 rounded-full bg-emerald-500"
            />
          )}
        </div>

        {/* Label under the AI avatar */}
        <div className="mt-2 text-sm font-medium">{aiAvatar.name}</div>
      </div>

      {/* ============== User Avatar (You) ============== */}
      {userAvatar && (
        <div className="flex flex-col items-center">
          <div className="w-20 h-20 rounded-full 
                          bg-neutral-200 dark:bg-neutral-700 
                          flex items-center justify-center overflow-hidden">
            
            {/* Show user avatar image if url exists, otherwise show their name */}
            {userAvatar.url ? (
              <img
                src={userAvatar.url}
                alt={userAvatar.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-xs font-medium text-neutral-700 dark:text-neutral-200">
                {userAvatar.name}
              </span>
            )}
          </div>
          
          {/* Label under the User avatar */}
          <div className="mt-1 text-xs text-neutral-500">You</div>
        </div>
      )}
    </div>
  );
}
