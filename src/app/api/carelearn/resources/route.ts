import { NextResponse } from "next/server";
import { careLearnResources } from "@/lib/seed";
import type { Role } from "@/lib/types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const role = searchParams.get("role") as Role | null;
  const useCase = searchParams.get("use_case");
  const filtered = careLearnResources.filter((resource) => {
    const roleMatch = role ? resource.role.includes(role) : true;
    const useCaseMatch = useCase ? resource.use_case === useCase || resource.use_case === "communication" : true;
    return roleMatch && useCaseMatch;
  });
  return NextResponse.json(filtered);
}
