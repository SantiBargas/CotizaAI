import { NextResponse } from "next/server";
import { apiError, requireTenantContext } from "@/lib/api";
import { syncIndecIndices } from "@/lib/inflation";

export const maxDuration = 60;

/**
 * POST /api/inflacion/sync — sincroniza IPC INDEC (AR/ARS) desde
 * apis.datos.gob.ar. Los índices son compartidos entre tenants (dato público),
 * pero la sincronización exige sesión válida.
 */
export async function POST(): Promise<NextResponse> {
  try {
    await requireTenantContext();
    const result = await syncIndecIndices();
    return NextResponse.json(result);
  } catch (err) {
    return apiError(err);
  }
}
