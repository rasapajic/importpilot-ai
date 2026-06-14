import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/modules/auth/infrastructure/request-auth";
import {
  deleteDemoProject,
  deleteEmptySearchProject,
  DemoProjectNotFoundError,
  EmptySearchProjectDeletionNotAllowedError,
  EmptySearchProjectNotFoundError,
  getProject,
  ProductionProjectDeletionNotAllowedError,
} from "@/modules/projects/application/project-service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });

  const project = await getProject((await params).projectId, auth.membership.organizationId);
  if (!project) return NextResponse.json({ error: "Projekat nije pronađen." }, { status: 404 });

  return NextResponse.json({ id: project.id, exists: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });

  try {
    const projectId = (await params).projectId;
    if (request.nextUrl.searchParams.get("mode") === "empty-search") {
      await deleteEmptySearchProject(projectId, auth.membership.organizationId);
    } else {
      await deleteDemoProject(projectId, auth.membership.organizationId);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof EmptySearchProjectNotFoundError) {
      return NextResponse.json({ error: "Pretraga nije pronađena." }, { status: 404 });
    }
    if (error instanceof EmptySearchProjectDeletionNotAllowedError) {
      return NextResponse.json(
        { error: "Pretraga sadrži korisne podatke i ne može biti obrisana ovde." },
        { status: 403 },
      );
    }
    if (error instanceof DemoProjectNotFoundError) {
      return NextResponse.json({ error: "Demo projekat nije pronađen." }, { status: 404 });
    }
    if (error instanceof ProductionProjectDeletionNotAllowedError) {
      return NextResponse.json(
        { error: "Brisanje je dozvoljeno samo za demo projekte." },
        { status: 403 },
      );
    }
    throw error;
  }
}
