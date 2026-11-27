import { updateTask, deleteTask } from "@/lib/mutations";
import { handle } from "../../_util";
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const b = await req.json(); return handle(() => updateTask(Number(id), b));
}
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; return handle(() => deleteTask(Number(id)));
}
