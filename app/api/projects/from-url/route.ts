import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/modules/auth/infrastructure/request-auth";
import { createProjectFromUrl } from "@/modules/projects/application/create-project-from-url";
import { createProjectFromUrlRequestSchema } from "@/modules/projects/domain/url-project-creation";

function developmentLog(error: unknown) {
  if (process.env.NODE_ENV !== "development") return;
  console.error("[projects-from-url] creation failed", {
    name: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : String(error),
  });
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Niste prijavljeni." }, { status: 401 });
  }

  const parsed = createProjectFromUrlRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ??
          "Proverite podatke projekta i ponude.",
      },
      { status: 400 },
    );
  }

  try {
    const created = await createProjectFromUrl(
      parsed.data,
      auth.membership.organizationId,
      auth.user.id,
    );
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    developmentLog(error);
    return NextResponse.json(
      { error: "Pretraga nije kreirana. Pokušajte ponovo." },
      { status: 500 },
    );
  }
}
