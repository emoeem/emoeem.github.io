const ADMIN_VERCEL_ORIGIN = "https://blog-source-roan.vercel.app";
if (window.location.hostname === "emoeem.github.io") {
  window.location.replace(ADMIN_VERCEL_ORIGIN + "/admin/");
}
window.ADMIN_API_BASE = "";
