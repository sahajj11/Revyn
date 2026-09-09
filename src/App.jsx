// App.jsx
import { useRef, useState } from "react";
import {
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Upload,
  Loader2,
} from "lucide-react";
import { parseCurriculumFromPDF } from "./lib/parseCurriculum.js";


const ACCENT = "#EC8601";
let idCounter = 1;
const uid = () => `id-${idCounter++}`;

const makeLesson = (title = "New Lesson") => ({
  id: uid(),
  title,
  description: "",
});

const makeTopic = (title = "New Topic") => ({
  id: uid(),
  title,
  description: "",
  lessons: [],
});

const makeModule = (title = "New Module") => ({
  id: uid(),
  title,
  description: "",
  topics: [],
});

const initialCurriculum = {
  title: "Untitled Curriculum",
  description: "",
  modules: [],
};

// Converts raw AI JSON into the same builder shapes used by manual creation,
// so every node gets a real id and both flows are indistinguishable downstream.
function hydrateFromAI(aiData) {
  return {
    title: aiData.title || "Untitled Curriculum",
    description: aiData.description || "",
    modules: (aiData.modules || []).map((m) => ({
      ...makeModule(m.title),
      description: m.description || "",
      topics: (m.topics || []).map((t) => ({
        ...makeTopic(t.title),
        description: t.description || "",
        lessons: (t.lessons || []).map((l) => ({
          ...makeLesson(l.title),
          description: l.description || "",
        })),
      })),
    })),
  };
}

// ---------- Reusable inline-editable pieces ----------

function EditableTitle({ value, onChange, placeholder, className }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`bg-transparent outline-none focus:bg-white/60 rounded px-1 -mx-1 w-full ${className}`}
    />
  );
}

function EditableDescription({ value, onChange, placeholder }) {
  const [editing, setEditing] = useState(false);

  if (!editing && !value) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="text-sm text-gray-400 hover:text-gray-500 italic text-left"
      >
        {placeholder}
      </button>
    );
  }

  return (
    <textarea
      autoFocus={editing}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => setEditing(false)}
      placeholder={placeholder}
      rows={1}
      className="w-full text-sm text-gray-600 bg-transparent outline-none focus:bg-white/60 rounded px-1 -mx-1 resize-none"
    />
  );
}

function AddButton({ label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 text-sm font-medium mt-2 px-2 py-1 rounded-md hover:bg-orange-50 transition-colors"
      style={{ color: ACCENT }}
    >
      <Plus size={14} /> {label}
    </button>
  );
}

function DeleteButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-500 p-1 shrink-0"
    >
      <Trash2 size={14} />
    </button>
  );
}

// Small numbered node that sits ON the vertical trunk line
function Node({ number, size = "md" }) {
  const sizes = {
    lg: "w-7 h-7 text-xs",
    md: "w-6 h-6 text-[11px]",
    sm: "w-5 h-5 text-[10px]",
  };
  return (
    <div
      className={`relative z-10 shrink-0 rounded-full flex items-center justify-center font-bold text-white ${sizes[size]}`}
      style={{ backgroundColor: ACCENT }}
    >
      {number}
    </div>
  );
}

// ---------- Lesson ----------

function Lesson({ lesson, number, onUpdate, onDelete }) {
  return (
    <div className="group relative flex items-start gap-3 py-2">
      <div className="absolute left-[9px] top-0 bottom-0 w-px bg-gray-200" />
      <Node number={number} size="sm" />
      <div className="flex-1 min-w-0 -mt-0.5">
        <EditableTitle
          value={lesson.title}
          onChange={(v) => onUpdate({ ...lesson, title: v })}
          placeholder="Lesson title"
          className="text-sm font-medium text-gray-700"
        />
        <EditableDescription
          value={lesson.description}
          onChange={(v) => onUpdate({ ...lesson, description: v })}
          placeholder="Add a description..."
        />
      </div>
      <DeleteButton onClick={onDelete} />
    </div>
  );
}

// ---------- Topic ----------

