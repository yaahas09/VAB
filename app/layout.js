import "./globals.css";

export const metadata = {
  title: "Ledger",
  description: "Payment collection ledger",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
