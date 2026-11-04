import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { isValidRoomCode, normalizeRoomCode } from '@ludo3d/shared/protocol';
import { RoomScreen } from '@/components/online/RoomScreen';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('online');
  return { title: t('lobbyTitle') };
}

export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const code = normalizeRoomCode((await params).code);
  if (!isValidRoomCode(code)) notFound();
  return <RoomScreen code={code} />;
}
