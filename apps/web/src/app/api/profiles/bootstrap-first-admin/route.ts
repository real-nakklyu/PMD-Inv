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

export async function POST(request: NextRequest) {
  const token = bearerToken(request);
  if (!token) {
    return NextResponse.json({ detail: "Missing Supabase bearer token." }, { status: 401 });
  }

  const body = (await request.json()) as { full_name?: string };
  const fullName = body.full_name?.trim();
  if (!fullName || fullName.length < 2) {
    return NextResponse.json({ detail: "Full name is required." }, { status: 422 });
  }

  const supabase = getServiceClient();
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) {
    return NextResponse.json({ detail: "Invalid Supabase bearer token." }, { status: 401 });
  }

  const { count, error: countError } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true });
  if (countError) {
    return NextResponse.json({ detail: countError.message }, { status: 400 });
  }
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { detail: "First admin bootstrap is only available before any profiles exist." },
      { status: 409 }
    );
  }

  const { data, error } = await supabase
    .from("profiles")
    .insert({ id: authData.user.id, full_name: fullName, role: "admin" })
    .select("*")
    .single();
  if (error) {
    return NextResponse.json({ detail: error.message }, { status: 400 });
  }

  return NextResponse.json(data, { status: 201 });
}
