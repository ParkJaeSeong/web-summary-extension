function stream(text: string) {
  const contents = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`
  return `<< /Length ${contents.length} >>\nstream\n${contents}\nendstream`
}

function pdfFixture(firstPageText: string | null, thirdPageText: string | null) {
  const page = (contentsObject?: number) =>
    contentsObject
      ? `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 8 0 R >> >> /Contents ${contentsObject} 0 R >>`
      : '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>'
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 5 0 R 6 0 R] /Count 3 >>',
    page(firstPageText === null ? undefined : 4),
    firstPageText === null ? '<< >>' : stream(firstPageText),
    page(),
    page(thirdPageText === null ? undefined : 7),
    thirdPageText === null ? '<< >>' : stream(thirdPageText),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Title (Fixture PDF) >>',
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(pdf.length)
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n`
  pdf += '0000000000 65535 f \n'
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('')
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 9 0 R >>\n`
  pdf += `startxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(pdf)
}

export function textPdfFixture() {
  return pdfFixture('First page text', 'Third page text')
}

export function textlessPdfFixture() {
  return pdfFixture(null, null)
}
