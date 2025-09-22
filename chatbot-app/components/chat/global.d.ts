declare namespace JSX {
  interface IntrinsicElements {
    'visage-viewer': React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement>,
      HTMLElement
    > & {
      src?: string;
      style?: React.CSSProperties;
      environment?: 'soft' | 'studio' | 'neutral' | string;
      'idle-rotation'?: boolean;
      scale?: number;
      'camera-initial-distance'?: number;
      'camera-orbit'?: string;
    };
  }
}
