import { useMemo, useState } from "react";

type MomentType = "Clutch" | "Funny" | "Fail" | "Toxic" | "Skill" | "Comeback";
type RecommendedAction = "Save" | "Review" | "Discard";
type HumanDecision = "Pending" | "Saved" | "Discarded" | "Needs Review";

type GameplayEvent = {
  id: string;
  timestamp: string;
  eventType: string;
  player: string;
  description: string;
  intensity: number;
  chatSpike: number;
  rarity: number;
  mistakeLevel: number;
  status: "New" | "Analyzed";
};

type SuggestedClip = GameplayEvent & {
  clipScore: number;
  momentType: MomentType;
  reason: string;
  suggestedCaption: string;
  finalCaption: string;
  recommendedAction: RecommendedAction;
  confidence: number;
  humanDecision: HumanDecision;
};

type AuditEntry = {
  id: string;
  clipId: string;
  eventLabel: string;
  aiRecommendation: RecommendedAction;
  humanDecision: HumanDecision;
  timestamp: string;
};

type ClaudeAnalyzeResponse = {
  source?: string;
  clips?: Array<Omit<SuggestedClip, "humanDecision"> & { humanDecision?: HumanDecision }>;
  error?: string;
};

type AppStage = "intake" | "analyzing" | "review";

const fakeEvents: GameplayEvent[] = [
  {
    id: "evt-01",
    timestamp: "OT 0:34",
    eventType: "Overtime Goal",
    player: "Nova",
    description: "Ceiling shot lands top corner to end overtime.",
    intensity: 98,
    chatSpike: 91,
    rarity: 88,
    mistakeLevel: 8,
    status: "New",
  },
  {
    id: "evt-02",
    timestamp: "4:12",
    eventType: "Aerial Save",
    player: "Nova",
    description: "Backboard read denies a certain goal.",
    intensity: 86,
    chatSpike: 64,
    rarity: 83,
    mistakeLevel: 3,
    status: "New",
  },
  {
    id: "evt-03",
    timestamp: "3:55",
    eventType: "Open Net Miss",
    player: "Nova",
    description: "Full boost, empty net, ball rolls wide by inches.",
    intensity: 67,
    chatSpike: 79,
    rarity: 52,
    mistakeLevel: 96,
    status: "New",
  },
  {
    id: "evt-04",
    timestamp: "3:11",
    eventType: "Opponent Own-Goal",
    player: "Blue Team",
    description: "Opponent panic clears directly into their own net.",
    intensity: 62,
    chatSpike: 72,
    rarity: 66,
    mistakeLevel: 82,
    status: "New",
  },
  {
    id: "evt-05",
    timestamp: "2:47",
    eventType: "Chat Spike",
    player: "Nova",
    description: "Chat floods after a last-second goal-line stop.",
    intensity: 77,
    chatSpike: 96,
    rarity: 60,
    mistakeLevel: 14,
    status: "New",
  },
  {
    id: "evt-06",
    timestamp: "2:22",
    eventType: "Kickoff Whiff",
    player: "Nova",
    description: "Delayed flip sends the car under the ball.",
    intensity: 52,
    chatSpike: 65,
    rarity: 42,
    mistakeLevel: 88,
    status: "New",
  },
  {
    id: "evt-07",
    timestamp: "1:39",
    eventType: "Triple Save",
    player: "Nova",
    description: "Three saves in 10 seconds while trapped on defense.",
    intensity: 90,
    chatSpike: 84,
    rarity: 92,
    mistakeLevel: 7,
    status: "New",
  },
  {
    id: "evt-08",
    timestamp: "1:05",
    eventType: "Toxic Chat",
    player: "Opponent",
    description: "Opponent rage-spams quick chat after missing an aerial.",
    intensity: 70,
    chatSpike: 89,
    rarity: 45,
    mistakeLevel: 74,
    status: "New",
  },
  {
    id: "evt-09",
    timestamp: "0:28",
    eventType: "Physics Crash",
    player: "Nova",
    description: "Two cars pinch the ball and launch sideways into goal.",
    intensity: 74,
    chatSpike: 76,
    rarity: 84,
    mistakeLevel: 58,
    status: "New",
  },
  {
    id: "evt-10",
    timestamp: "0:05",
    eventType: "Comeback Goal",
    player: "Nova",
    description: "Equalizer drops in with five seconds left.",
    intensity: 95,
    chatSpike: 93,
    rarity: 82,
    mistakeLevel: 4,
    status: "New",
  },
];

