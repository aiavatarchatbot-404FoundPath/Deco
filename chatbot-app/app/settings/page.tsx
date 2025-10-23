import { Suspense } from 'react';
import SettingsClient from './SettingsClient';

export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SettingsClient />
    </Suspense>
  );
}
