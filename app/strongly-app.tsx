"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { isValidTimeZone, supportedTimeZones } from "./timezones";

type Identity = { email: string; displayName: string; fullName: string | null };
type Section = "Today" | "Week" | "Goals" | "History" | "Prestige" | "Settings";
type Quest = { id: string; title: string; complete: boolean; kind?: "required" | "bonus"; milestone_id?: string | null; day_index?: number | null; position?: number };
type Milestone = { id: string; title: string; complete: boolean; position: number };
type Goal = { id: string; title: string; description: string; target_date: string | null; status: "active" | "completed" | "archived"; featured: number; completed_at: string | null; archived_at: string | null; milestones: Milestone[] };
type Profile = { email: string; displayName: string; timezone: string; onboardingComplete: boolean; masterMode: boolean };
type Prestige = { points: number; level: number; title: string; nextThreshold: number | null; nextTitle: string | null; progress: number; tiers: Array<{ level: number; threshold: number; title: string }> };
type PlannerWeek = { id: string; startsOn: string; endsOn: string; status: string; reflection: string; editable: boolean; lockReason: string | null; required: Quest[]; bonus: Array<{ dayIndex: number; quests: Quest[] }>; weekly: Quest[]; days: Array<{ dayIndex: number; date: string; requiredComplete: number; bonusAssigned: number; bonusComplete: number; completedQuestIds: string[]; strong: boolean; active: boolean }> };
type HistoryQuest = { title: string; complete: boolean };
type HistoryWeek = { id: string; startsOn: string; endsOn: string; reflection: string; isPreviousWeek: boolean; days: Array<{ date: string; requiredComplete: number; bonusAssigned: number; bonusComplete: number; requiredQuests?: HistoryQuest[]; bonusQuests?: HistoryQuest[]; strong: boolean }>; weeklyQuests?: HistoryQuest[]; strongDays: number; weeklyCompleted: number; weeklyAssigned: number; pointsEarned: number; rank: string };
type CampaignHistory = { summary: { currentStreak: number; strongDays: number; lifetimePoints: number }; weeks: HistoryWeek[] };
type WeekPlanPayload = { startsOn: string; required: string[]; bonus: Array<{ dayIndex: number; titles: string[] }>; weekly: Array<{ title: string; milestoneId: string | null }> };
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
  const [profile, setProfile] = useState<Profile>({ email: identity.email, displayName: identity.fullName ?? "Hero", timezone: "America/New_York", onboardingComplete: true, masterMode: false });
  const [prestige, setPrestige] = useState<Prestige>({ points: 0, level: 0, title: "Unprestiged", nextThreshold: 1_000, nextTitle: "Iron Resolve", progress: 0, tiers: [] });
  const [goals, setGoals] = useState<Goal[]>([]);
  const [today, setToday] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);
  const [mobileNav, setMobileNav] = useState(false);
  const [planner, setPlanner] = useState<PlannerWeek[]>([]);
  const [history, setHistory] = useState<CampaignHistory>({ summary: { currentStreak: 0, strongDays: 0, lifetimePoints: 0 }, weeks: [] });
  const [walkthroughOpen, setWalkthroughOpen] = useState(false);
  const [walkthroughStep, setWalkthroughStep] = useState(0);
  const [accountOpen, setAccountOpen] = useState(false);
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
    setToast(quest.complete ? `${quest.title} reopened${group === "weekly" && quest.milestone_id ? " · linked milestone updated" : ""}` : group === "weekly" ? quest.milestone_id ? "Weekly quest and linked milestone complete" : "Weekly quest complete" : "Quest complete · +3 prestige points");
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

  async function updateGoalLifecycle(action: { type: "goal-status"; goalId: string; status: "active" | "completed" | "archived" } | { type: "feature-goal" | "delete-goal"; goalId: string }) {
    try {
      await post(action);
      if (action.type === "feature-goal") setToast("Today goal updated");
      else if (action.type === "delete-goal") setToast("Goal permanently deleted");
      else if ("status" in action) setToast(action.status === "completed" ? "Goal completed" : action.status === "archived" ? "Goal archived" : "Goal restored");
    } catch (error) { setToast(error instanceof Error ? error.message : "Unable to update goal"); }
    window.setTimeout(() => setToast(""), 2600);
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

  async function setMasterMode(enabled: boolean) {
    try {
      await post({ type: "master-mode", enabled });
      setToast(enabled ? "Master Mode enabled" : "Master Mode disabled");
    } catch (error) { setToast(error instanceof Error ? error.message : "Unable to update Master Mode"); }
    window.setTimeout(() => setToast(""), 2400);
  }

  async function correctPastQuest(questId: string, completedOn: string) {
    try {
      await post({ type: "toggle-daily", questId, completedOn });
      setToast("Past-day record corrected");
    } catch (error) { setToast(error instanceof Error ? error.message : "Unable to correct that day"); }
    window.setTimeout(() => setToast(""), 2400);
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
    if (section === "Today") return <Today required={required} bonus={bonus} weekly={weekly} goals={goals} prestige={prestige} progress={progress} toggleQuest={toggleQuest} today={today} week={planner[0]} displayName={profile.displayName} onViewWeek={() => setSection("Week")} onViewGoals={() => setSection("Goals")} onViewPrestige={() => setSection("Prestige")} />;
    if (section === "Week") return <WeekView weeks={planner} goals={goals.filter((goal) => goal.status === "active")} today={today} masterMode={profile.masterMode} correctPastQuest={correctPastQuest} savePlan={async (plan) => { try { await post({ type: "plan-week", ...plan }); setToast(plan.startsOn === planner[0]?.startsOn ? "Current campaign saved" : "Next campaign saved"); } catch (error) { setToast(error instanceof Error ? error.message : "Unable to save week"); } }} saveReflection={async (weekId, reflection) => { await post({ type: "save-week-reflection", weekId, reflection }); setToast(reflection.trim() ? "Weekly reflection saved" : "Weekly reflection cleared"); window.setTimeout(() => setToast(""), 2200); }} />;
    if (section === "Goals") return <Goals goals={goals} toggleMilestone={toggleMilestone} saveGoal={saveGoal} updateLifecycle={updateGoalLifecycle} />;
    if (section === "History") return <History history={history} masterMode={profile.masterMode} saveReflection={async (weekId, reflection) => { await post({ type: "save-week-reflection", weekId, reflection }); setToast(reflection.trim() ? "Historical reflection updated" : "Historical reflection cleared"); window.setTimeout(() => setToast(""), 2200); }} />;
    if (section === "Prestige") return <PrestigeView prestige={prestige} />;
    return <Settings key={`${profile.displayName}:${profile.timezone}`} profile={profile} saveProfile={saveProfile} setMasterMode={setMasterMode} startWalkthrough={startWalkthrough} />;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, required, bonus, weekly, goals, progress, prestige, planner, history, today, profile]);

  return (
    <div className="app-shell theme-obsidian">
      <aside className={mobileNav ? "sidebar open" : "sidebar"}>
        <div className="brand">STRONGLY<span>.</span></div>
        <div className="profile">
          <div className="avatar">C</div>
          <div><b>{profile.displayName}</b><span><i /> Prestige {prestige.level} · {prestige.title}</span></div>
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
          <div className="top-actions"><div className="streak"><span>♨</span><b>{history.summary.currentStreak}</b><small>DAY STREAK</small></div><div className="prestige-chip"><span>✦</span><b>{prestige.points.toLocaleString()}</b><small>PRESTIGE POINTS</small></div><div className="account-anchor"><button className="round" aria-label="Open profile" aria-expanded={accountOpen} onClick={() => setAccountOpen(!accountOpen)}>♟<i /></button>{accountOpen && <AccountPanel profile={profile} onClose={() => setAccountOpen(false)} onSaveName={async (displayName) => { await saveProfile(displayName, profile.timezone); }} onEmailChanged={(email) => setProfile((current) => ({ ...current, email }))} />}</div></div>
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
    <i className="check">{quest.complete ? "✓" : ""}</i><span className="quest-copy"><b>{quest.title}</b><small>{quest.kind === "bonus" ? "Bonus quest" : quest.kind === "required" ? "Required quest" : quest.milestone_id ? "Weekly quest · Linked milestone" : "Weekly quest"}</small></span>{quest.kind && <span className="quest-points">+3 <em>PP</em></span>}
  </button>;
}

