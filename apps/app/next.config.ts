import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  transpilePackages: ["@cotizaai/ui"],
  outputFileTracingRoot: path.join(__dirname, "../../"),
  experimental: {
    // 30 min: cubre una sesión de trabajo entera sintiéndose instantánea.
    // Seguro para subirlo así de alto porque las escrituras invalidan su
    // página puntual con revalidatePath() (ver los route.ts de historicos/
    // generar/presupuestos/formatos/perfil/configuracion) y el cambio de
    // organización activa fuerza un router.refresh() completo
    // (features/nav/org-switch-revalidate.tsx) — sin esas dos piezas, un
    // valor así de alto mostraría datos viejos después de tus propias
    // acciones o cruzados entre organizaciones.
    staleTimes: { dynamic: 1800 },
  },
};

export default nextConfig;
