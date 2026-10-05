import { randomInt, timingSafeEqual } from 'node:crypto';
import type { Response } from 'express';
import { setCookie } from '../http/cookies';

export const CSRF_COOKIE = 'csrftoken';
export const CSRF_HEADER = 'x-csrftoken';
export const CSRF_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;
export const TRUSTED_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];

const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const SECRET_LENGTH = 32;
const TOKEN_LENGTH = SECRET_LENGTH * 2;

const onlyAlphabet = (value: string) => [...value].every((ch) => ALPHABET.includes(ch));

export function newCsrfSecret(): string {
  return Array.from({ length: SECRET_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
}

export function isValidSecret(value: string | undefined): value is string {
  return value !== undefined && value.length === SECRET_LENGTH && onlyAlphabet(value);
}

/** Sets the csrftoken cookie (readable by JS, so the SPA can echo it in X-CSRFToken). */
export function setCsrfCookie(res: Response, secret: string): void {
  setCookie(res, CSRF_COOKIE, secret, { maxAgeSeconds: CSRF_MAX_AGE_SECONDS, httpOnly: false });
}

/** Reverses the CSRF token masking: a 64-char token is mask + (secret + mask) per character. */
function unmask(token: string): string {
  const mask = token.slice(0, SECRET_LENGTH);
  const cipher = token.slice(SECRET_LENGTH);
  return [...cipher]
    .map((ch, i) => ALPHABET[(ALPHABET.indexOf(ch) - ALPHABET.indexOf(mask[i]) + ALPHABET.length) % ALPHABET.length])
    .join('');
}

/** True when the header token (plain secret or masked form) matches the cookie secret. */
export function tokenMatches(headerToken: string | undefined, secret: string): boolean {
  if (headerToken === undefined || !onlyAlphabet(headerToken)) return false;
  if (headerToken.length !== SECRET_LENGTH && headerToken.length !== TOKEN_LENGTH) return false;
  const candidate = Buffer.from(headerToken.length === TOKEN_LENGTH ? unmask(headerToken) : headerToken);
  return timingSafeEqual(candidate, Buffer.from(secret));
}
