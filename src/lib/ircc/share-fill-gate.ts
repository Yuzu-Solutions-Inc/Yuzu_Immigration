import { loadShareGateContext } from "@/lib/ircc/project-forms";

export async function loadShareFillGate(token: string) {
  try {
    return await loadShareGateContext(token);
  } catch (err) {
    console.error("loadShareGateContext:", err);
    return null;
  }
}
