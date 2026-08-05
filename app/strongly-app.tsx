"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

type Identity = { email: string; displayName: string; fullName: string | null };
type Section = "Today" | "Week" | "Goals" | "History" | "Prestige" | "Settings";
type Quest = { id: string; title: string; complete: boolean; kind?: "required" | "bonus"; day_index?: number | null; position?: number };
type Milestone = { id: string; title: string; complete: boolean; position: number };
type Goal = { id: string; title: string; description: string; target_date: string | null; milestones: Milestone[] };
type Profile = { email: string; displayName: string; timezone: string };
type Prestige = { points: number; level: number; title: string; nextThreshold: number | null; nextTitle: string | null; progress: number; tiers: Array<{ level: number; threshold: number; title: string }> };
type PlannerWeek = { id: string; startsOn: string; endsOn: string; status: string; required: Quest[]; bonus: Array<{ dayIndex: number; quests: Quest[] }>; weekly: Quest[]; days: Array<{ dayIndex: number; date: string; requiredComplete: number; active: boolean }> };
type HistoryWeek = { id: string; startsOn: string; endsOn: string; days: Array<{ date: string; requiredComplete: number; strong: boolean }>; strongDays: number; weeklyCompleted: number; weeklyAssigned: number; pointsEarned: number; rank: string };
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
  const [profile, setProfile] = useState<Profile>({ email: identity.email, displayName: identity.fullName ?? "Hero", timezone: "America/New_York" });
  const [prestige, setPrestige] = useState<Prestige>({ points: 0, level: 0, title: "Unprestiged", nextThreshold: 1_000, nextTitle: "Iron Resolve", progress: 0, tiers: [] });
  const [goals, setGoals] = useState<Goal[]>([]);
  const [today, setToday] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);
  const [mobileNav, setMobileNav] = useState(false);
  const [planner, setPlanner] = useState<PlannerWeek[]>([]);
  const [history, setHistory] = useState<CampaignHistory>({ summary: { currentStreak: 0, strongDays: 0, lifetimePoints: 0 }, weeks: [] });
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

  async function saveProfile(displayName: string, timezone: string) {
    try {
      await post({ type: "profile", displayName, timezone });
      setToast("Profile saved");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to save profile");
    }
    window.setTimeout(() => setToast(""), 2200);
  }

  const content = useMemo(() => {
    if (section === "Today") return <Today required={required} bonus={bonus} weekly={weekly} progress={progress} toggleQuest={toggleQuest} today={today} week={planner[0]} displayName={profile.displayName} />;
    if (section === "Week") return <WeekView weeks={planner} savePlan={async (plan) => { try { await post({ type: "plan-week", ...plan }); setToast("Next campaign saved"); } catch (error) { setToast(error instanceof Error ? error.message : "Unable to save week"); } }} />;
    if (section === "Goals") return <Goals goals={goals} toggleMilestone={toggleMilestone} />;
    if (section === "History") return <History history={history} />;
    if (section === "Prestige") return <PrestigeView prestige={prestige} />;
    return <Settings key={`${profile.displayName}:${profile.timezone}`} profile={profile} saveProfile={saveProfile} />;
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
    </div>
  );
}

function QuestRow({ quest, onToggle }: { quest: Quest; onToggle: () => void }) {
  return <button className={`quest-row ${quest.complete ? "complete" : ""}`} onClick={onToggle} aria-label={`${quest.complete ? "Reopen" : "Complete"} ${quest.title}`}>
    <i className="check">{quest.complete ? "✓" : ""}</i><span className="quest-copy"><b>{quest.title}</b><small>{quest.kind === "bonus" ? "Bonus quest" : quest.kind === "required" ? "Required quest" : "Weekly quest"}</small></span>{quest.kind && <span className="quest-points">+3 <em>PP</em></span>}
  </button>;
}

