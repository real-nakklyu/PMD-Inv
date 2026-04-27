import { jsPDF } from "jspdf";

import { apiGet } from "@/lib/api";
import { humanize } from "@/lib/utils";
import type { DeliverySetupChecklist, OperationalAppointment } from "@/types/domain";

const teal = "#0f766e";
const tealDark = "#134e4a";
const tealLight = "#ccfbf1";
const slate = "#334155";
const muted = "#64748b";
const border = "#cbd5e1";
const soft = "#f8fafc";
const white = "#ffffff";

const checklistRows: Array<[keyof DeliverySetupChecklist, string]> = [
  ["delivered", "Equipment delivered"],
  ["setup_completed", "Setup completed"],
  ["patient_or_caregiver_instructed", "Patient/caregiver instructed"],
  ["safe_operation_reviewed", "Safe operation reviewed"],
  ["troubleshooting_reviewed", "Troubleshooting reviewed"],
  ["cleaning_reviewed", "Cleaning reviewed"],
  ["maintenance_reviewed", "Maintenance reviewed"],
  ["charger_confirmed", "Charger confirmed"],
  ["battery_charged", "Battery charged"],
  ["documents_left", "Documents left with patient"]
];

export async function downloadDeliveryTicketPdf(appointment: OperationalAppointment) {
  const checklist = await loadChecklist(appointment.id);
  const ticketNumber = deliveryTicketNumber(appointment);
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 42;

  drawHeader(pdf, ticketNumber, appointment);

  sectionTitle(pdf, "Delivery Details", margin, 126);
  infoGrid(pdf, margin, 150, [
    ["Ticket number", ticketNumber],
    ["Delivery status", humanize(appointment.status)],
    ["Delivery date/time", new Date(appointment.scheduled_start).toLocaleString()],
    ["Driver", appointment.driver_name || "Not assigned"],
    ["Florida region", appointment.region],
    ["Delivery location", appointment.location_note || "Not recorded"]
  ]);

  sectionTitle(pdf, "Patient / Recipient", margin, 278);
  infoGrid(pdf, margin, 302, [
    ["Full name", appointment.patients?.full_name ?? "Not linked"],
    ["Date of birth", appointment.patients?.date_of_birth ? new Date(appointment.patients.date_of_birth).toLocaleDateString() : "Not linked"],
    ["Patient region", appointment.patients?.region ?? appointment.region],
    ["Recipient / designee", checklist?.signature_name || "To be completed on delivery"]
  ]);

  sectionTitle(pdf, "Equipment Delivered", margin, 408);
  itemTable(pdf, margin, 432, appointment);

  sectionTitle(pdf, "Delivery / Setup Verification", margin, 548);
  checklistTable(pdf, margin, 572, checklist);

  sectionTitle(pdf, "Notes", margin, 666);
  pdf.setTextColor(slate);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  const notes = checklist?.notes?.trim() || appointment.notes?.trim() || "No delivery notes recorded.";
  pdf.text(pdf.splitTextToSize(notes, pageWidth - margin * 2), margin, 690);

  signatureBlock(pdf, margin, pageHeight - 120, checklist);

  pdf.setDrawColor(border);
  pdf.line(margin, pageHeight - 52, pageWidth - margin, pageHeight - 52);
  pdf.setTextColor(muted);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text("PMDInv Florida DME Operations / Delivery ticket generated from schedule record", margin, pageHeight - 32);

  pdf.save(`pmdinv-delivery-ticket-${ticketNumber}.pdf`);
}

