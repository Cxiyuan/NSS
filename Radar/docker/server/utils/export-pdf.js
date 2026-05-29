import pdfmake from 'pdfmake';

export async function generatePDF(task, results) {
  const fonts = {
    Roboto: {
      normal: 'Helvetica',
      bold: 'Helvetica-Bold',
      italics: 'Helvetica-Oblique',
      bolditalics: 'Helvetica-BoldOblique',
    },
  };

  const printer = new pdfmake(fonts);

  const tableBody = [
    [
      { text: '#', style: 'tableHeader', bold: true },
      { text: 'URL', style: 'tableHeader', bold: true },
      { text: 'Found On', style: 'tableHeader', bold: true },
      { text: 'Type', style: 'tableHeader', bold: true },
      { text: 'Depth', style: 'tableHeader', bold: true },
    ],
  ];

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    tableBody.push([
      String(i + 1),
      { text: r.url, link: r.url, color: '#2563eb', fontSize: 8 },
      r.found_on || '',
      r.link_type || '',
      String(r.depth || ''),
    ]);
  }

  const doc = {
    content: [
      { text: 'Web Crawler Results', style: 'header' },
      {
        columns: [
          { text: `Task: ${task.id}`, style: 'subheader' },
          { text: `Generated: ${new Date().toISOString()}`, style: 'subheader', alignment: 'right' },
        ],
      },
      { text: `Type: ${task.type} | Total results: ${results.length}`, style: 'subheader', margin: [0, 4, 0, 12] },
      {
        table: {
          headerRows: 1,
          widths: ['auto', '*', 120, 60, 'auto'],
          body: tableBody,
        },
        layout: 'lightHorizontalLines',
      },
    ],
    styles: {
      header: { fontSize: 18, bold: true, margin: [0, 0, 0, 10] },
      subheader: { fontSize: 10, color: '#666', margin: [0, 2, 0, 2] },
      tableHeader: { fontSize: 9, color: '#333', fillColor: '#f1f5f9' },
    },
    defaultStyle: { fontSize: 9 },
    pageMargins: [30, 30, 30, 30],
  };

  return new Promise((resolve, reject) => {
    const chunks = [];
    const stream = printer.createPdfKitDocument(doc);
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
    stream.end();
  });
}
