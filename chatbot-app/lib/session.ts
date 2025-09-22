export function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return 'server';
  const k = 'anonSessionId:v1';
  let v = localStorage.getItem(k);
  if (!v) { v = crypto.randomUUID(); localStorage.setItem(k, v); }
  return v;
}

