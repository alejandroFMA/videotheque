import type { EmailOtpType } from '@supabase/supabase-js';
import { DEFAULT_OTP_TYPE, HOME_PATH, LINK_ERROR_QUERY, LOGIN_PATH, OTP_TYPES } from '../constants';

export interface AuthConfirmContext {
  params: URLSearchParams;
  verifyOtp: (args: { token_hash: string; type: EmailOtpType }) => Promise<{ error: unknown }>;
}

export interface AuthConfirmResult {
  status: 303;
  location: string;
}

function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) {
    return HOME_PATH;
  }
  return raw;
}

function resolveType(raw: string | null): EmailOtpType {
  return raw && (OTP_TYPES as readonly string[]).includes(raw)
    ? (raw as EmailOtpType)
    : DEFAULT_OTP_TYPE;
}

/**
 * Decides where `GET /auth/confirm` sends the browser. The caller injects the
 * real `verifyOtp`, whose cookie side effects land on the response. Logs every
 * failure at the boundary (like `handleTmdbRequest`) and still returns a
 * controlled result — it never rethrows.
 */
export async function handleAuthConfirm(ctx: AuthConfirmContext): Promise<AuthConfirmResult> {
  const failure: AuthConfirmResult = {
    status: 303,
    location: `${LOGIN_PATH}?${LINK_ERROR_QUERY}`,
  };

  const tokenHash = ctx.params.get('token_hash');
  if (!tokenHash) {
    console.warn('[auth/confirm] callback hit with no token_hash');
    return failure;
  }

  try {
    const { error } = await ctx.verifyOtp({
      token_hash: tokenHash,
      type: resolveType(ctx.params.get('type')),
    });
    if (error) {
      console.warn('[auth/confirm] verifyOtp rejected the token', error);
      return failure;
    }
  } catch (err) {
    console.error('[auth/confirm] verifyOtp threw', err);
    return failure;
  }

  return { status: 303, location: safeNext(ctx.params.get('next')) };
}
