import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { GeneratedBudgetPayload, BudgetBlock } from "@/types/budget";
import { formatMoney, formatDate } from "@/lib/format";
import { fetchLogo, type DocumentBranding } from "@/lib/docx/branding";

/**
 * Export a Word (.docx) con branding por tenant (Fase 3).
 * Membrete con logo + datos de la empresa, cuerpo desde los bloques tipados,
 * resumen comercial (total/forma de pago/validez) al cierre.
 * El LLM nunca genera firmas: el documento cierra limpio para que la empresa
 * firme/edite como quiera.
 */

function hex(color: string): string {
  return color.replace("#", "");
}

function blockToDocx(block: BudgetBlock, branding: DocumentBranding): (Paragraph | Table)[] {
  switch (block.type) {
    case "titulo":
      return [
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 280, after: 160 },
          children: [
            new TextRun({
              text: block.texto,
              bold: true,
              color: hex(branding.colorPrimary),
              size: 30,
            }),
          ],
        }),
      ];
    case "subtitulo":
      return [
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 220, after: 120 },
          children: [
            new TextRun({
              text: block.texto,
              bold: true,
              color: hex(branding.colorSecondary),
              size: 25,
            }),
          ],
        }),
      ];
    case "parrafo":
      return [
        new Paragraph({
          spacing: { after: 140 },
          alignment: AlignmentType.JUSTIFIED,
          children: [new TextRun({ text: block.texto, size: 22 })],
        }),
      ];
    case "lista":
      return block.items.map(
        (item) =>
          new Paragraph({
            bullet: { level: 0 },
            spacing: { after: 60 },
            children: [new TextRun({ text: item, size: 22 })],
          }),
      );
    case "tabla": {
      const headerRow = new TableRow({
        tableHeader: true,
        children: block.encabezados.map(
          (h) =>
            new TableCell({
              shading: { fill: hex(branding.colorPrimary) },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: h,
                      bold: true,
                      color: "FFFFFF",
                      size: 21,
                    }),
                  ],
                }),
              ],
            }),
        ),
      });
      const bodyRows = block.filas.map(
        (fila) =>
          new TableRow({
            children: block.encabezados.map(
              (_, j) =>
                new TableCell({
                  margins: { top: 60, bottom: 60, left: 120, right: 120 },
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({ text: fila[j] ?? "", size: 21 }),
                      ],
                    }),
                  ],
                }),
            ),
          }),
      );
      return [
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [headerRow, ...bodyRows],
        }),
        new Paragraph({ spacing: { after: 140 }, children: [] }),
      ];
    }
  }
}

export async function buildBudgetDocx(params: {
  payload: GeneratedBudgetPayload;
  branding: DocumentBranding;
  createdAt: Date;
}): Promise<Buffer> {
  const { payload, branding, createdAt } = params;

  // Membrete: logo (si hay) + nombre + líneas de contacto.
  const headerChildren: Paragraph[] = [];
  const logo = await fetchLogo(branding);
  if (logo) {
    headerChildren.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [
          new ImageRun({
            type: logo.type,
            data: logo.data,
            transformation: { width: 140, height: 60 },
          }),
        ],
      }),
    );
  }
  headerChildren.push(
    new Paragraph({
      spacing: { after: 40 },
      children: [
        new TextRun({
          text: branding.companyName,
          bold: true,
          size: 26,
          color: hex(branding.colorPrimary),
        }),
      ],
    }),
    ...branding.companyLines.map(
      (line) =>
        new Paragraph({
          spacing: { after: 20 },
          children: [new TextRun({ text: line, size: 18, color: "667780" })],
        }),
    ),
    new Paragraph({
      spacing: { after: 240 },
      border: {
        bottom: {
          style: BorderStyle.SINGLE,
          size: 8,
          color: hex(branding.colorSecondary),
        },
      },
      children: [],
    }),
  );

  // Título + fecha.
  const titleChildren: Paragraph[] = [
    new Paragraph({
      spacing: { after: 60 },
      children: [
        new TextRun({
          text: payload.titulo,
          bold: true,
          size: 36,
          color: hex(branding.colorPrimary),
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 280 },
      children: [
        new TextRun({
          text: `Fecha: ${formatDate(createdAt, branding.locale)}`,
          size: 20,
          color: "667780",
        }),
      ],
    }),
  ];

  // Cuerpo desde los bloques.
  const body = payload.cuerpo.flatMap((b) => blockToDocx(b, branding));

  // Resumen comercial al cierre.
  const summary: Paragraph[] = [];
  if (
    payload.cotizacionTotal !== null ||
    payload.formaPago ||
    payload.validezDias !== null
  ) {
    summary.push(
      new Paragraph({
        spacing: { before: 320, after: 120 },
        border: {
          top: {
            style: BorderStyle.SINGLE,
            size: 8,
            color: hex(branding.colorSecondary),
          },
        },
        children: [],
      }),
    );
    if (payload.cotizacionTotal !== null) {
      summary.push(
        new Paragraph({
          spacing: { after: 80 },
          children: [
            new TextRun({ text: "Total cotizado: ", bold: true, size: 26 }),
            new TextRun({
              text: formatMoney(
                payload.cotizacionTotal,
                payload.moneda,
                branding.locale,
              ),
              bold: true,
              size: 26,
              color: hex(branding.colorPrimary),
            }),
          ],
        }),
      );
    }
    if (payload.formaPago) {
      summary.push(
        new Paragraph({
          spacing: { after: 60 },
          children: [
            new TextRun({ text: "Forma de pago: ", bold: true, size: 22 }),
            new TextRun({ text: payload.formaPago, size: 22 }),
          ],
        }),
      );
    }
    if (payload.validezDias !== null) {
      summary.push(
        new Paragraph({
          spacing: { after: 60 },
          children: [
            new TextRun({ text: "Validez de la oferta: ", bold: true, size: 22 }),
            new TextRun({ text: `${payload.validezDias} días`, size: 22 }),
          ],
        }),
      );
    }
  }

  const doc = new Document({
    creator: "CotizaAI",
    title: payload.titulo,
    styles: {
      default: {
        document: { run: { font: "Calibri" } },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1000, bottom: 1000, left: 1100, right: 1100 },
          },
        },
        children: [...headerChildren, ...titleChildren, ...body, ...summary],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
