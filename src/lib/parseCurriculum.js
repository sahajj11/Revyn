import { GoogleGenerativeAI } from "@google/generative-ai";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);

// Gemini's inline-data request size ceiling. Keep a safety margin under the
// documented ~20MB limit for base64-encoded inline content.
const MAX_INLINE_PDF_BYTES = 18 * 1024 * 1024;

const SYSTEM_PROMPT = `You are a curriculum structuring engine for a nursing education platform.
You convert raw, messy PDF content (syllabi, course outlines, training docs — which may include
diagrams, charts, tables, or scanned pages alongside plain text) into a strict JSON hierarchy:
Curriculum → Modules → Topics → Lessons.

Rules:
1. Identify natural Modules (major sections/units) from headings, numbering, or topic shifts.
2. Under each Module, identify Topics (sub-sections).
3. Under each Topic, identify Lessons (individual teaching units).
4. If content is presented visually (a diagram, chart, table, or annotated image rather than
   plain paragraphs), interpret it the same way you would interpret text — extract the Modules,
   Topics, and Lessons it implies rather than ignoring it.
5. If the document has Modules but is missing Topics or Lessons, INFER reasonable ones based on
   the surrounding context and standard nursing-education structure. Never leave a Module with
   zero Topics, or a Topic with zero Lessons.
6. If the document has NO recognisable structure at all (e.g. a plain paragraph, a resume, random
   text), do not fabricate a fake curriculum. Instead create ONE Module titled "Imported Content"
   containing ONE Topic titled "Review Needed" with a single Lesson whose description explains
   that the source document had no clear structure and should be reviewed manually.
7. Write concise, plain-language titles (max ~8 words) and one-sentence descriptions.
8. Output ONLY valid JSON. No markdown fences, no commentary, no preamble.

Output schema:
{
  "title": string,
  "description": string,
  "modules": [
    {
      "title": string,
      "description": string,
      "topics": [
        {
          "title": string,
          "description": string,
          "lessons": [
            { "title": string, "description": string }
          ]
        }
      ]
    }
  ]
}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isRetryableError(error) {
  const message = error?.message || "";
  return (
    message.includes("503") ||
    message.includes("UNAVAILABLE") ||
    message.includes("high demand") ||
    message.includes("429") ||
    message.includes("RESOURCE_EXHAUSTED") ||
    message.includes("500") ||
    message.includes("502") ||
    message.includes("504")
  );
}

// Safely creates an Error with an attached cause across all runtime and TS target versions
function createNestedError(message, cause) {
  try {
    return new Error(message, { cause });
  } catch {
    const err = new Error(message);
    err.cause = cause;
    return err;
  }
}

// Inspects a PDF for both extractable text AND embedded images, so the
// caller can decide intelligently between the fast text-only path and the
// slower-but-vision-capable raw-PDF path.
async function analyzePDF(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let fullText = "";
  let imageOpCount = 0;
  let pagesWithImages = 0;

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);

    const content = await page.getTextContent();
    const pageText = content.items.map((item) => item.str).join(" ");
    fullText += pageText + "\n\n";

    const opList = await page.getOperatorList();
    let pageHasImage = false;
    for (const fn of opList.fnArray) {
      if (
        fn === pdfjsLib.OPS.paintImageXObject ||
        fn === pdfjsLib.OPS.paintJpegXObject ||
        fn === pdfjsLib.OPS.paintImageXObjectRepeat
      ) {
        imageOpCount++;
        pageHasImage = true;
      }
    }
    if (pageHasImage) pagesWithImages++;
  }

  return {
    text: fullText.trim(),
    numPages: pdf.numPages,
    imageOpCount,
    pagesWithImages,
  };
}

async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Failed to read PDF."));
        return;
      }
      resolve(result.split(",")[1]);
    };
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

// --- JSON repair for truncated model output -------------------------------

function computeOpenStack(str) {
  let inString = false;
  let escapeNext = false;
  const stack = [];

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (inString) {
      if (escapeNext) escapeNext = false;
      else if (ch === "\\") escapeNext = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}" || ch === "]") stack.pop();
  }

  return stack;
}

function findLastSafeCut(str) {
  let inString = false;
  let escapeNext = false;
  let lastSafeIndex = -1;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (inString) {
      if (escapeNext) escapeNext = false;
      else if (ch === "\\") escapeNext = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "," || ch === "}" || ch === "]") {
      lastSafeIndex = i;
    }
  }

  return lastSafeIndex;
}

function attemptJSONRepair(raw) {
  const cutIndex = findLastSafeCut(raw);
  if (cutIndex === -1) return null;

  const truncated = raw.slice(0, cutIndex + 1).replace(/,\s*$/, "");
  const openStack = computeOpenStack(truncated);

  const closer = { "{": "}", "[": "]" };
  let closing = "";
  for (let i = openStack.length - 1; i >= 0; i--) {
    closing += closer[openStack[i]];
  }

  try {
    return JSON.parse(truncated + closing);
  } catch {
    return null;
  }
}

async function generateWithRetry(content, maxRetries = 3) {
  const models = ["gemini-3.6-flash"];

  let lastError;

  for (const modelName of models) {
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: {
        responseMimeType: "application/json",
        maxOutputTokens: 65536,
        thinkingConfig: {
          thinkingLevel: "low",
        },
      },
    });

    let modelFailed = false;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Trying ${modelName} — attempt ${attempt + 1}`);
        const result = await model.generateContent(content);
        const text = result.response.text();
        const finishReason = result.response.candidates?.[0]?.finishReason;

        if (finishReason === "MAX_TOKENS") {
          console.warn(
            `${modelName} hit MAX_TOKENS — response was likely truncated before the JSON closed.`
          );
        }

        return { text, finishReason };
      } catch (error) {
        lastError = error;
        console.error(`${modelName} failed:`, error?.message || error);

        if (!isRetryableError(error)) {
          modelFailed = true;
          break;
        }

        if (attempt === maxRetries) {
          console.warn(`${modelName} failed after ${maxRetries + 1} attempts.`);
          modelFailed = true;
          break;
        }

        const delay = Math.min(1000 * 2 ** attempt, 10000) + Math.random() * 500;
        console.log(`Retrying in ${Math.round(delay)}ms...`);
        await sleep(delay);
      }
    }

    if (modelFailed) {
      console.warn(`Switching to fallback model...`);
    }
  }

  throw lastError;
}

