"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

type Identity = { email: string; displayName: string; fullName: string | null };
type Section = "Today" | "Week" | "Goals" | "History" | "Prestige" | "Settings";
type Quest = { id: string; title: string; complete: boolean; kind?: "required" | "bonus"; day_index?: number | null; position?: number };
type Milestone = { id: string; title: string; complete: boolean; position: number };
type Goal = { id: string; title: string; description: string; target_date: string | null; milestones: Milestone[] };
type Profile = { email: string; displayName: string; timezone: string; onboardingComplete: boolean };
type Prestige = { points: number; level: number; title: string; nextThreshold: number | null; nextTitle: string | null; progress: number; tiers: Array<{ level: number; threshold: number; title: string }> };
type PlannerWeek = { id: string; startsOn: string; endsOn: string; status: string; required: Quest[]; bonus: Array<{ dayIndex: number; quests: Quest[] }>; weekly: Quest[]; days: Array<{ dayIndex: number; date: string; requiredComplete: number; bonusAssigned: number; bonusComplete: number; strong: boolean; active: boolean }> };
type HistoryWeek = { id: string; startsOn: string; endsOn: string; days: Array<{ date: string; requiredComplete: number; bonusAssigned: number; bonusComplete: number; strong: boolean }>; strongDays: number; weeklyCompleted: number; weeklyAssigned: number; pointsEarned: number; rank: string };
type CampaignHistory = { summary: { currentStreak: number; strongDays: number; lifetimePoints: number }; weeks: HistoryWeek[] };
type CampaignState = {
  profile: Profile;
  campaign: { today: string; start: string; end: string };
  daily: Quest[];
  weekly: Quest[];
  goals: Goal[];
  prestige: Prestige;
  planner: PlannerWeek[];
  history: CampaignHistory;
};

const requiredSeed: Quest[] = [
  { id: "train", title: "Train for 30 minutes", complete: true, kind: "required" },
  { id: "plan", title: "Plan tomorrow before 9 PM", complete: true, kind: "required" },
  { id: "read", title: "Read 20 pages", complete: false, kind: "required" },
];
const bonusSeed: Quest[] = [
  { id: "water", title: "Drink 8 glasses of water", complete: true, kind: "bonus" },
  { id: "walk", title: "Take a 20 minute walk", complete: false, kind: "bonus" },
];
const weekSeed: Quest[] = [
  { id: "portfolio", title: "Finish portfolio case study", complete: false },
  { id: "mealprep", title: "Meal prep for next week", complete: true },
];

const nav: { name: Section; icon: string }[] = [
  { name: "Today", icon: "✦" }, { name: "Week", icon: "▦" }, { name: "Goals", icon: "◆" },
  { name: "History", icon: "◷" }, { name: "Prestige", icon: "✦" }, { name: "Settings", icon: "⚙" },
];

const walkthroughSteps: Array<{ section: Section; eyebrow: string; title: string; copy: string; detail: string }> = [
  { section: "Today", eyebrow: "WELCOME TO STRONGLY", title: "Build strength one day at a time", copy: "Your Today dashboard is the center of each campaign.", detail: "Every daily quest adds 3 prestige points. Complete all three required quests and every bonus quest you scheduled to secure a Strong Day and 10 additional points." },
  { section: "Week", eyebrow: "PLAN YOUR CAMPAIGN", title: "Set your daily and weekly quests", copy: "Open Week to prepare the structure of your campaign.", detail: "Choose exactly three daily quests, up to two bonus quests for each day, and one to three weekly quests. A scheduled bonus becomes part of that day's Strong Day commitment." },
  { section: "Goals", eyebrow: "THINK LONG TERM", title: "Turn ambitions into milestones", copy: "Goals hold the larger journeys that take more than one week.", detail: "Give each goal a clear outcome and target date, then divide it into ordered milestones you can complete over time." },
  { section: "History", eyebrow: "REVIEW YOUR RECORD", title: "Learn from every campaign", copy: "History preserves completed weeks after they close.", detail: "Review Strong Days, daily completion patterns, weekly quest results, and prestige earned during each past campaign." },
  { section: "Prestige", eyebrow: "BUILD YOUR PRESTIGE", title: "Consistency becomes your rank", copy: "Prestige measures your lifetime daily progress.", detail: "Your first prestige begins at 1,000 points. Higher ranks require 10,000, 100,000, and eventually 1,000,000 points." },
];

