export const openReportPrintPreview = (title = "Report") => {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

  const printContent = document.querySelector('[id^="print-"]') || document.querySelector("table");
  const content = printContent?.outerHTML || "<p>No report data found.</p>";

  printWindow.document.open();
  printWindow.document.write(`
      <html>
        <head>
          <title>${title}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; color: #1e293b; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; }
            th { background: #f1f5f9; }
            .print-button { background: #4f46e5; color: white; border: 0; border-radius: 6px; padding: 8px 16px; cursor: pointer; margin-bottom: 16px; }
            @media print { .print-button { display: none; } }
            @page { size: auto; margin: 10mm; }
          </style>
        </head>
        <body>
          <button class="print-button" onclick="window.print()">Print</button>
          <h1>${title}</h1>
          <p>Generated: ${new Date().toLocaleString()}</p>
          ${content}
          <script>window.onload = function() { window.print(); }</script>
        </body>
      </html>
    `);
  printWindow.document.close();
};