import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getEnv } from "@/lib/env";

/**
 * POST /api/demo — solicitud de demo desde la landing (pública, sin sesión).
 * Siempre persiste en DB; si hay RESEND_API_KEY + DEMO_NOTIFY_EMAIL además
 * manda un mail de aviso. Honeypot `web` contra bots básicos.
 */

const bodySchema = z.object({
  nombre: z.string().min(2).max(120),
  email: z.string().email().max(200),
  empresa: z.string().max(200).optional(),
  mensaje: z.string().max(2000).optional(),
  web: z.string().max(0).optional(), // honeypot: si viene con contenido, bot
});

async function notifyByEmail(d: {
  nombre: string;
  email: string;
  empresa?: string;
  mensaje?: string;
}): Promise<void> {
  const env = getEnv();
  if (!env.RESEND_API_KEY || !env.DEMO_NOTIFY_EMAIL) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "CotizaAI <onboarding@resend.dev>",
        to: [env.DEMO_NOTIFY_EMAIL],
        subject: `Nueva solicitud de demo: ${d.nombre}${d.empresa ? ` (${d.empresa})` : ""}`,
        text: [
          `Nombre: ${d.nombre}`,
          `Email: ${d.email}`,
          d.empresa ? `Empresa: ${d.empresa}` : null,
          d.mensaje ? `\nMensaje:\n${d.mensaje}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
      }),
    });
  } catch (err) {
    console.error("No se pudo enviar el mail de demo:", err);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Completá nombre y un email válido." },
        { status: 400 },
      );
    }
    const { nombre, email, empresa, mensaje, web } = parsed.data;

    // Honeypot disparado: responder OK sin guardar (no darle señal al bot).
    if (web) return NextResponse.json({ ok: true });

    await prisma.demoRequest.create({
      data: { nombre, email, empresa: empresa ?? null, mensaje: mensaje ?? null },
    });
    await notifyByEmail({ nombre, email, empresa, mensaje });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error("Error registrando solicitud de demo:", err);
    return NextResponse.json(
      { error: "No se pudo registrar la solicitud. Probá de nuevo." },
      { status: 500 },
    );
  }
}
