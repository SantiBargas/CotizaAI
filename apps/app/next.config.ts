import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  transpilePackages: ["@cotizaai/ui"],
  outputFileTracingRoot: path.join(__dirname, "../../"),
  async redirects() {
    return [
      // Ruta heredada de ITZA: el navegador suele autocompletarla del
      // historial. Sin esto, Clerk la protege y después del login cae en 404.
      { source: "/inicio", destination: "/dashboard", permanent: false },
    ];
  },
};

export default nextConfig;