function dateFromIso(value: string) { return new Date(`${value}T12:00:00Z`); }
function formatShortDate(value: string) { return dateFromIso(value).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }); }
function formatDay(value: string) { return dateFromIso(value).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }).toUpperCase(); }
function formatLongDate(value: string) { return dateFromIso(value).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).toUpperCase(); }

export default function StronglyApp({ identity }: { identity: Identity }) {
  const [section, setSection] = useState<Section>("Today");
  const [required, setRequired] = useState(requiredSeed);
  const [bonus, setBonus] = useState(bonusSeed);
  const [weekly, setWeekly] = useState(weekSeed);
  const [toast, setToast] = useState("");
  const [profile, setProfile] = useState<Profile>({ email: identity.email, displayName: identity.fullName ?? "Hero", timezone: "America/New_York", onboardingComplete: true });
  const [prestige, setPrestige] = useState<Prestige>({ points: 0, level: 0, title: "Unprestiged", nextThreshold: 1_000, nextTitle: "Iron Resolve", progress: 0, tiers: [] });
  const [goals, setGoals] = useState<Goal[]>([]);
  const [today, setToday] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);
  const [mobileNav, setMobileNav] = useState(false);
  const [planner, setPlanner] = useState<PlannerWeek[]>([]);
  const [history, setHistory] = useState<CampaignHistory>({ summary: { currentStreak: 0, strongDays: 0, lifetimePoints: 0 }, weeks: [] });
  const [walkthroughOpen, setWalkthroughOpen] = useState(false);
  const [walkthroughStep, setWalkthroughStep] = useState(0);
  const requiredDone = required.filter((q) => q.complete).length;
  const progress = Math.round((requiredDone / 3) * 100);

  function applyState(state: CampaignState) {
    setProfile(state.profile);
    setRequired(state.daily.filter((quest) => quest.kind === "required"));
    setBonus(state.daily.filter((quest) => quest.kind === "bonus"));
    setWeekly(state.weekly);
    setGoals(state.goals);
    setPrestige(state.prestige);
    setToday(state.campaign.today);
    setPlanner(state.planner);
    setHistory(state.history);
  }

  useEffect(() => {
    fetch("/api/campaign")
      .then(async (response) => {
        const payload = await response.json() as CampaignState & { error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Unable to load campaign");
        applyState(payload);
        if (!payload.profile.onboardingComplete) {
          setWalkthroughStep(0);
          setSection(walkthroughSteps[0].section);
          setWalkthroughOpen(true);
        }
      })
      .catch((error) => setToast(error instanceof Error ? error.message : "Unable to load campaign"))
      .finally(() => setLoading(false));
  }, []);

  async function post(action: Record<string, unknown>) {
    const response = await fetch("/api/campaign", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(action),
    });
    const payload = await response.json() as CampaignState & { error?: string };
    if (!response.ok) throw new Error(payload.error ?? "Unable to save change");
    applyState(payload);
  }

  async function toggleQuest(group: "required" | "bonus" | "weekly", id: string) {
    const setter = group === "required" ? setRequired : group === "bonus" ? setBonus : setWeekly;
    const source = group === "required" ? required : group === "bonus" ? bonus : weekly;
    const quest = source.find((item) => item.id === id)!;
    setter(source.map((item) => item.id === id ? { ...item, complete: !item.complete } : item));
    setToast(quest.complete ? `${quest.title} reopened` : group === "weekly" ? "Weekly quest complete" : "Quest complete · +3 prestige points");
    try {
      await post(group === "weekly" ? { type: "toggle-weekly", questId: id } : { type: "toggle-daily", questId: id, completedOn: today });
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to save quest");
      const response = await fetch("/api/campaign");
      if (response.ok) applyState(await response.json() as CampaignState);
    }
    window.setTimeout(() => setToast(""), 2400);
  }

  async function toggleMilestone(id: string) {
    try {
      await post({ type: "toggle-milestone", milestoneId: id });
      setToast("Milestone updated");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to update milestone");
    }
    window.setTimeout(() => setToast(""), 2200);
  }

  async function saveGoal(goal: { goalId?: string; title: string; description: string; targetDate: string | null; milestones: Array<{ id?: string; title: string }> }) {
    await post({ type: "save-goal", ...goal });
    setToast(goal.goalId ? "Long-term goal updated" : "Long-term goal created");
    window.setTimeout(() => setToast(""), 2200);
  }

  async function saveProfile(displayName: string, timezone: string) {
    try {
      await post({ type: "profile", displayName, timezone });
      setToast("Profile saved");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to save profile");
    }
    window.setTimeout(() => setToast(""), 2200);
  }

  function startWalkthrough() {
    setWalkthroughStep(0);
    setSection(walkthroughSteps[0].section);
    setWalkthroughOpen(true);
  }

  async function finishWalkthrough() {
    setWalkthroughOpen(false);
    try {
      await post({ type: "complete-onboarding" });
      setToast("Walkthrough complete · Your campaign awaits");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to save walkthrough progress");
    }
    window.setTimeout(() => setToast(""), 2400);
  }

  function advanceWalkthrough() {
    const next = walkthroughStep + 1;
    if (next >= walkthroughSteps.length) {
      void finishWalkthrough();
      return;
    }
    setWalkthroughStep(next);
    setSection(walkthroughSteps[next].section);
  }

  const content = useMemo(() => {
    if (section === "Today") return <Today required={required} bonus={bonus} weekly={weekly} progress={progress} toggleQuest={toggleQuest} today={today} week={planner[0]} displayName={profile.displayName} />;
    if (section === "Week") return <WeekView weeks={planner} savePlan={async (plan) => { try { await post({ type: "plan-week", ...plan }); setToast("Next campaign saved"); } catch (error) { setToast(error instanceof Error ? error.message : "Unable to save week"); } }} />;
    if (section === "Goals") return <Goals goals={goals} toggleMilestone={toggleMilestone} saveGoal={saveGoal} />;
    if (section === "History") return <History history={history} />;
    if (section === "Prestige") return <PrestigeView prestige={prestige} />;
    return <Settings key={`${profile.displayName}:${profile.timezone}`} profile={profile} saveProfile={saveProfile} startWalkthrough={startWalkthrough} />;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, required, bonus, weekly, progress, prestige, planner, history, today, profile]);

  return (
    <div className="app-shell theme-obsidian">
      <aside className={mobileNav ? "sidebar open" : "sidebar"}>
        <div className="brand">STRONGLY<span>.</span></div>
        <div className="profile">
          <div className="avatar">C</div>
          <div><b>{identity.fullName?.split(" ")[0] ?? "Hero"}</b><span><i /> Prestige {prestige.level} · {prestige.title}</span></div>
        </div>
        <nav aria-label="Primary navigation">
          <p>YOUR CAMPAIGN</p>
          {nav.slice(0, 4).map((item) => <button key={item.name} className={section === item.name ? "active" : ""} onClick={() => { setSection(item.name); setMobileNav(false); }}><i>{item.icon}</i>{item.name}</button>)}
          {nav.slice(4).map((item) => <button key={item.name} className={section === item.name ? "active" : ""} onClick={() => { setSection(item.name); setMobileNav(false); }}><i>{item.icon}</i>{item.name}</button>)}
        </nav>
        <div className="sidebar-quote"><span>✦</span><p>“We are what we repeatedly do.”</p><small>— Aristotle</small></div>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <button className="menu-button" aria-label="Open navigation" onClick={() => setMobileNav(!mobileNav)}>☰</button>
          <div className="week-title"><small>THIS CAMPAIGN</small><b>{planner[0] ? `${formatShortDate(planner[0].startsOn)} – ${formatShortDate(planner[0].endsOn)}` : "Loading week…"}</b></div>
          <div className="top-actions"><div className="streak"><span>♨</span><b>{history.summary.currentStreak}</b><small>DAY STREAK</small></div><div className="prestige-chip"><span>✦</span><b>{prestige.points.toLocaleString()}</b><small>PRESTIGE POINTS</small></div><button className="round" aria-label="Notifications">♟<i /></button></div>
        </header>
        <main className="app-main">{content}</main>
      </div>
      {toast && <div className="toast" role="status"><span>✦</span>{toast}</div>}
      {loading && <div className="loading-veil" role="status"><span>✦</span> Loading your campaign…</div>}
      {walkthroughOpen && <Walkthrough step={walkthroughStep} onBack={() => { const previous = Math.max(0, walkthroughStep - 1); setWalkthroughStep(previous); setSection(walkthroughSteps[previous].section); }} onNext={advanceWalkthrough} onSkip={() => void finishWalkthrough()} />}
    </div>
  );
}

