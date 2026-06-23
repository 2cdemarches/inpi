import { createSupabaseServer } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export async function POST() {
  const sb = await createSupabaseServer();
  await sb.auth.signOut();
  return NextResponse.json({ ok: true });
}
