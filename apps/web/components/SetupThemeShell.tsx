import "../app/home.css";
import "./setup-welcome.css";

type Props = {
  children: React.ReactNode;
};

export function SetupThemeShell({ children }: Props) {
  return (
    <main className="home setup-welcome setup-page">
      <div className="home-bg" aria-hidden>
        <div className="home-bg-gradient" />
        <div className="home-bg-grid" />
      </div>

      <section className="home-hero setup-hero setup-page-hero">{children}</section>
    </main>
  );
}
