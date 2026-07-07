export const FRAPPE_URL: string =
  (import.meta.env.VITE_FRAPPE_URL as string | undefined)?.replace(/\/$/, "") ||
  "https://app.makkobillischool.com";

export const OAUTH_CLIENT_ID: string = (import.meta.env.VITE_OAUTH_CLIENT_ID as string | undefined) || "";

export const OAUTH_REDIRECT_URI = `${window.location.origin}/oauth/callback`;

export const APP_NAME = "Makko Billi Staff";
export const APP_SHORT_NAME = "MBS Staff";
