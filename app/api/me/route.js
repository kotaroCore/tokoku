import { requireApi } from '@/lib/auth';

export async function GET() {
  const { session, error } = await requireApi();
  if (error) return error;
  return Response.json({ name: session.name, shiftId: session.shiftId });
}
