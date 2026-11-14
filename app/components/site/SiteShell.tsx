import { Inter_Tight } from "next/font/google";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";
import "./site.css";

const display = Inter_Tight({
  weight: ["500", "600", "700", "800"],
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

/** Header, skip link and footer shared by every marketing page. */
export function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className={`sl ${display.variable}`}>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />
    </div>
  );
}
