'use client';

import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const ShowcaseCanvas = dynamic(() => import('./ShowcaseCanvas'), { ssr: false });

function Inner() {
  const params = useSearchParams();
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <ShowcaseCanvas clip={params.get('clip') ?? 'Idle'} time={Number(params.get('t') ?? '-1')} />
    </div>
  );
}

export function AnimalShowcase() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
