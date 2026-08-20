import Image from "next/image";
import { PricingSection } from "../components/PricingSection";

export default function HomePage() {
  return (
    <>
      <header className="site-header" aria-label="Primary">
        <a className="brand" href="#top" aria-label="GPT Mathematical home">
          <span className="brand-mark" aria-hidden="true"></span>
          <span>GPT Mathematical</span>
        </a>
        <nav className="nav-links" aria-label="Site">
          <a href="#workflow">Workflow</a>
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
          <a href="/account">Account</a>
        </nav>
        <a className="nav-cta" href="#pricing">Buy launch access</a>
      </header>

      <main id="top">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-shade"></div>
          <div className="hero-content screen-reader-copy">
            <p className="eyebrow">Professional formatting for ChatGPT math output</p>
            <h1 id="hero-title">GPT Mathematical</h1>
            <p className="hero-copy">
              Convert ChatGPT formulas, derivations, tables, and code into a polished Word document
              that keeps mathematical structure readable instead of dumping raw Markdown into your report.
            </p>
          </div>
          <div className="hero-float-cta" aria-label="Primary actions">
            <a className="button primary" href="#pricing">Buy launch access</a>
            <a className="button secondary" href="#demo">See the product</a>
          </div>
        </section>

        <section className="trust-band" aria-label="Ideal customers">
          <span>Built for teachers</span>
          <span>Researchers</span>
          <span>Analysts</span>
          <span>Engineers</span>
          <span>Students writing serious reports</span>
        </section>

        <section id="demo" className="product-band" aria-labelledby="demo-title">
          <div className="section-copy">
            <p className="eyebrow">From ChatGPT math to submission-ready Word</p>
            <h2 id="demo-title">The fastest way to turn AI math into a clean document.</h2>
            <p>
              GPT Mathematical imports the ChatGPT share link, extracts the mathematical answer, formats
              equations and Markdown structure, then shows a preview before you save the `.docx` or PDF.
            </p>
          </div>
          <figure className="product-shot">
            <Image
              src="/assets/product-hero.png"
              alt="GPT Mathematical importing a ChatGPT share link, showing a preview, and downloading a Word document"
              width={1424}
              height={904}
              priority
            />
          </figure>
        </section>

        <section id="workflow" className="workflow-band" aria-labelledby="workflow-title">
          <div className="section-copy narrow">
            <p className="eyebrow">Three-step workflow</p>
            <h2 id="workflow-title">Built for the frustrating gap between correct math and usable formatting.</h2>
          </div>
          <div className="steps">
            <article className="step-card">
              <span className="step-number">01</span>
              <h3>Copy the share link</h3>
              <p>Create or copy a ChatGPT shared conversation link for the math-heavy answer you want to preserve.</p>
            </article>
            <article className="step-card">
              <span className="step-number">02</span>
              <h3>Import and preview</h3>
              <p>Paste the link, or let the app detect it from your clipboard, choose the whole chat or one response, and inspect the formatted math preview.</p>
            </article>
            <article className="step-card">
              <span className="step-number">03</span>
              <h3>Download Word or PDF</h3>
              <p>Save a document with supported equations, headings, tables, lists, and code carried into the export.</p>
            </article>
          </div>
        </section>

        <section id="features" className="features-band" aria-labelledby="features-title">
          <div className="section-copy">
            <p className="eyebrow">Professional output, less cleanup</p>
            <h2 id="features-title">ChatGPT math that looks right in Word.</h2>
          </div>
          <div className="feature-grid">
            {[
              ["fx", "Formula-first conversion", "Recognizes common LaTeX and STEM notation so equations do not arrive as messy raw text."],
              ["md", "Markdown structure", "Keeps headings, lists, emphasis, code blocks, and tables organized for report-style writing."],
              ["pc", "Math preview", "Review the formatted result and fallback text before committing it to a document."],
              ["doc", "Word and PDF export", "Download documents with supported LaTeX converted into polished visual output."],
              ["link", "Share-link workflow", "Use a ChatGPT share URL to bring the full answer into the app without manual copying and cleanup."],
              ["key", "License activation", "Paid users can unlock the Windows app with a license key from their account portal."]
            ].map(([icon, title, copy]) => (
              <article className="feature-card" key={title}>
                <div className="feature-icon" aria-hidden="true">{icon}</div>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="comparison-band" aria-labelledby="comparison-title">
          <div className="section-copy narrow">
            <p className="eyebrow">Why it sells</p>
            <h2 id="comparison-title">It removes the invisible tax from AI-assisted writing.</h2>
          </div>
          <div className="comparison">
            <div className="comparison-column pain">
              <h3>Without GPT Mathematical</h3>
              <ul>
                <li>Formulas paste as raw LaTeX or broken plain text.</li>
                <li>Tables and code lose report-friendly structure.</li>
                <li>Students and teams waste time rebuilding the answer.</li>
                <li>Word documents need manual cleanup before sharing.</li>
              </ul>
            </div>
            <div className="comparison-column gain">
              <h3>With GPT Mathematical</h3>
              <ul>
                <li>Convert ChatGPT formulas into readable math output.</li>
                <li>Keep Markdown, tables, and code structured.</li>
                <li>Preview the formatted result immediately.</li>
                <li>Export the answer as a polished Word or PDF document.</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="testimonials-band" aria-labelledby="testimonials-title">
          <div className="section-copy">
            <p className="eyebrow">Positioning</p>
            <h2 id="testimonials-title">Made for people who live between AI and documents.</h2>
          </div>
          <div className="quote-grid">
            <figure className="quote-card">
              <blockquote>
                The pitch is simple: stop reformatting ChatGPT equations by hand before they can go into Word.
              </blockquote>
              <figcaption>Independent analysts</figcaption>
            </figure>
            <figure className="quote-card">
              <blockquote>
                A practical utility for classrooms where AI math output still has to become a readable handout.
              </blockquote>
              <figcaption>STEM educators</figcaption>
            </figure>
            <figure className="quote-card">
              <blockquote>
                Formula formatting is the feature that makes long technical answers easier to preserve.
              </blockquote>
              <figcaption>Research teams</figcaption>
            </figure>
          </div>
        </section>

        <PricingSection />

        <section id="faq" className="faq-band" aria-labelledby="faq-title">
          <div className="section-copy narrow">
            <p className="eyebrow">FAQ</p>
            <h2 id="faq-title">Questions buyers will ask first.</h2>
          </div>
          <div className="faq-list">
            <details open>
              <summary>What happens after I buy?</summary>
              <p>Stripe returns you to GPT Mathematical, where you can sign in, view your license key, and download the Windows app.</p>
            </details>
            <details>
              <summary>How does activation work?</summary>
              <p>Open the desktop app, enter your account email and license key, and the app stores a local activation token.</p>
            </details>
            <details>
              <summary>Is tax enabled?</summary>
              <p>The integration is ready for Stripe Tax, but automatic tax is intentionally disabled until active registrations are confirmed.</p>
            </details>
          </div>
        </section>

        <section className="final-cta" aria-labelledby="final-title">
          <p className="eyebrow">Ready for launch packaging</p>
          <h2 id="final-title">Give technical writers a reliable way to get ChatGPT mathematics into Word.</h2>
          <a className="button primary" href="#pricing">Buy launch access</a>
        </section>
      </main>

      <footer className="site-footer">
        <span>GPT Mathematical</span>
        <span>Mathematical formula formatting and document export for AI-assisted STEM writing.</span>
      </footer>
    </>
  );
}
