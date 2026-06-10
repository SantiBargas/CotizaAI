import type { NextRequest } from "next/server";
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { prisma } from "@/lib/prisma";
import { MembershipRole } from "@prisma/client";

/**
 * Webhook de Clerk → espejo Tenant/User/Membership en nuestra DB.
 * Configurar en Clerk Dashboard apuntando a /api/webhooks/clerk con los eventos:
 * user.*, organization.*, organizationMembership.*
 *
 * La firma se verifica con CLERK_WEBHOOK_SIGNING_SECRET.
 */

interface ClerkUserData {
  id: string;
  email_addresses?: { id: string; email_address: string }[];
  primary_email_address_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  image_url?: string | null;
}

interface ClerkOrgData {
  id: string;
  name: string;
  slug?: string | null;
}

interface ClerkMembershipData {
  organization: { id: string };
  public_user_data: { user_id: string };
  role: string; // "org:admin" | "org:member" | ...
}

function fullName(d: ClerkUserData): string | null {
  const name = [d.first_name, d.last_name].filter(Boolean).join(" ").trim();
  return name.length > 0 ? name : null;
}

function primaryEmail(d: ClerkUserData): string | null {
  const list = d.email_addresses ?? [];
  const primary = list.find((e) => e.id === d.primary_email_address_id);
  return (primary ?? list[0])?.email_address ?? null;
}

function mapRole(clerkRole: string): MembershipRole {
  return clerkRole.includes("admin")
    ? MembershipRole.ADMIN
    : MembershipRole.MEMBER;
}

async function upsertUser(d: ClerkUserData): Promise<void> {
  const email = primaryEmail(d);
  if (!email) return;
  await prisma.user.upsert({
    where: { clerkUserId: d.id },
    create: {
      clerkUserId: d.id,
      email,
      name: fullName(d),
      imageUrl: d.image_url ?? null,
    },
    update: { email, name: fullName(d), imageUrl: d.image_url ?? null },
  });
}

async function upsertTenant(d: ClerkOrgData): Promise<void> {
  const slug = d.slug ?? d.id;
  await prisma.tenant.upsert({
    where: { clerkOrgId: d.id },
    create: { clerkOrgId: d.id, name: d.name, slug },
    update: { name: d.name, slug },
  });
}

async function upsertMembership(d: ClerkMembershipData): Promise<void> {
  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: d.organization.id },
    select: { id: true },
  });
  const user = await prisma.user.findUnique({
    where: { clerkUserId: d.public_user_data.user_id },
    select: { id: true },
  });
  if (!tenant || !user) return; // los eventos de user/org pueden llegar después
  const role = mapRole(d.role);
  await prisma.membership.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
    create: { tenantId: tenant.id, userId: user.id, role },
    update: { role },
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  let evt;
  try {
    evt = await verifyWebhook(req);
  } catch {
    return new Response("Firma de webhook inválida", { status: 400 });
  }

  try {
    switch (evt.type) {
      case "user.created":
      case "user.updated":
        await upsertUser(evt.data as unknown as ClerkUserData);
        break;
      case "user.deleted": {
        const id = (evt.data as { id?: string }).id;
        if (id)
          await prisma.user.deleteMany({ where: { clerkUserId: id } });
        break;
      }
      case "organization.created":
      case "organization.updated":
        await upsertTenant(evt.data as unknown as ClerkOrgData);
        break;
      case "organization.deleted": {
        const id = (evt.data as { id?: string }).id;
        if (id)
          await prisma.tenant.deleteMany({ where: { clerkOrgId: id } });
        break;
      }
      case "organizationMembership.created":
      case "organizationMembership.updated":
        await upsertMembership(evt.data as unknown as ClerkMembershipData);
        break;
      case "organizationMembership.deleted": {
        const d = evt.data as unknown as ClerkMembershipData;
        const tenant = await prisma.tenant.findUnique({
          where: { clerkOrgId: d.organization.id },
          select: { id: true },
        });
        const user = await prisma.user.findUnique({
          where: { clerkUserId: d.public_user_data.user_id },
          select: { id: true },
        });
        if (tenant && user)
          await prisma.membership.deleteMany({
            where: { tenantId: tenant.id, userId: user.id },
          });
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error("Error procesando webhook de Clerk:", err);
    return new Response("Error interno", { status: 500 });
  }

  return new Response("ok", { status: 200 });
}
