import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
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
import { scaleFirma, type Signer } from "@/types/signer";

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

const IMAGEN_MAX_ANCHO_PX = 400;
const IMAGEN_MAX_ALTO_PX = 500;

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
    case "imagen": {
      const { data, type } = firmaBuffer(block.base64);
      const dims = scaleFirma(
        { dataUrl: block.base64, width: block.width, height: block.height },
        IMAGEN_MAX_ALTO_PX,
        IMAGEN_MAX_ANCHO_PX,
      );
      return [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 160, after: block.leyenda ? 40 : 140 },
          children: [new ImageRun({ type, data, transformation: dims })],
        }),
        ...(block.leyenda
          ? [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 140 },
                children: [
                  new TextRun({
                    text: block.leyenda,
                    italics: true,
                    size: 18,
                    color: "667780",
                  }),
                ],
              }),
            ]
          : []),
      ];
    }
  }
}

const MAX_FIRMAS_POR_FILA = 3;
const FIRMA_MAX_ALTO_PX = 70;
const FIRMA_MAX_ANCHO_PX = 170;

function firmaBuffer(dataUrl: string): { data: Buffer; type: "png" | "jpg" } {
  const [, mime, base64] = /^data:image\/(png|jpeg);base64,(.*)$/.exec(
    dataUrl,
  ) ?? [undefined, "png", ""];
  return {
    data: Buffer.from(base64 ?? "", "base64"),
    type: mime === "jpeg" ? "jpg" : "png",
  };
}

/** Celda de un firmante: imagen (o línea para rubricar) + nombre + cargo. */
function signerCell(signer: Signer | null): TableCell {
  const children: Paragraph[] = [];
  if (signer) {
    if (signer.firma) {
      const { data, type } = firmaBuffer(signer.firma.dataUrl);
      const dims = scaleFirma(
        signer.firma,
        FIRMA_MAX_ALTO_PX,
        FIRMA_MAX_ANCHO_PX,
      );
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 60 },
          children: [
            new ImageRun({ type, data, transformation: dims }),
          ],
        }),
      );
    } else {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 480, after: 60 },
          children: [
            new TextRun({ text: "______________________", size: 22 }),
          ],
        }),
      );
    }
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 20 },
        children: [new TextRun({ text: signer.nombre, bold: true, size: 21 })],
      }),
    );
    if (signer.cargo) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: signer.cargo, size: 18, color: "667780" }),
          ],
        }),
      );
    }
  } else {
    children.push(new Paragraph({ children: [] }));
  }
  return new TableCell({
    borders: {
      top: { style: BorderStyle.NONE },
      bottom: { style: BorderStyle.NONE },
      left: { style: BorderStyle.NONE },
      right: { style: BorderStyle.NONE },
    },
    margins: { top: 120, bottom: 120, left: 120, right: 120 },
    width: {
      size: Math.floor(100 / MAX_FIRMAS_POR_FILA),
      type: WidthType.PERCENTAGE,
    },
    children,
  });
}

/** Bloque de firmas al cierre (hasta 3 por fila, layout heredado de ITZA). */
function signatureSection(branding: DocumentBranding): (Paragraph | Table)[] {
  if (!branding.showSignatures || branding.signers.length === 0) return [];
  const rows: TableRow[] = [];
  for (let i = 0; i < branding.signers.length; i += MAX_FIRMAS_POR_FILA) {
    const fila = branding.signers.slice(i, i + MAX_FIRMAS_POR_FILA);
    rows.push(
      new TableRow({
        children: Array.from({ length: MAX_FIRMAS_POR_FILA }, (_, c) =>
          signerCell(fila[c] ?? null),
        ),
      }),
    );
  }
  return [
    new Paragraph({ spacing: { before: 560 }, children: [] }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows,
    }),
  ];
}

export async function buildBudgetDocx(params: {
  payload: GeneratedBudgetPayload;
  branding: DocumentBranding;
  createdAt: Date;
}): Promise<Buffer> {
  const { payload, branding, createdAt } = params;

  // Membrete: logo (si hay) + nombre + líneas de contacto.
  const headerChildren: Paragraph[] = [];
  const logo = branding.showLogo ? await fetchLogo(branding) : null;
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
          text: `${branding.documentTitlePrefix}${payload.titulo}`,
          bold: true,
          size: 36,
          color: hex(branding.colorPrimary),
        }),
      ],
    }),
    ...(payload.concepto
      ? [
          new Paragraph({
            spacing: { after: 40 },
            children: [
              new TextRun({
                text: payload.concepto,
                bold: true,
                size: 22,
                color: hex(branding.colorSecondary),
              }),
            ],
          }),
        ]
      : []),
    new Paragraph({
      spacing: { after: branding.headerNote ? 80 : 280 },
      children: [
        new TextRun({
          text: [
            payload.ubicacion ? `Ubicación: ${payload.ubicacion}` : null,
            `Fecha: ${
              payload.fecha
                ? formatDate(new Date(payload.fecha), branding.locale)
                : formatDate(createdAt, branding.locale)
            }`,
          ]
            .filter((l): l is string => l !== null)
            .join("  ·  "),
          size: 20,
          color: "667780",
        }),
      ],
    }),
    ...(branding.headerNote
      ? [
          new Paragraph({
            spacing: { after: 280 },
            alignment: AlignmentType.JUSTIFIED,
            children: [
              new TextRun({
                text: branding.headerNote,
                italics: true,
                size: 20,
                color: "667780",
              }),
            ],
          }),
        ]
      : []),
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
            new TextRun({
              text: `${branding.totalLabel}: `,
              bold: true,
              size: 26,
            }),
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
            new TextRun({
              text: `${branding.paymentLabel}: `,
              bold: true,
              size: 22,
            }),
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
            new TextRun({
              text: `${branding.validityLabel}: `,
              bold: true,
              size: 22,
            }),
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
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: branding.footerText,
                    size: 16,
                    color: "8aa3ab",
                  }),
                ],
              }),
            ],
          }),
        },
        children: [
          ...headerChildren,
          ...titleChildren,
          ...body,
          ...summary,
          ...signatureSection(branding),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
