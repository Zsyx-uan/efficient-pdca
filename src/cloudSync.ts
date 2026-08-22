import type { GardenData } from './archiveTypes'

export type CloudSession = {
  access_token: string
  refresh_token: string
  expires_at?: number
  user: { id: string; email?: string | null }
}

type AuthResponse = CloudSession & { error?: { message?: string } }

export const SUPABASE_URL = 'https://haqinszdfgmxvnrlhefj.supabase.co'
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_KQZtC0yxKVn3UwBxKfGFQg_vHrBgfjz'

const authHeaders = { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' }
const messageFor = async (response: Response) => {
  const body = await response.json().catch(() => ({})) as { msg?: string; message?: string; error_description?: string }
  return body.msg ?? body.message ?? body.error_description ?? `请求失败（${response.status}）`
}

async function authRequest(path: string, payload: unknown): Promise<CloudSession> {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, { method: 'POST', headers: authHeaders, body: JSON.stringify(payload) })
  if (!response.ok) throw new Error(await messageFor(response))
  const data = await response.json() as AuthResponse
  if (!data.access_token || !data.user) throw new Error('请先到邮箱完成验证，然后再登录。')
  return data
}

export const signInWithPassword = (email: string, password: string) => authRequest('token?grant_type=password', { email, password })
export const signUpWithPassword = (email: string, password: string) => authRequest('signup', { email, password, options: { emailRedirectTo: `${window.location.origin}${window.location.pathname}` } })
export const refreshSession = (refreshToken: string) => authRequest('token?grant_type=refresh_token', { refresh_token: refreshToken })

export async function signOutFromCloud(session: CloudSession) {
  await fetch(`${SUPABASE_URL}/auth/v1/logout`, { method: 'POST', headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${session.access_token}` } }).catch(() => undefined)
}

const dataHeaders = (session: CloudSession, extra: Record<string, string> = {}) => ({
  apikey: SUPABASE_PUBLISHABLE_KEY,
  Authorization: `Bearer ${session.access_token}`,
  'Content-Type': 'application/json',
  ...extra,
})

export async function pullGarden(session: CloudSession): Promise<{ garden: GardenData; updatedAt: string } | null> {
  const url = `${SUPABASE_URL}/rest/v1/knowledge_gardens?select=garden,updated_at&user_id=eq.${encodeURIComponent(session.user.id)}&limit=1`
  const response = await fetch(url, { headers: dataHeaders(session) })
  if (!response.ok) throw new Error(await messageFor(response))
  const rows = await response.json() as Array<{ garden: GardenData; updated_at: string }>
  const row = rows[0]
  return row ? { garden: row.garden, updatedAt: row.updated_at } : null
}

export async function pushGarden(session: CloudSession, garden: GardenData) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/knowledge_gardens?on_conflict=user_id`, {
    method: 'POST',
    headers: dataHeaders(session, { Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify([{ user_id: session.user.id, garden, updated_at: new Date().toISOString() }]),
  })
  if (!response.ok) throw new Error(await messageFor(response))
}
