import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { BudgetBlock, GeneratedBudgetPayload } from "@/types/budget";
import { formatDate, formatMoney } from "@/lib/format";
import type { DocumentBranding } from "@/lib/docx/branding";
import { scaleFirma } from "@/types/signer";

/**
 * Export a PDF directo (Fase 3) con @react-pdf/renderer en el servidor.
 * Mismo contenido que el .docx; muchos rubros no usan Word y necesitan el PDF
 * listo para mandar.
 */

function makeStyles(branding: DocumentBranding) {
  return StyleSheet.create({
    page: {
      paddingTop: 48,
      paddingBottom: 56,
      paddingHorizontal: 52,
      fontSize: 10,
      fontFamily: "Helvetica",
      color: "#23363d",
    },
    companyName: {
      fontSize: 13,
      fontFamily: "Helvetica-Bold",
      color: branding.colorPrimary,
    },
    companyLine: { fontSize: 8, color: "#667780", marginTop: 2 },
    headerNote: {
      fontSize: 8,
      color: "#667780",
      marginTop: 8,
      lineHeight: 1.4,
      textAlign: "justify",
    },
    headerRule: {
      borderBottomWidth: 2,
      borderBottomColor: branding.colorSecondary,
      marginTop: 8,
      marginBottom: 18,
    },
    title: {
      fontSize: 18,
      fontFamily: "Helvetica-Bold",
      color: branding.colorPrimary,
      marginBottom: 4,
    },
    concepto: {
      fontSize: 11,
      fontFamily: "Helvetica-Bold",
      color: branding.colorSecondary,
      marginBottom: 2,
    },
    date: { fontSize: 9, color: "#667780", marginBottom: 16 },
    imagenBloque: { marginTop: 8, marginBottom: 4, alignSelf: "center" },
    imagenLeyenda: {
      fontSize: 8,
      fontFamily: "Helvetica-Oblique",
      color: "#667780",
      textAlign: "center",
      marginBottom: 10,
    },
    h1: {
      fontSize: 13,
      fontFamily: "Helvetica-Bold",
      color: branding.colorPrimary,
      marginTop: 12,
      marginBottom: 6,
    },
    h2: {
      fontSize: 11,
      fontFamily: "Helvetica-Bold",
      color: branding.colorSecondary,
      marginTop: 10,
      marginBottom: 4,
    },
    paragraph: { marginBottom: 6, lineHeight: 1.45, textAlign: "justify" },
    listItem: { flexDirection: "row", marginBottom: 3 },
    bullet: { width: 12 },
    listText: { flex: 1, lineHeight: 1.4 },
    table: { marginTop: 4, marginBottom: 10 },
    tableHeader: {
      flexDirection: "row",
      backgroundColor: branding.colorPrimary,
    },
    tableHeaderCell: {
      flex: 1,
      padding: 5,
      fontSize: 9,
      fontFamily: "Helvetica-Bold",
      color: "#ffffff",
    },
    tableRow: {
      flexDirection: "row",
      borderBottomWidth: 0.5,
      borderBottomColor: "#d7e0e3",
    },
    tableCell: { flex: 1, padding: 5, fontSize: 9 },
    summaryRule: {
      borderTopWidth: 2,
      borderTopColor: branding.colorSecondary,
      marginTop: 18,
      marginBottom: 10,
    },
    total: {
      fontSize: 13,
      fontFamily: "Helvetica-Bold",
      marginBottom: 6,
    },
    totalValue: { color: branding.colorPrimary },
    summaryLine: { fontSize: 10, marginBottom: 3 },
    summaryLabel: { fontFamily: "Helvetica-Bold" },
    footer: {
      position: "absolute",
      bottom: 24,
      left: 52,
      right: 52,
      fontSize: 7,
      color: "#8aa3ab",
      textAlign: "center",
    },
    signersRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-around",
      marginTop: 36,
    },
    signerBox: {
      width: "30%",
      alignItems: "center",
      marginBottom: 14,
    },
    signerLine: { fontSize: 10, marginTop: 28, marginBottom: 4 },
    signerName: { fontSize: 9, fontFamily: "Helvetica-Bold", marginTop: 4 },
    signerRole: { fontSize: 8, color: "#667780", marginTop: 2 },
  });
}

type Styles = ReturnType<typeof makeStyles>;

