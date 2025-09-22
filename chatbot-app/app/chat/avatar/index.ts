import { corsHeaders } from './cors';


// Define the Mood type (adjust values as needed)
type Mood = 'happy' | 'sad' | 'neutral' | 'angry' | 'excited';


// Define the structure of the webhook payload from Supabase
// initial_mood is set by the mood check-in component (see moodcheckin.tsx)
interface WebhookPayload {
  type: 'UPDATE';
  table: 'conversations';
  record: {
    id: string;
    initial_mood: Mood | null; // Value comes from moodcheckin.tsx
    final_mood: Mood | null;
  };
  old_record: {
    id: string;
    initial_mood: Mood | null;
    final_mood: Mood | null;
  };
}

// Export a handler function for Node.js environments
export async function handler(req: Request, res: any) {
  if (req.method === 'OPTIONS') {
    res.writeHead(200, corsHeaders);
    res.end('ok');
    return;
  }

  try {
    const payload: WebhookPayload = await (
      typeof req.json === 'function'
        ? req.json()
        : JSON.parse(await req.text())
    );

    // Extract the mood from the mood checkin
    const moodCheckin = payload.record.initial_mood;

    // Only respond to relevant updates, but skip analysis and DB update
    if (payload.type !== 'UPDATE' || !payload.record.final_mood || payload.old_record.final_mood) {
      res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders });
      res.end(JSON.stringify({ message: 'Irrelevant change, skipping analysis.' }));
      return;
    }

    // Respond with the mood from the mood checkin
    res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders });
    res.end(JSON.stringify({ success: true, moodCheckin }));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json', ...corsHeaders });
    const errorMessage =
      typeof error === 'object' && error !== null && 'message' in error
        ? (error as { message: string }).message
        : String(error);
    res.end(JSON.stringify({ error: errorMessage }));
  }
}