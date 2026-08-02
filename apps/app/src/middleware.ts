import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Rutas públicas (no requieren sesión). El resto queda protegido.
// El marketing vive en apps/web (app separada); acá "/" es solo el
// redirector según sesión (ver src/app/page.tsx).
const isPublicRoute = createRouteMatcher([
  "/",
  "/ingresar",
  "/api/webhooks(.*)",
  "/api/demo", // solicitud de demo desde apps/web (cross-origin, sin sesión)
  "/api/cron(.*)", // jobs de Vercel Cron (autenticados con CRON_SECRET, no Clerk)
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    // Sin esto, auth.protect() manda al default hardcodeado de Clerk
    // (/sign-in), que no existe en esta app — el login vive en /ingresar.
    await auth.protect({ unauthenticatedUrl: new URL("/ingresar", req.url).toString() });
  }
});

export const config = {
  matcher: [
    // Excluye estáticos y _next; corre en todo lo demás.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpg|jpeg|gif|png|svg|ico|webp|woff2?|ttf|map)).*)",
    "/(api|trpc)(.*)",
  ],
};