function Today({ required, bonus, weekly, progress, toggleQuest, today, week, displayName }: { required: Quest[]; bonus: Quest[]; weekly: Quest[]; progress: number; toggleQuest: (g: "required" | "bonus" | "weekly", id: string) => void; today: string; week?: PlannerWeek; displayName: string }) {
  return <>
    <section className="welcome"><div><p className="eyebrow">{formatLongDate(today)}</p><h1>Good afternoon, <em>{displayName}.</em></h1><p>{required.filter((quest) => quest.complete).length === 3 ? "Strong Day secured. Keep the momentum going." : "Finish your three required quests and strengthen today’s record."}</p></div><div className="rank-seal"><span>✦</span><small>BUILD PRESTIGE</small></div></section>
    <section className="day-strip">{week?.days.map((day) => <div className={day.active ? "active" : ""} key={day.date}><small>{formatDay(day.date)}</small><b>{dateFromIso(day.date).getUTCDate()}</b><span>{day.date <= today ? `${day.requiredComplete}/3` : "—"}</span></div>)}</section>
    <div className="dashboard-grid">
      <section className="panel daily-panel">
        <header className="panel-title"><div><p className="eyebrow">DAILY QUESTS</p><h2>Today’s path</h2></div><b>{required.filter(q => q.complete).length}<span>/3</span></b></header>
        <div className="progress"><span style={{ width: `${progress}%` }} /></div>
        <div className="strong-bonus"><span>✦</span><div><b>Strong Day</b><small>Complete all 3 required quests</small></div><em>{required.filter((quest) => quest.complete).length === 3 ? "SECURED" : "IN PROGRESS"}</em></div>
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
    {current && <div className="week-grid">{current.days.map((day) => <article className={`panel day-card ${day.active ? "active" : ""}`} key={day.date}><header><small>{formatDay(day.date)}</small><b>{dateFromIso(day.date).getUTCDate()}</b></header>{current.required.map((quest) => <div key={quest.id}><i className={day.requiredComplete === 3 ? "done" : ""}>{day.requiredComplete === 3 ? "✓" : ""}</i><span>{quest.title}</span></div>)}{current.bonus.find((item) => item.dayIndex === day.dayIndex)?.quests.map((quest) => <div className="bonus-line" key={quest.id}><i>+</i><span>{quest.title}</span></div>)}<footer>{day.requiredComplete === 3 ? "✦ Strong Day" : day.date < (current.days.find((item) => item.active)?.date ?? "") ? `${day.requiredComplete}/3 complete` : day.active ? `${day.requiredComplete}/3 today` : "Upcoming"}</footer></article>)}</div>}
    {next && <WeekPlanForm key={next.id} week={next} savePlan={savePlan} />}
  </section>;
}

function WeekPlanForm({ week, savePlan }: { week: PlannerWeek; savePlan: (plan: { startsOn: string; required: string[]; bonus: Array<{ dayIndex: number; titles: string[] }>; weekly: string[] }) => Promise<void> }) {
  const [required, setRequired] = useState(() => Array.from({ length: 3 }, (_, index) => week.required[index]?.title ?? ""));
  const [weekly, setWeekly] = useState(() => Array.from({ length: 3 }, (_, index) => week.weekly[index]?.title ?? ""));
  const [bonus, setBonus] = useState(() => Array.from({ length: 7 }, (_, dayIndex) => Array.from({ length: 2 }, (_, index) => week.bonus.find((day) => day.dayIndex === dayIndex)?.quests[index]?.title ?? "")));
  const [saving, setSaving] = useState(false);
  const update = (values: string[], index: number, value: string) => values.map((item, itemIndex) => itemIndex === index ? value : item);
  async function submit(event: FormEvent) { event.preventDefault(); setSaving(true); await savePlan({ startsOn: week.startsOn, required, weekly: weekly.filter((title) => title.trim()), bonus: bonus.map((titles, dayIndex) => ({ dayIndex, titles: titles.filter((title) => title.trim()) })) }); setSaving(false); }
  return <form className="panel week-planner" onSubmit={submit}><header><div><p className="eyebrow">PLAN AHEAD</p><h2>Next campaign · {formatShortDate(week.startsOn)} – {formatShortDate(week.endsOn)}</h2><p>Set three quests that repeat daily, optional day-specific bonuses, and one to three weekly objectives.</p></div><button className="button button-gold" disabled={saving}>{saving ? "Saving…" : "Save next week"}</button></header>
    <section><h3>Required daily quests <span>Exactly 3</span></h3><div className="planner-required">{required.map((title, index) => <label key={index}><small>QUEST {index + 1}</small><input required maxLength={120} value={title} onChange={(event) => setRequired(update(required, index, event.target.value))} placeholder={index === 0 ? "Exercise for 30 minutes" : index === 1 ? "Plan tomorrow" : "Read for 20 minutes"} /></label>)}</div></section>
    <section><h3>Daily bonus quests <span>Up to 2 each day</span></h3><div className="planner-bonus">{week.days.map((day) => <div key={day.date}><b>{formatDay(day.date)} <small>{formatShortDate(day.date)}</small></b>{bonus[day.dayIndex].map((title, index) => <input key={index} maxLength={120} value={title} onChange={(event) => setBonus(bonus.map((titles, dayIndex) => dayIndex === day.dayIndex ? update(titles, index, event.target.value) : titles))} placeholder={`Bonus slot ${index + 1}`} />)}</div>)}</div></section>
    <section><h3>Weekly quests <span>Choose 1–3</span></h3><div className="planner-required">{weekly.map((title, index) => <label key={index}><small>{index === 0 ? "REQUIRED" : `OPTIONAL ${index}`}</small><input required={index === 0} maxLength={120} value={title} onChange={(event) => setWeekly(update(weekly, index, event.target.value))} placeholder={index === 0 ? "Complete the week’s main objective" : "Additional weekly quest"} /></label>)}</div></section>
  </form>;
}