function Topic({ topic, number, onUpdate, onDelete, isLast }) {
  const [open, setOpen] = useState(true);

  const updateLesson = (updated) =>
    onUpdate({
      ...topic,
      lessons: topic.lessons.map((l) => (l.id === updated.id ? updated : l)),
    });

  const deleteLesson = (id) =>
    onUpdate({ ...topic, lessons: topic.lessons.filter((l) => l.id !== id) });

  const addLesson = () =>
    onUpdate({ ...topic, lessons: [...topic.lessons, makeLesson()] });

  return (
    <div className="relative">
      <div
        className={`absolute left-[11px] top-0 w-px bg-gray-200 ${
          isLast ? "h-5" : "bottom-0"
        }`}
      />
      <div className="group relative flex items-start gap-3 py-2">
        <Node number={number} size="md" />
        <button
          onClick={() => setOpen(!open)}
          className="mt-1.5 -ml-1 text-gray-400 hover:text-gray-600"
        >
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
        <div className="flex-1 min-w-0">
          <EditableTitle
            value={topic.title}
            onChange={(v) => onUpdate({ ...topic, title: v })}
            placeholder="Topic title"
            className="text-[15px] font-semibold text-gray-800"
          />
          <EditableDescription
            value={topic.description}
            onChange={(v) => onUpdate({ ...topic, description: v })}
            placeholder="Add a description..."
          />
        </div>
        <DeleteButton onClick={onDelete} />
      </div>

      {open && (
        <div className="ml-[27px] pl-3">
          <div className="pl-3">
            {topic.lessons.map((lesson, i) => (
              <Lesson
                key={lesson.id}
                lesson={lesson}
                number={`${number}.${i + 1}`}
                onUpdate={updateLesson}
                onDelete={() => deleteLesson(lesson.id)}
              />
            ))}
            <div className="pl-9">
              <AddButton label="Add Lesson" onClick={addLesson} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Module ----------

function Module({ module, number, onUpdate, onDelete, isLast }) {
  const [open, setOpen] = useState(true);

  const updateTopic = (updated) =>
    onUpdate({
      ...module,
      topics: module.topics.map((t) => (t.id === updated.id ? updated : t)),
    });

  const deleteTopic = (id) =>
    onUpdate({ ...module, topics: module.topics.filter((t) => t.id !== id) });

  const addTopic = () =>
    onUpdate({ ...module, topics: [...module.topics, makeTopic()] });

  return (
    <div className="relative">
      <div
        className={`absolute left-[13px] top-0 w-px bg-gray-200 ${
          isLast ? "h-6" : "bottom-0"
        }`}
      />
      <div className="group relative flex items-start gap-3 py-3">
        <Node number={number} size="lg" />
        <button
          onClick={() => setOpen(!open)}
          className="mt-2 -ml-1 text-gray-400 hover:text-gray-600"
        >
          {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </button>
        <div className="flex-1 min-w-0">
          <EditableTitle
            value={module.title}
            onChange={(v) => onUpdate({ ...module, title: v })}
            placeholder="Module title"
            className="text-lg font-bold text-gray-900"
          />
          <EditableDescription
            value={module.description}
            onChange={(v) => onUpdate({ ...module, description: v })}
            placeholder="Add a description..."
          />
        </div>
        <DeleteButton onClick={onDelete} />
      </div>

      {open && (
        <div className="ml-[13px] pl-6 pb-2">
          {module.topics.map((topic, i) => (
            <Topic
              key={topic.id}
              topic={topic}
              number={`${number}.${i + 1}`}
              onUpdate={updateTopic}
              onDelete={() => deleteTopic(topic.id)}
              isLast={i === module.topics.length - 1}
            />
          ))}
          <div className="pl-9">
            <AddButton label="Add Topic" onClick={addTopic} />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- App ----------

export default function App() {
  const [curriculum, setCurriculum] = useState(initialCurriculum);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef(null);

  const updateModule = (updated) =>
    setCurriculum({
      ...curriculum,
      modules: curriculum.modules.map((m) =>
        m.id === updated.id ? updated : m
      ),
    });

  const deleteModule = (id) =>
    setCurriculum({
      ...curriculum,
      modules: curriculum.modules.filter((m) => m.id !== id),
    });

  const addModule = () =>
    setCurriculum({
      ...curriculum,
      modules: [...curriculum.modules, makeModule()],
    });

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      setUploadError("Please upload a PDF file.");
      return;
    }

    setUploading(true);
    setUploadError("");

    try {
      const aiData = await parseCurriculumFromPDF(file);
      setCurriculum(hydrateFromAI(aiData));
    } catch (err) {
      console.error(err);
      setUploadError("Something went wrong parsing the PDF. Please try again.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div className="flex-1">
            <EditableTitle
              value={curriculum.title}
              onChange={(v) => setCurriculum({ ...curriculum, title: v })}
              placeholder="Curriculum title"
              className="text-2xl font-extrabold text-gray-900"
            />
            <EditableDescription
              value={curriculum.description}
              onChange={(v) =>
                setCurriculum({ ...curriculum, description: v })
              }
              placeholder="Add a description..."
            />
          </div>

          <div className="shrink-0 ml-4 flex flex-col items-end gap-1">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={handleFileSelect}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 text-white text-sm font-medium px-4 py-2 rounded-lg shadow-sm hover:opacity-90 transition-opacity disabled:opacity-60"
              style={{ backgroundColor: ACCENT }}
            >
              {uploading ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Parsing PDF...
                </>
              ) : (
                <>
                  <Upload size={16} /> Upload Curriculum
                </>
              )}
            </button>
            {uploadError && (
              <p className="text-xs text-red-500 max-w-[220px] text-right">
                {uploadError}
              </p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-2">
          {curriculum.modules.length === 0 && (
            <p className="text-sm text-gray-400 italic py-6 text-center">
              No modules yet. Add your first one below, or upload a PDF.
            </p>
          )}
          {curriculum.modules.map((module, i) => (
            <Module
              key={module.id}
              module={module}
              number={i + 1}
              onUpdate={updateModule}
              onDelete={() => deleteModule(module.id)}
              isLast={i === curriculum.modules.length - 1}
            />
          ))}
          <div className="py-3">
            <AddButton label="Add Module" onClick={addModule} />
          </div>
        </div>
      </div>
    </div>
  );
}