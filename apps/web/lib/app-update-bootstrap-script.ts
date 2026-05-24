/** Inline head bootstrap — publish SSR build id only; React owns update UX after hydration. */
export function appUpdateBootstrapScript(clientVersion: string): string {
  if (!clientVersion || clientVersion === "dev") return "";

  const versionLiteral = JSON.stringify(clientVersion);

  return `(function(){try{window.__ccoAppVersion=${versionLiteral};}catch(e){}})();`;
}
