import { WELCOME_SEEN_KEY } from "@/lib/welcome-seen";
import {
  APP_BOOT_OVERLAY_LABEL,
  APP_FULLSCREEN_OVERLAY_STYLE_CSS,
  buildFullscreenOverlayInnerHtml,
} from "@/lib/app-update-overlay";

/** Inline head bootstrap — PWA loading screen before React hydrates on return visits. */
export function appBootBootstrapScript(): string {
  const welcomeKeyLiteral = JSON.stringify(WELCOME_SEEN_KEY);
  const styleLiteral = JSON.stringify(APP_FULLSCREEN_OVERLAY_STYLE_CSS);
  const overlayLiteral = JSON.stringify(buildFullscreenOverlayInnerHtml(APP_BOOT_OVERLAY_LABEL));

  return `(function(){
try{
  var n=navigator;
  if(!(n.standalone||matchMedia("(display-mode: standalone)").matches||matchMedia("(display-mode: fullscreen)").matches))return;
  if(window.__ccoApplyingUpdate)return;
  var p=location.pathname;
  if(p!=="/groups"&&p!=="/dms"&&p!=="/teams")return;
  try{if(localStorage.getItem(${welcomeKeyLiteral})!=="1")return}catch(e){return}
  if(document.getElementById("cco-app-boot-overlay"))return;
  var style=document.getElementById("cco-app-fullscreen-overlay-style");
  if(!style){
    style=document.createElement("style");
    style.id="cco-app-fullscreen-overlay-style";
    style.textContent=${styleLiteral};
    document.head.appendChild(style);
  }
  var overlay=document.createElement("div");
  overlay.id="cco-app-boot-overlay";
  overlay.className="app-update-overlay";
  overlay.setAttribute("role","status");
  overlay.setAttribute("aria-live","polite");
  overlay.innerHTML=${overlayLiteral};
  (document.body||document.documentElement).appendChild(overlay);
}catch(e){}
})();`;
}
