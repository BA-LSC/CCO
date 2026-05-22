/** Baked at build time — must match /api/app-version on the same deploy. */
export const APP_BUILD_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";
