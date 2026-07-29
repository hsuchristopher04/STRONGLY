"use client";

import { useEffect, useMemo, useState } from "react";

type Identity = { email: string; displayName: string; fullName: string | null };
type Section = "Today" | "Week" | "Goals" | "History" | "Shop" | "Settings";
type Quest = { id: string; title: string; reward: number; complete: boolean; kind?: "required" | "bonus" };
type Milestone = { id: string; title: string; reward: number; complete: boolean; position: number };
type Goal = { id: string; title: string; description: string; target_date: string | null; milestones: Milestone[] };
type Profile = { email: string; displayName: string; timezone: string; equippedTheme: string; equippedBadge: string };
type CampaignState = {
  profile: Profile;
  campaign: { today: string; start: string; end: string };
  daily: Quest[];
  weekly: Quest[];
  goals: Goal[];
  owned: string[];
  balance: number;
};

const requiredSeed: Quest[] = [
  { id: "train", title: "Train for 30 minutes", reward: 10, complete: true, kind: "required" },
  { id: "plan", title: "Plan tomorrow before 9 PM", reward: 10, complete: true, kind: "required" },
  { id: "read", title: "Read 20 pages", reward: 10, complete: false, kind: "required" },
];
const bonusSeed: Quest[] = [
  { id: "water", title: "Drink 8 glasses of water", reward: 15, complete: true, kind: "bonus" },
  { id: "walk", title: "Take a 20 minute walk", reward: 15, complete: false, kind: "bonus" },
];
const weekSeed: Quest[] = [
  { id: "portfolio", title: "Finish portfolio case study", reward: 100, complete: false },
  { id: "mealprep", title: "Meal prep for next week", reward: 100, complete: true },
];

const days = [
  { day: "SUN", date: "26", score: 3 }, { day: "MON", date: "27", score: 3 },
  { day: "TUE", date: "28", score: 2 }, { day: "WED", date: "29", score: 2, active: true },
  { day: "THU", date: "30", score: 0 }, { day: "FRI", date: "31", score: 0 },
  { day: "SAT", date: "01", score: 0 },
];

const nav: { name: Section; icon: string }[] = [
  { name: "Today", icon: "✦" }, { name: "Week", icon: "▦" }, { name: "Goals", icon: "◆" },
  { name: "History", icon: "◷" }, { name: "Shop", icon: "◈" }, { name: "Settings", icon: "⚙" },
];

