import { notFound } from 'next/navigation';
import { AnimalShowcase } from '@/components/dev/AnimalShowcase';

/** Developer asset-review page: every species and clip, large. Not shipped in production. */
export default function AnimalShowcasePage() {
  if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_E2E !== '1') notFound();
  return <AnimalShowcase />;
}
