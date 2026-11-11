import type { EmailOtpType } from '@supabase/supabase-js';
import {
  DEFAULT_OTP_TYPE,
  HOME_PATH,
  HTTP_SEE_OTHER,
  LINK_ERROR_QUERY,
  LOGIN_PATH,
  OTP_TYPES,
} from '../constants';

export interface AuthConfirmContext {
  params: URLSearchParams;
  verifyOtp: (args: { token_hash: string; type: EmailOtpType }) => Promise<{ error: unknown }>;
  exchangeCodeForSession: (code: string) => Promise<{ error: unknown }>;
}

export interface AuthConfirmResult {
  status: typeof HTTP_SEE_OTHER;
  location: string;
}

function safeNext(raw: string | null): string {
  // Must be a path starting with a single "/" (not "//" or "/\"), and contain
  // no control characters — browsers strip tab/CR/LF before URL parsing, which
  // turns "/<TAB>/evil.com" into a protocol-relative redirect.
  // eslint-disable-next-line no-control-regex -- rejecting control chars is the point
  if (!raw || !/^\/[^/\\]/.test(raw) || /[\u0000-\u001f\u007f]/.test(raw)) {
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
    status: HTTP_SEE_OTHER,
    location: `${LOGIN_PATH}?${LINK_ERROR_QUERY}`,
  };

  // `token_hash` comes from our own email template. `code` comes from the
  // hosted project's default one: Supabase verifies the link itself and hands
  // back a PKCE code, which only the browser that asked for the link can
  // redeem, because its verifier sits in that browser's cookies. The hosted
  // project cannot use our template without custom SMTP, so both must work.
  const tokenHash = ctx.params.get('token_hash');
  const code = ctx.params.get('code');
  if (!tokenHash && !code) {
    console.warn('[auth/confirm] callback hit with neither token_hash nor code');
    return failure;
  }

  try {
    const { error } = tokenHash
      ? await ctx.verifyOtp({ token_hash: tokenHash, type: resolveType(ctx.params.get('type')) })
      : await ctx.exchangeCodeForSession(code as string);
    if (error) {
      console.warn('[auth/confirm] the link was rejected', error);
      return failure;
    }
  } catch (err) {
    console.error('[auth/confirm] verifying the link threw', err);
    return failure;
  }

  return { status: HTTP_SEE_OTHER, location: safeNext(ctx.params.get('next')) };
}