function PrestigeSeal({ prestige, onClick }: { prestige: Prestige; onClick: () => void }) {
  const percentage = prestige.nextThreshold ? Math.max(0, Math.min(100, Math.round(prestige.progress))) : 100;
  const label = prestige.nextThreshold ? `${percentage}% toward Prestige ${prestige.level + 1}, ${prestige.nextTitle}` : "Maximum prestige achieved";
  return <button className="rank-seal prestige-seal" onClick={onClick} aria-label={`${label}. View prestige progress.`}><svg viewBox="0 0 100 100" aria-hidden="true"><circle className="prestige-track" cx="50" cy="50" r="44" /><circle className="prestige-meter" cx="50" cy="50" r="44" pathLength="100" strokeDasharray={`${percentage} 100`} /></svg><span>✦</span><b>{percentage}%</b><small>{prestige.nextThreshold ? `TO P${prestige.level + 1}` : "COMPLETE"}</small></button>;
}

function Today({ required, bonus, weekly, goals, prestige, progress, toggleQuest, today, week, displayName, onViewWeek, onViewGoals, onViewPrestige }: { required: Quest[]; bonus: Quest[]; weekly: Quest[]; goals: Goal[]; prestige: Prestige; progress: number; toggleQuest: (g: "required" | "bonus" | "weekly", id: string) => void; today: string; week?: PlannerWeek; displayName: string; onViewWeek: () => void; onViewGoals: () => void; onViewPrestige: () => void }) {
  const strongDay = required.filter((quest) => quest.complete).length === 3 && bonus.every((quest) => quest.complete);
  const activeGoals = goals.filter((goal) => goal.status === "active");
  const activeGoal = activeGoals.find((goal) => Boolean(goal.featured)) ?? activeGoals.find((goal) => goal.milestones.some((milestone) => !milestone.complete)) ?? activeGoals[0];
  const completedMilestones = activeGoal?.milestones.filter((milestone) => milestone.complete).length ?? 0;
  const milestoneCount = activeGoal?.milestones.length ?? 0;
  const goalProgress = milestoneCount === 0 ? 0 : Math.round((completedMilestones / milestoneCount) * 100);
  const strongDayRequirement = bonus.length === 0
    ? "Complete all 3 required quests · +10 PP"
    : `Complete all 3 required and ${bonus.length} bonus ${bonus.length === 1 ? "quest" : "quests"} · +10 PP`;
  return <>
    <section className="welcome"><div><p className="eyebrow">{formatLongDate(today)}</p><h1>Good afternoon, <em>{displayName}.</em></h1><p>{strongDay ? "Strong Day secured. You earned 10 bonus prestige points." : bonus.length > 0 ? "Finish every required and scheduled bonus quest to secure today’s Strong Day." : "Finish your three required quests and strengthen today’s record."}</p></div><PrestigeSeal prestige={prestige} onClick={onViewPrestige} /></section>
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
        <section className="panel weekly-panel"><div className="panel-title"><div><p className="eyebrow">WEEKLY QUESTS</p><h2>The campaign</h2></div><span>{weekly.filter(q => q.complete).length}/{weekly.length}</span></div>{weekly.map((q) => <QuestRow key={q.id} quest={q} onToggle={() => toggleQuest("weekly", q.id)} />)}<button className="text-button" onClick={onViewWeek}>View full week <span>→</span></button></section>
        {activeGoal ? <section className="panel goal-peek"><p className="eyebrow">ACTIVE GOAL</p><div><span>◆</span><small>{activeGoal.target_date ? `TARGET · ${formatShortDate(activeGoal.target_date)}` : "LONG-TERM QUEST"}</small></div><h3>{activeGoal.title}</h3><div className="goal-progress" aria-label={`${goalProgress}% complete`}><span style={{ width: `${goalProgress}%` }} /></div><footer><b>{completedMilestones} of {milestoneCount} {milestoneCount === 1 ? "milestone" : "milestones"}</b><button className="text-button goal-peek-link" onClick={onViewGoals}>View goal <span>→</span></button></footer></section> : <section className="panel goal-peek goal-peek-empty"><p className="eyebrow">ACTIVE GOAL</p><div><span>◇</span><small>NO JOURNEY YET</small></div><h3>Choose what you want to conquer next.</h3><p>Build a long-term goal and divide it into milestones.</p><button className="text-button goal-peek-link" onClick={onViewGoals}>Create a goal <span>→</span></button></section>}
      </aside>
    </div>
  </>;
}