const momentStyles: Record<MomentType, string> = {
  Clutch: "badge-clutch",
  Funny: "badge-funny",
  Fail: "badge-fail",
  Toxic: "badge-toxic",
  Skill: "badge-skill",
  Comeback: "badge-comeback",
};

const actionStyles: Record<RecommendedAction, string> = {
  Save: "action-save",
  Review: "action-review",
  Discard: "action-discard",
};

const decisionStyles: Record<HumanDecision, string> = {
  Pending: "decision-pending",
  Saved: "decision-saved",
  Discarded: "decision-discarded",
  "Needs Review": "decision-review",
};

function classifyMoment(event: GameplayEvent): MomentType {
  if (event.eventType.includes("Toxic")) return "Toxic";
  if (event.eventType.includes("Comeback")) return "Comeback";
  if (event.eventType.includes("Overtime")) return "Clutch";
  if (event.eventType.includes("Aerial") || event.eventType.includes("Triple")) return "Skill";
  if (event.eventType.includes("Miss") || event.eventType.includes("Whiff")) return "Fail";
  return "Funny";
}

function scoreBoost(event: GameplayEvent, momentType: MomentType) {
  if (event.eventType.includes("Overtime")) return 8;
  if (event.eventType.includes("Comeback")) return 7;
  if (event.eventType.includes("Aerial")) return 6;
  if (event.eventType.includes("Triple")) return 9;
  if (event.eventType.includes("Physics")) return 5;
  if (momentType === "Toxic") return 4;
  return 2;
}

function buildReason(event: GameplayEvent, momentType: MomentType) {
  const reasons: Record<MomentType, string> = {
    Clutch: "High-pressure finish with a strong chat reaction.",
    Funny: "Unexpected outcome with clear replay value.",
    Fail: "Obvious mistake that reads instantly as a short-form clip.",
    Toxic: "High engagement, but needs creator judgment before posting.",
    Skill: "Visible mechanical skill and defensive pressure.",
    Comeback: "Last-second score creates a clean comeback story.",
  };

  return `${reasons[momentType]} ${event.description}`;
}

function buildCaption(event: GameplayEvent, momentType: MomentType) {
  const captions: Record<MomentType, string> = {
    Clutch: "Overtime ice. No second chances.",
    Funny: "Rocket League physics had other plans.",
    Fail: "The open net was apparently optional.",
    Toxic: "Chat went nuclear after this play.",
    Skill: "Three saves, zero breathing room.",
    Comeback: "Five seconds left. One more chance.",
  };

  return captions[momentType];
}

function analyzeEvent(event: GameplayEvent): SuggestedClip {
  const momentType = classifyMoment(event);
  const weightedScore =
    event.intensity * 0.35 +
    event.chatSpike * 0.25 +
    event.rarity * 0.25 +
    event.mistakeLevel * 0.15;
  const clipScore = Math.min(100, Math.round(weightedScore + scoreBoost(event, momentType)));
  const recommendedAction: RecommendedAction =
    momentType === "Toxic" ? "Review" : clipScore >= 80 ? "Save" : clipScore >= 60 ? "Review" : "Discard";
  const confidence =
    momentType === "Clutch" || momentType === "Comeback" || momentType === "Skill"
      ? Math.min(98, clipScore + 8)
      : momentType === "Toxic"
        ? 76
        : Math.min(90, clipScore + 5);

  return {
    ...event,
    status: "Analyzed",
    clipScore,
    momentType,
    reason: buildReason(event, momentType),
    suggestedCaption: buildCaption(event, momentType),
    finalCaption: buildCaption(event, momentType),
    recommendedAction,
    confidence,
    humanDecision: "Pending",
  };
}

function buildMockClips() {
  return fakeEvents.map(analyzeEvent).sort((a, b) => b.clipScore - a.clipScore);
}

