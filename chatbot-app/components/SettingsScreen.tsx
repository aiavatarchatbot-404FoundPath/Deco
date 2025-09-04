'use client';

import React from "react";
import Home from "components/Home";
import ProfileScreen from "components/ProfileScreen";

interface SettingsScreenProps {
  onNavigate: (screen: any) => void;
  user?: any;
}

export default function SettingsScreen({ onNavigate, user }: SettingsScreenProps) {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold">⚙️ Settings</h1>
      <p className="mt-4 text-gray-600">This is a placeholder settings page.</p>

      {user && (
        <p className="mt-2 text-sm text-gray-500">
          Logged in as <strong>{user.username}</strong>
        </p>
      )}

      <button
        className="mt-6 px-4 py-2 bg-teal-600 text-white rounded"
        onClick={() => onNavigate("welcome")}
      >
        ← Back to Home
      </button>
    </div>
  );
}
