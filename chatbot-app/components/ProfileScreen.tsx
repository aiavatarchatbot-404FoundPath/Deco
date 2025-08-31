import React from "react";
import { Button } from "./ui/button";

interface ProfileScreenProps {
  onNavigate: (screen: "welcome" | "profile") => void;
  user: { id: string; username: string };
}

export default function ProfileScreen({ onNavigate, user }: ProfileScreenProps) {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Profile</h1>
      <p>User ID: {user.id}</p>
      <p>Username: {user.username}</p>

      <Button onClick={() => onNavigate("welcome")} className="mt-4">
        ← Back to Home
      </Button>
    </div>
  );
}
