import type { Metadata } from "next";
import { Source_Sans_3 } from "next/font/google";
import { cookies, headers } from "next/headers";
import { Providers } from "@/components/providers/providers";
import "./globals.css";

const sourceSans = Source_Sans_3({
    subsets: ["latin"],
    variable: "--font-source-sans",
    weight: ["400", "600", "700", "800"],
});

export const metadata: Metadata = {
    title: "AI Simulator SaaS",
    description: "Stateless Multi-tenant AI SaaS",
};

export default async function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    const nonce = (await headers()).get('x-nonce') || undefined;
    const cookieStore = await cookies();
    const cookieLang = cookieStore.get('app-lang')?.value;
    const htmlLang = cookieLang === 'en' ? 'en' : 'es';

    return (
        <html lang={htmlLang} suppressHydrationWarning>
            <body className={`${sourceSans.variable} antialiased`}>
                <Providers nonce={nonce}>
                    {children}
                </Providers>
            </body>
        </html>
    );
}
