import Link from "next/link";
import { AccountPortal } from "../../components/AccountPortal";

export default function AccountPage() {
  return (
    <>
      <header className="site-header light" aria-label="Primary">
        <Link className="brand" href="/" aria-label="GPT Mathematical home">
          <span className="brand-mark" aria-hidden="true"></span>
          <span>GPT Mathematical</span>
        </Link>
        <nav className="nav-links" aria-label="Site">
          <Link href="/#pricing">Pricing</Link>
          <Link href="/#faq">FAQ</Link>
        </nav>
        <Link className="nav-cta" href="/api/download">Download free</Link>
      </header>
      <AccountPortal />
    </>
  );
}
