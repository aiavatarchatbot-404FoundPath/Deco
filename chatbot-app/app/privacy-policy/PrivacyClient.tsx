"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  Globe,
  Info,
  Lock,
  Search,
  Shield,
  HelpCircle,
} from "lucide-react";

type FaqItem = { q: string; a: string };

// safety faq
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

// general faq
const GENERAL_FAQ: FaqItem[] = [
  {
    q: "What is this app for?",
    a: "A supportive space to talk through feelings, decisions, and everyday challenges. It helps with reflection and resources, but it’s not for emergencies.",
  },
  {
    q: "How does it work?",
    a: "You chat with an AI companion. It uses safe prompts and guidelines to suggest ideas, coping strategies, and resources based on what you share.",
  },
  {
    q: "Will humans read my conversations?",
    a: "No, not by default. Limited, audited access may occur to investigate abuse, safety events, or to maintain the service—always under strict privacy controls.",
  },
  {
    q: "Is my data used to train AI models?",
    a: "We do not sell your data and we avoid using personal conversations to train public models. Any improvement signals are anonymized and aggregated where possible.",
  },
  {
    q: "Can I opt out of analytics?",
    a: "Yes. Turn off Anonymous Usage Analytics in Preferences at any time.",
  },
  {
    q: "What platforms and browsers are supported?",
    a: "Modern desktop and mobile browsers such as Chrome, Safari, Edge, and Firefox. Keep your browser up to date for the best experience.",
  },
  {
    q: "Is it free to use?",
    a: "A free tier is available. Some features may be limited or subject to fair-use safeguards.",
  },
  {
    q: "How do I export or delete my data?",
    a: "Open Preferences or Profile → Settings to download your data or request deletion.",
  },
  {
    q: "Do you integrate with third-party services?",
    a: "Only when necessary to provide core functionality (e.g., storage or authentication). We don’t share data for advertising or profiling.",
  },
  {
    q: "Who can use this app?",
    a: "It’s designed for young people and general users seeking supportive guidance. Additional safeguards apply for minors.",
  },
  {
    q: "Where can I get help in a crisis?",
    a: "If you’re in immediate danger or thinking about self-harm, contact emergency services (000) or Lifeline (13 11 14) right away.",
  },
];

const LinkA = (props: React.ComponentProps<"a">) => (
  <a className="underline underline-offset-2 hover:text-emerald-600" target="_blank" rel="noreferrer" {...props} />
);

