import type { WorkbookValue } from "@/lib/excel-workbook";

export type WordReportImage = {
    data: Buffer;
    mimeType: "image/png" | "image/jpeg";
    width: number;
    height: number;
};

type WordReportOptions = {
    title: string;
    subtitle: string;
    columns: string[];
    rows: WorkbookValue[][];
    headerImage?: WordReportImage | null;
    footerImage?: WordReportImage | null;
};

type ZipEntry = {
    name: string;
    data: Buffer;
    crc: number;
    offset: number;
};

const encoder = new TextEncoder();

function xmlText(value: WorkbookValue) {
    return (value === null ? "" : String(value))
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

function crc32(data: Buffer) {
    let crc = 0xFFFFFFFF;

    for (const byte of data) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit += 1) {
            crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
        }
    }

    return (crc ^ 0xFFFFFFFF) >>> 0;
}

function createZip(files: Array<{ name: string; contents: string | Buffer }>) {
    const chunks: Buffer[] = [];
    const entries: ZipEntry[] = [];
    let offset = 0;

    for (const file of files) {
        const name = Buffer.from(encoder.encode(file.name));
        const data = typeof file.contents === "string"
            ? Buffer.from(encoder.encode(file.contents))
            : file.contents;
        const crc = crc32(data);
        const header = Buffer.alloc(30);
        header.writeUInt32LE(0x04034B50, 0);
        header.writeUInt16LE(20, 4);
        header.writeUInt16LE(0x0800, 6);
        header.writeUInt16LE(0, 8);
        header.writeUInt16LE(0, 10);
        header.writeUInt16LE(33, 12);
        header.writeUInt32LE(crc, 14);
        header.writeUInt32LE(data.length, 18);
        header.writeUInt32LE(data.length, 22);
        header.writeUInt16LE(name.length, 26);
        header.writeUInt16LE(0, 28);

        chunks.push(header, name, data);
        entries.push({ name: file.name, data, crc, offset });
        offset += header.length + name.length + data.length;
    }

    const centralDirectoryOffset = offset;
    for (const entry of entries) {
        const name = Buffer.from(encoder.encode(entry.name));
        const header = Buffer.alloc(46);
        header.writeUInt32LE(0x02014B50, 0);
        header.writeUInt16LE(20, 4);
        header.writeUInt16LE(20, 6);
        header.writeUInt16LE(0x0800, 8);
        header.writeUInt16LE(0, 10);
        header.writeUInt16LE(0, 12);
        header.writeUInt16LE(33, 14);
        header.writeUInt32LE(entry.crc, 16);
        header.writeUInt32LE(entry.data.length, 20);
        header.writeUInt32LE(entry.data.length, 24);
        header.writeUInt16LE(name.length, 28);
        header.writeUInt16LE(0, 30);
        header.writeUInt16LE(0, 32);
        header.writeUInt16LE(0, 34);
        header.writeUInt16LE(0, 36);
        header.writeUInt32LE(0, 38);
        header.writeUInt32LE(entry.offset, 42);

        chunks.push(header, name);
        offset += header.length + name.length;
    }

    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054B50, 0);
    end.writeUInt16LE(0, 4);
    end.writeUInt16LE(0, 6);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(offset - centralDirectoryOffset, 12);
    end.writeUInt32LE(centralDirectoryOffset, 16);
    end.writeUInt16LE(0, 20);
    chunks.push(end);

    return Buffer.concat(chunks);
}

const JPEG_START_OF_FRAME_MARKERS = new Set([
    0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7,
    0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF,
]);

