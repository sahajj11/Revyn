import { GoogleGenerativeAI } from "@google/generative-ai";

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

export async function parseCurriculumFromPDF(file) {

    console.log("calleddddddd")
  // Convert PDF to base64 so Gemini can read it directly —
  // no need for a separate pdf-parse text-extraction step.
  const base64Data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });

  const model = genAI.getGenerativeModel({
    model: "gemini-3.6-flash",
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: {
      responseMimeType: "application/json",
    },
  });

  const result = await model.generateContent([
    {
      inlineData: {
        mimeType: "application/pdf",
        data: base64Data,
      },
    },
    { text: "Convert this PDF into the curriculum JSON schema." },
  ]);

  const raw = result.response.text();
  return JSON.parse(raw);
}