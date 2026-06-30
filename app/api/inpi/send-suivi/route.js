import { NextResponse } from 'next/server';
import { createSupabaseServer, requireUser } from '@/lib/supabase-server';
import { sendMail } from '@/lib/mailer';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://inpi-ten.vercel.app';

export async function POST(req) {
  try {
    const user = await requireUser();
    const sb   = await createSupabaseServer();
    const { formaliteId, denomination, siren, email } = await req.json();

    if (!email || !formaliteId) {
      return NextResponse.json({ ok: false, error: 'Email et ID formalité requis' }, { status: 400 });
    }

    const { data: settings } = await sb.from('settings').select('*').eq('user_id', user.id).single();
    const cabinetName = settings?.nom_cabinet || 'Votre cabinet';
    const suiviUrl = `${APP_URL}/inpi/suivi/${formaliteId}`;

    // Enregistrer le contact
    await sb.from('inpi_contacts').upsert({
      user_id: user.id, formalite_id: String(formaliteId), email,
      sent_at: new Date().toISOString(),
    }, { onConflict: 'formalite_id,email' });

    await sendMail(settings, {
      to: email,
      subject: `Suivi de votre formalité — ${denomination || formaliteId}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1e293b">
          <div style="background:linear-gradient(135deg,#ea580c,#c2410c);padding:28px 32px;border-radius:12px 12px 0 0">
            <h1 style="color:white;margin:0;font-size:20px;font-weight:700">Suivi de votre formalité INPI</h1>
            <p style="color:#fed7aa;margin:6px 0 0;font-size:14px">${denomination || ''}${siren ? ' · SIREN ' + siren : ''}</p>
          </div>
          <div style="background:#f8fafc;padding:32px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none">
            <p style="margin:0 0 16px">Bonjour,</p>
            <p style="margin:0 0 24px;color:#475569">
              Vous pouvez suivre en temps réel l'avancement de votre formalité
              ${denomination ? '<strong>' + denomination + '</strong>' : ''} déposée au Guichet Unique de l'INPI.
            </p>
            <div style="text-align:center;margin:24px 0">
              <a href="${suiviUrl}"
                style="display:inline-block;background:#ea580c;color:white;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px">
                📋 Suivre ma formalité
              </a>
            </div>
            <p style="margin:24px 0 0;font-size:13px;color:#64748b">
              Ou copiez ce lien dans votre navigateur :<br/>
              <a href="${suiviUrl}" style="color:#ea580c;font-size:12px;word-break:break-all">${suiviUrl}</a>
            </p>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
            <p style="font-size:12px;color:#94a3b8;margin:0">${cabinetName}</p>
          </div>
        </div>
      `,
    });

    return NextResponse.json({ ok: true, sentTo: email, suiviUrl });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