function QuestRow({ quest, onToggle }: { quest: Quest; onToggle: () => void }) {
  return <button className={`quest-row ${quest.complete ? "complete" : ""}`} onClick={onToggle} aria-label={`${quest.complete ? "Reopen" : "Complete"} ${quest.title}`}>
    <i className="check">{quest.complete ? "✓" : ""}</i><span className="quest-copy"><b>{quest.title}</b><small>{quest.kind === "bonus" ? "Bonus quest" : quest.kind === "required" ? "Required quest" : "Weekly quest"}</small></span>{quest.kind && <span className="quest-points">+3 <em>PP</em></span>}
  </button>;
}

function Today({ required, bonus, weekly, progress, toggleQuest, today, week, displayName }: { required: Quest[]; bonus: Quest[]; weekly: Quest[]; progress: number; toggleQuest: (g: "required" | "bonus" | "weekly", id: string) => void; today: string; week?: PlannerWeek; displayName: string }) {
  const strongDay = required.filter((quest) => quest.complete).length === 3 && bonus.every((quest) => quest.complete);
  const strongDayRequirement = bonus.length === 0
    ? "Complete all 3 required quests · +10 PP"
    : `Complete all 3 required and ${bonus.length} bonus ${bonus.length === 1 ? "quest" : "quests"} · +10 PP`;
  return <>
    <section className="welcome"><div><p className="eyebrow">{formatLongDate(today)}</p><h1>Good afternoon, <em>{displayName}.</em></h1><p>{strongDay ? "Strong Day secured. You earned 10 bonus prestige points." : bonus.length > 0 ? "Finish every required and scheduled bonus quest to secure today’s Strong Day." : "Finish your three required quests and strengthen today’s record."}</p></div><div className="rank-seal"><span>✦</span><small>BUILD PRESTIGE</small></div></section>
    <section className="day-strip">{week?.days.map((day) => <div className={day.active ? "active" : ""} key={day.date}><small>{formatDay(day.date)}</small><b>{dateFromIso(day.date).getUTCDate()}</b><span>{day.date <= today ? `${day.requiredComplete}/3` : "—"}</span></div>)}</section>
    <div className="dashboard-grid">
      <section className="panel daily-panel">
        <header className="panel-title"><div><p className="eyebrow">DAILY QUESTS</p><h2>Today’s path</h2></div><b>{required.filter(q => q.complete).length}<span>/3</span></b></header>
        <div className="progress"><span style={{ width: `${progress}%` }} /></div>
        <div className="strong-bonus"><span>✦</span><div><b>Strong Day</b><small>{strongDayRequirement}</small></div><em>{strongDay ? "SECURED" : "IN PROGRESS"}</em></div>
        <div className="quest-list">{required.map((q) => <QuestRow key={q.id} quest={q} onToggle={() => toggleQuest("required", q.id)} />)}</div>
        <div className="subheading"><span>BONUS QUESTS</span><small>MORE PRESTIGE</small></div>
        <div className="quest-list compact">{bonus.map((q) => <QuestRow key={q.id} quest={q} onToggle={() => toggleQuest("bonus", q.id)} />)}</div>
      </section>
      <aside className="side-stack">
        <section className="panel weekly-panel"><div className="panel-title"><div><p className="eyebrow">WEEKLY QUESTS</p><h2>The campaign</h2></div><span>{weekly.filter(q => q.complete).length}/{weekly.length}</span></div>{weekly.map((q) => <QuestRow key={q.id} quest={q} onToggle={() => toggleQuest("weekly", q.id)} />)}<button className="text-button">View full week <span>→</span></button></section>
        <section className="panel goal-peek"><p className="eyebrow">ACTIVE GOAL</p><div><span>◆</span><small>90 DAY QUEST</small></div><h3>Run my first half marathon</h3><div className="goal-progress"><span style={{ width: "60%" }} /></div><footer><b>3 of 5 milestones</b><span>Oct 18</span></footer></section>
      </aside>
    </div>
  </>;
}