function Goals({ goals, toggleMilestone }: { goals: Goal[]; toggleMilestone: (id: string) => void }) {
  const goal = goals[0];
  const milestones = goal?.milestones ?? [];
  const doneCount = milestones.filter((item) => item.complete).length;
  return <section className="page-section"><PageHeader eyebrow="LONG-TERM GOALS" title="Build your legend" copy="Break ambitious goals into milestones you can conquer." button="+ New goal" />
    <div className="goals-grid">
      <article className="panel featured-goal"><div className="goal-rune">◆</div><div className="goal-meta"><span>ACTIVE · FITNESS</span><small>Target: {goal?.target_date ?? "No date"}</small></div><h2>{goal?.title ?? "Your first long-term goal"}</h2><p>{goal?.description ?? "Create a goal and divide it into achievable milestones."}</p><div className="goal-progress large"><span style={{ width: `${milestones.length ? (doneCount / milestones.length) * 100 : 0}%` }} /></div><b>{doneCount} of {milestones.length} milestones complete</b><div className="milestones">{milestones.map((item, i) => <button className={item.complete ? "done" : ""} key={item.id} onClick={() => toggleMilestone(item.id)}><i>{item.complete ? "✓" : i + 1}</i><span>{item.title}<small>{item.complete ? "Completed" : i === 3 ? "Linked to this week’s quest" : "Milestone"}</small></span><em>{item.complete ? "DONE" : "OPEN"}</em></button>)}</div></article>
      <aside><article className="panel goal-mini"><span>◇</span><small>LEARNING · DEC 31</small><h3>Read 24 books this year</h3><div className="goal-progress"><span style={{ width: "67%" }} /></div><footer><b>16 of 24 books</b><span>67%</span></footer></article><article className="panel new-goal"><i>＋</i><h3>Begin another journey</h3><p>Turn your next ambition into clear, achievable milestones.</p><button className="text-button">Create a goal →</button></article></aside>
    </div>
  </section>;
}

function History({ history }: { history: CampaignHistory }) {
  const { summary, weeks } = history;
  return <section className="page-section"><PageHeader eyebrow="CAMPAIGN ARCHIVE" title="The record of your strength" copy="Every completed quest is proof that you showed up." />
    <section className="history-stats"><article><span>♨</span><div><small>CURRENT STREAK</small><b>{summary.currentStreak} {summary.currentStreak === 1 ? "day" : "days"}</b></div></article><article><span>✦</span><div><small>STRONG DAYS</small><b>{summary.strongDays} total</b></div></article><article><span>✦</span><div><small>LIFETIME PRESTIGE POINTS</small><b>{summary.lifetimePoints.toLocaleString()}</b></div></article></section>
    {weeks.length === 0 ? <article className="panel history-empty"><span>◇</span><h2>Your archive begins after this campaign</h2><p>When Saturday closes, this week’s Strong Days, quest results, and prestige points will be preserved here.</p></article> :
      <div className="history-list">{weeks.map((week, index) => <article className="panel history-row" key={week.id}><div className="week-number"><small>WEEK</small><b>{weeks.length - index}</b></div><div><small>DATE</small><b>{formatShortDate(week.startsOn)} – {formatShortDate(week.endsOn)}</b></div><div className="day-dots"><small>DAILY BREAKDOWN</small><span>{week.days.map((day) => <i className={day.strong ? "done" : day.requiredComplete > 0 ? "partial" : ""} title={`${formatDay(day.date)}: ${day.requiredComplete}/3 required quests`} key={day.date} />)}</span><b>{week.strongDays}/7 strong</b></div><div><small>WEEKLY QUESTS</small><b>{week.weeklyCompleted}/{week.weeklyAssigned}</b></div><div><small>PRESTIGE EARNED</small><b className="gold">{week.pointsEarned >= 0 ? "+" : ""}{week.pointsEarned} PP</b></div><em>{week.rank}</em></article>)}</div>}
  </section>;
}

