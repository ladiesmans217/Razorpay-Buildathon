import type { Metadata } from "next";
import { Toaster } from "sonner";
import { CareStoreProvider } from "@/lib/care-store";
import "./globals.css";

export const metadata: Metadata = {
  title: "RememberMe CareGrid",
  description:
    "AI memory, wandering safety, community care coordination, and Gemini CareLearn training for Indian families."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <CareStoreProvider>
          {children}
          <Toaster richColors position="top-right" />
        </CareStoreProvider>
      </body>
    </html>
  );
}
