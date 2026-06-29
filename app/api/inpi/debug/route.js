import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase-server';
import { getInpiToken } from '@/lib/inpi';

const RNE = 'https://registre-national-entreprises.inpi.fr/api';

// GET /api/inpi/debug — retourne les 2 premiers items bruts pour inspecter la structure
export async function GET() {
  try {
    const user = await requireUser();
    const token = await getInpiToken(user.id);
    const headers = { Authorization: `Bearer ${token}` };

    // Essayer paginated
    const res = await fetch(`${RNE}/formalities/paginated?page=1&pageSize=2`, { headers });
    const txt = await res.text();
    let parsed;
    try { parsed = JSON.parse(txt); } catch { parsed = txt; }

    // Aussi essayer l'endpoint non paginé avec limit
    const res2 = await fetch(`${RNE}/formalities?pageSize=2&page=1`, { headers });
    const txt2 = await res2.text();
    let parsed2;
    try { parsed2 = JSON.parse(txt2); } catch { parsed2 = txt2; }

    return NextResponse.json({
      paginated_status: res.status,
      paginated: parsed,
      formalities_status: res2.status,
      formalities: parsed2,
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
