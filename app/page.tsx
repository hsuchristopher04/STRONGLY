import Link from "next/link";
import { getAuthUser } from "./auth";
import StronglyApp from "./strongly-app";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getAuthUser();

  if (!user) {
    return (
      <main className="landing">
        <nav className="landing-nav">
          <Link className="wordmark" href="/">STRONGLY<span>.</span></Link>
          <a className="button button-ghost" href="/sign-in">Sign in</a>
        </nav>
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">A WEEKLY QUEST SYSTEM</p>
            <h1>Make your<br />week <em>strong.</em></h1>
            <p>Turn your real priorities into daily quests. Build momentum, earn prestige, and create a record you’ll be proud to look back on.</p>
            <a className="button button-gold" href="/sign-in">Begin your first quest <span>→</span></a>
            <div className="hero-proof"><span>✦</span> Three quests. Seven days. One stronger you.</div>
          </div>
          <div className="hero-card" aria-label="Example weekly quest card">
            <div className="hero-card-top"><span>WEEK 31</span><b>6 PP</b></div>
            <h2>Today’s quests</h2>
            <p>Wednesday, July 29</p>
            {["Train for 30 minutes", "Plan tomorrow before 9 PM", "Read 20 pages"].map((quest, index) => (
              <div className="hero-quest" key={quest}><i>{index < 2 ? "✓" : ""}</i><span>{quest}<small>Required · +3 PP</small></span></div>
            ))}
            <div className="hero-progress"><span style={{ width: "67%" }} /></div>
            <footer><b>2 of 3 complete</b><span>Each quest +3 PP</span></footer>
          </div>
        </section>
        <section className="feature-strip">
          <article><b>01</b><h3>Plan the campaign</h3><p>Choose the actions that will make this week count.</p></article>
          <article><b>02</b><h3>Complete the quests</h3><p>Show up daily and build prestige through real progress.</p></article>
          <article><b>03</b><h3>Build your legend</h3><p>Reach prestige ranks and watch your record grow over time.</p></article>
        </section>
      </main>
    );
  }

  return <StronglyApp identity={user} />;
}
