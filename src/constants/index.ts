import type { EmailOtpType } from '@supabase/supabase-js';

export const HOME_PATH = '/';
export const LOGIN_PATH = '/login';
export const CONFIRM_PATH = '/auth/confirm';
export const SIGNOUT_PATH = '/auth/signout';

// Appended to LOGIN_PATH when a magic link fails to verify.
export const LINK_ERROR_QUERY = 'error=link';

// HTTP 303 See Other — every auth redirect (magic-link confirm, sign-out) uses it.
export const HTTP_SEE_OTHER = 303;

// The email template sends `type=email`; the others are accepted defensively.
export const OTP_TYPES = ['email', 'magiclink', 'recovery'] as const;
export const DEFAULT_OTP_TYPE: EmailOtpType = 'email';

// Enforced by the endpoint, not by the database.
export const SHELF_CAPACITY = 20;

export const SHELF_FULL_MESSAGE =
  'Tienes la estantería llena, crea otra para seguir añadiendo películas';

export const WORDMARK = 'Videothèque';

// TMDB's licence requires the attribution to stay visible wherever its data is.
export const TMDB_URL = 'https://www.themoviedb.org/';
export const TMDB_ATTRIBUTION =
  'Este producto usa la API de TMDB, pero no está avalado ni certificado por TMDB.';

export const TMDB_LOGO_ALT = 'The Movie Database (TMDB)';

// Absent from storage means "follow the system"; the toggle only ever writes an
// explicit choice, which the CSS honours over the media query.
export const THEME_STORAGE_KEY = 'videotheque-theme';
export const THEME_DARK = 'dark';
export const THEME_LIGHT = 'light';
export const THEME_TO_DARK_LABEL = 'Cambiar a tema oscuro';
export const THEME_TO_LIGHT_LABEL = 'Cambiar a tema claro';

// Interface copy is Castilian Spanish and never inline in a component.
export const AUTH_PAGE_TITLE = 'Login · Videothèque';

// Each pair is [emphasised verb, the rest of the clause]. The split is the
// content's own structure — three actions — not decoration, and it is what
// the two weights on the line are carrying. Uppercasing happens in CSS.
export const AUTH_PITCH = [
  ['Busca', 'tus películas'],
  ['Organiza', 'tu estantería'],
  ['Comparte', 'tu colección con quien quieras'],
] as const;

// English on purpose: the owner treats "login" as the universal term.
export const AUTH_SIGN_IN = 'Login';
export const AUTH_SIGN_UP = 'Regístrate';
export const AUTH_EMAIL_LABEL = 'Correo electrónico';
export const AUTH_SUBMIT_SIGN_IN = 'Enviarme el enlace';
export const AUTH_SUBMIT_SIGN_UP = 'Crear mi estantería';
export const AUTH_SENDING = 'Enviando…';

// Replaced with the address at the call site, so this file stays declarative.
export const AUTH_EMAIL_TOKEN = '{email}';
export const AUTH_SENT = `Enlace enviado a ${AUTH_EMAIL_TOKEN}. Ábrelo en este mismo navegador.`;

export const AUTH_NO_ACCOUNT = 'No hay ninguna cuenta con ese correo. Crea una para empezar.';
export const AUTH_SEND_FAILED = 'No se pudo enviar el enlace. Inténtalo otra vez.';
export const AUTH_LINK_EXPIRED = 'Ese enlace ya no sirve. Pide uno nuevo.';

// Supabase answers `shouldCreateUser: false` for an unknown address with this
// code; it is the only way to tell "no account" from a real send failure.
export const SUPABASE_OTP_DISABLED = 'otp_disabled';