function WeekView({ weeks, savePlan }: { weeks: PlannerWeek[]; savePlan: (plan: { startsOn: string; required: string[]; bonus: Array<{ dayIndex: number; titles: string[] }>; weekly: string[] }) => Promise<void> }) {
  const current = weeks[0];
  const next = weeks[1];
  return <section className="page-section"><PageHeader eyebrow="WEEKLY CALENDAR" title="Your campaign map" copy="Your quests now follow the calendar in your saved timezone." />
    {!current && <article className="panel planner-empty"><h2>Your campaign could not be loaded</h2><p>Run the latest database migrations, then refresh this page.</p><code>npm run db:migrate</code></article>}
    {current && <><div className="week-grid">{current.days.map((day) => <article className={`panel day-card ${day.active ? "active" : ""}`} key={day.date}><header><small>{formatDay(day.date)}</small><b>{dateFromIso(day.date).getUTCDate()}</b></header>{current.required.map((quest) => <div key={quest.id}><i className={day.requiredComplete === 3 ? "done" : ""}>{day.requiredComplete === 3 ? "✓" : ""}</i><span>{quest.title}</span></div>)}{current.bonus.find((item) => item.dayIndex === day.dayIndex)?.quests.map((quest, index) => <div className="bonus-line" key={quest.id}><i className={index < day.bonusComplete ? "done" : ""}>{index < day.bonusComplete ? "✓" : "+"}</i><span>{quest.title}</span></div>)}<footer>{day.strong ? "✦ Strong Day · +10 PP" : day.date < (current.days.find((item) => item.active)?.date ?? "") ? `${day.requiredComplete}/3 required · ${day.bonusComplete}/${day.bonusAssigned} bonus` : day.active ? `${day.requiredComplete}/3 required · ${day.bonusComplete}/${day.bonusAssigned} bonus` : "Upcoming"}</footer></article>)}</div><WeekPlanForm key={`current-${current.id}`} week={current} savePlan={savePlan} /></>}
    {next && <WeekPlanForm key={`next-${next.id}`} week={next} savePlan={savePlan} />}
  </section>;
}

