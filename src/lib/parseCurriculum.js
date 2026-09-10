import { GoogleGenerativeAI } from "@google/generative-ai";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);

const SYSTEM_PROMPT = `You are a curriculum structuring engine for a nursing education platform.
You convert raw, messy PDF text (syllabi, course outlines, training docs) into a strict JSON hierarchy:
Curriculum → Modules → Topics → Lessons.

Rules:
1. Identify natural Modules (major sections/units) from headings, numbering, or topic shifts.
2. Under each Module, identify Topics (sub-sections).
3. Under each Topic, identify Lessons (individual teaching units).
4. If the document has Modules but is missing Topics or Lessons, INFER reasonable ones based on
   the surrounding context and standard nursing-education structure. Never leave a Module with
   zero Topics, or a Topic with zero Lessons.
5. If the document has NO recognisable structure at all (e.g. a plain paragraph, a resume, random
   text), do not fabricate a fake curriculum. Instead create ONE Module titled "Imported Content"
   containing ONE Topic titled "Review Needed" with a single Lesson whose description explains
   that the source document had no clear structure and should be reviewed manually.
6. Write concise, plain-language titles (max ~8 words) and one-sentence descriptions.
7. Output ONLY valid JSON. No markdown fences, no commentary, no preamble.

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

// Extracts plain text from a PDF entirely in the browser. Much faster for
// the model to process than sending the raw PDF binary, since it skips
// document-layout/vision parsing and just reads text straight away.
// Returns "" if the PDF has little/no extractable text (e.g. scanned pages),
// signalling the caller to fall back to sending the raw file instead.
async function extractTextFromPDF(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let fullText = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map((item) => item.str).join(" ");
    fullText += pageText + "\n\n";
  }

  return fullText.trim();
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

async function generateWithRetry(content, maxRetries = 3) {
  const models = ["gemini-3.6-flash"];

  let lastError;

  for (const modelName of models) {
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: {
        responseMimeType: "application/json",
        maxOutputTokens: 8192,
        // gemini-3.x can't fully disable thinking (thinkingBudget is a 2.5-only
        // param), but thinkingLevel controls how much reasoning it does before
        // answering. "low" is enough for structured extraction and noticeably
        // faster than the "medium" default for a task this mechanical.
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
        return result.response.text();
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
    const extractedText = await extractTextFromPDF(file);

    // Treat very short extractions as "not enough real text" (likely a
    // scanned/image PDF) and fall back to sending the raw binary so Gemini
    // can use its own document/vision parsing instead.
    if (extractedText.length > 100) {
      console.log(`Extracted ${extractedText.length} characters client-side — sending as text.`);
      content = [
        { text: `PDF content:\n\n${extractedText}` },
        { text: "Convert this PDF content into the curriculum JSON schema." },
      ];
    } else {
      console.warn("Little/no extractable text found — falling back to sending the raw PDF.");
      const base64Data = await fileToBase64(file);
      content = [
        { inlineData: { mimeType: "application/pdf", data: base64Data } },
        { text: "Convert this PDF into the curriculum JSON schema." },
      ];
    }
  } catch (err) {
    // If client-side extraction itself throws (corrupt file, unusual PDF
    // structure), fall back to raw binary rather than failing the upload.
    console.warn("Client-side text extraction failed, falling back to raw PDF:", err);
    const base64Data = await fileToBase64(file);
    content = [
      { inlineData: { mimeType: "application/pdf", data: base64Data } },
      { text: "Convert this PDF into the curriculum JSON schema." },
    ];
  }

  const raw = await generateWithRetry(content);

  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error("Gemini returned invalid JSON:", raw);
    throw new Error("Gemini returned invalid curriculum JSON.", { cause: error });
  }
}