function WeekDayQuest({ quest, completed, editable, bonus, onToggle }: { quest: Quest; completed: boolean; editable: boolean; bonus?: boolean; onToggle: () => void }) {
  const content = <><i className={completed ? "done" : ""}>{completed ? "✓" : bonus ? "+" : ""}</i><span>{quest.title}</span></>;
  return editable ? <button className={`day-quest-line ${bonus ? "bonus-line" : ""}`} onClick={onToggle} aria-label={`${completed ? "Reopen" : "Complete"} ${quest.title}`}>{content}</button> : <div className={bonus ? "bonus-line" : ""}>{content}</div>;
}

function WeekView({ weeks, goals, today, masterMode, correctPastQuest, savePlan, saveReflection }: { weeks: PlannerWeek[]; goals: Goal[]; today: string; masterMode: boolean; correctPastQuest: (questId: string, completedOn: string) => Promise<void>; savePlan: (plan: WeekPlanPayload) => Promise<void>; saveReflection: (weekId: string, reflection: string) => Promise<void> }) {
  const current = weeks[0];
  const next = weeks[1];
  return <section className="page-section"><PageHeader eyebrow="WEEKLY CALENDAR" title="Your campaign map" copy="Your quests now follow the calendar in your saved timezone." />
    {masterMode && <aside className="master-mode-banner" role="status"><span>◆</span><div><b>Master Mode enabled</b><p>You may correct quests from earlier days in this campaign. STRONGLY trusts you to keep your record honest.</p></div></aside>}
    {!current && <article className="panel planner-empty"><h2>Your campaign could not be loaded</h2><p>Run the latest database migrations, then refresh this page.</p><code>npm run db:migrate</code></article>}
    {current && <><div className="week-grid">{current.days.map((day) => { const editablePastDay = masterMode && current.status === "active" && day.date < today; return <article className={`panel day-card ${day.active ? "active" : ""} ${editablePastDay ? "master-editable" : ""}`} key={day.date}><header><small>{formatDay(day.date)}</small><b>{dateFromIso(day.date).getUTCDate()}</b>{editablePastDay && <em>EDITABLE</em>}</header>{current.required.map((quest) => <WeekDayQuest key={quest.id} quest={quest} completed={day.completedQuestIds.includes(quest.id)} editable={editablePastDay} onToggle={() => void correctPastQuest(quest.id, day.date)} />)}{current.bonus.find((item) => item.dayIndex === day.dayIndex)?.quests.map((quest) => <WeekDayQuest bonus key={quest.id} quest={quest} completed={day.completedQuestIds.includes(quest.id)} editable={editablePastDay} onToggle={() => void correctPastQuest(quest.id, day.date)} />)}<footer>{day.strong ? "✦ Strong Day · +10 PP" : day.date < today ? `${day.requiredComplete}/3 required · ${day.bonusComplete}/${day.bonusAssigned} bonus` : day.active ? `${day.requiredComplete}/3 required · ${day.bonusComplete}/${day.bonusAssigned} bonus` : "Upcoming"}</footer></article>; })}</div><WeekPlanForm key={`current-${current.id}`} week={current} goals={goals} savePlan={savePlan} /></>}
    {current && <WeekReflection key={`reflection-${current.id}-${current.reflection}`} week={current} saveReflection={saveReflection} />}
    {next && <WeekPlanForm key={`next-${next.id}`} week={next} goals={goals} savePlan={savePlan} />}
  </section>;
}

function WeekReflection({ week, saveReflection }: { week: PlannerWeek; saveReflection: (weekId: string, reflection: string) => Promise<void> }) {
  const [reflection, setReflection] = useState(week.reflection);
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); setSaving(true); try { await saveReflection(week.id, reflection); } finally { setSaving(false); } }
  return <form className="panel week-reflection" onSubmit={submit}><div><p className="eyebrow">CAMPAIGN JOURNAL</p><h2>Reflect on this week</h2><p>Capture wins, lessons, obstacles, or anything you want to remember when this campaign enters History.</p></div><label htmlFor={`week-reflection-${week.id}`}>Weekly note <span>{reflection.length}/2,000</span></label><textarea id={`week-reflection-${week.id}`} maxLength={2000} value={reflection} onChange={(event) => setReflection(event.target.value)} placeholder="What stood out this week? What will you carry into the next campaign?" /><footer><small>This note becomes read-only when the campaign closes.</small><button className="button button-gold" disabled={saving || reflection.trim() === week.reflection}>{saving ? "Saving…" : "Save reflection"}</button></footer></form>;
}

