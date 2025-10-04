// app/privacy-policy/PrivacyClient.tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Search,
  Shield,
  Lock,
  Globe,
  FileText,
  Info,
  Users,
  CheckCircle2,
  ArrowLeft,
} from "lucide-react";

type FaqItem = { q: string; a: string };

const SAFETY_FAQ: FaqItem[] = [
  {
    q: "Do you collect personally identifiable information?",
    a: "No. You can use the app anonymously. We don’t require or store personally identifiable information unless you explicitly provide it.",
  },
  {
    q: "Are my chats encrypted?",
    a: "Yes. Conversations are transmitted and stored securely. Internal access is strictly limited for maintenance and safety.",
  },
  {
    q: "How long are conversations kept?",
    a: "By default, conversations are automatically deleted after 30 days if Auto-Delete is enabled in Preferences.",
  },
  {
    q: "Do you share or sell data to third parties?",
    a: "No. We never sell your data. We also don’t share it with third parties for advertising or profiling.",
  },
  {
    q: "Can I download or delete my data?",
    a: "Yes. Use the options in Preferences or Profile → Settings to export or request deletion of your data.",
  },
];

export default function PrivacyClient() {
  const router = useRouter();
  const [tab, setTab] = useState<"overview" | "privacy" | "features" | "audience">("privacy");
  const [query, setQuery] = useState("");

  // central nav handler (matches your other pages)
  const handleNavigate = (screen: string) => {
    switch (screen) {
      case "privacy":
        router.push("/privacy-policy");
        break;
      case "settings":
        router.push("/settings");
        break;
      case "profile":
        router.push("/profile");
        break;
      case "avatarbuilder":
        router.push("/avatarbuilder");
        break;
      case "login":
        router.push("/login");
        break;
      default:
        router.push("/");
    }
  };

  const filteredFaq = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SAFETY_FAQ;
    return SAFETY_FAQ.filter(
      (i) => i.q.toLowerCase().includes(q) || i.a.toLowerCase().includes(q)
    );
  }, [query]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar onNavigate={handleNavigate} currentPage="privacy" isLoggedIn={true} isLoading={false} />

      <main className="mx-auto w-full max-w-7xl px-4 sm:px-6 py-8">
        {/* Back */}
        <Button variant="ghost" onClick={() => router.push("/")} className="mb-6 trauma-safe gentle-focus">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Home
        </Button>

        {/* Hero */}
        <section className="text-center mb-8 sm:mb-12">
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">
            Privacy, Safety &amp; FAQ
          </h1>
          <p className="mt-3 text-muted-foreground max-w-3xl mx-auto">
            Everything you need to know about how we protect your data, how the app works,
            and who it’s for — all in one place.
          </p>
        </section>

        {/* Tabs header row with search (like your screenshot’s layout) */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Tabs
            value={tab}
            onValueChange={(v) => setTab(v as any)}
            className="w-full sm:w-auto"
          >
            <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="privacy">Safety &amp; Data Privacy</TabsTrigger>
              <TabsTrigger value="features">Features</TabsTrigger>
              <TabsTrigger value="audience">Who we help</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Search input */}
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Looking for something?"
              className="w-full pl-9 pr-3 py-2 rounded-md border border-input bg-background text-sm outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* Tabs content */}
        <div className="mt-6">
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full">
            {/* Overview */}
            <TabsContent value="overview" className="space-y-6">
              <Card className="trauma-safe">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Info className="w-5 h-5" />
                    What this page covers
                  </CardTitle>
                  <CardDescription>
                    A quick overview of how we handle safety, privacy, and the core features you can expect.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid sm:grid-cols-3 gap-4">
                    <div className="p-4 rounded-lg border">
                      <Shield className="w-5 h-5 mb-2 text-emerald-600" />
                      <h3 className="font-medium mb-1">Trauma-informed design</h3>
                      <p className="text-sm text-muted-foreground">
                        Calming visuals and guardrails to support safer conversations.
                      </p>
                    </div>
                    <div className="p-4 rounded-lg border">
                      <Lock className="w-5 h-5 mb-2 text-emerald-600" />
                      <h3 className="font-medium mb-1">Secure by default</h3>
                      <p className="text-sm text-muted-foreground">
                        Encrypted transport/storage and strict internal access.
                      </p>
                    </div>
                    <div className="p-4 rounded-lg border">
                      <Globe className="w-5 h-5 mb-2 text-emerald-600" />
                      <h3 className="font-medium mb-1">No selling data</h3>
                      <p className="text-sm text-muted-foreground">
                        We never sell your data. No ads, no third-party resale.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Safety & Data Privacy */}
            <TabsContent value="privacy" className="space-y-6">
              <Card className="trauma-safe">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="w-5 h-5" />
                    Safety &amp; Privacy FAQs
                  </CardTitle>
                  <CardDescription>
                    Answers to common questions. Use the search to filter.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {filteredFaq.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No results match your search.</p>
                  ) : (
                    <div className="space-y-3">
                      {filteredFaq.map((item, idx) => (
                        <details key={idx} className="rounded-md border p-4">
                          <summary className="font-medium cursor-pointer">
                            {item.q}
                          </summary>
                          <p className="mt-2 text-sm text-muted-foreground">
                            {item.a}
                          </p>
                        </details>
                      ))}
                    </div>
                  )}

                  {/* Policy summary card */}
                  <div className="mt-4 rounded-lg border p-4 bg-muted/30">
                    <div className="flex items-start gap-3">
                      <FileText className="w-5 h-5 mt-0.5" />
                      <div>
                        <h4 className="font-medium">Policy highlights</h4>
                        <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-600" />
                            Anonymous use supported; no PII required.
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-600" />
                            Auto-Delete option removes chats after 30 days.
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-600" />
                            No third-party resale or ads; limited internal access.
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <Button variant="outline" onClick={() => handleNavigate("settings")} className="trauma-safe gentle-focus">
                      Manage Preferences
                    </Button>
                    <Button variant="ghost" onClick={() => handleNavigate("profile")} className="trauma-safe gentle-focus">
                      Go to Profile
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Features */}
            <TabsContent value="features" className="space-y-6">
              <Card className="trauma-safe">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Info className="w-5 h-5" />
                    Key Features
                  </CardTitle>
                  <CardDescription>What you can do with the app.</CardDescription>
                </CardHeader>
                <CardContent className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[
                    { icon: Shield, title: "Safety checks", text: "Gentle prompts and resources when risk signals appear." },
                    { icon: Lock, title: "Anonymous mode", text: "Chat without linking personal information." },
                    { icon: Globe, title: "Multimodal avatars", text: "3D companion avatars for supportive conversations." },
                    { icon: FileText, title: "Export/Download", text: "Download conversation summaries when you choose." },
                    { icon: Users, title: "Share with trusted adult", text: "Optionally share a summary, not raw messages." },
                    { icon: CheckCircle2, title: "Auto-Delete", text: "Automatically delete chats after 30 days." },
                  ].map((f, i) => (
                    <div key={i} className="p-4 rounded-lg border">
                      <f.icon className="w-5 h-5 mb-2 text-emerald-600" />
                      <h3 className="font-medium mb-1">{f.title}</h3>
                      <p className="text-sm text-muted-foreground">{f.text}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Who we help */}
            <TabsContent value="audience" className="space-y-6">
              <Card className="trauma-safe">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    Who this app supports
                  </CardTitle>
                  <CardDescription>
                    Designed for young people and anyone seeking calm, supportive guidance. Not for emergencies.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="p-4 rounded-lg border">
                      <h3 className="font-medium mb-1">Everyday support</h3>
                      <p className="text-sm text-muted-foreground">
                        Stress, worry, decision-making, and building healthy habits.
                      </p>
                    </div>
                    <div className="p-4 rounded-lg border">
                      <h3 className="font-medium mb-1">With trusted adults</h3>
                      <p className="text-sm text-muted-foreground">
                        Share summaries with mentors, parents, or professionals when you choose.
                      </p>
                    </div>
                  </div>
                  <div className="rounded-lg border p-4 bg-muted/30">
                    <p className="text-sm text-muted-foreground">
                      If you’re in immediate danger or thinking about self-harm, please contact emergency services (000) or Lifeline (13 11 14) right away.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
