'use client';
import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';

type VisageEl = HTMLElement & { src?: string; model?: string };

type Props = React.DetailedHTMLProps<
  React.HTMLAttributes<HTMLElement>,
  HTMLElement
> & {
  /** Direct .glb URL */
  src?: string;
};

const VisageWrapper: React.FC<Props> = ({ src, className, style, ...rest }) => {
  const ref = useRef<VisageEl | null>(null);
  const [loading, setLoading] = useState<boolean>(!!src);

  useEffect(() => {
    import('@readyplayerme/visage').catch((e) =>
      console.error('[VisageWrapper] import failed', e)
    );
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const url = src ? (src.endsWith('.glb') ? src : `${src}.glb`) : undefined;

    const done = () => setLoading(false);
    const fail = (e: Event) => {
      setLoading(false);
      console.error('[VisageWrapper] model load error', e);
    };

    const doneEvents = ['model-load-complete', 'model-loaded', 'ready', 'load'];
    const errEvents = ['model-load-error', 'error'];

    doneEvents.forEach((n) => el.addEventListener(n, done as EventListener));
    errEvents.forEach((n) => el.addEventListener(n, fail as EventListener));
    const safety = window.setTimeout(done, 4000);

    if (url) {
      console.log('[VisageWrapper] applying src =', url);
      // set as attribute and property (and alternative name 'model' just in case)
      el.setAttribute('src', url);
      try { (el as any).src = url; } catch {}
      try { (el as any).model = url; } catch {}
      setLoading(true);
    } else {
      console.log('[VisageWrapper] no src');
      setLoading(false);
    }

    return () => {
      window.clearTimeout(safety);
      doneEvents.forEach((n) => el.removeEventListener(n, done as EventListener));
      errEvents.forEach((n) => el.removeEventListener(n, fail as EventListener));
    };
  }, [src]);

  return (
    <div className={`relative ${className ?? ''}`} style={{ minHeight: 260, ...style }}>
      {loading && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-black/5">
          <RefreshCw className="h-7 w-7 animate-spin text-gray-400" />
        </div>
      )}
      <visage-viewer
        ref={ref}
        key={src || 'empty'}
        style={{
          width: '100%',
          height: '100%',
          opacity: loading ? 0 : 1,
          transition: 'opacity .25s',
        }}
        {...rest}
      />
    </div>
  );
};

export default VisageWrapper;
