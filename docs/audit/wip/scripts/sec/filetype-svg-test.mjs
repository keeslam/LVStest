import { fileTypeFromBuffer } from 'file-type';
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(4)"><script>alert(5)</script></svg>');
const detected = await fileTypeFromBuffer(svg);
console.log('detected for SVG buffer:', detected);
const pdf = Buffer.from('%PDF-1.4\n<script>document.title="x"</script>\n%%EOF');
const detectedPdf = await fileTypeFromBuffer(pdf);
console.log('detected for PDF-polyglot buffer:', detectedPdf);
