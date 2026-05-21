import Link from "next/link";
import "../app/home.css";
import "./setup-welcome.css";

const SETUP_STEPS = [
  {
    title: "Connect OAuth",
    body: "Paste your church's PCO developer app credentials.",
  },
  {
    title: "Sign in with Planning Center",
    body: "Verify you are an organization administrator.",
  },
  {
    title: "Open chats",
    body: "Groups, DMs, and volunteer teams sync automatically after setup.",
  },
] as const;

export function SetupWelcome() {
  return (
    <main className="home setup-welcome">
      <div className="home-bg" aria-hidden>
        <div className="home-bg-gradient" />
        <div className="home-bg-grid" />
      </div>

      <section className="home-hero setup-hero">
        <div className="setup-hero-grid">
          <div className="home-hero-content setup-hero-main">
            <p className="setup-eyebrow">First-time setup</p>

            <h1 className="setup-headline">
              Welcome to <span className="setup-headline-accent">CCO</span>
            </h1>
            <p className="setup-subhead">Chat Center Online for Planning Center</p>

            <p className="setup-lede">
              Realtime messaging for groups, direct messages, and volunteer teams — wired to
              the people and memberships you already manage in Planning Center.
            </p>

            <div className="setup-cta">
              <Link href="/setup" className="setup-btn-primary">
                Set up CCO
              </Link>
            </div>
          </div>

          <aside className="setup-steps-card" aria-labelledby="setup-steps-title">
            <p className="setup-steps-label" id="setup-steps-title">
              What happens next
            </p>
            <ol className="setup-steps-list">
              {SETUP_STEPS.map((step, index) => (
                <li key={step.title} className="setup-step">
                  <span className="setup-step-index">{index + 1}</span>
                  <div>
                    <p className="setup-step-title">{step.title}</p>
                    <p className="setup-step-body">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </aside>
        </div>
      </section>
    </main>
  );
}
