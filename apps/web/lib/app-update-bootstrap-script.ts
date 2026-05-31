import {
  APP_UPDATE_OVERLAY_INNER_HTML,
  APP_UPDATE_OVERLAY_STYLE_CSS,
} from "@/lib/app-update-overlay";

/** Inline head bootstrap — early deploy detection before React hydrates. */
export function appUpdateBootstrapScript(clientVersion: string): string {
  if (!clientVersion || clientVersion === "dev") return "";

  const versionLiteral = JSON.stringify(clientVersion);
  const styleLiteral = JSON.stringify(APP_UPDATE_OVERLAY_STYLE_CSS);
  const overlayLiteral = JSON.stringify(APP_UPDATE_OVERLAY_INNER_HTML);

  return `(function(){
try{
  window.__ccoAppVersion=${versionLiteral};
  function showOverlay(){
    if(document.getElementById("cco-app-update-overlay"))return;
    var style=document.getElementById("cco-app-fullscreen-overlay-style");
    if(!style){
      style=document.createElement("style");
      style.id="cco-app-fullscreen-overlay-style";
      style.textContent=${styleLiteral};
      document.head.appendChild(style);
    }
    var overlay=document.createElement("div");
    overlay.id="cco-app-update-overlay";
    overlay.className="app-update-overlay";
    overlay.setAttribute("role","alert");
    overlay.setAttribute("aria-live","assertive");
    overlay.innerHTML=${overlayLiteral};
    (document.body||document.documentElement).appendChild(overlay);
  }
  function armUpdating(){
    window.__ccoApplyingUpdate=true;
    window.__ccoDeployPending=true;
    showOverlay();
    try{window.dispatchEvent(new Event("cco:app-updating"))}catch(e){}
  }
  function shouldArm(data){
    if(!data)return false;
    var client=window.__ccoAppVersion;
    if(data.updating)return true;
    if(!data.version||!client||client==="dev")return false;
    return data.version!==client;
  }
  fetch("/api/app-version",{cache:"no-store",headers:{"Cache-Control":"no-cache",Pragma:"no-cache"}})
    .then(function(res){return res.ok?res.json():null})
    .then(function(data){
      if(!shouldArm(data))return;
      armUpdating();
      if(data.updating)return;
      setTimeout(function(){window.location.reload()},500);
    })
    .catch(function(){});
}catch(e){}
})();`;
}