function normalizeIncomingClips(clips: ClaudeAnalyzeResponse["clips"]): SuggestedClip[] {
  return (clips ?? [])
    .map((clip) => ({
      ...clip,
      status: "Analyzed" as const,
      finalCaption: clip.finalCaption || clip.suggestedCaption,
      humanDecision: "Pending" as const,
    }))
    .sort((a, b) => b.clipScore - a.clipScore);
}

function wait(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function App() {
  const [events, setEvents] = useState<GameplayEvent[]>(fakeEvents);
  const [suggestedClips, setSuggestedClips] = useState<SuggestedClip[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [editingClipId, setEditingClipId] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiSource, setAiSource] = useState("Offline mock scorer");
  const [aiError, setAiError] = useState<string | null>(null);
  const [exportComplete, setExportComplete] = useState(false);
  const [creatorPreference, setCreatorPreference] = useState("Fast, funny clips with obvious fails, clutch goals, and captions that work for TikTok.");

  const analyzed = suggestedClips.length > 0;
  const stage: AppStage = isAnalyzing ? "analyzing" : analyzed ? "review" : "intake";

  const metrics = useMemo(() => {
    const approved = suggestedClips.filter((clip) => clip.humanDecision === "Saved").length;
    const discarded = suggestedClips.filter((clip) => clip.humanDecision === "Discarded").length;
    const averageScore =
      suggestedClips.length === 0
        ? 0
        : Math.round(suggestedClips.reduce((total, clip) => total + clip.clipScore, 0) / suggestedClips.length);

    return {
      eventsScanned: events.filter((event) => event.status === "Analyzed").length,
      suggested: suggestedClips.length,
      approved,
      discarded,
      averageScore,
    };
  }, [events, suggestedClips]);

  const postQueue = suggestedClips.filter((clip) => clip.humanDecision === "Saved");

  async function analyzeMoments() {
    setIsAnalyzing(true);
    setAiError(null);
    setExportComplete(false);
    const minimumLoadingTime = wait(900);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ events: fakeEvents, creatorPreference }),
      });
      const data = (await response.json()) as ClaudeAnalyzeResponse;
      await minimumLoadingTime;

      if (!response.ok) {
        throw new Error(data.error || "Claude analysis failed.");
      }

      const rankedClips = normalizeIncomingClips(data.clips);
      if (rankedClips.length === 0) {
        throw new Error("Claude returned no usable clips.");
      }

      setEvents(fakeEvents.map((event) => ({ ...event, status: "Analyzed" })));
      setSuggestedClips(rankedClips);
      setAuditLog([]);
      setEditingClipId(null);
      setAiSource(`Claude API: ${data.source || "live analysis"}`);
    } catch (error) {
      await minimumLoadingTime;
      const rankedClips = buildMockClips();
      setEvents(fakeEvents.map((event) => ({ ...event, status: "Analyzed" })));
      setSuggestedClips(rankedClips);
      setAuditLog([]);
      setEditingClipId(null);
      setAiSource("Offline mock scorer");
      setAiError(error instanceof Error ? error.message : "Claude unavailable; using offline mock scoring.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  function resetDemo() {
    setEvents(fakeEvents);
    setSuggestedClips([]);
    setAuditLog([]);
    setEditingClipId(null);
    setIsAnalyzing(false);
    setAiSource("Offline mock scorer");
    setAiError(null);
    setExportComplete(false);
  }

  function updateCaption(clipId: string, finalCaption: string) {
    setSuggestedClips((clips) => clips.map((clip) => (clip.id === clipId ? { ...clip, finalCaption } : clip)));
    setExportComplete(false);
  }

  function addAuditEntry(clip: SuggestedClip, humanDecision: HumanDecision) {
    setAuditLog((entries) => [
      {
        id: `${clip.id}-${Date.now()}`,
        clipId: clip.id,
        eventLabel: `${clip.player}: ${clip.eventType}`,
        aiRecommendation: clip.recommendedAction,
        humanDecision,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      },
      ...entries,
    ]);
  }

  function decideClip(clipId: string, humanDecision: HumanDecision) {
    const clip = suggestedClips.find((item) => item.id === clipId);
    if (!clip) return;

    setSuggestedClips((clips) => clips.map((item) => (item.id === clipId ? { ...item, humanDecision } : item)));
    addAuditEntry(clip, humanDecision);
    setExportComplete(false);
  }

  function exportSelectedClips() {
    if (postQueue.length === 0) return;
    setExportComplete(true);
  }

  return (
    <main className="app-shell">
      <DashboardHeader
        stage={stage}
        aiSource={aiSource}
        aiError={aiError}
        onReset={resetDemo}
      />

      {stage === "intake" ? (
        <IntakeView
          events={events}
          creatorPreference={creatorPreference}
          onCreatorPreferenceChange={setCreatorPreference}
          onAnalyze={analyzeMoments}
        />
      ) : null}
      {stage === "analyzing" ? <AnalyzingView events={events} aiSource={aiSource} creatorPreference={creatorPreference} /> : null}
      {stage === "review" ? (
        <ReviewWorkspace
          metrics={metrics}
          clips={suggestedClips}
          postQueue={postQueue}
          auditLog={auditLog}
          editingClipId={editingClipId}
          exportComplete={exportComplete}
          onEdit={setEditingClipId}
          onCaptionChange={updateCaption}
          onDecision={decideClip}
          onExport={exportSelectedClips}
        />
      ) : null}
    </main>
  );
}