export function deliveryTicketNumber(appointment: Pick<OperationalAppointment, "id" | "scheduled_start">) {
  const date = new Date(appointment.scheduled_start);
  const stamp = Number.isNaN(date.getTime())
    ? "000000"
    : `${date.getFullYear().toString().slice(2)}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  return `DT-${stamp}-${appointment.id.slice(0, 6).toUpperCase()}`;
}

async function loadChecklist(appointmentId: string) {
  try {
    const records = await apiGet<DeliverySetupChecklist[]>(`/delivery-checklists?appointment_id=${appointmentId}&limit=1`);
    return records[0] ?? null;
  } catch {
    return null;
  }
}

function drawHeader(pdf: jsPDF, ticketNumber: string, appointment: OperationalAppointment) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 42;

  pdf.setFillColor(teal);
  pdf.rect(0, 0, pageWidth, 94, "F");
  pdf.setTextColor(white);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(24);
  pdf.text("PMDInv Delivery Ticket", margin, 40);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.text("Proof of delivery / Florida DME Operations", margin, 62);

  pdf.setFillColor(tealLight);
  pdf.roundedRect(pageWidth - margin - 176, 24, 176, 44, 7, 7, "F");
  pdf.setTextColor(tealDark);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text(ticketNumber, pageWidth - margin - 158, 43);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text(humanize(appointment.status), pageWidth - margin - 158, 58);
}

function sectionTitle(pdf: jsPDF, title: string, x: number, y: number) {
  pdf.setTextColor(teal);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.text(title, x, y);
  pdf.setDrawColor(teal);
  pdf.line(x, y + 8, x + 176, y + 8);
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
    pdf.text(pdf.splitTextToSize(value || "Not recorded", colWidth - 18), cellX, cellY + 15);
  });
}

function itemTable(pdf: jsPDF, x: number, y: number, appointment: OperationalAppointment) {
  const equipment = appointment.equipment;
  const width = 528;
  const rows = [
    ["Qty", "1"],
    ["Description", equipment ? `${humanize(equipment.equipment_type)} / ${equipment.make} ${equipment.model}` : "Equipment not linked"],
    ["Serial number", equipment?.serial_number ?? "Not linked"],
    ["Condition at delivery", "Delivered in working order unless noted below"]
  ] as const;

  pdf.setDrawColor(border);
  pdf.setFillColor(soft);
  pdf.roundedRect(x, y, width, 82, 7, 7, "FD");
  rows.forEach(([label, value], index) => {
    const rowY = y + 18 + index * 18;
    pdf.setTextColor(muted);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.text(label.toUpperCase(), x + 14, rowY);
    pdf.setTextColor(slate);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text(pdf.splitTextToSize(value, width - 150), x + 132, rowY);
  });
}

function checklistTable(pdf: jsPDF, x: number, y: number, checklist: DeliverySetupChecklist | null) {
  const colWidth = 264;
  checklistRows.forEach(([key, label], index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const cellX = x + col * colWidth;
    const cellY = y + row * 20;
    const checked = Boolean(checklist?.[key]);

    pdf.setDrawColor(checked ? teal : border);
    pdf.setFillColor(checked ? teal : white);
    pdf.roundedRect(cellX, cellY - 10, 10, 10, 2, 2, checked ? "FD" : "S");
    pdf.setTextColor(slate);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text(label, cellX + 16, cellY - 1);
  });
}

function signatureBlock(pdf: jsPDF, x: number, y: number, checklist: DeliverySetupChecklist | null) {
  const width = 528;
  pdf.setDrawColor(border);
  pdf.setFillColor(soft);
  pdf.roundedRect(x, y, width, 70, 7, 7, "FD");

  pdf.setTextColor(muted);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.text("RECIPIENT / DESIGNEE SIGNATURE", x + 14, y + 18);
  pdf.text("SIGNER NAME", x + 316, y + 18);
  pdf.text("SIGNED AT", x + 316, y + 48);

  if (checklist?.signature_data_url) {
    try {
      pdf.addImage(checklist.signature_data_url, "PNG", x + 14, y + 24, 250, 32);
    } catch {
      signatureLine(pdf, x + 14, y + 54, 250);
    }
  } else {
    signatureLine(pdf, x + 14, y + 54, 250);
  }

  pdf.setTextColor(slate);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.text(checklist?.signature_name || "Printed name", x + 316, y + 32);
  pdf.text(checklist?.signed_at ? new Date(checklist.signed_at).toLocaleString() : "Date/time", x + 316, y + 62);
}

function signatureLine(pdf: jsPDF, x: number, y: number, width: number) {
  pdf.setDrawColor(muted);
  pdf.line(x, y, x + width, y);
}
