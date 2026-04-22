import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type ReturnRow = {
  id: string;
  equipment_id: string;
  patient_id: string;
  status: string;
  requested_at: string;
};

const completedStatuses = new Set(["received", "inspected", "restocked", "closed", "cancelled"]);

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

function isAuthorized(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ detail: "Unauthorized cron request." }, { status: 401 });
  }

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("returns")
    .select("id,equipment_id,patient_id,status,requested_at");

  if (error) {
    return NextResponse.json({ detail: error.message }, { status: 500 });
  }

  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const overdue = ((data ?? []) as ReturnRow[]).filter((item) => {
    const requestedAt = new Date(item.requested_at).getTime();
    return !completedStatuses.has(item.status) && now - requestedAt > sevenDaysMs;
  });

  if (!overdue.length) {
    return NextResponse.json({ ok: true, overdue_count: 0, logged_count: 0 });
  }

  const logs = overdue.map((item) => {
    const overdueDays = Math.floor((now - new Date(item.requested_at).getTime()) / (24 * 60 * 60 * 1000));
    return {
      event_type: "return_status_changed",
      equipment_id: item.equipment_id,
      patient_id: item.patient_id,
      return_id: item.id,
      message: `Overdue return reminder: return ${item.id} has been open for ${overdueDays} days.`,
      metadata: { source: "vercel_cron", status: item.status, overdue_days: overdueDays }
    };
  });

  const { error: insertError } = await supabase.from("activity_logs").insert(logs);
  if (insertError) {
    return NextResponse.json({ detail: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, overdue_count: overdue.length, logged_count: logs.length });
}
