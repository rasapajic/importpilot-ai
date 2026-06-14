import { NextRequest, NextResponse } from "next/server";

import {
  createProject,
  listProjects,
} from "@/modules/projects/application/project-service";
import {
  createProjectSchema,
  listProjectsSchema,
} from "@/modules/projects/domain/validation";
import { authenticateRequest } from "@/modules/auth/infrastructure/request-auth";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });

  const result = listProjectsSchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!result.success) {
    return NextResponse.json({ error: "Neispravni filteri." }, { status: 400 });
  }
  return NextResponse.json(
    await listProjects(result.data, auth.membership.organizationId),
  );
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });

  const result = createProjectSchema.safeParse(await request.json().catch(() => null));
  if (!result.success) {
    return NextResponse.json(
      { error: result.error.issues[0]?.message ?? "Neispravni podaci." },
      { status: 400 },
    );
  }
  const project = await createProject(
    result.data,
    auth.membership.organizationId,
    auth.user.id,
  );
  return NextResponse.json(project, { status: 201 });
}

