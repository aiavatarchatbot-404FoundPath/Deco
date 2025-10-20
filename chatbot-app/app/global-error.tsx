'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Global client error:', error);
  }, [error]);

  return (
    <html>
      <body style={{ padding: 24, fontFamily: 'system-ui' }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
          Something went wrong
        </h2>
        <pre
          style={{
            whiteSpace: 'pre-wrap',
            background: '#f6f6f6',
            padding: 12,
            borderRadius: 8,
            border: '1px solid #e5e7eb',
            color: '#374151',
            marginBottom: 16,
          }}
        >
          {String(error?.message || 'Unknown client error')}
        </pre>
        <button
          onClick={() => reset()}
          style={{ padding: '8px 12px', borderRadius: 8, background: '#111', color: '#fff' }}
        >
          Reload
        </button>
      </body>
    </html>
  );
}


