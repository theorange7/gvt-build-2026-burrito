// One-shot script — generates a minimal valid .docx fixture for the
// extract tests. Re-run only if the fixture body needs to change.
//   node test/fixtures/make-docx.mjs
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from '../../node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/lib/index.js';

const here = dirname(fileURLToPath(import.meta.url));

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Shipped login redesign (PR #42) on 2026-02-01.</w:t></w:r></w:p>
    <w:p><w:r><w:t>Reviewed payments PR (PR #43) on 2026-02-03.</w:t></w:r></w:p>
    <w:p><w:r><w:t>Wrote runbook for incident-response on 2026-02-05.</w:t></w:r></w:p>
  </w:body>
</w:document>`;

const zip = new JSZip();
zip.file('[Content_Types].xml', contentTypes);
zip.folder('_rels').file('.rels', rootRels);
zip.folder('word').file('document.xml', document);

const buf = await zip.generateAsync({ type: 'nodebuffer' });
writeFileSync(resolve(here, 'sample.docx'), buf);
console.log('wrote', resolve(here, 'sample.docx'), buf.length, 'bytes');
