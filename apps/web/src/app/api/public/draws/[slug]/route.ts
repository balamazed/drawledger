import { findDraw, publicDrawView } from "@/lib/repo";
import { HttpError, handle, json } from "@/lib/http";

type Ctx = { params: Promise<{ slug: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const draw = await findDraw({ slug: (await params).slug });
  if (!draw) throw new HttpError(404, "Draw not found");
  return json(await publicDrawView(draw));
});
