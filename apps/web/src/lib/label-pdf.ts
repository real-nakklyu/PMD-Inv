import QRCode from "qrcode";
import { jsPDF } from "jspdf";

import { currency, humanize } from "@/lib/utils";
import type { Assignment, Equipment, EquipmentDetailData } from "@/types/domain";

const teal = "#0f766e";
const tealLight = "#ccfbf1";
const slate = "#334155";
const muted = "#64748b";
const border = "#cbd5e1";

export type LabelPatient = {
  id: string;
  full_name: string;
  date_of_birth: string;
  region: string;
  assigned_at: string;
} | null;

export function getCurrentAssignedPatient(detail: EquipmentDetailData | null): LabelPatient {
  const assignment = detail?.assignments.find((item) => item.status === "active" || item.status === "return_in_progress");
  if (!assignment?.patients) return null;
  return {
    id: assignment.patient_id,
    full_name: assignment.patients.full_name,
    date_of_birth: assignment.patients.date_of_birth,
    region: assignment.patients.region,
    assigned_at: assignment.assigned_at
  };
}

export async function downloadEquipmentLabelPdf({
  equipment,
  detail,
  origin
}: {
  equipment: Equipment;
  detail: EquipmentDetailData | null;
  origin: string;
}) {
  const patient = getCurrentAssignedPatient(detail);
  const equipmentUrl = `${origin}/equipment/${equipment.id}`;
  const qrDataUrl = await QRCode.toDataURL(equipmentUrl, { errorCorrectionLevel: "M", margin: 1, width: 500 });
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 42;

  pdf.setFillColor(teal);
  pdf.rect(0, 0, pageWidth, 92, "F");
  pdf.setTextColor("#ffffff");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(24);
  pdf.text("PMDInv Equipment Label", margin, 40);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.text("Florida DME Operations / Power Wheelchair and Scooter Inventory", margin, 62);

  pdf.setFillColor(tealLight);
  pdf.roundedRect(pageWidth - margin - 156, 24, 156, 44, 7, 7, "F");
  pdf.setTextColor(teal);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text("SCAN TO OPEN RECORD", pageWidth - margin - 138, 52);

  const qrSize = 168;
  pdf.addImage(qrDataUrl, "PNG", margin, 124, qrSize, qrSize);
  pdf.setDrawColor(border);
  pdf.roundedRect(margin - 8, 116, qrSize + 16, qrSize + 16, 8, 8, "S");

  pdf.setTextColor(slate);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(28);
  pdf.text(equipment.serial_number, margin + qrSize + 34, 142);
  pdf.setFontSize(18);
  pdf.text(`${equipment.make} ${equipment.model}`, margin + qrSize + 34, 174);

  tag(pdf, humanize(equipment.equipment_type), margin + qrSize + 34, 198);
  tag(pdf, humanize(equipment.status), margin + qrSize + 34, 228);
  tag(pdf, equipment.region, margin + qrSize + 34, 258);

  sectionTitle(pdf, "Equipment Information", margin, 342);
  infoGrid(pdf, margin, 366, [
    ["Serial number", equipment.serial_number],
    ["Type", humanize(equipment.equipment_type)],
    ["Make", equipment.make],
    ["Model", equipment.model],
    ["Current status", humanize(equipment.status)],
    ["Current region", equipment.region],
    ["Bought price", currency(Number(equipment.bought_price))],
    ["Added", new Date(equipment.added_at).toLocaleString()],
    ["Assigned at", equipment.assigned_at ? new Date(equipment.assigned_at).toLocaleString() : "Not assigned"],
    ["Completed repairs", String(detail?.repair_count ?? 0)]
  ]);

  sectionTitle(pdf, "Assigned Patient", margin, 548);
  if (patient) {
    infoGrid(pdf, margin, 572, [
      ["Full name", patient.full_name],
      ["Date of birth", new Date(patient.date_of_birth).toLocaleDateString()],
      ["Patient region", patient.region],
      ["Assigned date", new Date(patient.assigned_at).toLocaleString()]
    ]);
  } else {
    pdf.setTextColor(muted);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(11);
    pdf.text("No patient is currently assigned to this equipment.", margin, 576);
  }

  sectionTitle(pdf, "Operational Notes", margin, 680);
  pdf.setTextColor(slate);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  const notes = equipment.notes?.trim() || "No equipment notes recorded.";
  pdf.text(pdf.splitTextToSize(notes, pageWidth - margin * 2), margin, 704);

  pdf.setDrawColor(border);
  pdf.line(margin, pageHeight - 52, pageWidth - margin, pageHeight - 52);
  pdf.setTextColor(muted);
  pdf.setFontSize(9);
  pdf.text(`Generated ${new Date().toLocaleString()} / ${equipmentUrl}`, margin, pageHeight - 32);

  pdf.save(`pmdinv-label-${equipment.serial_number}.pdf`);
}

function sectionTitle(pdf: jsPDF, title: string, x: number, y: number) {
  pdf.setTextColor(teal);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.text(title, x, y);
  pdf.setDrawColor(teal);
  pdf.line(x, y + 8, x + 170, y + 8);
}

function infoGrid(pdf: jsPDF, x: number, y: number, rows: Array<[string, string]>) {
  const colWidth = 248;
  const rowHeight = 34;
  rows.forEach(([label, value], index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const cellX = x + col * colWidth;
    const cellY = y + row * rowHeight;
    pdf.setTextColor(muted);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.text(label.toUpperCase(), cellX, cellY);
    pdf.setTextColor(slate);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text(pdf.splitTextToSize(value || "empty", colWidth - 18), cellX, cellY + 15);
  });
}

function tag(pdf: jsPDF, label: string, x: number, y: number) {
  pdf.setFillColor(tealLight);
  pdf.roundedRect(x, y - 16, 180, 23, 6, 6, "F");
  pdf.setTextColor(teal);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text(label, x + 10, y);
}
