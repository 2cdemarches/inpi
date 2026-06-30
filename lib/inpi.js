// lib/inpi.js
// Intégration API RNE — INPI (multi-tenant : credentials par user dans settings)

import { createClient } from '@supabase/supabase-js'

const INPI_BASE = 'https://registre-national-entreprises.inpi.fr/api'

function adminSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

// ── Cache en mémoire par userId ───────────────────────────────────────────────
const tokenCache = new Map() // userId → { token, expiry }

/**
 * Obtenir un token RNE pour un utilisateur donné.
 * Lit inpi_rne_username / inpi_rne_password depuis la table settings.
 */
export async function getInpiToken(userId) {
  // 1. Cache mémoire (valable 55 min)
  const cached = tokenCache.get(userId)
  if (cached && cached.expiry > Date.now()) return cached.token

  // 2. Lire les credentials depuis Supabase settings
  const sb = adminSb()
  const { data: settings } = await sb
    .from('settings')
    .select('inpi_rne_username, inpi_rne_password')
    .eq('user_id', userId)
    .single()

  const username = settings?.inpi_rne_username?.trim() || process.env.INPI_RNE_USERNAME
  const password = settings?.inpi_rne_password?.trim() || process.env.INPI_RNE_PASSWORD

  if (!username || !password) {
    throw new Error('Credentials RNE INPI manquants. Renseignez-les dans ⚙️ Paramètres.')
  }

  // 3. Login
  const res = await fetch(`${INPI_BASE}/sso/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  })

  if (!res.ok) {
    throw new Error(`Échec authentification RNE INPI (${res.status}). Vérifiez vos identifiants dans ⚙️ Paramètres.`)
  }

  const data = await res.json()
  const token = data.token

  tokenCache.set(userId, { token, expiry: Date.now() + 55 * 60 * 1000 })
  return token
}

// ── Appel API RNE générique ───────────────────────────────────────────────────
async function rneCall(userId, path) {
  const token = await getInpiToken(userId)
  const res = await fetch(`${INPI_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!res.ok) throw new Error(`INPI RNE ${res.status} sur ${path}`)
  return res.json()
}

/**
 * Vérifier si une entreprise existe par SIREN
 */
export async function companyExists(userId, siren) {
  const token = await getInpiToken(userId)
  const res = await fetch(`${INPI_BASE}/companies/${siren}/exists`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  return res.ok
}

/**
 * Récupérer les informations complètes d'une entreprise par SIREN
 */
export async function getCompany(userId, siren) {
  return rneCall(userId, `/companies/${siren}`)
}

/**
 * Récupérer les formalités (créations, modifications, cessations)
 */
export async function getFormalities(userId, params = {}) {
  const query = new URLSearchParams(params).toString()
  return rneCall(userId, `/formalities?${query}`)
}

/**
 * Récupérer une formalité par numéro de liasse
 */
export async function getFormality(userId, liasseNumber) {
  return rneCall(userId, `/formalities/${liasseNumber}`)
}

/**
 * Récupérer les modifications d'entreprises entre 2 dates
 * @param {string} dateDebut - Format: YYYY-MM-DD
 * @param {string} dateFin   - Format: YYYY-MM-DD
 */
export async function getCompaniesDiff(userId, dateDebut, dateFin) {
  return rneCall(userId, `/companies/diff?dateDebut=${dateDebut}&dateFin=${dateFin}`)
}