function MilestoneSelect({ goals, value, disabled, usedMilestones, label, onChange }: { goals: Goal[]; value: string | null; disabled: boolean; usedMilestones: Set<string>; label: string; onChange: (value: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const selected = goals.flatMap((goal) => goal.milestones).find((milestone) => milestone.id === value);
  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("mousedown", closeOnOutsideClick); document.removeEventListener("keydown", closeOnEscape); };
  }, [open]);
  return <div className={`milestone-select ${open ? "open" : ""}`} ref={root}>
    <button type="button" className="milestone-select-trigger" disabled={disabled} aria-label={label} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}><span>{selected?.title ?? "No linked milestone"}</span><i>{open ? "▴" : "▾"}</i></button>
    {open && <div className="milestone-select-menu" role="listbox" aria-label={label}>
      <button type="button" role="option" aria-selected={!value} className={!value ? "selected" : ""} onClick={() => { onChange(null); setOpen(false); }}><span>No linked milestone</span><small>Track this quest independently</small></button>
      {goals.map((goal) => <section key={goal.id}><header>{goal.title}</header>{goal.milestones.map((milestone) => { const unavailable = usedMilestones.has(milestone.id); return <button type="button" role="option" aria-selected={value === milestone.id} className={value === milestone.id ? "selected" : ""} disabled={unavailable} onClick={() => { onChange(milestone.id); setOpen(false); }} key={milestone.id}><span>{milestone.title}</span><small>{unavailable ? "Linked to another weekly quest" : milestone.complete ? "Milestone already complete" : "Complete with this weekly quest"}</small></button>; })}</section>)}
      {goals.length === 0 && <p>Create a long-term goal first to link a milestone.</p>}
    </div>}
  </div>;
}

function WeekPlanForm({ week, goals, savePlan }: { week: PlannerWeek; goals: Goal[]; savePlan: (plan: WeekPlanPayload) => Promise<void> }) {
  const [required, setRequired] = useState(() => Array.from({ length: 3 }, (_, index) => week.required[index]?.title ?? ""));
  const [weekly, setWeekly] = useState(() => Array.from({ length: 3 }, (_, index) => ({ title: week.weekly[index]?.title ?? "", milestoneId: week.weekly[index]?.milestone_id ?? null })));
  const [bonus, setBonus] = useState(() => Array.from({ length: 7 }, (_, dayIndex) => Array.from({ length: 2 }, (_, index) => week.bonus.find((day) => day.dayIndex === dayIndex)?.quests[index]?.title ?? "")));
  const [saving, setSaving] = useState(false);
  const update = (values: string[], index: number, value: string) => values.map((item, itemIndex) => itemIndex === index ? value : item);
  async function submit(event: FormEvent) { event.preventDefault(); if (!week.editable) return; setSaving(true); await savePlan({ startsOn: week.startsOn, required, weekly: weekly.filter((quest) => quest.title.trim()).map((quest) => ({ ...quest, title: quest.title.trim() })), bonus: bonus.map((titles, dayIndex) => ({ dayIndex, titles: titles.filter((title) => title.trim()) })) }); setSaving(false); }
  const isCurrent = week.status === "active";
  const guidance = week.lockReason ?? (isCurrent ? "You can edit this campaign until you complete its first daily or weekly quest. After progress begins, reopen every completion before changing the plan." : "Plan freely now. These quests become your active campaign on Sunday and lock after you begin completing them.");
  return <form className={`panel week-planner ${week.editable ? "" : "locked"}`} onSubmit={submit}><header><div><p className="eyebrow">{week.editable ? isCurrent ? "EDIT THIS CAMPAIGN" : "PLAN AHEAD" : "CAMPAIGN LOCKED"}</p><h2>{isCurrent ? "Current" : "Next"} campaign · {formatShortDate(week.startsOn)} – {formatShortDate(week.endsOn)}</h2><p>Set three quests that repeat daily, optional day-specific bonuses, and one to three weekly objectives.</p></div><button className="button button-gold" disabled={saving || !week.editable} title={week.lockReason ?? undefined}>{saving ? "Saving…" : week.editable ? isCurrent ? "Save this week" : "Save next week" : "Planning locked"}</button></header>
    <div className={`planning-safeguard ${week.editable ? "editable" : "locked"}`} role="status"><span>{week.editable ? "◇" : "◆"}</span><div><b>{week.editable ? "Planning is open" : "Your progress is protected"}</b><p>{guidance}</p></div></div>
    <section><h3>Required daily quests <span>Exactly 3</span></h3><div className="planner-required">{required.map((title, index) => <label key={index}><small>QUEST {index + 1}</small><input disabled={!week.editable} required maxLength={120} value={title} onChange={(event) => setRequired(update(required, index, event.target.value))} placeholder={index === 0 ? "Exercise for 30 minutes" : index === 1 ? "Plan tomorrow" : "Read for 20 minutes"} /></label>)}</div></section>
    <section><h3>Daily bonus quests <span>Up to 2 each day</span></h3><div className="planner-bonus">{week.days.map((day) => <div key={day.date}><b>{formatDay(day.date)} <small>{formatShortDate(day.date)}</small></b>{bonus[day.dayIndex].map((title, index) => <input disabled={!week.editable} key={index} maxLength={120} value={title} onChange={(event) => setBonus(bonus.map((titles, dayIndex) => dayIndex === day.dayIndex ? update(titles, index, event.target.value) : titles))} placeholder={`Bonus slot ${index + 1}`} />)}</div>)}</div></section>
    <section><h3>Weekly quests <span>Choose 1–3 · Link milestones optionally</span></h3><div className="planner-required">{weekly.map((quest, index) => <div className="weekly-quest-field" key={index}><small>{index === 0 ? "REQUIRED" : `OPTIONAL ${index}`}</small><input aria-label={`Weekly quest ${index + 1}`} disabled={!week.editable} required={index === 0} maxLength={120} value={quest.title} onChange={(event) => setWeekly(weekly.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item))} placeholder={index === 0 ? "Complete the week’s main objective" : "Additional weekly quest"} /><MilestoneSelect goals={goals} value={quest.milestoneId} disabled={!week.editable || !quest.title.trim()} usedMilestones={new Set(weekly.filter((_, itemIndex) => itemIndex !== index).map((item) => item.milestoneId).filter((id): id is string => Boolean(id)))} label={`Linked milestone for weekly quest ${index + 1}`} onChange={(milestoneId) => setWeekly(weekly.map((item, itemIndex) => itemIndex === index ? { ...item, milestoneId } : item))} /></div>)}</div></section>
  </form>;
}

