import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CotizaAI — Presupuestos con IA",
    short_name: "CotizaAI",
    description:
      "Generá presupuestos profesionales con IA a partir de tu histórico, ajustados por inflación y listos para enviar.",
    start_url: "/inicio",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#005778",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