function DashboardHeader({
  stage,
  aiSource,
  aiError,
  onReset,
}: {
  stage: AppStage;
  aiSource: string;
  aiError: string | null;
  onReset: () => void;
}) {
  return (
    <header className="hero">
      <div>
        <p className="eyebrow">Human-in-the-Loop AI</p>
        <h1>Roasty-Lite</h1>
        <p className="hero-copy">AI suggests clip-worthy gameplay moments. The creator decides what gets saved.</p>
      </div>
      <div className="hero-actions">
        <span className="stage-pill">Step {stage === "intake" ? "1" : stage === "analyzing" ? "2" : "3"} of 3</span>
        <span className="live-pill">
          <span className="live-dot" />
          Fake Rocket League stream
        </span>
        <span className="ai-source">AI engine: {aiSource}</span>
        {aiError ? <span className="ai-warning">Fallback active: {aiError}</span> : null}
        <button className="ghost-button" onClick={onReset}>
          Reset demo
        </button>
      </div>
    </header>
  );
}

function IntakeView({
  events,
  creatorPreference,
  onCreatorPreferenceChange,
  onAnalyze,
}: {
  events: GameplayEvent[];
  creatorPreference: string;
  onCreatorPreferenceChange: (value: string) => void;
  onAnalyze: () => void;
}) {
  return (
    <section className="flow-grid">
      <article className="panel intake-panel">
        <p className="eyebrow">Match Intake</p>
        <h2>Scan the stream for clip candidates</h2>
        <p>
          Roasty-Lite starts with fake match telemetry, then asks AI to identify which moments are worth a creator's time.
        </p>
        <label className="preference-field" htmlFor="creator-preference">
          <span>What content does well for you?</span>
          <textarea
            id="creator-preference"
            value={creatorPreference}
            onChange={(event) => onCreatorPreferenceChange(event.target.value)}
            rows={3}
          />
        </label>
        <div className="intake-actions">
          <button className="primary-button" onClick={onAnalyze}>
            Start AI analysis
          </button>
          <span>{events.length} gameplay events ready</span>
        </div>
      </article>
      <LiveEventFeed events={events.slice(0, 5)} compact />
    </section>
  );
}

function AnalyzingView({
  events,
  aiSource,
  creatorPreference,
}: {
  events: GameplayEvent[];
  aiSource: string;
  creatorPreference: string;
}) {
  return (
    <section className="panel analyzing-panel">
      <div className="loader-ring" />
      <p className="eyebrow">Analyzing Match Data</p>
      <h2>Scoring clip potential from fake gameplay events</h2>
      <p>
        Reviewing {events.length} events for intensity, chat reaction, rarity, mistake value, and social caption fit.
      </p>
      <p className="preference-summary">Optimizing for: {creatorPreference || "general short-form gaming clips"}</p>
      <div className="scan-list" aria-label="Analysis progress">
        <span>Reading event feed</span>
        <span>Ranking viral potential</span>
        <span>Generating captions</span>
        <span>Preparing human review queue</span>
      </div>
      <div className="scan-bar">
        <span />
      </div>
      <small>Current engine: {aiSource}</small>
    </section>
  );
}