function Goals({ goals, toggleMilestone, saveGoal, updateLifecycle }: { goals: Goal[]; toggleMilestone: (id: string) => void; saveGoal: (goal: { goalId?: string; title: string; description: string; targetDate: string | null; milestones: Array<{ id?: string; title: string }> }) => Promise<void>; updateLifecycle: (action: { type: "goal-status"; goalId: string; status: "active" | "completed" | "archived" } | { type: "feature-goal" | "delete-goal"; goalId: string }) => Promise<void> }) {
  const [editing, setEditing] = useState<Goal | "new" | null>(null);
  return <section className="page-section"><header className="page-header"><div><p className="eyebrow">LONG-TERM GOALS</p><h1>Build your legend</h1><p>Break ambitious goals into milestones you can conquer.</p></div><button className="button button-gold" onClick={() => setEditing("new")}>+ New goal</button></header>
    {goals.length === 0 ? <article className="panel goals-empty"><span>◆</span><h2>Set your first long-term goal</h2><p>Define the outcome you want, choose a target date, and divide the journey into milestones.</p><button className="button button-gold" onClick={() => setEditing("new")}>Create a goal</button></article> :
      <div className="goal-list">{goals.map((goal) => { const doneCount = goal.milestones.filter((item) => item.complete).length; const inactive = goal.status !== "active"; return <article className={`panel featured-goal goal-${goal.status}`} key={goal.id}><div className="goal-rune">{goal.featured ? "✦" : "◆"}</div><div className="goal-meta"><span>{goal.featured ? "TODAY GOAL" : `${goal.status.toUpperCase()} GOAL`}</span><small>Target: {goal.target_date ? formatShortDate(goal.target_date) : "No date"}</small></div><h2>{goal.title}</h2><p>{goal.description || "No description yet."}</p><div className="goal-progress large"><span style={{ width: `${goal.milestones.length ? (doneCount / goal.milestones.length) * 100 : 0}%` }} /></div><div className="goal-summary"><b>{doneCount} of {goal.milestones.length} milestones complete</b><div className="goal-actions">{goal.status === "active" && !goal.featured && <button className="text-button" onClick={() => void updateLifecycle({ type: "feature-goal", goalId: goal.id })}>Show on Today</button>}<button className="text-button" onClick={() => setEditing(goal)}>Edit</button>{goal.status === "active" && <button className="text-button" onClick={() => void updateLifecycle({ type: "goal-status", goalId: goal.id, status: "completed" })}>Complete goal</button>}{goal.status !== "archived" && <button className="text-button" onClick={() => void updateLifecycle({ type: "goal-status", goalId: goal.id, status: "archived" })}>Archive</button>}{inactive && <button className="text-button" onClick={() => void updateLifecycle({ type: "goal-status", goalId: goal.id, status: "active" })}>Restore</button>}<button className="text-button danger" onClick={() => { if (window.confirm(`Permanently delete “${goal.title}” and all of its milestones?`)) void updateLifecycle({ type: "delete-goal", goalId: goal.id }); }}>Delete</button></div></div><div className="milestones">{goal.milestones.map((item, index) => <button disabled={inactive} className={item.complete ? "done" : ""} key={item.id} onClick={() => toggleMilestone(item.id)}><i>{item.complete ? "✓" : index + 1}</i><span>{item.title}<small>{item.complete ? "Completed" : "Milestone"}</small></span><em>{item.complete ? "DONE" : "OPEN"}</em></button>)}</div></article>; })}</div>}
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
  const moveMilestone = (index: number, direction: -1 | 1) => { const next = index + direction; if (next < 0 || next >= milestones.length) return; const reordered = [...milestones]; [reordered[index], reordered[next]] = [reordered[next], reordered[index]]; setMilestones(reordered); };
  return <div className="form-modal-backdrop"><form className="panel goal-form" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="goal-form-title"><header><div><p className="eyebrow">{goal ? "EDIT JOURNEY" : "NEW JOURNEY"}</p><h2 id="goal-form-title">{goal ? "Refine your goal" : "Create a long-term goal"}</h2></div><button type="button" onClick={onClose} aria-label="Close goal form">×</button></header><label>Goal title<input required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Run my first half marathon" /></label><label>Description<textarea maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What does success look like?" /></label><label>Target date <small>Optional</small><input type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} /></label><section><div><b>Milestones</b><small>1–10 ordered steps</small></div>{milestones.map((milestone, index) => <div className="milestone-input" key={milestone.id ?? index}><span>{index + 1}</span><input required maxLength={120} value={milestone.title} onChange={(event) => setMilestones(milestones.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item))} placeholder="Define the next concrete step" /><div className="milestone-order"><button type="button" disabled={index === 0} onClick={() => moveMilestone(index, -1)} aria-label={`Move milestone ${index + 1} up`}>↑</button><button type="button" disabled={index === milestones.length - 1} onClick={() => moveMilestone(index, 1)} aria-label={`Move milestone ${index + 1} down`}>↓</button></div>{milestones.length > 1 && <button type="button" className="milestone-remove" onClick={() => setMilestones(milestones.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove milestone ${index + 1}`}>×</button>}</div>)}{milestones.length < 10 && <button type="button" className="text-button" onClick={() => setMilestones([...milestones, { title: "" }])}>+ Add milestone</button>}</section>{error && <p className="form-error" role="alert">{error}</p>}<footer><button type="button" className="walkthrough-back" onClick={onClose}>Cancel</button><button className="button button-gold" disabled={saving}>{saving ? "Saving…" : "Save goal"}</button></footer></form></div>;
}

function HistoryPopover({ label, children, align = "right" }: { label: string; children: ReactNode; align?: "left" | "right" }) {
  return <div className={`history-popover ${align}`}><button type="button" aria-haspopup="dialog">{label}</button><div className="history-popover-card" role="dialog" aria-label={label}>{children}</div></div>;
}

function HistoryQuestDetails({ week }: { week: HistoryWeek }) {
  const hasDetailedRecord = week.days.some((day) => day.requiredQuests || day.bonusQuests) || Boolean(week.weeklyQuests);
  return <div className="history-quest-details"><header><p className="eyebrow">COMPLETE QUEST RECORD</p><h3>{formatShortDate(week.startsOn)} – {formatShortDate(week.endsOn)}</h3></header>{!hasDetailedRecord ? <p className="history-detail-unavailable">Detailed quest records are loading. Refresh once the campaign server has restarted.</p> : <><div className="history-days">{week.days.map((day) => { const requiredQuests = day.requiredQuests ?? []; const bonusQuests = day.bonusQuests ?? []; return <section key={day.date}><div><b>{formatDay(day.date)}</b><small>{formatShortDate(day.date)}{day.strong ? " · Strong Day" : ""}</small></div><ul>{requiredQuests.map((quest, index) => <li className={quest.complete ? "complete" : ""} key={`required-${index}`}><i>{quest.complete ? "✓" : "○"}</i><span>{quest.title}<small>Required daily</small></span></li>)}{bonusQuests.map((quest, index) => <li className={quest.complete ? "complete bonus" : "bonus"} key={`bonus-${index}`}><i>{quest.complete ? "✓" : "+"}</i><span>{quest.title}<small>Bonus quest</small></span></li>)}{bonusQuests.length === 0 && <li className="empty">No bonus quests scheduled</li>}</ul></section>; })}</div><section className="history-weekly-detail"><h4>Weekly quests</h4><ul>{(week.weeklyQuests ?? []).map((quest, index) => <li className={quest.complete ? "complete" : ""} key={index}><i>{quest.complete ? "✓" : "○"}</i><span>{quest.title}</span></li>)}</ul></section></>}</div>;
}

function HistoryReflection({ week, editable, onEdit }: { week: HistoryWeek; editable: boolean; onEdit: () => void }) {
  return <div className="history-reflection"><p className="eyebrow">WEEKLY REFLECTION</p>{week.reflection ? <p>{week.reflection}</p> : <p className="reflection-empty">No reflection was written for this campaign.</p>}<small>{editable ? "Master Mode permits revising the immediately previous campaign." : "Preserved exactly as this campaign closed."}</small>{editable && <button type="button" className="reflection-edit" onClick={onEdit}>{week.reflection ? "Edit reflection" : "Add reflection"}</button>}</div>;
}

function HistoryReflectionEditor({ week, onClose, onSave }: { week: HistoryWeek; onClose: () => void; onSave: (reflection: string) => Promise<void> }) {
  const [reflection, setReflection] = useState(week.reflection);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) { event.preventDefault(); setSaving(true); setError(""); try { await onSave(reflection); onClose(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to update reflection"); setSaving(false); } }
  return <div className="form-modal-backdrop"><form className="panel reflection-editor" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="history-reflection-title"><header><div><p className="eyebrow">MASTER MODE · HONOR SYSTEM</p><h2 id="history-reflection-title">Revise previous reflection</h2><small>{formatShortDate(week.startsOn)} – {formatShortDate(week.endsOn)}</small></div><button type="button" onClick={onClose} aria-label="Close reflection editor">×</button></header><blockquote>You are revising an archived campaign. Use Master Mode only to correct an honest omission or improve the reflection—not to rewrite your recorded progress.</blockquote><label htmlFor="historical-reflection">Weekly reflection <span>{reflection.length}/2,000</span></label><textarea id="historical-reflection" maxLength={2000} value={reflection} onChange={(event) => setReflection(event.target.value)} placeholder="What stood out during this campaign?" />{error && <p className="form-error" role="alert">{error}</p>}<footer><button type="button" className="walkthrough-back" onClick={onClose}>Cancel</button><button className="button button-gold" disabled={saving || reflection.trim() === week.reflection}>{saving ? "Saving…" : "Save historical reflection"}</button></footer></form></div>;
}

function History({ history, masterMode, saveReflection }: { history: CampaignHistory; masterMode: boolean; saveReflection: (weekId: string, reflection: string) => Promise<void> }) {
  const { summary, weeks } = history;
  const [editingReflection, setEditingReflection] = useState<HistoryWeek | null>(null);
  return <section className="page-section"><PageHeader eyebrow="CAMPAIGN ARCHIVE" title="The record of your strength" copy="Hover or focus on a week’s records to revisit every quest and reflection." />
    <section className="history-stats"><article><span>♨</span><div><small>CURRENT STREAK</small><b>{summary.currentStreak} {summary.currentStreak === 1 ? "day" : "days"}</b></div></article><article><span>✦</span><div><small>STRONG DAYS</small><b>{summary.strongDays} total</b></div></article><article><span>✦</span><div><small>LIFETIME PRESTIGE POINTS</small><b>{summary.lifetimePoints.toLocaleString()}</b></div></article></section>
    {weeks.length === 0 ? <article className="panel history-empty"><span>◇</span><h2>Your archive begins after this campaign</h2><p>When Saturday closes, this week’s Strong Days, quest results, reflection, and prestige points will be preserved here.</p></article> :
      <div className="history-list">{weeks.map((week, index) => { const canEditReflection = masterMode && week.isPreviousWeek; return <article className="panel history-row" key={week.id}><div className="week-number"><small>WEEK</small><b>{weeks.length - index}</b></div><div><small>DATE</small><b>{formatShortDate(week.startsOn)} – {formatShortDate(week.endsOn)}</b></div><HistoryPopover label="Quest details" align="left"><HistoryQuestDetails week={week} /></HistoryPopover><div><small>WEEKLY QUESTS</small><b>{week.weeklyCompleted}/{week.weeklyAssigned}</b></div><div><small>PRESTIGE EARNED</small><b className="gold">{week.pointsEarned >= 0 ? "+" : ""}{week.pointsEarned} PP</b></div><div className="history-actions"><em>{week.rank}</em><HistoryPopover label="Reflection"><HistoryReflection week={week} editable={canEditReflection} onEdit={() => setEditingReflection(week)} /></HistoryPopover></div></article>; })}</div>}
    {editingReflection && <HistoryReflectionEditor week={editingReflection} onClose={() => setEditingReflection(null)} onSave={(reflection) => saveReflection(editingReflection.id, reflection)} />}
  </section>;
}

function PrestigeView({ prestige }: { prestige: Prestige }) {
  return <section className="page-section"><PageHeader eyebrow="PRESTIGE PATH" title="Strength measured over time" copy="Every daily quest adds 3 points, and every Strong Day adds 10 more. Prestige is permanent proof of sustained discipline." />
    <article className="panel prestige-hero"><div><span>PRESTIGE {prestige.level}</span><h2>{prestige.title}</h2><p>{prestige.points.toLocaleString()} lifetime points</p></div><div className="prestige-next"><small>{prestige.nextThreshold ? `NEXT: ${prestige.nextTitle}` : "MAXIMUM PRESTIGE"}</small><div className="goal-progress large"><span style={{ width: `${prestige.progress}%` }} /></div><b>{prestige.nextThreshold ? `${prestige.points.toLocaleString()} / ${prestige.nextThreshold.toLocaleString()} PP` : "All current tiers achieved"}</b></div></article>
    <div className="prestige-grid">{prestige.tiers.map((tier) => { const achieved = prestige.points >= tier.threshold; return <article className={`panel prestige-tier ${achieved ? "unlocked" : ""}`} key={tier.level}><span>PRESTIGE {tier.level}</span><div className="prestige-mark">{achieved ? "✓" : tier.level}</div><h3>{tier.title}</h3><b>{tier.threshold.toLocaleString()} PP</b><p>A permanent mark of your long-term consistency.</p><small>{achieved ? "ACHIEVED" : "INCOMPLETE"}</small></article>; })}</div>
  </section>;
}

function AccountPanel({ profile, onClose, onSaveName, onEmailChanged }: { profile: Profile; onClose: () => void; onSaveName: (displayName: string) => Promise<void>; onEmailChanged: (email: string) => void }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [email, setEmail] = useState(profile.email);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [emailCooldown, setEmailCooldown] = useState(0);
  useEffect(() => {
    if (emailCooldown <= 0) return;
    const timer = window.setInterval(() => setEmailCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [emailCooldown]);
  async function requestEmailChange() {
    setBusy(true); setMessage("");
    const response = await fetch("/api/account/request-email-change", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
    const payload = await response.json() as { error?: string; devCode?: string; cooldownSeconds?: number; retryAfterSeconds?: number };
    if (!response.ok) { setEmailCooldown(payload.retryAfterSeconds ?? 0); setMessage(payload.error ?? "Unable to send verification code"); }
    else { setEmailCooldown(payload.cooldownSeconds ?? 60); setPendingEmail(email.trim().toLowerCase()); setCode(payload.devCode ?? ""); setMessage(payload.devCode ? `Development code: ${payload.devCode}` : "Verification code sent to your new email."); }
    setBusy(false);
  }
  async function verifyEmailChange() {
    if (!pendingEmail) return;
    setBusy(true); setMessage("");
    const response = await fetch("/api/account/verify-email-change", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: pendingEmail, code }) });
    const payload = await response.json() as { error?: string; email?: string };
    if (!response.ok) setMessage(payload.error ?? "Unable to verify that code");
    else { onEmailChanged(payload.email ?? pendingEmail); setEmail(payload.email ?? pendingEmail); setPendingEmail(null); setCode(""); setMessage("Account email updated."); }
    setBusy(false);
  }
  async function signOut() { await fetch("/api/auth/sign-out", { method: "POST" }); router.replace("/"); router.refresh(); }
  return <section className="account-panel" role="dialog" aria-label="Profile and account"><header><div><p className="eyebrow">YOUR ACCOUNT</p><h2>Profile</h2><p>Manage the identity attached to your campaign.</p></div><button onClick={onClose} aria-label="Close profile">×</button></header><div className="account-section"><div className="account-section-title"><span>◆</span><div><b>Username</b><small>How your name appears throughout STRONGLY.</small></div></div><label htmlFor="account-username">Username</label><input id="account-username" maxLength={80} value={displayName} onChange={(event) => setDisplayName(event.target.value)} /><button className="button account-save" disabled={busy || !displayName.trim() || displayName.trim() === profile.displayName} onClick={async () => { setBusy(true); await onSaveName(displayName.trim()); setBusy(false); setMessage("Username updated."); }}>Save username</button></div><div className="account-section"><div className="account-section-title"><span>✦</span><div><b>Email address</b><small>A verification code is required before this changes.</small></div></div><label htmlFor="account-email">Email address</label><input id="account-email" type="email" value={email} onChange={(event) => { setEmail(event.target.value); setPendingEmail(null); setCode(""); }} />{pendingEmail ? <><label htmlFor="account-code">Verification code</label><input id="account-code" inputMode="numeric" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} placeholder="6-digit code" /><button className="button button-gold" disabled={busy || code.length !== 6} onClick={() => void verifyEmailChange()}>Verify new email</button><button className="account-email-resend" disabled={busy || emailCooldown > 0} onClick={() => void requestEmailChange()}>{emailCooldown > 0 ? `Resend code in ${emailCooldown}s` : "Resend verification code"}</button></> : <button className="button account-email-button" disabled={busy || emailCooldown > 0 || email.trim().toLowerCase() === profile.email} onClick={() => void requestEmailChange()}>{emailCooldown > 0 ? `Try again in ${emailCooldown}s` : "Send verification code"}</button>}{message && <p className="account-message" role="status">{message}</p>}</div><footer><button className="account-signout" onClick={signOut}>Sign out</button></footer></section>;
}

function TimezonePicker({ value, onChange }: { value: string; onChange: (timezone: string) => void }) {
  const zones = useMemo(() => supportedTimeZones(), []);
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const searchValue = open ? query : value;
  const normalizedQuery = searchValue.trim().toLowerCase().replaceAll(" ", "_");
  const matches = zones.filter((zone) => zone.toLowerCase().includes(normalizedQuery)).slice(0, 80);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }, [open, value]);
  return <div className={`timezone-picker ${open ? "open" : ""}`} ref={root}><input id="timezone-search" role="combobox" aria-label="Timezone" aria-expanded={open} aria-controls="timezone-options" aria-autocomplete="list" autoComplete="off" value={searchValue} onFocus={() => { setQuery(value); setOpen(true); }} onChange={(event) => { setQuery(event.target.value); setOpen(true); }} placeholder="Search cities or regions…" /><span aria-hidden="true">⌕</span>{open && <div className="timezone-options" id="timezone-options" role="listbox" aria-label="IANA timezones">{matches.length ? matches.map((zone) => <button type="button" role="option" aria-selected={value === zone} className={value === zone ? "selected" : ""} key={zone} onClick={() => { onChange(zone); setQuery(zone); setOpen(false); }}><b>{zone.replaceAll("_", " ")}</b><small>{zone}</small></button>) : <p>No matching IANA timezone</p>}</div>}</div>;
}

function Settings({ profile, saveProfile, setMasterMode, startWalkthrough }: { profile: Profile; saveProfile: (displayName: string, timezone: string) => void; setMasterMode: (enabled: boolean) => Promise<void>; startWalkthrough: () => void }) {
  const [timezone, setTimezone] = useState(profile.timezone);
  return <section className="page-section"><PageHeader eyebrow="PROFILE & SECURITY" title="Your adventurer’s record" copy="Manage your identity, timezone, and account access." />
    <div className="settings-grid"><section className="panel settings-panel timezone-panel"><h3>Timezone</h3><p className="settings-copy">Dates, daily deadlines, and campaign rollover follow your saved timezone.</p><label htmlFor="timezone-search">Search IANA timezones</label><TimezonePicker value={timezone} onChange={setTimezone} /><p className="timezone-current"><span>◆</span><span>Selected timezone<b>{timezone.replaceAll("_", " ")}</b></span></p><button className="button button-gold" disabled={!isValidTimeZone(timezone) || timezone === profile.timezone} onClick={() => saveProfile(profile.displayName, timezone)}>Save timezone</button></section><aside><section className={`panel settings-panel master-mode-setting ${profile.masterMode ? "enabled" : ""}`}><div className="setting-heading"><div><p className="eyebrow">HONOR SYSTEM</p><h3>Master Mode</h3></div><label className="switch" aria-label="Master Mode"><input type="checkbox" checked={profile.masterMode} onChange={(event) => void setMasterMode(event.target.checked)} /><span /></label></div><p>Correct daily quests from earlier days in the current campaign. Future days and closed weeks always remain locked.</p><blockquote>Master Mode is intended for correcting honest mistakes—not manufacturing progress. STRONGLY trusts you to keep your record truthful.</blockquote><div className="campaign-rule"><span>◇</span><div><b>Campaign schedule</b><p>Every week begins Sunday and ends Saturday at 11:59 PM in your saved timezone.</p></div></div></section><section className="panel security-card"><span>✦</span><div><h3>Passwordless security</h3><p>Your account is protected by one-time email codes. Use the profile icon to update your username, verify a new email, or sign out.</p></div></section><section className="panel settings-panel"><h3>Guidance</h3><p className="settings-copy">Review how daily quests, weekly planning, goals, History, and Prestige work.</p><button className="button walkthrough-replay" onClick={startWalkthrough}>Replay walkthrough</button></section></aside></div>
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
