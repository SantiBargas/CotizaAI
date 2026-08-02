import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

/**
 * Raíz de apps/app. El marketing vive en apps/web; acá solo decidimos a
 * dónde mandar según sesión.
 */
export default async function RootPage(): Promise<never> {
  const { userId } = await auth();
  redirect(userId ? "/dashboard" : "/ingresar");
}
