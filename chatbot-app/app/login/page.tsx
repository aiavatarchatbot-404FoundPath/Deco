"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, User, Lock, UserPlus, Shield, Info } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();

  
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState(""); 
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleBack = () => router.push("/");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setIsLoading(true);

    try {
      if (isSignUp) {
        if (password !== confirmPassword) {
          setErr("Passwords do not match.");
          return;
        }

        // FOR SIGNUP!!!!!!!!!!! here
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username: username.trim() || null } },
        });
        if (error) throw error;

         const signIn = async () => {
          await supabase.auth.signInWithOAuth({ provider: 'google' }); // pick any provider you set up
          };
          return <button onClick={signIn}>Sign in</button>;

        // USER HAS. to confm email to work
        alert("Check your email to confirm your account, then log in.");
        setIsSignUp(false); // flip back to login
        setPassword("");
        setConfirmPassword("");
        return;
      } else {
        // Login
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        const params = new URLSearchParams(window.location.search);
        const redirectTo = params.get("redirect");

        // basic safety: only allow internal paths
        const safeTarget = redirectTo && redirectTo.startsWith("/") ? redirectTo : "/profile";
        router.push(safeTarget);
      }
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
            <CardTitle className="text-2xl">{isSignUp ? "Create Account" : "Welcome Back"}</CardTitle>
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
                    Creating an account is optional. Your conversations remain private and secure whether you login or
                    chat anonymously.
                  </p>
                </div>
              </div>
            </div>

            
            {err && (
              <div className="text-sm rounded-md border border-red-300 bg-red-50 text-red-700 p-3">
                {err}
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

            {/* login & signup stuff */}
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
