/**
 * Auth error envelopes (docs/08 §30).
 *
 * Every error follows `{ error: { code, message } }`. Messages are generic and
 * stable so they never leak whether an account exists or what internal
 * permission was missing (docs/11 §5.2, §20, §36).
 */
import type { ApiErrorEnvelope } from '@shared/api';

/** Wrong email/password, disabled account — indistinguishable by design. */
export function invalidCredentialsEnvelope(): ApiErrorEnvelope {
  return {
    error: { code: 'UNAUTHORIZED', message: 'Invalid credentials.' },
  };
}

/** No valid session was presented. */
export function unauthorizedEnvelope(): ApiErrorEnvelope {
  return {
    error: { code: 'UNAUTHORIZED', message: 'Authentication required.' },
  };
}

/** Authenticated but lacking the required permission. Never names the
 *  permission to avoid exposing internal authorization details. */
export function forbiddenEnvelope(): ApiErrorEnvelope {
  return {
    error: {
      code: 'FORBIDDEN',
      message: 'You do not have permission to perform this action.',
    },
  };
}

/** Malformed request body. */
export function validationEnvelope(
  message = 'The request contains invalid data.',
): ApiErrorEnvelope {
  return { error: { code: 'VALIDATION_ERROR', message } };
}