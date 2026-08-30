import type { EmailOtpType } from '@supabase/supabase-js';

export const HOME_PATH = '/';
export const LOGIN_PATH = '/login';
export const CONFIRM_PATH = '/auth/confirm';
export const SIGNOUT_PATH = '/auth/signout';

// Appended to LOGIN_PATH when a magic link fails to verify.
export const LINK_ERROR_QUERY = 'error=link';

// The email template sends `type=email`; the others are accepted defensively.
export const OTP_TYPES = ['email', 'magiclink', 'recovery'] as const;
export const DEFAULT_OTP_TYPE: EmailOtpType = 'email';