export default function StronglyApp({ identity }: { identity: Identity }) {
  const [section, setSection] = useState<Section>("Today");
  const [required, setRequired] = useState(requiredSeed);
  const [bonus, setBonus] = useState(bonusSeed);
  const [weekly, setWeekly] = useState(weekSeed);
  const [coins, setCoins] = useState(450);
  const [toast, setToast] = useState("");
  const [owned, setOwned] = useState(["obsidian", "founder"]);
  const [theme, setTheme] = useState("obsidian");
  const [profile, setProfile] = useState<Profile>({ email: identity.email, displayName: identity.fullName ?? "Hero", timezone: "America/New_York", equippedTheme: "obsidian", equippedBadge: "founder" });
  const [goals, setGoals] = useState<Goal[]>([]);
  const [today, setToday] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);
  const [mobileNav, setMobileNav] = useState(false);
  const requiredDone = required.filter((q) => q.complete).length;
  const progress = Math.round((requiredDone / 3) * 100);

  function applyState(state: CampaignState) {
    setProfile(state.profile);
    setRequired(state.daily.filter((quest) => quest.kind === "required"));
    setBonus(state.daily.filter((quest) => quest.kind === "bonus"));
    setWeekly(state.weekly);
    setGoals(state.goals);
    setOwned(state.owned);
    setTheme(state.profile.equippedTheme);
    setCoins(state.balance);
    setToday(state.campaign.today);
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

  async function post(action: Record<string, string>) {
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
    const delta = quest.complete ? -quest.reward : quest.reward;
    const strongDayDelta = group === "required" && !quest.complete && requiredDone === 2 ? 20 :
      group === "required" && quest.complete && requiredDone === 3 ? -20 : 0;
    setter(source.map((item) => item.id === id ? { ...item, complete: !item.complete } : item));
    setCoins((value) => value + delta + strongDayDelta);
    setToast(quest.complete ? `${quest.title} reopened` : `Quest complete · +${quest.reward + strongDayDelta} coins`);
    try {
      await post(group === "weekly" ? { type: "toggle-weekly", questId: id } : { type: "toggle-daily", questId: id, completedOn: today });
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to save quest");
      const response = await fetch("/api/campaign");
      if (response.ok) applyState(await response.json() as CampaignState);
    }
    window.setTimeout(() => setToast(""), 2400);
  }

  async function buy(id: string, price: number) {
    try {
      if (owned.includes(id)) {
        await post({ type: "equip", cosmeticId: id });
        setToast("Cosmetic equipped");
      } else if (coins >= price) {
        await post({ type: "purchase", cosmeticId: id });
        await post({ type: "equip", cosmeticId: id });
        setToast("New cosmetic unlocked");
      } else setToast(`You need ${price - coins} more coins`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to update cosmetic");
    }
    window.setTimeout(() => setToast(""), 2200);
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
    if (section === "Today") return <Today required={required} bonus={bonus} weekly={weekly} progress={progress} toggleQuest={toggleQuest} />;
    if (section === "Week") return <WeekView required={required} />;
    if (section === "Goals") return <Goals goals={goals} toggleMilestone={toggleMilestone} />;
    if (section === "History") return <History />;
    if (section === "Shop") return <Shop coins={coins} owned={owned} theme={theme} buy={buy} />;
    return <Settings key={`${profile.displayName}:${profile.timezone}`} profile={profile} saveProfile={saveProfile} />;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, required, bonus, weekly, progress, coins, owned, theme]);

  return (
    <div className={`app-shell theme-${theme}`}>
      <aside className={mobileNav ? "sidebar open" : "sidebar"}>
        <div className="brand">STRONGLY<span>.</span></div>
        <div className="profile">
          <div className="avatar">C</div>
          <div><b>{identity.fullName?.split(" ")[0] ?? "Hero"}</b><span><i /> Level 7 · Pathfinder</span></div>
        </div>
        <nav aria-label="Primary navigation">
          <p>YOUR CAMPAIGN</p>
          {nav.slice(0, 4).map((item) => <button key={item.name} className={section === item.name ? "active" : ""} onClick={() => { setSection(item.name); setMobileNav(false); }}><i>{item.icon}</i>{item.name}</button>)}
          <p>CUSTOMIZE</p>
          {nav.slice(4).map((item) => <button key={item.name} className={section === item.name ? "active" : ""} onClick={() => { setSection(item.name); setMobileNav(false); }}><i>{item.icon}</i>{item.name}</button>)}
        </nav>
        <div className="sidebar-quote"><span>✦</span><p>“We are what we repeatedly do.”</p><small>— Aristotle</small></div>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <button className="menu-button" aria-label="Open navigation" onClick={() => setMobileNav(!mobileNav)}>☰</button>
          <div className="week-title"><small>THIS CAMPAIGN</small><b>Week of July 26 – Aug 1</b></div>
          <div className="top-actions"><div className="streak"><span>♨</span><b>4</b><small>DAY STREAK</small></div><div className="coin"><span>◈</span><b>{coins}</b><small>COINS</small></div><button className="round" aria-label="Notifications">♟<i /></button></div>
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
    <i className="check">{quest.complete ? "✓" : ""}</i><span className="quest-copy"><b>{quest.title}</b><small>{quest.kind === "bonus" ? "Bonus quest" : quest.kind === "required" ? "Required quest" : "Weekly quest"}</small></span><span className="reward">+{quest.reward} <em>◈</em></span>
  </button>;
}

function Today({ required, bonus, weekly, progress, toggleQuest }: { required: Quest[]; bonus: Quest[]; weekly: Quest[]; progress: number; toggleQuest: (g: "required" | "bonus" | "weekly", id: string) => void }) {
  return <>
    <section className="welcome"><div><p className="eyebrow">WEDNESDAY · JULY 29</p><h1>Good afternoon, <em>Chris.</em></h1><p>Two quests down. Finish strong and claim your Strong Day bonus.</p></div><div className="rank-seal"><span>VII</span><small>PATHFINDER</small></div></section>
    <section className="day-strip">{days.map((day) => <div className={day.active ? "active" : ""} key={day.day}><small>{day.day}</small><b>{day.date}</b><span>{day.score ? `${day.score}/3` : "—"}</span></div>)}</section>
    <div className="dashboard-grid">
      <section className="panel daily-panel">
        <header className="panel-title"><div><p className="eyebrow">DAILY QUESTS</p><h2>Today’s path</h2></div><b>{required.filter(q => q.complete).length}<span>/3</span></b></header>
        <div className="progress"><span style={{ width: `${progress}%` }} /></div>
        <div className="strong-bonus"><span>✦</span><div><b>Strong Day Bonus</b><small>Complete all 3 required quests</small></div><em>+20 ◈</em></div>
        <div className="quest-list">{required.map((q) => <QuestRow key={q.id} quest={q} onToggle={() => toggleQuest("required", q.id)} />)}</div>
        <div className="subheading"><span>BONUS QUESTS</span><small>EXTRA COINS</small></div>
        <div className="quest-list compact">{bonus.map((q) => <QuestRow key={q.id} quest={q} onToggle={() => toggleQuest("bonus", q.id)} />)}</div>
      </section>
      <aside className="side-stack">
        <section className="panel weekly-panel"><div className="panel-title"><div><p className="eyebrow">WEEKLY QUESTS</p><h2>The campaign</h2></div><span>{weekly.filter(q => q.complete).length}/{weekly.length}</span></div>{weekly.map((q) => <QuestRow key={q.id} quest={q} onToggle={() => toggleQuest("weekly", q.id)} />)}<button className="text-button">View full week <span>→</span></button></section>
        <section className="panel goal-peek"><p className="eyebrow">ACTIVE GOAL</p><div><span>◆</span><small>90 DAY QUEST</small></div><h3>Run my first half marathon</h3><div className="goal-progress"><span style={{ width: "60%" }} /></div><footer><b>3 of 5 milestones</b><span>Oct 18</span></footer></section>
      </aside>
    </div>
  </>;
}

function WeekView({ required }: { required: Quest[] }) {
  return <section className="page-section"><PageHeader eyebrow="WEEKLY CALENDAR" title="Your campaign map" copy="Every strong week starts with a clear path." button="Plan next week" />
    <div className="week-grid">{days.map((day, i) => <article className={`panel day-card ${day.active ? "active" : ""}`} key={day.day}><header><small>{day.day}</small><b>{day.date}</b></header>{required.map((q, qi) => <div key={q.id}><i className={(i < 2 || (i === 2 && qi < 2) || (i === 3 && q.complete)) ? "done" : ""}>{(i < 2 || (i === 2 && qi < 2) || (i === 3 && q.complete)) ? "✓" : ""}</i><span>{q.title}</span></div>)}<footer>{day.score === 3 ? "✦ Strong Day" : day.score ? `${day.score}/3 complete` : "Upcoming"}</footer></article>)}</div>
    <section className="panel planning-note"><span>✦</span><div><h3>Prepare the next campaign</h3><p>Next week opens for planning every Thursday. Choose three repeating daily quests and up to three weekly objectives.</p></div><button className="button button-gold">Start planning</button></section>
  </section>;
}

function Goals({ goals, toggleMilestone }: { goals: Goal[]; toggleMilestone: (id: string) => void }) {
  const goal = goals[0];
  const milestones = goal?.milestones ?? [];
  const doneCount = milestones.filter((item) => item.complete).length;
  return <section className="page-section"><PageHeader eyebrow="LONG-TERM GOALS" title="Build your legend" copy="Break ambitious goals into milestones you can conquer." button="+ New goal" />
    <div className="goals-grid">
      <article className="panel featured-goal"><div className="goal-rune">◆</div><div className="goal-meta"><span>ACTIVE · FITNESS</span><small>Target: {goal?.target_date ?? "No date"}</small></div><h2>{goal?.title ?? "Your first long-term goal"}</h2><p>{goal?.description ?? "Create a goal and divide it into achievable milestones."}</p><div className="goal-progress large"><span style={{ width: `${milestones.length ? (doneCount / milestones.length) * 100 : 0}%` }} /></div><b>{doneCount} of {milestones.length} milestones complete</b><div className="milestones">{milestones.map((item, i) => <button className={item.complete ? "done" : ""} key={item.id} onClick={() => toggleMilestone(item.id)}><i>{item.complete ? "✓" : i + 1}</i><span>{item.title}<small>{item.complete ? "Completed" : i === 3 ? "Linked to this week’s quest" : "+150 coins"}</small></span><em>{item.complete ? "DONE" : "+150 ◈"}</em></button>)}</div></article>
      <aside><article className="panel goal-mini"><span>◇</span><small>LEARNING · DEC 31</small><h3>Read 24 books this year</h3><div className="goal-progress"><span style={{ width: "67%" }} /></div><footer><b>16 of 24 books</b><span>67%</span></footer></article><article className="panel new-goal"><i>＋</i><h3>Begin another journey</h3><p>Turn your next ambition into clear, achievable milestones.</p><button className="text-button">Create a goal →</button></article></aside>
    </div>
  </section>;
}

function History() {
  const weeks = [
    { label: "Jul 19 – 25", days: 6, weekly: "2/2", coins: 430, rank: "Legendary" },
    { label: "Jul 12 – 18", days: 5, weekly: "2/3", coins: 355, rank: "Strong" },
    { label: "Jul 5 – 11", days: 4, weekly: "1/2", coins: 275, rank: "Steady" },
    { label: "Jun 28 – Jul 4", days: 6, weekly: "3/3", coins: 535, rank: "Legendary" },
  ];
  return <section className="page-section"><PageHeader eyebrow="CAMPAIGN ARCHIVE" title="The record of your strength" copy="Every completed quest is proof that you showed up." />
    <section className="history-stats"><article><span>♨</span><div><small>CURRENT STREAK</small><b>4 days</b></div></article><article><span>✦</span><div><small>STRONG DAYS</small><b>21 total</b></div></article><article><span>◈</span><div><small>LIFETIME COINS</small><b>2,840</b></div></article></section>
    <div className="history-list">{weeks.map((week, i) => <article className="panel history-row" key={week.label}><div className="week-number"><small>WEEK</small><b>{30 - i}</b></div><div><small>DATE</small><b>{week.label}</b></div><div className="day-dots"><small>STRONG DAYS</small><span>{[0,1,2,3,4,5,6].map(x => <i className={x < week.days ? "done" : ""} key={x} />)}</span><b>{week.days}/7</b></div><div><small>WEEKLY QUESTS</small><b>{week.weekly}</b></div><div><small>COINS EARNED</small><b className="gold">+{week.coins} ◈</b></div><em>{week.rank}</em></article>)}</div>
  </section>;
}

function Shop({ coins, owned, theme, buy }: { coins: number; owned: string[]; theme: string; buy: (id: string, price: number) => void }) {
  const items = [
    { id: "forest", name: "Emerald Keep", type: "Theme", price: 500, desc: "Deep forest tones and ancient gold.", color: "#174735" },
    { id: "royal", name: "Royal Vanguard", type: "Theme", price: 750, desc: "Regal plum with polished brass.", color: "#422744" },
    { id: "ember", name: "Emberforge", type: "Theme", price: 1000, desc: "Smoldering crimson and warm iron.", color: "#6f3023" },
    { id: "early", name: "Dawn Walker", type: "Badge", price: 250, desc: "For heroes who begin before sunrise.", color: "#aa6d28" },
    { id: "steadfast", name: "The Steadfast", type: "Badge", price: 400, desc: "Awarded to the relentlessly consistent.", color: "#334a6a" },
  ];
  return <section className="page-section"><PageHeader eyebrow="THE QUARTERMASTER" title="Rewards worthy of the journey" copy="Spend the coins you earned. Every unlock is proof of progress." />
    <div className="shop-balance"><span>YOUR PURSE</span><b>◈ {coins}</b><small>Earn more by completing quests</small></div>
    <h3 className="section-label">CURATED THEMES & BADGES</h3>
    <div className="shop-grid"><article className="shop-item owned panel"><div className="swatch obsidian" /><small>THEME</small><h3>Obsidian Guild</h3><p>The original STRONGLY campaign theme.</p><button disabled>{theme === "obsidian" ? "Equipped" : "Owned"}</button></article>{items.map(item => <article className="shop-item panel" key={item.id}><div className="swatch" style={{ background: item.color }}><span>{item.type === "Badge" ? "✦" : ""}</span></div><small>{item.type.toUpperCase()}</small><h3>{item.name}</h3><p>{item.desc}</p><button onClick={() => buy(item.id, item.price)}>{owned.includes(item.id) ? (theme === item.id ? "Equipped" : "Equip") : `◈ ${item.price}`}</button></article>)}</div>
  </section>;
}

function Settings({ profile, saveProfile }: { profile: Profile; saveProfile: (displayName: string, timezone: string) => void }) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [timezone, setTimezone] = useState(profile.timezone);
  return <section className="page-section"><PageHeader eyebrow="PROFILE & SECURITY" title="Your adventurer’s record" copy="Manage your identity, timezone, and account access." />
    <div className="settings-grid"><section className="panel settings-panel"><h3>Profile</h3><label>Display name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label><label>Email address<input value={profile.email} disabled /></label><label>Timezone<select value={timezone} onChange={(event) => setTimezone(event.target.value)}><option>America/New_York</option><option>America/Chicago</option><option>America/Denver</option><option>America/Los_Angeles</option><option>Europe/London</option></select></label><button className="button button-gold" onClick={() => saveProfile(displayName, timezone)}>Save changes</button></section><aside><section className="panel security-card"><span>✦</span><div><h3>Passwordless security</h3><p>Your account is protected by managed sign-in. No password is stored by STRONGLY.</p><a href="/signout-with-chatgpt?return_to=/">Sign out</a></div></section><section className="panel settings-panel"><h3>Week preferences</h3><label className="toggle-row"><span><b>Week starts Sunday</b><small>Your campaigns close Saturday at midnight.</small></span><input type="checkbox" defaultChecked /></label><label className="toggle-row"><span><b>Reduced motion</b><small>Minimize completion animations.</small></span><input type="checkbox" /></label></section></aside></div>
  </section>;
}

function PageHeader({ eyebrow, title, copy, button }: { eyebrow: string; title: string; copy: string; button?: string }) {
  return <header className="page-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{copy}</p></div>{button && <button className="button button-gold">{button}</button>}</header>;
}