export async function parseCurriculumFromPDF(file) {
  if (!file || file.type !== "application/pdf") {
    throw new Error("Please select a valid PDF file.");
  }

  let content;

  try {
    const { text, numPages, imageOpCount, pagesWithImages } = await analyzePDF(file);

    const isMostlyImageBased = text.length < 100;
    const hasSignificantImages = pagesWithImages / Math.max(numPages, 1) > 0.25 || imageOpCount > 5;

    if (isMostlyImageBased || hasSignificantImages) {
      const routeType = isMostlyImageBased
        ? "vision (scanned/no text layer)"
        : "vision (text + meaningful images)";
      console.log(
        `Routing to raw PDF (${routeType}) — ${numPages} pages, ${imageOpCount} image ops across ${pagesWithImages} page(s).`
      );

      if (file.size > MAX_INLINE_PDF_BYTES) {
        throw new Error(
          `This PDF is ${(file.size / (1024 * 1024)).toFixed(1)}MB, which is too large to send for image-based parsing. Try a smaller file, or a version with fewer embedded images.`
        );
      }

      const base64Data = await fileToBase64(file);
      content = [
        { inlineData: { mimeType: "application/pdf", data: base64Data } },
        {
          text:
            "Convert this PDF into the curriculum JSON schema. This document includes diagrams, " +
            "charts, or other visual content in addition to text — interpret those visually as well, " +
            "not just the plain text.",
        },
      ];
    } else {
      console.log(`Routing to text-only (${text.length} characters extracted, ${numPages} pages, no significant images).`);
      content = [
        { text: `PDF content:\n\n${text}` },
        { text: "Convert this PDF content into the curriculum JSON schema." },
      ];
    }
  } catch (err) {
    if (err.message?.includes("too large")) {
      throw err;
    }

    console.warn("Client-side PDF analysis failed, falling back to raw PDF (vision):", err);

    if (file.size > MAX_INLINE_PDF_BYTES) {
      throw createNestedError(
        `This PDF is ${(file.size / (1024 * 1024)).toFixed(1)}MB and couldn't be pre-processed, which is too large to send directly. Try a smaller file.`,
        err
      );
    }

    const base64Data = await fileToBase64(file);
    content = [
      { inlineData: { mimeType: "application/pdf", data: base64Data } },
      { text: "Convert this PDF into the curriculum JSON schema." },
    ];
  }

  const { text: raw, finishReason } = await generateWithRetry(content);

  try {
    return JSON.parse(raw);
  } catch (error) {
    const repaired = attemptJSONRepair(raw);
    if (repaired) {
      console.warn(
        "Gemini's response was truncated" +
          (finishReason ? ` (finishReason: ${finishReason})` : "") +
          " — recovered a partial curriculum from what was returned. Some modules/topics/lessons near the end may be missing."
      );
      return repaired;
    }

    console.error("Gemini returned invalid JSON:", raw);

    if (finishReason === "MAX_TOKENS") {
      throw createNestedError(
        "The document was too long to process in one pass and the response got cut off. Try a shorter PDF, or split this one into smaller sections.",
        error
      );
    }

    throw createNestedError("Gemini returned invalid curriculum JSON.", error);
  }
}