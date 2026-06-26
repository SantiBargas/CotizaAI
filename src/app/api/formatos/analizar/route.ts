import { NextResponse, type NextRequest } from "next/server";
import mammoth from "mammoth";
import { apiError, badRequest, requireTenantContext } from "@/lib/api";
import {
  callWithTool,
  AiNotConfiguredError,
  type ToolDefinition,
} from "@/lib/ai/providers";
import { recordUsage } from "@/lib/ai/usage";
import { budgetTemplateConfigSchema } from "@/types/budget-template";

export const maxDuration = 60;

const MAX_INPUT_CHARS = 20_000;

const ANALYZE_TOOL: ToolDefinition = {
  name: "registrar_formato",
  description:
    "Registra la configuración de formato de presupuesto inferida del documento Word de referencia.",
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description:
          "Nombre corto para esta plantilla (ej: 'Presupuesto estándar', 'Licitación').",
      },
      documentTitlePrefix: {
        type: "string",
        description:
          "Prefijo que el documento usa antes del título principal, si lo hay (ej: 'PRESUPUESTO N° ', 'OFERTA - '). Vacío si no hay.",
      },
      headerNote: {
        type: "string",
        description:
          "Nota, aclaración legal o condición general que aparece debajo del encabezado/membrete del documento, si la hay. Vacío si no hay.",
      },
      totalLabel: {
        type: "string",
        description:
          "Cómo el documento llama al total cotizado (ej: 'Total', 'Monto total', 'Presupuesto total'). Default 'Total cotizado'.",
      },
      paymentLabel: {
        type: "string",
        description:
          "Cómo el documento llama a la forma de pago (ej: 'Condiciones de pago'). Default 'Forma de pago'.",
      },
      validityLabel: {
        type: "string",
        description:
          "Cómo el documento llama a la validez de la oferta (ej: 'Vigencia de la propuesta'). Default 'Validez de la oferta'.",
      },
      footerText: {
        type: "string",
        description: "Texto del pie de página del documento, si lo hay.",
      },
    },
    required: ["name"],
  },
};

interface RawArgs {
  name?: unknown;
  documentTitlePrefix?: unknown;
  headerNote?: unknown;
  totalLabel?: unknown;
  paymentLabel?: unknown;
  validityLabel?: unknown;
  footerText?: unknown;
}

function asText(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/**
 * POST /api/formatos/analizar — sube un .docx de referencia (multipart/form-data,
 * campo `file`), extrae su texto con mammoth y le pide a la IA que infiera una
 * configuración de plantilla (etiquetas, prefijos, notas). No persiste nada:
 * devuelve `{ name, config }` para precargar el formulario de creación.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { tenant, user } = await requireTenantContext();

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return badRequest("Subí un archivo .docx en el campo `file`.");
    }
    if (
      !file.name.toLowerCase().endsWith(".docx") &&
      file.type !==
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      return badRequest("El archivo debe ser un .docx.");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { value: rawText } = await mammoth.extractRawText({ buffer });
    if (!rawText.trim()) {
      return badRequest("No se pudo extraer texto del documento.");
    }

    const input = rawText.slice(0, MAX_INPUT_CHARS);
    const result = await callWithTool(
      [
        {
          role: "system",
          content:
            "Sos un asistente que analiza documentos Word de presupuestos/cotizaciones para " +
            "inferir un formato reutilizable. Respondé SIEMPRE invocando el tool. " +
            "Si un dato no aparece claramente en el documento, omitilo (no inventes).",
        },
        {
          role: "user",
          content: `Analizá este documento de presupuesto y registrá su formato:\n\n${input}`,
        },
      ],
      ANALYZE_TOOL,
      { fast: true },
    );

    const raw = (result.args ?? {}) as RawArgs;
    const config = budgetTemplateConfigSchema.parse({
      documentTitlePrefix: asText(raw.documentTitlePrefix),
      headerNote: asText(raw.headerNote),
      totalLabel: asText(raw.totalLabel),
      paymentLabel: asText(raw.paymentLabel),
      validityLabel: asText(raw.validityLabel),
      footerText: asText(raw.footerText),
    });

    await recordUsage({
      tenantId: tenant.id,
      userId: user?.id,
      operation: "EXTRACTION",
      provider: result.provider,
      model: result.model,
      usage: result.usage,
    });

    return NextResponse.json({
      name: asText(raw.name) ?? "Formato importado",
      config,
    });
  } catch (err) {
    if (err instanceof AiNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return apiError(err);
  }
}
