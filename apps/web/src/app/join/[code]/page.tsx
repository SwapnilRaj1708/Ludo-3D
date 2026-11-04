import { notFound, redirect } from 'next/navigation';
import { isValidRoomCode, normalizeRoomCode } from '@ludo3d/shared/protocol';

/** Invitation links (`/join/AB3K9Q`) lead straight into the room. */
export default async function InviteLinkPage({ params }: { params: Promise<{ code: string }> }) {
  const code = normalizeRoomCode((await params).code);
  if (!isValidRoomCode(code)) notFound();
  redirect(`/room/${code}`);
}