function ReviewWorkspace({
  metrics,
  clips,
  postQueue,
  auditLog,
  editingClipId,
  exportComplete,
  onEdit,
  onCaptionChange,
  onDecision,
  onExport,
}: {
  metrics: {
    eventsScanned: number;
    suggested: number;
    approved: number;
    discarded: number;
    averageScore: number;
  };
  clips: SuggestedClip[];
  postQueue: SuggestedClip[];
  auditLog: AuditEntry[];
  editingClipId: string | null;
  exportComplete: boolean;
  onEdit: (clipId: string | null) => void;
  onCaptionChange: (clipId: string, caption: string) => void;
  onDecision: (clipId: string, decision: HumanDecision) => void;
  onExport: () => void;
}) {
  return (
    <>
      <MetricsBar metrics={metrics} />
      <section className="review-workspace">
        <SuggestedClipsPanel
          clips={clips}
          editingClipId={editingClipId}
          onEdit={onEdit}
          onCaptionChange={onCaptionChange}
          onDecision={onDecision}
        />
        <aside className="export-column">
          <ExportPanel clips={postQueue} exportComplete={exportComplete} onExport={onExport} />
        </aside>
      </section>
      <AuditLog entries={auditLog} />
    </>
  );
}

function MetricsBar({
  metrics,
}: {
  metrics: {
    eventsScanned: number;
    suggested: number;
    approved: number;
    discarded: number;
    averageScore: number;
  };
}) {
  return (
    <section className="metrics-grid" aria-label="Demo metrics">
      <Metric label="Events scanned" value={metrics.eventsScanned} />
      <Metric label="AI suggested" value={metrics.suggested} />
      <Metric label="Human-approved" value={metrics.approved} />
      <Metric label="Discarded" value={metrics.discarded} />
      <Metric label="Avg clip score" value={metrics.averageScore} />
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function LiveEventFeed({ events, compact = false }: { events: GameplayEvent[]; compact?: boolean }) {
  return (
    <section className="panel feed-panel">
      <PanelTitle title="Live Event Feed" subtitle={compact ? "Preview of incoming events" : "Offline fake stream"} />
      <div className="event-list">
        {events.map((event) => (
          <article className="event-row" key={event.id}>
            <div className="time-chip">{event.timestamp}</div>
            <div className="event-body">
              <div className="row-top">
                <strong>{event.eventType}</strong>
                <span className={`status-badge ${event.status === "Analyzed" ? "status-analyzed" : ""}`}>{event.status}</span>
              </div>
              <p>
                <span>{event.player}</span> - {event.description}
              </p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function SuggestedClipsPanel({
  clips,
  editingClipId,
  onEdit,
  onCaptionChange,
  onDecision,
}: {
  clips: SuggestedClip[];
  editingClipId: string | null;
  onEdit: (clipId: string | null) => void;
  onCaptionChange: (clipId: string, caption: string) => void;
  onDecision: (clipId: string, decision: HumanDecision) => void;
}) {
  return (
    <section className="panel suggestions-panel">
      <PanelTitle title="AI Suggested Clips" subtitle="Ranked by clip potential" />
      {clips.length === 0 ? (
        <EmptyState text="Click Analyze moments to score the fake event stream." />
      ) : (
        <div className="clip-list">
          {clips.map((clip, index) => (
            <article className={`clip-card ${clip.clipScore >= 85 ? "clip-card-hot" : ""}`} key={clip.id}>
              <div className="clip-heading">
                <div className="score-ring">
                  <span>{clip.clipScore}</span>
                  <small>score</small>
                </div>
                <div>
                  <div className="rank-line">
                    <span className="rank">#{index + 1}</span>
                    <span className={`moment-badge ${momentStyles[clip.momentType]}`}>{clip.momentType}</span>
                    <span className={`action-badge ${actionStyles[clip.recommendedAction]}`}>AI: {clip.recommendedAction}</span>
                  </div>
                  <h2>{clip.eventType}</h2>
                  <p>{clip.reason}</p>
                </div>
              </div>

              <div className="caption-box">
                <label htmlFor={`caption-${clip.id}`}>Suggested caption</label>
                {editingClipId === clip.id ? (
                  <input
                    id={`caption-${clip.id}`}
                    value={clip.finalCaption}
                    onChange={(event) => onCaptionChange(clip.id, event.target.value)}
                    onBlur={() => onEdit(null)}
                    autoFocus
                  />
                ) : (
                  <p>{clip.finalCaption}</p>
                )}
              </div>

              <div className="clip-footer">
                <span className={`decision-pill ${decisionStyles[clip.humanDecision]}`}>Human: {clip.humanDecision}</span>
                <span className="confidence">Confidence {clip.confidence}%</span>
              </div>

              <div className="button-row">
                <button onClick={() => onDecision(clip.id, "Saved")}>Keep Clip</button>
                <button className="danger-button" onClick={() => onDecision(clip.id, "Discarded")}>
                  Reject
                </button>
                <button onClick={() => onEdit(clip.id)}>Edit Caption</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ExportPanel({
  clips,
  exportComplete,
  onExport,
}: {
  clips: SuggestedClip[];
  exportComplete: boolean;
  onExport: () => void;
}) {
  return (
    <section className="panel export-panel">
      <PanelTitle title="Export Area" subtitle="Fake export for kept clips" />
      {clips.length === 0 ? (
        <EmptyState text="Keep a clip to stage it for export." />
      ) : (
        <div className="post-list">
          {clips.map((clip) => (
            <article className="post-card" key={clip.id}>
              <div className="post-score">{clip.clipScore}</div>
              <div>
                <span className={`moment-badge ${momentStyles[clip.momentType]}`}>{clip.momentType}</span>
                <h3>{clip.finalCaption}</h3>
                <p>
                  {clip.eventType} by {clip.player}
                </p>
                <div className="platforms">
                  <span>TikTok</span>
                  <span>YouTube Shorts</span>
                  <span>Instagram Reels</span>
                </div>
              </div>
            </article>
          ))}
          <button className="primary-button export-button" onClick={onExport}>
            Export {clips.length} kept clip{clips.length === 1 ? "" : "s"}
          </button>
          {exportComplete ? (
            <div className="export-complete">
              Export package ready: captions, moment tags, and platform targets queued.
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function PostQueue({ clips }: { clips: SuggestedClip[] }) {
  return (
    <section className="panel post-panel">
      <PanelTitle title="Post Queue" subtitle="Approved clips ready to export" />
      {clips.length === 0 ? (
        <EmptyState text="Saved clips will land here with final captions and platform tags." />
      ) : (
        <div className="post-list">
          {clips.map((clip) => (
            <article className="post-card" key={clip.id}>
              <div className="post-score">{clip.clipScore}</div>
              <div>
                <span className={`moment-badge ${momentStyles[clip.momentType]}`}>{clip.momentType}</span>
                <h3>{clip.finalCaption}</h3>
                <p>
                  {clip.eventType} by {clip.player}
                </p>
                <div className="platforms">
                  <span>TikTok</span>
                  <span>YouTube Shorts</span>
                  <span>Instagram Reels</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function AuditLog({ entries }: { entries: AuditEntry[] }) {
  return (
    <section className="panel audit-panel">
      <PanelTitle title="Audit History" subtitle="AI recommendation vs human decision" />
      {entries.length === 0 ? (
        <EmptyState text="Save, discard, or review a clip to create an audit entry." />
      ) : (
        <div className="audit-list">
          {entries.map((entry) => (
            <article className="audit-row" key={entry.id}>
              <span>{entry.timestamp}</span>
              <strong>{entry.eventLabel}</strong>
              <p>
                AI: {entry.aiRecommendation} | Human: {entry.humanDecision}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function PanelTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="panel-title">
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}

export default App;
