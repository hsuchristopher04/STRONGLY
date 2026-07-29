import { headers } from "next/headers";
import Link from "next/link";
import { chatGPTSignInPath, getChatGPTUser } from "./chatgpt-auth";
import StronglyApp from "./strongly-app";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getChatGPTUser();
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "";
  const isLocal = host.startsWith("localhost") || host.startsWith("127.0.0.1");

  if (!user && !isLocal) {
    return (
      <main className="landing">
        <nav className="landing-nav">
          <Link className="wordmark" href="/">STRONGLY<span>.</span></Link>
          <a className="button button-ghost" href={chatGPTSignInPath("/")}>Sign in</a>
        </nav>
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">A WEEKLY QUEST SYSTEM</p>
            <h1>Make your<br />week <em>strong.</em></h1>
            <p>Turn your real priorities into daily quests. Build momentum, earn rewards, and create a record you’ll be proud to look back on.</p>
            <a className="button button-gold" href={chatGPTSignInPath("/")}>Begin your first quest <span>→</span></a>
            <div className="hero-proof"><span>✦</span> Three quests. Seven days. One stronger you.</div>
          </div>
          <div className="hero-card" aria-label="Example weekly quest card">
            <div className="hero-card-top"><span>WEEK 31</span><b>450 ◈</b></div>
            <h2>Today’s quests</h2>
            <p>Wednesday, July 29</p>
            {["Train for 30 minutes", "Plan tomorrow before 9 PM", "Read 20 pages"].map((quest, index) => (
              <div className="hero-quest" key={quest}><i>{index < 2 ? "✓" : ""}</i><span>{quest}<small>Required · +10</small></span></div>
            ))}
            <div className="hero-progress"><span style={{ width: "67%" }} /></div>
            <footer><b>2 of 3 complete</b><span>Strong Day +20</span></footer>
          </div>
        </section>
        <section className="feature-strip">
          <article><b>01</b><h3>Plan the campaign</h3><p>Choose the actions that will make this week count.</p></article>
          <article><b>02</b><h3>Complete the quests</h3><p>Show up daily and collect coins for real progress.</p></article>
          <article><b>03</b><h3>Build your legend</h3><p>Unlock themes, earn badges, and watch your record grow.</p></article>
        </section>
      </main>
    );
  }

  return <StronglyApp identity={user ?? { email: "hero@strongly.local", displayName: "Hero", fullName: "Hero" }} />;
}
