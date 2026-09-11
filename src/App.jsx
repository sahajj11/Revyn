// App.jsx
import { useRef, useState, useEffect } from "react";
import {
  Plus,
  Trash2,
  Copy,
  GripVertical,
  ChevronDown,
  ChevronRight,
  Upload,
  Loader2,
  Sparkles,
  Check,
  BookOpen,
  Zap,
  Layers,
  FileText,
} from "lucide-react";
import { parseCurriculumFromPDF } from "./lib/parseCurriculum";

const ACCENT = "#EC8601";
const ACCENT_TINT = "#FDF1E2";
const INK = "#15161A";
const INK_SOFT = "#3A3D46";
const MUTED = "#8B8DA0";
const PAPER = "#F7F7F9";
const HAIRLINE = "#E9E9EF";
const ROW_HOVER = "#FAFAFC";
const PILL_BG = "#F1F1F5";

const LESSON_COLORS = ["#5B6EF5", "#EC8601", "#9757D7", "#0EA5C4"];
const LESSON_ICONS = [Zap, FileText, BookOpen, Layers];

let idCounter = 1;
const uid = () => `id-${idCounter++}`;

const makeLesson = (title = "New lesson") => ({
  id: uid(),
  title,
  description: "",
});

const makeTopic = (title = "New topic") => ({
  id: uid(),
  title,
  description: "",
  lessons: [],
});

const makeModule = (title = "New module") => ({
  id: uid(),
  title,
  description: "",
  topics: [],
});

const initialCurriculum = {
  title: "Untitled curriculum",
  description: "",
  modules: [],
};