function WeekPlanForm({ week, savePlan }: { week: PlannerWeek; savePlan: (plan: { startsOn: string; required: string[]; bonus: Array<{ dayIndex: number; titles: string[] }>; weekly: string[] }) => Promise<void> }) {
  const [required, setRequired] = useState(() => Array.from({ length: 3 }, (_, index) => week.required[index]?.title ?? ""));
  const [weekly, setWeekly] = useState(() => Array.from({ length: 3 }, (_, index) => week.weekly[index]?.title ?? ""));
  const [bonus, setBonus] = useState(() => Array.from({ length: 7 }, (_, dayIndex) => Array.from({ length: 2 }, (_, index) => week.bonus.find((day) => day.dayIndex === dayIndex)?.quests[index]?.title ?? "")));
  const [saving, setSaving] = useState(false);
  const update = (values: string[], index: number, value: string) => values.map((item, itemIndex) => itemIndex === index ? value : item);
  async function submit(event: FormEvent) { event.preventDefault(); setSaving(true); await savePlan({ startsOn: week.startsOn, required, weekly: weekly.filter((title) => title.trim()), bonus: bonus.map((titles, dayIndex) => ({ dayIndex, titles: titles.filter((title) => title.trim()) })) }); setSaving(false); }
  const isCurrent = week.status === "active";
  return <form className="panel week-planner" onSubmit={submit}><header><div><p className="eyebrow">{isCurrent ? "EDIT THIS CAMPAIGN" : "PLAN AHEAD"}</p><h2>{isCurrent ? "Current" : "Next"} campaign · {formatShortDate(week.startsOn)} – {formatShortDate(week.endsOn)}</h2><p>Set three quests that repeat daily, optional day-specific bonuses, and one to three weekly objectives.</p></div><button className="button button-gold" disabled={saving}>{saving ? "Saving…" : isCurrent ? "Save this week" : "Save next week"}</button></header>
    <section><h3>Required daily quests <span>Exactly 3</span></h3><div className="planner-required">{required.map((title, index) => <label key={index}><small>QUEST {index + 1}</small><input required maxLength={120} value={title} onChange={(event) => setRequired(update(required, index, event.target.value))} placeholder={index === 0 ? "Exercise for 30 minutes" : index === 1 ? "Plan tomorrow" : "Read for 20 minutes"} /></label>)}</div></section>
    <section><h3>Daily bonus quests <span>Up to 2 each day</span></h3><div className="planner-bonus">{week.days.map((day) => <div key={day.date}><b>{formatDay(day.date)} <small>{formatShortDate(day.date)}</small></b>{bonus[day.dayIndex].map((title, index) => <input key={index} maxLength={120} value={title} onChange={(event) => setBonus(bonus.map((titles, dayIndex) => dayIndex === day.dayIndex ? update(titles, index, event.target.value) : titles))} placeholder={`Bonus slot ${index + 1}`} />)}</div>)}</div></section>
    <section><h3>Weekly quests <span>Choose 1–3</span></h3><div className="planner-required">{weekly.map((title, index) => <label key={index}><small>{index === 0 ? "REQUIRED" : `OPTIONAL ${index}`}</small><input required={index === 0} maxLength={120} value={title} onChange={(event) => setWeekly(update(weekly, index, event.target.value))} placeholder={index === 0 ? "Complete the week’s main objective" : "Additional weekly quest"} /></label>)}</div></section>
  </form>;
}