export function imageDimensions(data: Buffer, mimeType: string) {
    if (mimeType === "image/png") {
        const validSignature = data.length >= 24 &&
            data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
        if (!validSignature) throw new Error("The PNG image is invalid.");

        const width = data.readUInt32BE(16);
        const height = data.readUInt32BE(20);
        if (!width || !height) throw new Error("The PNG image has invalid dimensions.");
        return { width, height };
    }

    if (mimeType === "image/jpeg") {
        if (data.length < 4 || data[0] !== 0xFF || data[1] !== 0xD8) {
            throw new Error("The JPEG image is invalid.");
        }

        let offset = 2;
        while (offset + 9 < data.length) {
            if (data[offset] !== 0xFF) {
                offset += 1;
                continue;
            }

            const marker = data[offset + 1];
            if (marker === 0xD9 || marker === 0xDA) break;
            if (marker === 0xFF || marker === 0x00) {
                offset += 1;
                continue;
            }

            const segmentLength = data.readUInt16BE(offset + 2);
            if (segmentLength < 2 || offset + segmentLength + 2 > data.length) break;

            if (JPEG_START_OF_FRAME_MARKERS.has(marker)) {
                const height = data.readUInt16BE(offset + 5);
                const width = data.readUInt16BE(offset + 7);
                if (!width || !height) break;
                return { width, height };
            }

            offset += segmentLength + 2;
        }

        throw new Error("The JPEG image dimensions could not be read.");
    }

    throw new Error("Only PNG and JPEG images are supported.");
}

function paragraph(text: WorkbookValue, options?: { bold?: boolean; style?: string }) {
    const style = options?.style
        ? `<w:pStyle w:val="${options.style}"/>`
        : "";
    const bold = options?.bold ? "<w:b/>" : "";
    return `<w:p><w:pPr>${style}</w:pPr><w:r><w:rPr>${bold}</w:rPr><w:t xml:space="preserve">${xmlText(text)}</w:t></w:r></w:p>`;
}

function tableCell(value: WorkbookValue, isHeader: boolean, width: number) {
    const headerProperties = isHeader
        ? '<w:shd w:val="clear" w:color="auto" w:fill="DDEBF7"/>'
        : "";
    const runProperties = isHeader ? "<w:b/><w:color w:val=\"1E3A5F\"/>" : "";
    return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${headerProperties}</w:tcPr><w:p><w:r><w:rPr>${runProperties}</w:rPr><w:t xml:space="preserve">${xmlText(value)}</w:t></w:r></w:p></w:tc>`;
}

function tableXml(columns: string[], rows: WorkbookValue[][]) {
    const columnWidth = Math.max(Math.floor(9362 / Math.max(columns.length, 1)), 360);
    const header = `<w:tr><w:trPr><w:tblHeader/></w:trPr>${columns
        .map((column) => tableCell(column, true, columnWidth))
        .join("")}</w:tr>`;
    const body = rows.map((row) => `<w:tr>${columns
        .map((_, index) => tableCell(row[index] ?? null, false, columnWidth))
        .join("")}</w:tr>`).join("");

    return `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/><w:tblLayout w:type="autofit"/><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>${header}${body}</w:tbl>`;
}

function imageExtent(image: WordReportImage) {
    const maxWidth = 6_126_480;
    const maxHeight = 658_368;
    const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
    return {
        width: Math.max(Math.round(image.width * scale), 1),
        height: Math.max(Math.round(image.height * scale), 1),
    };
}

function headerFooterXml(kind: "hdr" | "ftr", image: WordReportImage, name: string, id: number) {
    const extent = imageExtent(image);
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:${kind} xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
 <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing>
  <wp:inline distT="0" distB="0" distL="0" distR="0">
   <wp:extent cx="${extent.width}" cy="${extent.height}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>
   <wp:docPr id="${id}" name="${xmlText(name)}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>
   <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>
    <pic:nvPicPr><pic:cNvPr id="0" name="${xmlText(name)}"/><pic:cNvPicPr/></pic:nvPicPr>
    <pic:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
    <pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${extent.width}" cy="${extent.height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>
   </pic:pic></a:graphicData></a:graphic>
  </wp:inline>
 </w:drawing></w:r></w:p>
</w:${kind}>`;
}