export default function PrivacyClient() {
  const router = useRouter();
  const [tab, setTab] = useState<"overview" | "privacy" | "features" | "faq">("privacy");
  const [query, setQuery] = useState("");

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

  const filteredSafetyFaq = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SAFETY_FAQ;
    return SAFETY_FAQ.filter(
      (i) => i.q.toLowerCase().includes(q) || i.a.toLowerCase().includes(q)
    );
  }, [query]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-100 via-pink-50 to-blue-100">
      <Navbar onNavigate={handleNavigate} currentPage="privacy" isLoggedIn={true} isLoading={false} />

      <main className="mx-auto w-full max-w-7xl px-4 sm:px-6 py-8">
        <Button variant="ghost" onClick={() => router.push("/")} className="mb-6 trauma-safe gentle-focus">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Home
        </Button>

        <section className="text-center mb-8 sm:mb-12">
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">
            Privacy, Safety &amp; FAQ
          </h1>
          <p className="mt-3 text-muted-foreground max-w-3xl mx-auto">
            We build AI support tools with responsibility, privacy, and user dignity at the core.
            Below is a concise overview of our commitments and answers to common questions.
          </p>
        </section>

        {/* Tabs header row + search */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full sm:w-auto">
            <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="privacy">Safety &amp; Data Privacy</TabsTrigger>
              <TabsTrigger value="features">Features</TabsTrigger>
              <TabsTrigger value="faq">FAQ</TabsTrigger> {/* renamed */}
            </TabsList>
          </Tabs>

          {/* Search input (filters only Safety & Privacy tab) */}
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search Safety & Privacy FAQs…"
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
                  <p>
                    We’re committed to responsible AI for mental-health support: our systems are designed to{" "}
                    <strong>augment, not replace</strong> human care, follow established best practices,
                    and include guardrails like crisis escalation and human oversight where appropriate.
                  </p>

                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="p-4 rounded-lg border">
                      <Shield className="w-5 h-5 mb-2 text-emerald-600" />
                      <h3 className="font-medium mb-1">Trauma-informed</h3>
                      <p className="text-sm text-muted-foreground">
                        Calming UX, clear choices, non-judgmental language, and easy exits from difficult topics.
                      </p>
                    </div>
                    <div className="p-4 rounded-lg border">
                      <Lock className="w-5 h-5 mb-2 text-emerald-600" />
                      <h3 className="font-medium mb-1">Privacy by design</h3>
                      <p className="text-sm text-muted-foreground">
                        Data minimization, encryption, limited retention, and transparent policies.
                      </p>
                    </div>
                    <div className="p-4 rounded-lg border">
                      <Globe className="w-5 h-5 mb-2 text-emerald-600" />
                      <h3 className="font-medium mb-1">Responsible AI</h3>
                      <p className="text-sm text-muted-foreground">
                        Evidence-aligned guidance, continuous monitoring, and human oversight for critical paths.
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
                  <CardDescription>Answers to common questions. Use the search to filter.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {filteredSafetyFaq.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No results match your search.</p>
                  ) : (
                    <div className="space-y-3">
                      {filteredSafetyFaq.map((item, idx) => (
                        <details key={idx} className="rounded-md border p-4">
                          <summary className="font-medium cursor-pointer">{item.q}</summary>
                          <p className="mt-2 text-sm text-muted-foreground">{item.a}</p>
                        </details>
                      ))}
                    </div>
                  )}

                  {/* Policy highlights */}
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
                            No third-party resale; limited, audited internal access.
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  {/* Safety & Risk Detection Pipeline (concise) */}
                  <div className="rounded-lg border p-4">
                    <h4 className="font-medium mb-2">Safety &amp; Risk Detection Pipeline</h4>
                    <p className="text-sm text-muted-foreground mb-2">
                      A layered approach to proactively surface potential risks (e.g., self-harm indicators) and respond appropriately:
                    </p>
                    <ol className="list-decimal pl-5 space-y-1 text-sm text-muted-foreground">
                      <li>Automated screening of messages for risk signals.</li>
                      <li>AI-assisted risk assessment with conservative thresholds.</li>
                      <li>Trauma-informed responses and crisis resources if needed.</li>
                      <li>Limited human review under strict privacy controls.</li>
                      <li>Ongoing evaluation to improve detection and reduce false flags.</li>
                    </ol>
                  </div>

                  {/* Key standards/resources */}
                  <div className="rounded-lg border p-4">
                    <h4 className="font-medium mb-2">Key Standards &amp; Resources</h4>
                    <ul className="list-disc pl-5 space-y-1 text-sm">
                      <li><LinkA href="https://standards.ieee.org/industry-connections/ec/autonomous-systems/">IEEE Ethically Aligned Design</LinkA></li>
                      <li><LinkA href="https://artificialintelligenceact.eu/">EU Artificial Intelligence Act</LinkA></li>
                      <li><LinkA href="https://gdpr.eu/">GDPR</LinkA> &nbsp;•&nbsp; <LinkA href="https://www.oaic.gov.au/privacy/the-privacy-act">Australia’s Privacy Act</LinkA></li>
                      <li><LinkA href="https://www.samhsa.gov/trauma-violence">SAMHSA Trauma Resources</LinkA></li>
                    </ul>
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
                    { icon: Globe, title: "3D avatars", text: "Supportive companion avatars for conversation." },
                    { icon: FileText, title: "Export/Download", text: "Download conversation summaries when you choose." },
                    { icon: HelpCircle, title: "FAQ & Guides", text: "Clear guidance on privacy, features, and usage." },
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

            {/* FAQ */}
            <TabsContent value="faq" className="space-y-6">
              <Card className="trauma-safe">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <HelpCircle className="w-5 h-5" />
                    FAQ
                  </CardTitle>
                  <CardDescription>Quick answers about using the app.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    {GENERAL_FAQ.map((item, idx) => (
                      <details key={idx} className="rounded-md border p-4">
                        <summary className="font-medium cursor-pointer">{item.q}</summary>
                        <p className="mt-2 text-sm text-muted-foreground">{item.a}</p>
                      </details>
                    ))}
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