function Goals({ goals, toggleMilestone, saveGoal }: { goals: Goal[]; toggleMilestone: (id: string) => void; saveGoal: (goal: { goalId?: string; title: string; description: string; targetDate: string | null; milestones: Array<{ id?: string; title: string }> }) => Promise<void> }) {
  const [editing, setEditing] = useState<Goal | "new" | null>(null);
  return <section className="page-section"><header className="page-header"><div><p className="eyebrow">LONG-TERM GOALS</p><h1>Build your legend</h1><p>Break ambitious goals into milestones you can conquer.</p></div><button className="button button-gold" onClick={() => setEditing("new")}>+ New goal</button></header>
    {goals.length === 0 ? <article className="panel goals-empty"><span>◆</span><h2>Set your first long-term goal</h2><p>Define the outcome you want, choose a target date, and divide the journey into milestones.</p><button className="button button-gold" onClick={() => setEditing("new")}>Create a goal</button></article> :
      <div className="goal-list">{goals.map((goal) => { const doneCount = goal.milestones.filter((item) => item.complete).length; return <article className="panel featured-goal" key={goal.id}><div className="goal-rune">◆</div><div className="goal-meta"><span>ACTIVE GOAL</span><small>Target: {goal.target_date ? formatShortDate(goal.target_date) : "No date"}</small></div><h2>{goal.title}</h2><p>{goal.description || "No description yet."}</p><div className="goal-progress large"><span style={{ width: `${goal.milestones.length ? (doneCount / goal.milestones.length) * 100 : 0}%` }} /></div><div className="goal-summary"><b>{doneCount} of {goal.milestones.length} milestones complete</b><button className="text-button" onClick={() => setEditing(goal)}>Edit goal</button></div><div className="milestones">{goal.milestones.map((item, index) => <button className={item.complete ? "done" : ""} key={item.id} onClick={() => toggleMilestone(item.id)}><i>{item.complete ? "✓" : index + 1}</i><span>{item.title}<small>{item.complete ? "Completed" : "Milestone"}</small></span><em>{item.complete ? "DONE" : "OPEN"}</em></button>)}</div></article>; })}</div>}
    {editing && <GoalForm goal={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSave={async (goal) => { await saveGoal(goal); setEditing(null); }} />}
  </section>;
}

function GoalForm({ goal, onClose, onSave }: { goal?: Goal; onClose: () => void; onSave: (goal: { goalId?: string; title: string; description: string; targetDate: string | null; milestones: Array<{ id?: string; title: string }> }) => Promise<void> }) {
  const [title, setTitle] = useState(goal?.title ?? "");
  const [description, setDescription] = useState(goal?.description ?? "");
  const [targetDate, setTargetDate] = useState(goal?.target_date ?? "");
  const [milestones, setMilestones] = useState<Array<{ id?: string; title: string }>>(goal?.milestones.map((item) => ({ id: item.id, title: item.title })) ?? [{ title: "" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try { await onSave({ goalId: goal?.id, title, description, targetDate: targetDate || null, milestones }); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to save goal"); setSaving(false); }
  }
  return <div className="form-modal-backdrop"><form className="panel goal-form" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="goal-form-title"><header><div><p className="eyebrow">{goal ? "EDIT JOURNEY" : "NEW JOURNEY"}</p><h2 id="goal-form-title">{goal ? "Refine your goal" : "Create a long-term goal"}</h2></div><button type="button" onClick={onClose} aria-label="Close goal form">×</button></header><label>Goal title<input required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Run my first half marathon" /></label><label>Description<textarea maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What does success look like?" /></label><label>Target date <small>Optional</small><input type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} /></label><section><div><b>Milestones</b><small>1–10 ordered steps</small></div>{milestones.map((milestone, index) => <div className="milestone-input" key={milestone.id ?? index}><span>{index + 1}</span><input required maxLength={120} value={milestone.title} onChange={(event) => setMilestones(milestones.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item))} placeholder="Define the next concrete step" />{milestones.length > 1 && <button type="button" onClick={() => setMilestones(milestones.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove milestone ${index + 1}`}>×</button>}</div>)}{milestones.length < 10 && <button type="button" className="text-button" onClick={() => setMilestones([...milestones, { title: "" }])}>+ Add milestone</button>}</section>{error && <p className="form-error" role="alert">{error}</p>}<footer><button type="button" className="walkthrough-back" onClick={onClose}>Cancel</button><button className="button button-gold" disabled={saving}>{saving ? "Saving…" : "Save goal"}</button></footer></form></div>;
}

function History({ history }: { history: CampaignHistory }) {
  const { summary, weeks } = history;
  return <section className="page-section"><PageHeader eyebrow="CAMPAIGN ARCHIVE" title="The record of your strength" copy="Every completed quest is proof that you showed up." />
    <section className="history-stats"><article><span>♨</span><div><small>CURRENT STREAK</small><b>{summary.currentStreak} {summary.currentStreak === 1 ? "day" : "days"}</b></div></article><article><span>✦</span><div><small>STRONG DAYS</small><b>{summary.strongDays} total</b></div></article><article><span>✦</span><div><small>LIFETIME PRESTIGE POINTS</small><b>{summary.lifetimePoints.toLocaleString()}</b></div></article></section>
    {weeks.length === 0 ? <article className="panel history-empty"><span>◇</span><h2>Your archive begins after this campaign</h2><p>When Saturday closes, this week’s Strong Days, quest results, and prestige points will be preserved here.</p></article> :
      <div className="history-list">{weeks.map((week, index) => <article className="panel history-row" key={week.id}><div className="week-number"><small>WEEK</small><b>{weeks.length - index}</b></div><div><small>DATE</small><b>{formatShortDate(week.startsOn)} – {formatShortDate(week.endsOn)}</b></div><div className="day-dots"><small>DAILY BREAKDOWN</small><span>{week.days.map((day) => <i className={day.strong ? "done" : day.requiredComplete > 0 || day.bonusComplete > 0 ? "partial" : ""} title={`${formatDay(day.date)}: ${day.requiredComplete}/3 required, ${day.bonusComplete}/${day.bonusAssigned} bonus${day.strong ? " · Strong Day" : ""}`} key={day.date} />)}</span><b>{week.strongDays}/7 strong</b></div><div><small>WEEKLY QUESTS</small><b>{week.weeklyCompleted}/{week.weeklyAssigned}</b></div><div><small>PRESTIGE EARNED</small><b className="gold">{week.pointsEarned >= 0 ? "+" : ""}{week.pointsEarned} PP</b></div><em>{week.rank}</em></article>)}</div>}
  </section>;
}

function PrestigeView({ prestige }: { prestige: Prestige }) {
  return <section className="page-section"><PageHeader eyebrow="PRESTIGE PATH" title="Strength measured over time" copy="Every daily quest adds 3 points, and every Strong Day adds 10 more. Prestige is permanent proof of sustained discipline." />
    <article className="panel prestige-hero"><div><span>PRESTIGE {prestige.level}</span><h2>{prestige.title}</h2><p>{prestige.points.toLocaleString()} lifetime points</p></div><div className="prestige-next"><small>{prestige.nextThreshold ? `NEXT: ${prestige.nextTitle}` : "MAXIMUM PRESTIGE"}</small><div className="goal-progress large"><span style={{ width: `${prestige.progress}%` }} /></div><b>{prestige.nextThreshold ? `${prestige.points.toLocaleString()} / ${prestige.nextThreshold.toLocaleString()} PP` : "All current tiers achieved"}</b></div></article>
    <div className="prestige-grid">{prestige.tiers.map((tier) => { const achieved = prestige.points >= tier.threshold; return <article className={`panel prestige-tier ${achieved ? "unlocked" : ""}`} key={tier.level}><span>PRESTIGE {tier.level}</span><div className="prestige-mark">{achieved ? "✓" : tier.level}</div><h3>{tier.title}</h3><b>{tier.threshold.toLocaleString()} PP</b><p>A permanent mark of your long-term consistency.</p><small>{achieved ? "ACHIEVED" : "INCOMPLETE"}</small></article>; })}</div>
  </section>;
}

function Settings({ profile, saveProfile, startWalkthrough }: { profile: Profile; saveProfile: (displayName: string, timezone: string) => void; startWalkthrough: () => void }) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [timezone, setTimezone] = useState(profile.timezone);
  async function signOut() {
    await fetch("/api/auth/sign-out", { method: "POST" });
    window.location.assign("/");
  }
  return <section className="page-section"><PageHeader eyebrow="PROFILE & SECURITY" title="Your adventurer’s record" copy="Manage your identity, timezone, and account access." />
    <div className="settings-grid"><section className="panel settings-panel"><h3>Profile</h3><label>Display name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label><label>Email address<input value={profile.email} disabled /></label><label>Timezone<select value={timezone} onChange={(event) => setTimezone(event.target.value)}><option>America/New_York</option><option>America/Chicago</option><option>America/Denver</option><option>America/Los_Angeles</option><option>Europe/London</option></select></label><button className="button button-gold" onClick={() => saveProfile(displayName, timezone)}>Save changes</button></section><aside><section className="panel security-card"><span>✦</span><div><h3>Passwordless security</h3><p>Your account is protected by one-time email codes. No password is stored by STRONGLY.</p><button className="auth-link" onClick={signOut}>Sign out</button></div></section><section className="panel settings-panel"><h3>Guidance</h3><p className="settings-copy">Review how daily quests, weekly planning, goals, History, and Prestige work.</p><button className="button walkthrough-replay" onClick={startWalkthrough}>Replay walkthrough</button></section><section className="panel settings-panel"><h3>Week preferences</h3><label className="toggle-row"><span><b>Week starts Sunday</b><small>Your campaigns close Saturday at midnight.</small></span><input type="checkbox" defaultChecked /></label><label className="toggle-row"><span><b>Reduced motion</b><small>Minimize completion animations.</small></span><input type="checkbox" /></label></section></aside></div>
  </section>;
}

function Walkthrough({ step, onBack, onNext, onSkip }: { step: number; onBack: () => void; onNext: () => void; onSkip: () => void }) {
  const item = walkthroughSteps[step];
  const last = step === walkthroughSteps.length - 1;
  return <div className="walkthrough-backdrop" role="presentation" style={{ position: "fixed", inset: 0, zIndex: 1000, display: "grid", placeItems: "center", padding: 24, background: "rgba(3, 7, 5, .88)", backdropFilter: "blur(5px)" }}>
    <section className="walkthrough-card" role="dialog" aria-modal="true" aria-labelledby="walkthrough-title" aria-describedby="walkthrough-detail" style={{ width: "min(560px, 100%)", maxHeight: "calc(100vh - 32px)", overflowY: "auto" }}>
      <header><span>{item.eyebrow}</span><button onClick={onSkip} aria-label="Skip walkthrough">×</button></header>
      <div className="walkthrough-icon">{step + 1}</div>
      <small>STEP {step + 1} OF {walkthroughSteps.length} · {item.section.toUpperCase()}</small>
      <h2 id="walkthrough-title">{item.title}</h2>
      <p>{item.copy}</p>
      <div id="walkthrough-detail" className="walkthrough-detail">{item.detail}</div>
      <div className="walkthrough-dots" aria-label={`Step ${step + 1} of ${walkthroughSteps.length}`}>{walkthroughSteps.map((_, index) => <i className={index === step ? "active" : index < step ? "done" : ""} key={index} />)}</div>
      <footer><button className="walkthrough-skip" onClick={onSkip}>Skip tour</button><div>{step > 0 && <button className="walkthrough-back" onClick={onBack}>Back</button>}<button className="button button-gold" onClick={onNext}>{last ? "Begin my campaign" : "Next"}</button></div></footer>
    </section>
  </div>;
}

function PageHeader({ eyebrow, title, copy, button }: { eyebrow: string; title: string; copy: string; button?: string }) {
  return <header className="page-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{copy}</p></div>{button && <button className="button button-gold">{button}</button>}</header>;
}