function imageRelationship(target: string) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${target}"/>
</Relationships>`;
}

export function createWordDocument({
    title,
    subtitle,
    columns,
    rows,
    headerImage,
    footerImage,
}: WordReportOptions) {
    if (!columns.length) throw new Error("The Word report needs at least one column.");

    const files: Array<{ name: string; contents: string | Buffer }> = [];
    const contentTypeDefaults = new Set<string>();
    const documentRelationships = [
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>',
    ];
    const contentTypeOverrides = [
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
        '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>',
        '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>',
    ];
    let nextRelationshipId = 3;
    let headerReference = "";
    let footerReference = "";

    if (headerImage) {
        const extension = headerImage.mimeType === "image/png" ? "png" : "jpeg";
        contentTypeDefaults.add(extension);
        contentTypeOverrides.push('<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>');
        documentRelationships.push(`<Relationship Id="rId${nextRelationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>`);
        headerReference = `<w:headerReference w:type="default" r:id="rId${nextRelationshipId}"/>`;
        nextRelationshipId += 1;
        files.push(
            { name: "word/header1.xml", contents: headerFooterXml("hdr", headerImage, `header.${extension}`, 1) },
            { name: "word/_rels/header1.xml.rels", contents: imageRelationship(`media/header.${extension}`) },
            { name: `word/media/header.${extension}`, contents: headerImage.data },
        );
    }

    if (footerImage) {
        const extension = footerImage.mimeType === "image/png" ? "png" : "jpeg";
        contentTypeDefaults.add(extension);
        contentTypeOverrides.push('<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>');
        documentRelationships.push(`<Relationship Id="rId${nextRelationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>`);
        footerReference = `<w:footerReference w:type="default" r:id="rId${nextRelationshipId}"/>`;
        files.push(
            { name: "word/footer1.xml", contents: headerFooterXml("ftr", footerImage, `footer.${extension}`, 2) },
            { name: "word/_rels/footer1.xml.rels", contents: imageRelationship(`media/footer.${extension}`) },
            { name: `word/media/footer.${extension}`, contents: footerImage.data },
        );
    }

    const imageContentTypes = [...contentTypeDefaults].map((extension) =>
        `<Default Extension="${extension}" ContentType="image/${extension === "jpeg" ? "jpeg" : "png"}"/>`,
    );

    files.push(
        {
            name: "[Content_Types].xml",
            contents: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
 <Default Extension="xml" ContentType="application/xml"/>
 ${imageContentTypes.join("\n ")}
 ${contentTypeOverrides.join("\n ")}
</Types>`,
        },
        {
            name: "_rels/.rels",
            contents: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
        },
        {
            name: "word/_rels/document.xml.rels",
            contents: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 ${documentRelationships.join("\n ")}
</Relationships>`,
        },
        {
            name: "word/document.xml",
            contents: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
 <w:body>
  ${paragraph(title, { style: "Title" })}
  ${paragraph(subtitle)}
  ${paragraph("")}
  ${tableXml(columns, rows)}
  <w:sectPr>${headerReference}${footerReference}<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="720" w:bottom="1440" w:left="720" w:header="240" w:footer="240" w:gutter="0"/></w:sectPr>
 </w:body>
</w:document>`,
        },
        {
            name: "word/styles.xml",
            contents: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
 <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:style>
 <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="120"/></w:pPr><w:rPr><w:b/><w:color w:val="0F4C81"/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr></w:style>
 <w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:uiPriority w:val="59"/><w:qFormat/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:color="B8C5D1"/><w:left w:val="single" w:sz="4" w:color="B8C5D1"/><w:bottom w:val="single" w:sz="4" w:color="B8C5D1"/><w:right w:val="single" w:sz="4" w:color="B8C5D1"/><w:insideH w:val="single" w:sz="4" w:color="D5DEE7"/><w:insideV w:val="single" w:sz="4" w:color="D5DEE7"/></w:tblBorders><w:tblCellMar><w:top w:w="80" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
</w:styles>`,
        },
        {
            name: "word/settings.xml",
            contents: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:defaultTabStop w:val="720"/><w:compat/></w:settings>`,
        },
    );

    return createZip(files);
}