function renderBlock(
  block: BudgetBlock,
  index: number,
  styles: Styles,
): React.ReactElement {
  switch (block.type) {
    case "titulo":
      return (
        <Text key={index} style={styles.h1}>
          {block.texto}
        </Text>
      );
    case "subtitulo":
      return (
        <Text key={index} style={styles.h2}>
          {block.texto}
        </Text>
      );
    case "parrafo":
      return (
        <Text key={index} style={styles.paragraph}>
          {block.texto}
        </Text>
      );
    case "lista":
      return (
        <View key={index}>
          {block.items.map((item, i) => (
            <View key={i} style={styles.listItem}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.listText}>{item}</Text>
            </View>
          ))}
        </View>
      );
    case "tabla":
      return (
        <View key={index} style={styles.table}>
          <View style={styles.tableHeader}>
            {block.encabezados.map((h, i) => (
              <Text key={i} style={styles.tableHeaderCell}>
                {h}
              </Text>
            ))}
          </View>
          {block.filas.map((fila, i) => (
            <View key={i} style={styles.tableRow}>
              {block.encabezados.map((_, j) => (
                <Text key={j} style={styles.tableCell}>
                  {fila[j] ?? ""}
                </Text>
              ))}
            </View>
          ))}
        </View>
      );
    case "imagen": {
      const dims = scaleFirma(
        { dataUrl: block.base64, width: block.width, height: block.height },
        400,
        320,
      );
      return (
        <View key={index}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- Image de @react-pdf, no admite alt */}
          <Image src={block.base64} style={[styles.imagenBloque, dims]} />
          {block.leyenda && (
            <Text style={styles.imagenLeyenda}>{block.leyenda}</Text>
          )}
        </View>
      );
    }
  }
}

function BudgetPdf({
  payload,
  branding,
  createdAt,
}: {
  payload: GeneratedBudgetPayload;
  branding: DocumentBranding;
  createdAt: Date;
}): React.ReactElement {
  const styles = makeStyles(branding);
  return (
    <Document title={payload.titulo} creator="CotizaAI">
      <Page size="A4" style={styles.page}>
        <Text style={styles.companyName}>{branding.companyName}</Text>
        {branding.companyLines.map((line, i) => (
          <Text key={i} style={styles.companyLine}>
            {line}
          </Text>
        ))}
        <View style={styles.headerRule} />

        <Text style={styles.title}>
          {branding.documentTitlePrefix}
          {payload.titulo}
        </Text>
        {payload.concepto && (
          <Text style={styles.concepto}>{payload.concepto}</Text>
        )}
        <Text style={styles.date}>
          {[
            payload.ubicacion ? `Ubicación: ${payload.ubicacion}` : null,
            `Fecha: ${
              payload.fecha
                ? formatDate(new Date(payload.fecha), branding.locale)
                : formatDate(createdAt, branding.locale)
            }`,
          ]
            .filter((l): l is string => l !== null)
            .join("   ·   ")}
        </Text>
        {branding.headerNote && (
          <Text style={styles.headerNote}>{branding.headerNote}</Text>
        )}

        {payload.cuerpo.map((block, i) => renderBlock(block, i, styles))}

        {(payload.cotizacionTotal !== null ||
          payload.formaPago ||
          payload.validezDias !== null) && (
          <View>
            <View style={styles.summaryRule} />
            {payload.cotizacionTotal !== null && (
              <Text style={styles.total}>
                {branding.totalLabel}:{" "}
                <Text style={styles.totalValue}>
                  {formatMoney(
                    payload.cotizacionTotal,
                    payload.moneda,
                    branding.locale,
                  )}
                </Text>
              </Text>
            )}
            {payload.formaPago && (
              <Text style={styles.summaryLine}>
                <Text style={styles.summaryLabel}>
                  {branding.paymentLabel}:{" "}
                </Text>
                {payload.formaPago}
              </Text>
            )}
            {payload.validezDias !== null && (
              <Text style={styles.summaryLine}>
                <Text style={styles.summaryLabel}>
                  {branding.validityLabel}:{" "}
                </Text>
                {payload.validezDias} días
              </Text>
            )}
          </View>
        )}

        {branding.showSignatures && branding.signers.length > 0 && (
          <View style={styles.signersRow} wrap={false}>
            {branding.signers.map((s) => (
              <View key={s.id} style={styles.signerBox}>
                {s.firma ? (
                  // eslint-disable-next-line jsx-a11y/alt-text -- Image de @react-pdf, no admite alt
                  <Image
                    src={s.firma.dataUrl}
                    style={scaleFirma(s.firma, 52, 130)}
                  />
                ) : (
                  <Text style={styles.signerLine}>____________________</Text>
                )}
                <Text style={styles.signerName}>{s.nombre}</Text>
                {s.cargo && <Text style={styles.signerRole}>{s.cargo}</Text>}
              </View>
            ))}
          </View>
        )}

        <Text style={styles.footer} fixed>
          {branding.footerText}
        </Text>
      </Page>
    </Document>
  );
}

export async function buildBudgetPdf(params: {
  payload: GeneratedBudgetPayload;
  branding: DocumentBranding;
  createdAt: Date;
}): Promise<Buffer> {
  return renderToBuffer(
    <BudgetPdf
      payload={params.payload}
      branding={params.branding}
      createdAt={params.createdAt}
    />,
  );
}
