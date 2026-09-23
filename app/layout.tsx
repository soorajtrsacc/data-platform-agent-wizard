import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pipeline Coding Agent — Intake Wizard",
  description: "Multi-engine cloud-agnostic data pipeline agent builder",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="w-full bg-navy-ribbon px-6 py-3 flex items-center gap-3 shadow-sm" style={{ backgroundColor: "#0f2d5c" }}>
          <span className="text-white font-bold text-sm tracking-wide">Enterprise Data Platform</span>
          <span className="text-sky-300 text-xs font-medium">AI Coding Agent Wizard</span>
        </div>
        {children}
      </body>
    </html>
  );
}
