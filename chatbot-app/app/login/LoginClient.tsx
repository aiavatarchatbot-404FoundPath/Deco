'use client';

import React, { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { Route } from 'next';
import type { User } from "@supabase/supabase-js";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, User as UserIcon, Lock, UserPlus, Shield, Info } from "lucide-react";

export default function LoginClient() {
  const router = useRouter();
  const params = useSearchParams();

  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState(""); // stored in auth metadata + synced to profiles.username
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const handleBack = () => router.push("/");

  const safeRedirectPath = (() => {
    const redirect = params.get("redirect");
    return redirect && redirect.startsWith("/") ? redirect : "/profile";
  })();

  // NEW: push username into public.profiles for this uid
  async function ensureProfile(u: User | null, desiredUsername?: string) {
    if (!u) return;
    const nameFromAuth = (u.user_metadata as any)?.username;
    const finalUsername = (desiredUsername ?? nameFromAuth ?? "")
      .toString()
      .trim()
      .slice(0, 40) || null;

    // RLS must allow: auth.uid() = id to insert/update
    await supabase
      .from("profiles")
      .upsert(
        { id: u.id, username: finalUsername, updated_at: new Date().toISOString() },
        { onConflict: "id" }
      );
  }

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
        // After redirect, do a profile sync on /profile page as well (recommended).
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

        // Simple username validation (optional)
        const uname = username.trim();
        if (uname && !/^[a-zA-Z0-9_ .-]{2,40}$/.test(uname)) {
          setErr("Username can use letters, numbers, spaces, _.- (2–40 chars).");
          return;
        }

        if (haveSession) {
          // upgrade-in-place: keep SAME uid
          const { data: updated, error } = await supabase.auth.updateUser({
            email,
            password,
            data: { username: uname || null },
          });
          if (error) throw error;

          // NEW: sync to profiles immediately
          await ensureProfile(updated.user ?? user, uname);

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
        const { data: signUpData, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username: uname || null } },
        });
        if (error) throw error;

        // If your project has email confirmation ON, there is no session yet.
        // We'll sync profile on first login. (If confirmation is OFF and a session exists,
        // you can call ensureProfile(signUpData.user, uname) here.)

        setInfo("Check your email to confirm your account, then log in.");
        setIsSignUp(false);
        setPassword("");
        setConfirmPassword("");
        return;
      }

      // LOGIN
      const { error: loginErr } = await supabase.auth.signInWithPassword({ email, password });
      if (loginErr) throw loginErr;

      // After login, fetch user and sync profile (copies auth.user_metadata.username → profiles.username)
      const { data: { user: u2 } } = await supabase.auth.getUser();
      await ensureProfile(u2, undefined); // username comes from auth metadata on login

      // claim after login too (covers the non-upgrade path)
      if (convoFromRedirect && u2?.id) {
        await fetch("/api/conversations/ensure-ownership", {
          method: "POST",
          headers: { "content-type": "application/json", "x-user-id": u2.id },
          body: JSON.stringify({ conversationId: convoFromRedirect }),
        }).catch(() => {});
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
      <div className="mx-auto max-w-5xl px-4 py-8">
        <Button onClick={handleBack} variant="ghost" className="mb-6 trauma-safe gentle-focus">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Home
        </Button>

        <div className="grid md:grid-cols-2 gap-8 items-start">
          <div className="hidden md:block">
            <div className="relative overflow-hidden rounded-2xl border border-white/70 bg-white/60 shadow-sm p-8">
              <div className="pointer-events-none absolute -top-16 -left-16 h-56 w-56 rounded-full bg-purple-300/30 blur-2xl" />
              <div className="pointer-events-none absolute -bottom-16 -right-16 h-64 w-64 rounded-full bg-blue-300/30 blur-2xl" />
              <div className="relative">
                <div className="w-16 h-16 mb-4 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                  <UserIcon className="h-8 w-8 text-white" />
                </div>
                <h2 className="text-3xl font-semibold text-gray-900 mb-2">Sign in to save your stuff</h2>
                <p className="text-gray-600 mb-6 max-w-md">
                  Save and customize your avatar, keep preferences across sessions, and pick up chats where you left off. Private by default.
                </p>
                <div className="flex flex-wrap gap-2 mb-8">
                  <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-yellow-50 text-yellow-900 ring-1 ring-yellow-200/60 text-sm">
                    <Shield className="h-4 w-4 text-yellow-700" /> Private
                  </span>
                  <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 text-blue-900 ring-1 ring-blue-200/60 text-sm">
                    <UserIcon className="h-4 w-4 text-blue-700" /> Built for Youth
                  </span>
                  <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200/60 text-sm">
                    <Lock className="h-4 w-4 text-emerald-700" /> Optional account
                  </span>
                </div>
                <ul className="space-y-2 text-sm text-gray-700">
                  <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-gray-600" /> Save and customize your avatar</li>
                  <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-gray-600" /> Keep preferences across sessions</li>
                  <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-gray-600" /> Optional conversation history (with consent)</li>
                </ul>
              </div>
            </div>
          </div>

          <Card className="trauma-safe">
            <CardHeader className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                {isSignUp ? <UserPlus className="h-8 w-8 text-white" /> : <UserIcon className="h-8 w-8 text-white" />}
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
    </div>
  );
}
