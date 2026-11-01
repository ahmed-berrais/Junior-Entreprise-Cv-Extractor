import { spaceLogin } from "@/lib/space-login";
export async function POST(request: Request) { return spaceLogin(request, "company"); }
