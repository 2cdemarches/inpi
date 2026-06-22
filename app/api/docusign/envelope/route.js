import { NextResponse } from 'next/server';
import * as jose from 'jose';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const envelopeId = searchParams.get('id');
  if (!envelopeId) return NextResponse.json({ error: 'id manquant' }, { status: 400 });

  try {
    const accountId = process.env.DOCUSIGN_ACCOUNT_ID;
    const clientId  = process.env.DOCUSIGN_CLIENT_ID;
    const userId    = process.env.DOCUSIGN_USER_ID;
    const privateKey = process.env.DOCUSIGN_PRIVATE_KEY?.replace(/\\n/g, '\n');
    const baseUrl   = process.env.DOCUSIGN_BASE_URL || 'https://na4.docusign.net';

    if (!accountId || !clientId || !userId || !privateKey) {
      return NextResponse.json({ error: 'Config DocuSign manquante' }, { status: 500 });
    }

    const key = await jose.importPKCS8(privateKey, 'RS256');
    const jwt = await new jose.SignJWT({ sub: userId, iss: clientId, aud: 'account-d.docusign.com', scope: 'signature impersonation' })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(key);

    const tokenRes = await fetch('https://account-d.docusign.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return NextResponse.json({ error: 'Token DocuSign impossible' }, { status: 500 });

    const envelopeRes = await fetch(
      `${baseUrl}/restapi/v2.1/accounts/${accountId}/envelopes/${envelopeId}`,
      { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
    );
    const envelope = await envelopeRes.json();
    return NextResponse.json({ status: envelope.status, sent: envelope.sentDateTime, completed: envelope.completedDateTime });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
