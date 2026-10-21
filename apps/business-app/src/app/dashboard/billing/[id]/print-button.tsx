'use client';

type ShareInvoiceProps = {
  invoiceNumber: string;
  customerName: string;
  total: number;
  dueDate: string | null;
};

export function PrintDocumentButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-100 print:hidden"
    >
      Print / Save PDF
    </button>
  );
}

/**
 * Opens a WhatsApp message without exposing an authenticated invoice URL.
 * Staff must attach the PDF saved with the adjacent Print / Save PDF button.
 */
export function ShareInvoiceWhatsAppButton({
  invoiceNumber,
  customerName,
  total,
  dueDate,
}: ShareInvoiceProps) {
  function share() {
    const amount = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
    }).format(total);
    const message = [
      `Hello ${customerName},`,
      `Please find the details for invoice ${invoiceNumber}.`,
      `Invoice amount: ${amount}`,
      ...(dueDate ? [`Due date: ${dueDate}`] : []),
      'Please contact our office for the invoice PDF and payment instructions.',
    ].join('\n');
    window.open(
      `https://wa.me/?text=${encodeURIComponent(message)}`,
      '_blank',
      'noopener,noreferrer',
    );
  }

  return (
    <button
      type="button"
      onClick={share}
      className="rounded-xl border border-green-300 bg-green-50 px-5 py-2.5 text-sm font-semibold text-green-800 hover:bg-green-100 print:hidden"
      title="Opens a WhatsApp message; attach the saved invoice PDF manually"
    >
      Share details on WhatsApp
    </button>
  );
}
