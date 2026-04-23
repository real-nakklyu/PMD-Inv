import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import QRCode from "qrcode";

import { env } from "@/src/lib/env";
import { currency, humanize } from "@/src/lib/format";
import type { EquipmentDetailData } from "@/src/types/domain";

export type LabelPatient = {
  id: string;
  full_name: string;
  date_of_birth: string;
  region: string;
  assigned_at: string;
} | null;

export function getCurrentAssignedPatient(detail: EquipmentDetailData | null): LabelPatient {
  const assignment = detail?.assignments.find(
    (item) => item.status === "active" || item.status === "return_in_progress"
  );
  if (!assignment?.patients) return null;

  return {
    assigned_at: assignment.assigned_at,
    date_of_birth: assignment.patients.date_of_birth,
    full_name: assignment.patients.full_name,
    id: assignment.patient_id,
    region: assignment.patients.region,
  };
}

export function getEquipmentRecordUrl(equipmentId: string) {
  const origin = env.apiUrl.replace(/\/api\/?$/, "");
  return `${origin}/equipment/${equipmentId}`;
}

export async function createEquipmentLabelQrDataUrl(equipmentId: string) {
  return QRCode.toDataURL(getEquipmentRecordUrl(equipmentId), {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 500,
  });
}

export async function shareEquipmentLabelPdf(detail: EquipmentDetailData) {
  const html = await buildEquipmentLabelHtml(detail);
  const file = await Print.printToFileAsync({
    html,
    margins: {
      bottom: 24,
      left: 24,
      right: 24,
      top: 24,
    },
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      UTI: ".pdf",
      mimeType: "application/pdf",
    });
  }

  return file.uri;
}

export async function printEquipmentLabel(detail: EquipmentDetailData) {
  const html = await buildEquipmentLabelHtml(detail);
  await Print.printAsync({ html });
}

async function buildEquipmentLabelHtml(detail: EquipmentDetailData) {
  const { equipment } = detail;
  const patient = getCurrentAssignedPatient(detail);
  const equipmentUrl = getEquipmentRecordUrl(equipment.id);
  const qrDataUrl = await createEquipmentLabelQrDataUrl(equipment.id);
  const notes = equipment.notes?.trim() || "No equipment notes recorded.";

  return `<!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
      <style>
        @page { margin: 28px; }
        * { box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif;
          color: #1f2937;
          margin: 0;
          background: #f8fafc;
        }
        .sheet {
          border: 1px solid #dbe3ef;
          border-radius: 28px;
          overflow: hidden;
          background: white;
        }
        .hero {
          background: linear-gradient(135deg, #0f766e, #115e59);
          color: white;
          padding: 28px 30px 24px;
        }
        .eyebrow {
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.12em;
          opacity: 0.8;
          text-transform: uppercase;
        }
        .serial {
          font-size: 30px;
          font-weight: 800;
          margin-top: 10px;
        }
        .model {
          font-size: 16px;
          margin-top: 6px;
          opacity: 0.95;
        }
        .chips {
          margin-top: 18px;
        }
        .chip {
          display: inline-block;
          background: rgba(255,255,255,0.16);
          border-radius: 999px;
          padding: 7px 12px;
          margin-right: 8px;
          margin-bottom: 8px;
          font-size: 12px;
          font-weight: 700;
        }
        .content {
          display: table;
          width: 100%;
        }
        .qrCol, .infoCol {
          display: table-cell;
          vertical-align: top;
          padding: 28px;
        }
        .qrCol {
          width: 230px;
          border-right: 1px solid #e5e7eb;
        }
        .qrBox {
          border: 1px solid #dbe3ef;
          border-radius: 24px;
          padding: 16px;
          text-align: center;
          background: #fff;
        }
        .qrBox img {
          width: 170px;
          height: 170px;
        }
        .scanLabel {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.12em;
          color: #64748b;
          text-transform: uppercase;
          margin-top: 12px;
        }
        .url {
          font-size: 11px;
          color: #64748b;
          word-break: break-all;
          margin-top: 12px;
        }
        h2 {
          color: #0f766e;
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          margin: 0 0 12px;
          padding-bottom: 8px;
          border-bottom: 1px solid #dbe3ef;
        }
        .grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px 16px;
          margin-bottom: 22px;
        }
        .label {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #64748b;
          margin-bottom: 4px;
        }
        .value {
          font-size: 13px;
          line-height: 1.45;
          color: #1f2937;
        }
        .note {
          font-size: 13px;
          line-height: 1.6;
          color: #475569;
        }
        .footer {
          border-top: 1px solid #e5e7eb;
          color: #64748b;
          font-size: 10px;
          padding: 14px 28px 20px;
        }
      </style>
    </head>
    <body>
      <div class="sheet">
        <div class="hero">
          <div class="eyebrow">PMDInv Equipment Label</div>
          <div class="serial">${escapeHtml(equipment.serial_number)}</div>
          <div class="model">${escapeHtml(equipment.make)} ${escapeHtml(equipment.model)}</div>
          <div class="chips">
            <span class="chip">${escapeHtml(humanize(equipment.equipment_type))}</span>
            <span class="chip">${escapeHtml(humanize(equipment.status))}</span>
            <span class="chip">${escapeHtml(equipment.region)}</span>
          </div>
        </div>

        <div class="content">
          <div class="qrCol">
            <div class="qrBox">
              <img src="${qrDataUrl}" alt="QR code for ${escapeHtml(equipment.serial_number)}" />
              <div class="scanLabel">Scan to open equipment record</div>
            </div>
            <div class="url">${escapeHtml(equipmentUrl)}</div>
          </div>

          <div class="infoCol">
            <h2>Equipment Information</h2>
            <div class="grid">
              ${infoCell("Serial Number", equipment.serial_number)}
              ${infoCell("Type", humanize(equipment.equipment_type))}
              ${infoCell("Make", equipment.make)}
              ${infoCell("Model", equipment.model)}
              ${infoCell("Current Status", humanize(equipment.status))}
              ${infoCell("Current Region", equipment.region)}
              ${infoCell("Bought Price", currency(Number(equipment.bought_price)))}
              ${infoCell("Added", new Date(equipment.added_at).toLocaleString())}
              ${infoCell(
                "Assigned At",
                equipment.assigned_at
                  ? new Date(equipment.assigned_at).toLocaleString()
                  : "Not assigned"
              )}
              ${infoCell("Completed Repairs", `${detail.repair_count} completed`)}
            </div>

            <h2>Assigned Patient</h2>
            ${
              patient
                ? `<div class="grid">
                    ${infoCell("Full Name", patient.full_name)}
                    ${infoCell("Date of Birth", new Date(patient.date_of_birth).toLocaleDateString())}
                    ${infoCell("Patient Region", patient.region)}
                    ${infoCell("Assigned Date", new Date(patient.assigned_at).toLocaleString())}
                  </div>`
                : `<div class="note">No patient is currently assigned to this equipment.</div>`
            }

            <h2>Operational Notes</h2>
            <div class="note">${escapeHtml(notes)}</div>
          </div>
        </div>

        <div class="footer">
          Generated ${escapeHtml(new Date().toLocaleString())} / ${escapeHtml(equipmentUrl)}
        </div>
      </div>
    </body>
  </html>`;
}

function infoCell(label: string, value: string) {
  return `<div><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(
    value || "empty"
  )}</div></div>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
