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

export const HOME_PAGE_TITLE = 'Tu estantería · Videothèque';

// Opens with the visible word: an accessible name that does not contain the
// visible text leaves voice control unable to address the link (WCAG 2.5.3).
export const HEADER_HOME_LABEL = `${WORDMARK} · ir a tu estantería`;

// The search placeholder is the one string the shelf spec names verbatim.
export const SEARCH_PLACEHOLDER = 'Busca una película para archivarla';
export const SEARCH_LABEL = 'Buscar películas';
export const SEARCH_RESULTS_LABEL = 'Resultados de la búsqueda';
export const SEARCH_ON_SHELF = 'Ya en la estantería';
export const SEARCH_EMPTY = 'No hay resultados';
export const SEARCH_FAILED = 'No se pudo buscar. Inténtalo otra vez.';
export const SEARCH_ADDING = 'Añadiendo…';
export const ADD_FAILED = 'No se pudo añadir la película. Inténtalo otra vez.';

export const ACCOUNT_MENU_LABEL = 'Tu cuenta';
export const SIGN_OUT = 'Cerrar sesión';

export const SHELVES_LOAD_FAILED = 'No se pudieron cargar tus estanterías.';

// A public profile lives at PROFILE_PATH_PREFIX + handle.
export const PROFILE_PATH_PREFIX = '/u/';

// Dispatched on `document` so the search field and the bookcase, which are
// separate components with separate scripts, stay in step without a reload.
export const FILM_ADDED_EVENT = 'shelf:film-added';
export const FILM_REMOVED_EVENT = 'shelf:film-removed';

export const SHELF_EMPTY_HINT = 'Tu estantería está vacía. Busca una película para archivarla.';
export const ADD_SHELF = '+ Añadir balda';
export const ADD_SHELF_FAILED = 'No se pudo añadir la balda. Inténtalo otra vez.';
export const REORDER_FAILED = 'No se pudo guardar el orden. Inténtalo otra vez.';

export const CASE_REMOVE = 'Quitar de la estantería';
export const CASE_REMOVE_FAILED = 'No se pudo quitar la película. Inténtalo otra vez.';
export const CASE_CLOSE = 'Cerrar';
export const CASE_NO_OVERVIEW = 'Sin sinopsis.';

// The postit is a shelf's `name` drawn on its `accent_color`, which the owner
// picks freely. This is what the picker opens on for a shelf with no postit.
export const LABEL_MAX_LENGTH = 24;
export const POSTIT_DEFAULT_COLOR = '#9e2f26';
export const POSTIT_DEFAULT_TEXT_COLOR = '#ffffff';

export const LABEL_ADD = '+ Etiqueta';
export const LABEL_EDIT = 'Editar etiqueta';
export const LABEL_DIALOG_TITLE = 'Etiqueta de la balda';
export const LABEL_NAME = 'Nombre';
export const LABEL_COLOR = 'Color del postit';
export const LABEL_TEXT_COLOR = 'Color del texto';
export const LABEL_SAVE = 'Guardar';
export const LABEL_REMOVE = 'Quitar etiqueta';
export const LABEL_CANCEL = 'Cancelar';
export const LABEL_SAVE_FAILED = 'No se pudo guardar la etiqueta. Inténtalo otra vez.';

export const SHARE_PROFILE = 'Compartir perfil';
export const SHARE_COPIED = 'Enlace copiado';
export const SHARE_FAILED = 'No se pudo copiar el enlace';

// Replaced with the display name at the call site, like AUTH_EMAIL_TOKEN.
export const PROFILE_NAME_TOKEN = '{name}';
export const PUBLIC_SHELF_OF = `Estantería de ${PROFILE_NAME_TOKEN}`;
export const PUBLIC_NOT_FOUND = 'Aquí no hay ninguna estantería.';
export const PUBLIC_NOT_FOUND_TITLE = 'No encontrada · Videothèque';
export const PUBLIC_EMPTY = 'Esta estantería todavía está vacía.';
