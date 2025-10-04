"use client";

import React, { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { Route } from 'next';


import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, User, Lock, UserPlus, Shield, Info } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();

  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState(""); // stored in user metadata
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const handleBack = () => router.push("/");

  const safeRedirectPath = (() => {
    const redirect = params.get("redirect");
    // only allow internal paths
    return redirect && redirect.startsWith("/") ? redirect : "/profile";
  })();

  // build an absolute URL for OAuth redirect/callback
  const absoluteRedirectUrl = () => {
    if (typeof window === "undefined") return undefined;
    const origin = window.location.origin;
    return `${origin}${safeRedirectPath}`;
  };

  async function handleOAuth(provider: "google") {
  setErr(null);
  setInfo(null);
  setIsLoading(true);
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const redirect = params.get("redirect");
    const safeTarget = redirect && redirect.startsWith("/") ? redirect : "/profile";
    const redirectTo =
      typeof window !== "undefined" ? window.location.origin + safeTarget : undefined;

    if (user) {
      // Link provider to THIS uid (upgrade-in-place)
      const { error } = await supabase.auth.linkIdentity({
        provider,
        options: { redirectTo },
      });
      if (error) throw error;
      // Supabase will redirect; nothing else to do
      return;
    }

    // No session → normal OAuth sign-in (new uid)
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    });
    if (error) throw error;
  } catch (e: any) {
    console.error(e);
    setErr(e?.message ?? "OAuth error.");
    setIsLoading(false);
  }
}


  const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setErr(null);
  setInfo(null);
  setIsLoading(true);

  try {
    const redirect = params.get("redirect");
    const safeTarget = redirect && redirect.startsWith("/") ? redirect : "/profile";

    // pull ?convo=<id> from redirect path so we can claim it
    let convoFromRedirect: string | null = null;
    if (typeof window !== "undefined") {
      const u = new URL(window.location.origin + safeTarget);
      convoFromRedirect = u.searchParams.get("convo");
    }

    const { data: { user } } = await supabase.auth.getUser();
    const haveSession = !!user;

    if (isSignUp) {
      if (password !== confirmPassword) {
        setErr("Passwords do not match.");
        return;
      }

      if (haveSession) {
        // upgrade-in-place: keep SAME uid
        const { error } = await supabase.auth.updateUser({
          email,
          password,
          data: { username: username.trim() || null },
        });
        if (error) throw error;

        // claim the ongoing conversation (safe if already owned)
        if (convoFromRedirect && user?.id) {
          await fetch("/api/conversations/ensure-ownership", {
            method: "POST",
            headers: { "content-type": "application/json", "x-user-id": user.id },
            body: JSON.stringify({ conversationId: convoFromRedirect }),
          }).catch(() => {});
        }

        router.replace(safeTarget as Route);
        return;
      }

      // no session → real sign-up (new uid)
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username: username.trim() || null } },
      });
      if (error) throw error;

      setInfo("Check your email to confirm your account, then log in.");
      setIsSignUp(false);
      setPassword("");
      setConfirmPassword("");
      return;
    }

    // LOGIN
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    // claim after login too (covers the non-upgrade path)
    if (convoFromRedirect) {
      const { data: { user: u2 } } = await supabase.auth.getUser();
      if (u2?.id) {
        await fetch("/api/conversations/ensure-ownership", {
          method: "POST",
          headers: { "content-type": "application/json", "x-user-id": u2.id },
          body: JSON.stringify({ conversationId: convoFromRedirect }),
        }).catch(() => {});
      }
    }

    router.replace(safeTarget as Route);
  } catch (e: any) {
    console.error(e);
    setErr(e?.message ?? "Something went wrong.");
  } finally {
    setIsLoading(false);
  }
};



  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-100 via-pink-50 to-blue-100">
      <div className="max-w-md mx-auto px-4 py-8">
        <Button onClick={handleBack} variant="ghost" className="mb-6 trauma-safe gentle-focus">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Home
        </Button>

        <Card className="trauma-safe">
          <CardHeader className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
              {isSignUp ? <UserPlus className="h-8 w-8 text-white" /> : <User className="h-8 w-8 text-white" />}
            </div>
            <CardTitle className="text-2xl">
              {isSignUp ? "Create Account" : "Welcome Back"}
            </CardTitle>
            <p className="text-muted-foreground">
              {isSignUp
                ? "Create an account to save your avatar and preferences"
                : "Login to access your saved avatars and continue your journey"}
            </p>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-medium text-blue-800 dark:text-blue-300 mb-1">Optional & Private</h4>
                  <p className="text-sm text-blue-700 dark:text-blue-400">
                    Creating an account is optional. Your conversations remain private and secure whether you login or chat anonymously.
                  </p>
                </div>
              </div>
            </div>

            {err && (
              <div className="text-sm rounded-md border border-red-300 bg-red-50 text-red-700 p-3">
                {err}
              </div>
            )}
            {info && (
              <div className="text-sm rounded-md border border-blue-300 bg-blue-50 text-blue-700 p-3">
                {info}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="trauma-safe gentle-focus"
                />
              </div>

              {isSignUp && (
                <div>
                  <Label htmlFor="username">Username (shown on profile)</Label>
                  <Input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Choose a username"
                    className="trauma-safe gentle-focus"
                  />
                </div>
              )}

              <div>
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  className="trauma-safe gentle-focus"
                />
              </div>

              {isSignUp && (
                <div>
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your password"
                    required
                  />
                </div>
              )}

              <Button type="submit" className="w-full trauma-safe calm-hover" disabled={isLoading}>
                {isLoading ? (
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>{isSignUp ? "Creating Account..." : "Logging In..."}</span>
                  </div>
                ) : (
                  <>
                    <Lock className="h-4 w-4 mr-2" />
                    {isSignUp ? "Create Account" : "Login"}
                  </>
                )}
              </Button>
            </form>

            <Separator />

            {/* OAuth (link when anon / sign-in when not) */}
            <div className="space-y-2">
              <Button
                variant="outline"
                onClick={() => handleOAuth("google")}
                className="w-full trauma-safe gentle-focus"
                disabled={isLoading}
              >
                Continue with Google
              </Button>
            </div>

            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-3">
                {isSignUp ? "Already have an account?" : "Don't have an account?"}
              </p>
              <Button variant="outline" onClick={() => setIsSignUp(!isSignUp)} className="trauma-safe gentle-focus">
                {isSignUp ? "Login Instead" : "Create Account"}
              </Button>
            </div>

            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-3">
                <Info className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                <h4 className="font-medium text-sm">Benefits of Having an Account</h4>
              </div>
              <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
                <li className="flex items-center space-x-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-current" />
                  <span>Save and customize your avatar</span>
                </li>
                <li className="flex items-center space-x-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-current" />
                  <span>Keep your preferences across sessions</span>
                </li>
                <li className="flex items-center space-x-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-current" />
                  <span>Optional conversation history (with your consent)</span>
                </li>
              </ul>
            </div>

            <div className="text-center pt-4 border-t border-border">
              <p className="text-sm text-muted-foreground mb-3">Prefer to stay anonymous?</p>
              <Button variant="ghost" onClick={handleBack} className="trauma-safe gentle-focus">
                Continue Without Account
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
