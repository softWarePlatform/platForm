import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

const MAX_EXTRACT_CHARS = 120_000;

export async function extractDocumentText(filename: string, buffer: Buffer): Promise<string> {
  const lower = filename.toLowerCase();
  let text = "";

  if (lower.endsWith(".pdf")) {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      text = result.text ?? "";
    } finally {
      await parser.destroy();
    }
  } else if (lower.endsWith(".docx")) {
    const result = await mammoth.extractRawText({ buffer });
    text = result.value ?? "";
  } else if (lower.endsWith(".doc")) {
    throw new Error("暂不支持旧版 .doc，请另存为 .docx 后上传");
  } else {
    throw new Error("仅支持 PDF 与 Word（.docx）");
  }

  const trimmed = text.replace(/\r\n/g, "\n").trim();
  if (!trimmed) throw new Error("未能从文档中提取到文字，请检查文件是否为扫描件或是否加密");
  return trimmed.slice(0, MAX_EXTRACT_CHARS);
}