function hydrateFromAI(aiData) {
  return {
    title: aiData.title || "Untitled curriculum",
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

function countAll(curriculum) {
  let topics = 0;
  let lessons = 0;
  curriculum.modules.forEach((m) => {
    topics += m.topics.length;
    m.topics.forEach((t) => (lessons += t.lessons.length));
  });
  return { modules: curriculum.modules.length, topics, lessons };
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function FontLoader() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
      .font-ui { font-family: 'Inter', system-ui, sans-serif; }

      @keyframes modalIn {
        from { opacity: 0; transform: scale(0.96) translateY(6px); }
        to { opacity: 1; transform: scale(1) translateY(0); }
      }
      @keyframes rowIn {
        from { opacity: 0; transform: translateY(6px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes shimmerText {
        0%, 100% { opacity: 0.55; }
        50% { opacity: 1; }
      }
      .animate-modal-in { animation: modalIn 0.28s cubic-bezier(0.16, 1, 0.3, 1); }
      .animate-row-in { animation: rowIn 0.32s cubic-bezier(0.16, 1, 0.3, 1) backwards; }
      .animate-shimmer { animation: shimmerText 1.8s ease-in-out infinite; }
    `}</style>
  );
}

// ---------- Reusable inline-editable pieces ----------

// Auto-growing textarea instead of a single-line input, so long titles wrap
// onto a second line and push content below them instead of scrolling
// off-screen the way a plain <input> would.
function EditableTitle({ value, onChange, placeholder, className }) {
  const textareaRef = useRef(null);

  const resize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  useEffect(() => {
    resize();
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onInput={resize}
      onKeyDown={(e) => {
        // Titles stay single-field: Enter confirms rather than adding a
        // literal newline. Long text still wraps visually on its own.
        if (e.key === "Enter") {
          e.preventDefault();
          e.target.blur();
        }
      }}
      placeholder={placeholder}
      rows={1}
      className={`font-ui bg-transparent outline-none focus:bg-[#F1EDE4] rounded px-1 -mx-1 transition-colors resize-none overflow-hidden block w-full break-words ${className}`}
      style={{ color: INK }}
    />
  );
}

function EditableDescription({ value, onChange, placeholder, className = "" }) {
  const [editing, setEditing] = useState(false);
  const textareaRef = useRef(null);

  const resize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  // Resize on every value change, not just while `editing` is true. A
  // description that already has content (e.g. hydrated from an AI-parsed
  // PDF) was previously stuck at its default single-line height until
  // something happened to flip `editing` — which for a non-empty value
  // never actually occurred, since there's no onFocus handler here. That
  // made long text look clipped until you clicked in, tabbed away, and
  // some other state change happened to trigger a resize. Now it's sized
  // correctly from the first render, no interaction required.
  useEffect(() => {
    resize();
  }, [value, editing]);

  if (!editing && !value) {
    return (
      <button
        onClick={() => setEditing(true)}
        className={`font-ui text-[13px] text-left cursor-text ${className}`}
        style={{ color: MUTED }}
      >
        {placeholder}
      </button>
    );
  }

  return (
    <textarea
      ref={textareaRef}
      autoFocus={editing}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onInput={resize}
      onBlur={() => setEditing(false)}
      placeholder={placeholder}
      rows={1}
      className={`font-ui w-full text-[13px] bg-transparent outline-none focus:bg-[#F1EDE4] rounded px-1 -mx-1 resize-none overflow-hidden block transition-colors ${className}`}
      style={{ color: "#6B6E7C" }}
    />
  );
}

function AddButton({ label, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="font-ui cursor-pointer flex items-center gap-1.5 text-[13px] font-medium mt-2 px-2.5 py-1.5 rounded-md transition-all"
      style={{
        color: ACCENT,
        backgroundColor: hover ? ACCENT_TINT : "transparent",
        transform: hover ? "translateX(1px)" : "translateX(0)",
      }}
    >
      <Plus size={13} /> {label}
    </button>
  );
}

function Pill({ children }) {
  return (
    <span
      className="font-ui text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ backgroundColor: PILL_BG, color: "#5E6072" }}
    >
      {children}
    </span>
  );
}

// Every icon action now: cursor-pointer, a clear hover bg, and a tiny
// scale-up so hover feedback is unmistakable even for small icon-only hits.
function RowActions({ onDuplicate, onDelete, ariaLabel }) {
  return (
    <div className="flex items-center gap-0.5 opacity-40 group-hover:opacity-100 transition-opacity shrink-0">
      {/* <button
        className="p-1.5 rounded-md cursor-grab active:cursor-grabbing hover:bg-black/5 hover:scale-110 transition-all"
        style={{ color: MUTED }}
        title="Reorder"
        tabIndex={-1}
      >
        <GripVertical size={14} />
      </button> */}
      <button
        onClick={onDuplicate}
        className="p-1.5 rounded-md cursor-pointer hover:bg-black/5 hover:scale-110 transition-all"
        style={{ color: MUTED }}
        title="Duplicate"
      >
        <Copy size={14} />
      </button>
      <button
        onClick={onDelete}
        aria-label={ariaLabel || "Delete"}
        className="p-1.5 rounded-md cursor-pointer hover:!text-red-500 hover:!bg-red-50 hover:scale-110 transition-all"
        style={{ color: MUTED }}
        title="Delete"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

// Module: solid dark 32px badge. Topic: white bordered 28px badge.
// Lesson: quiet 24px numeral, no fill, sits beside the lesson's colored icon.
function NumberBadge({ number, level }) {
  const styles = {
    module: {
      className: "w-8 h-8 text-[13px] text-white",
      style: { backgroundColor: INK },
    },
    topic: {
      className: "w-7 h-7 text-[11px] bg-white border",
      style: { color: INK_SOFT, borderColor: "#D8D8E0" },
    },
    lesson: {
      className: "w-6 h-6 text-[10px] bg-transparent",
      style: { color: MUTED },
    },
  };
  const s = styles[level];
  return (
    <div
      className={`font-ui relative z-10 shrink-0 rounded-lg flex items-center justify-center font-bold italic ${s.className}`}
      style={s.style}
    >
      {number}
    </div>
  );
}

function HoverRow({ children }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      className="group rounded-lg transition-colors"
      style={{ backgroundColor: hover ? ROW_HOVER : "transparent" }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {children}
    </div>
  );
}

// A chevron toggle used by both Module and Topic — cursor-pointer, hover
// background, and a slight rotation nudge for extra affordance.
function ChevronToggle({ open, onClick, size = 14 }) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 cursor-pointer p-0.5 rounded-md hover:bg-black/5 transition-all"
      style={{ color: MUTED }}
      title={open ? "Collapse" : "Expand"}
    >
      {open ? <ChevronDown size={size} /> : <ChevronRight size={size} />}
    </button>
  );
}

// Shared vertical "rail" segment used by Module, Topic, and Lesson alike.
// It draws a hairline from this item's badge center down through the rest
// of the row (continuing seamlessly into the next sibling's own segment),
// except for the last item in a list, where it only draws a short stub
// connecting in from above and stops at that item's badge.
//
// `left` = horizontal position of the badge column for this level.
// `centerOffset` = vertical distance from the top of the wrapping element
// down to the vertical center of that level's badge.
function ConnectorLine({ left, centerOffset, isFirst, isLast }) {
  return (
    <>
      <div
        className="absolute w-px pointer-events-none"
        style={{
          left,
          top: isFirst ? `${centerOffset}px` : "0px",
          bottom: isLast ? "auto" : "0px",
          height: isLast ? "0px" : undefined,
          backgroundColor: HAIRLINE,
        }}
      />
      {isLast && (
        <div
          className="absolute w-px pointer-events-none"
          style={{
            left,
            top: "0px",
            height: `${centerOffset}px`,
            backgroundColor: HAIRLINE,
          }}
        />
      )}
    </>
  );
}

// ---------- AI Parsing Modal ----------

const PARSE_STAGES = [
  "Reading your PDF",
  "Understanding the structure",
  "Identifying modules and topics",
  "Generating your curriculum",
];

const SKELETON_LINES = [
  { role: "module", rawWidth: "94%" },
  { role: "topic", rawWidth: "78%" },
  { role: "topic", rawWidth: "85%" },
  { role: "lesson", rawWidth: "65%" },
  { role: "lesson", rawWidth: "72%" },
  { role: "lesson", rawWidth: "58%" },
];

const RAW_LINE_COLOR = "#DCDCE3";

function getLineStyle(role, roleIndex, rawY, rawWidth, stage) {
  if (stage <= 0) {
    return { x: 0, y: rawY, width: rawWidth, height: 6, radius: 3, color: RAW_LINE_COLOR, opacity: 1 };
  }

  if (role === "module") {
    return { x: 0, y: 0, width: "100%", height: 8, radius: 4, color: INK, opacity: 1 };
  }

  if (role === "topic") {
    if (stage < 2) {
      return { x: 0, y: rawY, width: rawWidth, height: 6, radius: 3, color: RAW_LINE_COLOR, opacity: 0.35 };
    }
    return {
      x: 24,
      y: 20 + roleIndex * 12,
      width: roleIndex === 0 ? "46%" : "38%",
      height: 6,
      radius: 3,
      color: INK_SOFT,
      opacity: 1,
    };
  }

  // role === "lesson"
  if (stage < 3) {
    return { x: 0, y: rawY, width: rawWidth, height: 6, radius: 3, color: RAW_LINE_COLOR, opacity: 0.35 };
  }
  return {
    x: 48,
    y: 54 + roleIndex * 12,
    width: ["62%", "48%", "70%"][roleIndex],
    height: 4,
    radius: 4,
    color: LESSON_COLORS[roleIndex % LESSON_COLORS.length],
    opacity: 1,
  };
}

// isWaiting: true once the final stage is reached but the real API call
// hasn't resolved yet — locked-in bars get a slow staggered breathing pulse
// during this window instead of sitting dead-still, so the tree keeps
// visually "working" for however long the actual response takes, with no
// fake percentage anywhere pretending to know exactly how long that is.
function CurriculumSkeleton({ stage, isWaiting }) {
  let topicCounter = 0;
  let lessonCounter = 0;

  return (
    <div className="relative" style={{ height: 92 }}>
      {SKELETON_LINES.map((line, i) => {
        const roleIndex =
          line.role === "topic" ? topicCounter++ : line.role === "lesson" ? lessonCounter++ : 0;
        const rawY = i * 15;
        const s = getLineStyle(line.role, roleIndex, rawY, line.rawWidth, stage);
        const isLocked = stage >= (line.role === "module" ? 1 : line.role === "topic" ? 2 : 3);

        return (
          <div
            key={i}
            className={`absolute top-0 left-0 ${stage <= 0 ? "animate-shimmer" : ""} ${
              isWaiting && isLocked ? "animate-line-pulse" : ""
            }`}
            style={{
              height: s.height,
              width: s.width,
              borderRadius: s.radius,
              backgroundColor: s.color,
              opacity: s.opacity,
              transform: `translate(${s.x}px, ${s.y}px)`,
              transitionProperty: "transform, width, background-color, opacity",
              transitionDuration: "0.55s",
              transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
              transitionDelay: `${i * 45}ms`,
              animationDelay: isWaiting && isLocked ? `${i * 180}ms` : undefined,
            }}
          />
        );
      })}
    </div>
  );
}

// Replaces the old checkmark/dot list — cleaner spacing, current stage gets
// a filled pulsing dot, done stages get a check, upcoming stages stay dim.
// No percentage, no progress bar: just an honest "here's what's happening
// right now" readout.
function StageList({ stages, currentStage, isComplete }) {
  return (
    <div className="space-y-3">
      {stages.map((stage, i) => {
        const isDone = isComplete || i < currentStage;
        const isActive = !isComplete && i === currentStage;

        return (
          <div key={stage} className="flex items-center gap-3">
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-colors border"
              style={{
                backgroundColor: isDone ? ACCENT : "transparent",
                borderColor: isDone || isActive ? ACCENT : HAIRLINE,
              }}
            >
              {isDone && <Check size={12} className="text-white" />}
              {isActive && (
                <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: ACCENT }} />
              )}
            </div>
            <span
              className="font-ui text-[13px] transition-colors"
              style={{
                color: isDone ? MUTED : isActive ? INK : "#C9C9D3",
                textDecoration: isDone && !isComplete ? "line-through" : "none",
                fontWeight: isActive ? 600 : 400,
              }}
            >
              {stage}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ParsingModal({ fileName, fixedStageIndex }) {
  const [activeStage, setActiveStage] = useState(0);

  useEffect(() => {
    if (activeStage >= PARSE_STAGES.length - 1) return;
    const t = setTimeout(() => setActiveStage((s) => s + 1), 1400);
    return () => clearTimeout(t);
  }, [activeStage]);

  const currentStage = fixedStageIndex !== undefined ? fixedStageIndex : activeStage;
  const isComplete = currentStage >= PARSE_STAGES.length;
  const isOnFinalStage = !isComplete && currentStage === PARSE_STAGES.length - 1;
  const skeletonStage = Math.min(currentStage, PARSE_STAGES.length - 1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#15161A]/45 backdrop-blur-sm px-4">
      <style>{`
        @keyframes linePulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.45; }
        }
        .animate-line-pulse {
          animation: linePulse 1.6s ease-in-out infinite;
        }
      `}</style>

      <div
        className="animate-modal-in rounded-2xl shadow-2xl w-full max-w-sm p-7"
        style={{ backgroundColor: "#FFFFFF", border: `1px solid ${HAIRLINE}` }}
      >
        <div className="flex items-center justify-center gap-1.5 mb-1">
          {isComplete ? (
            <Check size={14} style={{ color: ACCENT }} />
          ) : (
            <Sparkles size={14} style={{ color: ACCENT }} className={isOnFinalStage ? "animate-pulse" : ""} />
          )}
          <h3 className="font-ui text-center text-base font-bold" style={{ color: INK }}>
            Generating your curriculum
          </h3>
        </div>
        {fileName && (
          <p className="font-ui text-center text-xs truncate" style={{ color: MUTED }}>
            {fileName}
          </p>
        )}

        {/* Persistent expectation-setter — stays visible through every
            stage (including the final wait), instead of only appearing
            in one footer state where it could vanish right when a large
            document actually needs it most. */}
        {!isComplete && (
          <p className="font-ui text-center text-[11px] mt-1.5 mb-5" style={{ color: "#B7B7C2" }}>
            Larger PDFs with more modules can take a little longer to process.
          </p>
        )}
        {isComplete && <div className="mb-5" />}

        <div
          className="rounded-xl mb-6"
          style={{ backgroundColor: PAPER, border: `1px solid ${HAIRLINE}`, padding: "14px 14px 16px" }}
        >
          <CurriculumSkeleton stage={skeletonStage} isWaiting={isOnFinalStage} />
        </div>

        <StageList stages={PARSE_STAGES} currentStage={currentStage} isComplete={isComplete} />

        <p className="font-ui text-center text-[11px] mt-6" style={{ color: "#B7B7C2" }}>
          {isOnFinalStage
            ? "Almost there — finalizing details"
            : isComplete
            ? "Curriculum ready"
            : "Working through your document"}
        </p>
      </div>
    </div>
  );
}

// ---------- Lesson ----------

// `number` is the full "module.topic.lesson" string, e.g. "3.3.4".
// `isFirst` / `isLast` describe this lesson's position among its topic's
// lessons, so its ConnectorLine segment lines up with its siblings.
function Lesson({ lesson, number, index, isFirst, isLast, onUpdate, onDelete, onDuplicate }) {
  const color = LESSON_COLORS[index % LESSON_COLORS.length];
  const Icon = LESSON_ICONS[index % LESSON_ICONS.length];

  return (
    <div className="relative">
      <ConnectorLine left="22px" centerOffset={24} isFirst={isFirst} isLast={isLast} />
      <HoverRow>
        <div className="flex items-start gap-3 py-2.5 px-2.5">
          <div className="mt-0.5">
            <NumberBadge number={number} level="lesson" />
          </div>
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 transition-transform group-hover:scale-105"
            style={{ backgroundColor: `${color}1A` }}
          >
            <Icon size={15} style={{ color }} />
          </div>
          <div className="flex-1 min-w-0">
            <EditableTitle
              value={lesson.title}
              onChange={(v) => onUpdate({ ...lesson, title: v })}
              placeholder="Lesson title"
              className="text-[13.5px] font-semibold w-full block"
            />
            <EditableDescription
              value={lesson.description}
              onChange={(v) => onUpdate({ ...lesson, description: v })}
              placeholder="Add a description..."
            />
          </div>
          <RowActions onDuplicate={onDuplicate} onDelete={onDelete} ariaLabel="Delete lesson" />
        </div>
      </HoverRow>
    </div>
  );
}

// ---------- Topic ----------

// `number` is the "module.topic" string, e.g. "3.3" — lessons extend it
// with their own index to form "3.3.4". `isFirst` / `isLast` describe this
// topic's position among its module's topics.
function Topic({ topic, number, isFirst, isLast, onUpdate, onDelete, onDuplicate }) {
  const [open, setOpen] = useState(true);

  const updateLesson = (updated) =>
    onUpdate({
      ...topic,
      lessons: topic.lessons.map((l) => (l.id === updated.id ? updated : l)),
    });

  const deleteLesson = (id) =>
    onUpdate({ ...topic, lessons: topic.lessons.filter((l) => l.id !== id) });

  const duplicateLesson = (lesson) =>
    onUpdate({
      ...topic,
      lessons: [
        ...topic.lessons,
        { ...lesson, id: uid(), title: `${lesson.title} (copy)` },
      ],
    });

  const addLesson = () =>
    onUpdate({ ...topic, lessons: [...topic.lessons, makeLesson()] });

  return (
    <div className="relative mb-2 last:mb-0">
      <ConnectorLine left="54px" centerOffset={24} isFirst={isFirst} isLast={isLast} />
      <HoverRow>
        <div className="flex items-start gap-3 py-2.5 px-2.5">
          <div className="mt-2">
            <ChevronToggle open={open} onClick={() => setOpen(!open)} />
          </div>
          <NumberBadge number={number} level="topic" />
          <div className="flex-1 min-w-0 pt-0.5">
            <div className="flex items-start justify-between gap-3">
              <EditableTitle
                value={topic.title}
                onChange={(v) => onUpdate({ ...topic, title: v })}
                placeholder="Topic title"
                className="text-[14px] font-bold flex-1"
              />
              <Pill>
                {topic.lessons.length} Lesson{topic.lessons.length !== 1 ? "s" : ""}
              </Pill>
            </div>
            <EditableDescription
              value={topic.description}
              onChange={(v) => onUpdate({ ...topic, description: v })}
              placeholder="Add a description..."
            />
          </div>
          <RowActions onDuplicate={onDuplicate} onDelete={onDelete} ariaLabel="Delete topic" />
        </div>
      </HoverRow>

      {open && (
        <div className="ml-[52px] mt-1">
          {topic.lessons.map((lesson, i) => (
            <div key={lesson.id} className="animate-row-in" style={{ animationDelay: `${i * 30}ms` }}>
              <Lesson
                lesson={lesson}
                number={`${number}.${i + 1}`}
                index={i}
                isFirst={i === 0}
                isLast={i === topic.lessons.length - 1}
                onUpdate={updateLesson}
                onDelete={() => deleteLesson(lesson.id)}
                onDuplicate={() => duplicateLesson(lesson)}
              />
            </div>
          ))}
          <AddButton label="Add Lesson" onClick={addLesson} />
        </div>
      )}
    </div>
  );
}

// ---------- Module ----------

function Module({ module, number, isFirst, isLast, onUpdate, onDelete, onDuplicate }) {
  const [open, setOpen] = useState(true);
  const counts = { topics: module.topics.length, lessons: module.topics.reduce((n, t) => n + t.lessons.length, 0) };

  const updateTopic = (updated) =>
    onUpdate({
      ...module,
      topics: module.topics.map((t) => (t.id === updated.id ? updated : t)),
    });

  const deleteTopic = (id) =>
    onUpdate({ ...module, topics: module.topics.filter((t) => t.id !== id) });

  const duplicateTopic = (topic) =>
    onUpdate({
      ...module,
      topics: [
        ...module.topics,
        {
          ...topic,
          id: uid(),
          title: `${topic.title} (copy)`,
          lessons: topic.lessons.map((l) => ({ ...l, id: uid() })),
        },
      ],
    });

  const addTopic = () =>
    onUpdate({ ...module, topics: [...module.topics, makeTopic()] });

  return (
    <div className="relative">
      <ConnectorLine left="32px" centerOffset={32} isFirst={isFirst} isLast={isLast} />

      <div className="group p-4 relative transition-colors hover:bg-black/[0.015]">
        <div className="flex items-start gap-3">
          <NumberBadge number={pad2(number)} level="module" />
          <div className="mt-2">
            <ChevronToggle open={open} onClick={() => setOpen(!open)} size={16} />
          </div>
          <div className="flex-1 min-w-0 pt-1">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <EditableTitle
                value={module.title}
                onChange={(v) => onUpdate({ ...module, title: v })}
                placeholder="Module title"
                className="text-[16px] font-bold flex-1 min-w-[140px]"
              />
              <div className="flex items-center gap-1.5 shrink-0">
                <Pill>{counts.topics} Topic{counts.topics !== 1 ? "s" : ""}</Pill>
                <Pill>{counts.lessons} Lesson{counts.lessons !== 1 ? "s" : ""}</Pill>
              </div>
            </div>
            <EditableDescription
              value={module.description}
              onChange={(v) => onUpdate({ ...module, description: v })}
              placeholder="Add a description..."
            />
          </div>
          <RowActions onDuplicate={onDuplicate} onDelete={onDelete} ariaLabel="Delete module" />
        </div>

        {open && (
          <div className="ml-[52px] mt-3 pt-3" style={{ borderTop: `1px solid ${HAIRLINE}` }}>
            {module.topics.map((topic, i) => (
              <div key={topic.id} className="animate-row-in" style={{ animationDelay: `${i * 40}ms` }}>
                <Topic
                  topic={topic}
                  number={`${number}.${i + 1}`}
                  isFirst={i === 0}
                  isLast={i === module.topics.length - 1}
                  onUpdate={updateTopic}
                  onDelete={() => deleteTopic(topic.id)}
                  onDuplicate={() => duplicateTopic(topic)}
                />
              </div>
            ))}
            <AddButton label={`Add Topic to Module ${pad2(number)}`} onClick={addTopic} />
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- App ----------

export default function App() {
  const [curriculum, setCurriculum] = useState(initialCurriculum);
  const [uploading, setUploading] = useState(false);
  const [uploadFileName, setUploadFileName] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [doneStage, setDoneStage] = useState(undefined);
  const fileInputRef = useRef(null);

  const updateModule = (updated) =>
    setCurriculum({
      ...curriculum,
      modules: curriculum.modules.map((m) => (m.id === updated.id ? updated : m)),
    });

  const deleteModule = (id) =>
    setCurriculum({ ...curriculum, modules: curriculum.modules.filter((m) => m.id !== id) });

  const duplicateModule = (module) =>
    setCurriculum({
      ...curriculum,
      modules: [
        ...curriculum.modules,
        {
          ...module,
          id: uid(),
          title: `${module.title} (copy)`,
          topics: module.topics.map((t) => ({
            ...t,
            id: uid(),
            lessons: t.lessons.map((l) => ({ ...l, id: uid() })),
          })),
        },
      ],
    });

  const addModule = () =>
    setCurriculum({ ...curriculum, modules: [...curriculum.modules, makeModule()] });

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      setUploadError("Please upload a PDF file.");
      return;
    }

    setUploading(true);
    setUploadFileName(file.name);
    setUploadError("");
    setDoneStage(undefined);

    try {
      const aiData = await parseCurriculumFromPDF(file);
      setDoneStage(PARSE_STAGES.length);
      await new Promise((r) => setTimeout(r, 600));
      setCurriculum(hydrateFromAI(aiData));
    } catch (err) {
      console.error(err);
      setUploadError("Something went wrong parsing the PDF. Please try again.");
    } finally {
      setUploading(false);
      setDoneStage(undefined);
      e.target.value = "";
    }
  };

  const counts = countAll(curriculum);

  return (
    <div className="min-h-screen" style={{ backgroundColor: PAPER }}>
      <FontLoader />

      {uploading && <ParsingModal fileName={uploadFileName} fixedStageIndex={doneStage} />}

      <div style={{ borderBottom: `1px solid ${HAIRLINE}`, backgroundColor: "#FFFFFF" }}>
        <div className="max-w-3xl mx-auto px-6 py-3.5 flex items-center gap-2">
          <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ backgroundColor: ACCENT }}>
            <BookOpen size={13} className="text-white" />
          </div>
          <span className="font-ui text-[13px] font-bold" style={{ color: INK }}>
            Curriculum Studio
          </span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="mb-8">
          <div className="flex items-start justify-between gap-6">
            <div className="flex-1 min-w-0">
              <EditableTitle
                value={curriculum.title}
                onChange={(v) => setCurriculum({ ...curriculum, title: v })}
                placeholder="Curriculum title"
                className="text-[26px] font-extrabold leading-tight block"
              />
              <div className="mt-1.5">
                <EditableDescription
                  value={curriculum.description}
                  onChange={(v) => setCurriculum({ ...curriculum, description: v })}
                  placeholder="Add a description..."
                />
              </div>
              {counts.modules > 0 && (
                <div className="flex items-center gap-1.5 mt-3">
                  <Pill>{counts.modules} Module{counts.modules !== 1 ? "s" : ""}</Pill>
                  <Pill>{counts.topics} Topic{counts.topics !== 1 ? "s" : ""}</Pill>
                  <Pill>{counts.lessons} Lesson{counts.lessons !== 1 ? "s" : ""}</Pill>
                </div>
              )}
            </div>

            <div className="shrink-0 flex flex-col items-end gap-2">
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
                className="font-ui cursor-pointer disabled:cursor-not-allowed group flex items-center gap-2 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-all disabled:opacity-60 hover:opacity-90 hover:shadow-md active:scale-[0.98]"
                style={{ backgroundColor: ACCENT }}
              >
                {uploading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Parsing...
                  </>
                ) : (
                  <>
                    <Upload size={16} className="transition-transform group-hover:-translate-y-0.5" /> Upload
                    Curriculum
                  </>
                )}
              </button>
              <div className="flex items-center gap-1">
                <Sparkles size={11} style={{ color: ACCENT }} />
                <span className="font-ui text-[11px]" style={{ color: MUTED }}>
                  AI-powered · Generate from a PDF
                </span>
              </div>
              {uploadError && (
                <p className="font-ui text-xs text-red-500 max-w-[200px] text-right">{uploadError}</p>
              )}
            </div>
          </div>
        </div>

        {curriculum.modules.length === 0 ? (
          <div
            className="rounded-2xl py-14 text-center"
            style={{ backgroundColor: "#FFFFFF", border: `1px solid ${HAIRLINE}` }}
          >
            <p className="font-ui text-base font-bold mb-1" style={{ color: INK }}>
              Nothing here yet
            </p>
            <p className="font-ui text-sm" style={{ color: MUTED }}>
              Add your first module, or upload a PDF to generate one.
            </p>
          </div>
        ) : (
          <div
            className="rounded-2xl overflow-hidden"
            style={{ backgroundColor: "#FFFFFF", border: `1px solid ${HAIRLINE}` }}
          >
            {curriculum.modules.map((module, i) => (
              <div
                key={module.id}
                className="animate-row-in"
                style={{
                  animationDelay: `${i * 60}ms`,
                  borderTop: i === 0 ? "none" : `1px solid ${HAIRLINE}`,
                }}
              >
                <Module
                  module={module}
                  number={i + 1}
                  isFirst={i === 0}
                  isLast={i === curriculum.modules.length - 1}
                  onUpdate={updateModule}
                  onDelete={() => deleteModule(module.id)}
                  onDuplicate={() => duplicateModule(module)}
                />
              </div>
            ))}
          </div>
        )}

        <button
          onClick={addModule}
          className="font-ui w-full mt-3 cursor-pointer py-3.5 rounded-2xl border-2 border-dashed text-sm font-semibold transition-all flex items-center justify-center gap-2 hover:scale-[1.005]"
          style={{ borderColor: "#D8D8E0", color: MUTED }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = ACCENT;
            e.currentTarget.style.color = ACCENT;
            e.currentTarget.style.backgroundColor = ACCENT_TINT;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "#D8D8E0";
            e.currentTarget.style.color = MUTED;
            e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          <Plus size={16} /> Add New Module
        </button>
      </div>
    </div>
  );
}