// components/ConversationList.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { getSessionUserId } from '@/lib/auth';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Search } from 'lucide-react';

type ConversationRow = {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
};

type MessagePreview = { conversation_id: string; content: string; created_at: string };
type LastByConvo = Record<string, MessagePreview>;

type Props = {
  /** Called when user clicks a conversation or “Continue” */
  onSelect: (conversationId: string) => void;
  /** Show search box */
  showSearch?: boolean;
  /** Limit number of rows (default: 50) */
  limit?: number;
  /** If false, will show *all* convos the user can read (creator or participant). Default: true (creator only). */
  mineOnly?: boolean;
  /** Optional className for outer container */
  className?: string;
};

export default function ConversationList({
  onSelect,
  showSearch = true,
  limit = 50,
  mineOnly = true,
  className,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<ConversationRow[]>([]);
  const [last, setLast] = useState<LastByConvo>({});
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);

      const uid = await getSessionUserId();
      if (!uid) {
        setRows([]);
        setLast({});
        setLoading(false);
        return;
      }

      // 1) fetch conversations
      let convosRes;
      if (mineOnly) {
        convosRes = await supabase
          .from('conversations')
          .select('id, title, created_at, updated_at, created_by')
          .eq('created_by', uid)
          .order('updated_at', { ascending: false })
          .limit(limit);
      } else {
        // creator OR participant (if you are using conversation_participants)
        convosRes = await supabase
          .rpc('convos_for_user', { p_user: uid }); // optional: create this RPC for speed
        // fallback (no RPC): do two queries & merge – omitted for brevity
      }

      if (cancelled) return;
      if ('error' in convosRes && convosRes.error) {
        setErr(convosRes.error.message);
        setRows([]);
        setLoading(false);
        return;
      }

      const convos: ConversationRow[] =
        'data' in convosRes ? (convosRes.data as any[]) : [];
      setRows(convos ?? []);

      // 2) fetch last message previews (simple approach)
      const ids = convos.map((c) => c.id);
      if (ids.length) {
        const { data: msgs, error: mErr } = await supabase
          .from('messages')
          .select('conversation_id, content, created_at')
          .in('conversation_id', ids)
          .order('created_at', { ascending: false });

        if (!cancelled && !mErr && msgs) {
          const firstByConvo: LastByConvo = {};
          for (const m of msgs as MessagePreview[]) {
            if (!firstByConvo[m.conversation_id]) firstByConvo[m.conversation_id] = m;
          }
          setLast(firstByConvo);
        }
      }

      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [limit, mineOnly]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const title = (r.title ?? 'Untitled').toLowerCase();
      const preview = (last[r.id]?.content ?? '').toLowerCase();
      return title.includes(q) || preview.includes(q);
    });
  }, [rows, last, search]);

  return (
    <div className={className}>
      {showSearch && (
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search chats…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 trauma-safe gentle-focus"
          />
        </div>
      )}

      {loading ? (
        <Card className="trauma-safe">
          <CardContent className="p-8 text-center text-muted-foreground">
            Loading…
          </CardContent>
        </Card>
      ) : err ? (
        <Card className="trauma-safe">
          <CardContent className="p-8 text-center text-red-600">
            {err}
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="trauma-safe">
          <CardContent className="p-8 text-center text-muted-foreground">
            No chats.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => (
            <Card
              key={c.id}
              className="trauma-safe calm-hover cursor-pointer transition-all duration-200"
              onClick={() => onSelect(c.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h3>{c.title || 'Untitled Chat'}</h3>
                      <Badge variant="secondary" className="trauma-safe">
                        {new Date(c.updated_at).toLocaleDateString()}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Last message: {last[c.id]?.content ?? '—'}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(c.id);
                    }}
                    className="trauma-safe gentle-focus"
                  >
                    Continue
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