function PrestigeView({ prestige }: { prestige: Prestige }) {
  return <section className="page-section"><PageHeader eyebrow="PRESTIGE PATH" title="Strength measured over time" copy="Every daily quest adds 3 points. Prestige is permanent proof of sustained discipline." />
    <article className="panel prestige-hero"><div><span>PRESTIGE {prestige.level}</span><h2>{prestige.title}</h2><p>{prestige.points.toLocaleString()} lifetime points</p></div><div className="prestige-next"><small>{prestige.nextThreshold ? `NEXT: ${prestige.nextTitle}` : "MAXIMUM PRESTIGE"}</small><div className="goal-progress large"><span style={{ width: `${prestige.progress}%` }} /></div><b>{prestige.nextThreshold ? `${prestige.points.toLocaleString()} / ${prestige.nextThreshold.toLocaleString()} PP` : "All current tiers achieved"}</b></div></article>
    <div className="prestige-grid">{prestige.tiers.map((tier) => { const achieved = prestige.points >= tier.threshold; return <article className={`panel prestige-tier ${achieved ? "unlocked" : ""}`} key={tier.level}><span>PRESTIGE {tier.level}</span><div className="prestige-mark">{achieved ? "✓" : tier.level}</div><h3>{tier.title}</h3><b>{tier.threshold.toLocaleString()} PP</b><p>A permanent mark of your long-term consistency.</p><small>{achieved ? "ACHIEVED" : "INCOMPLETE"}</small></article>; })}</div>
  </section>;
}

function Settings({ profile, saveProfile }: { profile: Profile; saveProfile: (displayName: string, timezone: string) => void }) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [timezone, setTimezone] = useState(profile.timezone);
  async function signOut() {
    await fetch("/api/auth/sign-out", { method: "POST" });
    window.location.assign("/");
  }
  return <section className="page-section"><PageHeader eyebrow="PROFILE & SECURITY" title="Your adventurer’s record" copy="Manage your identity, timezone, and account access." />
    <div className="settings-grid"><section className="panel settings-panel"><h3>Profile</h3><label>Display name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label><label>Email address<input value={profile.email} disabled /></label><label>Timezone<select value={timezone} onChange={(event) => setTimezone(event.target.value)}><option>America/New_York</option><option>America/Chicago</option><option>America/Denver</option><option>America/Los_Angeles</option><option>Europe/London</option></select></label><button className="button button-gold" onClick={() => saveProfile(displayName, timezone)}>Save changes</button></section><aside><section className="panel security-card"><span>✦</span><div><h3>Passwordless security</h3><p>Your account is protected by one-time email codes. No password is stored by STRONGLY.</p><button className="auth-link" onClick={signOut}>Sign out</button></div></section><section className="panel settings-panel"><h3>Week preferences</h3><label className="toggle-row"><span><b>Week starts Sunday</b><small>Your campaigns close Saturday at midnight.</small></span><input type="checkbox" defaultChecked /></label><label className="toggle-row"><span><b>Reduced motion</b><small>Minimize completion animations.</small></span><input type="checkbox" /></label></section></aside></div>
  </section>;
}

function PageHeader({ eyebrow, title, copy, button }: { eyebrow: string; title: string; copy: string; button?: string }) {
  return <header className="page-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{copy}</p></div>{button && <button className="button button-gold">{button}</button>}</header>;
}
