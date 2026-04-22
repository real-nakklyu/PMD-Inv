import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getServiceClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing server-side Supabase environment variables.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.toLowerCase().startsWith("bearer ")) return null;
  return authorization.slice("bearer ".length);
}

export async function GET(request: NextRequest) {
  const token = bearerToken(request);
  if (!token) {
    return NextResponse.json({ detail: "Missing Supabase bearer token." }, { status: 401 });
  }

  const supabase = getServiceClient();
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) {
    return NextResponse.json({ detail: "Invalid Supabase bearer token." }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", authData.user.id)
    .maybeSingle();
  const { count } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true });
  const { data: accessRequest } = await supabase
    .from("staff_access_requests")
    .select("*")
    .eq("user_id", authData.user.id)
    .maybeSingle();

  return NextResponse.json({
    auth_user: { id: authData.user.id, email: authData.user.email ?? null },
    profile,
    needs_profile: profile == null,
    can_bootstrap_admin: profile == null && (count ?? 0) === 0,
    access_request: accessRequest ?? null
  });
}
