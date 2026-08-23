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
          <a href="#demo">Product</a>
          <a href="#workflow">How it works</a>
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
        </nav>
        <a className="nav-cta" href="/api/download">Download Windows .exe</a>
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
            <a className="button primary" href="/api/download">Download for free</a>
            <a className="button secondary" href="#demo">See the product</a>
            <span className="hero-download-note">Windows installer. 15 free exports each month.</span>
          </div>
        </section>

        <section className="trust-band reveal" aria-label="Product highlights">
          <span>Windows desktop app</span>
          <span>15 free monthly exports</span>
          <span>Word and PDF output</span>
          <span>Secure Stripe upgrades</span>
          <span>Local document conversion</span>
        </section>

        <section id="demo" className="product-band reveal" aria-labelledby="demo-title">
          <div className="section-copy">
            <p className="eyebrow">From ChatGPT math to submission-ready Word</p>
            <h2 id="demo-title">The fastest way to turn AI math into a clean document.</h2>
            <p>
              GPT Mathematical imports the ChatGPT share link, extracts the mathematical answer, formats
              equations and Markdown structure, then shows a preview before you save the `.docx` or PDF. The app is free to download, with 15 exports each month on the free plan.
            </p>
            <div className="copy-actions">
              <a className="button primary" href="/api/download">Download the installer</a>
              <a className="button quiet compact" href="#pricing">Compare plans</a>
            </div>
          </div>
          <figure className="product-shot showcase-shot">
            <Image
              src="/assets/export-cleanly-showcase.png"
              alt="GPT Mathematical importing a ChatGPT share link, showing a preview, and downloading a Word document"
              width={1672}
              height={941}
              sizes="(max-width: 1040px) 100vw, 56vw"
            />
          </figure>
        </section>

        <section id="workflow" className="workflow-band reveal" aria-labelledby="workflow-title">
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

        <section className="visual-story reveal" aria-labelledby="visual-story-title">
          <div className="visual-story-media">
            <Image
              src="/assets/word-pdf-workflow-showcase.png"
              alt="GPT Mathematical exporting ChatGPT math into Word and PDF while preserving equations"
              width={1672}
              height={941}
              sizes="(max-width: 1040px) 100vw, 58vw"
            />
          </div>
          <div className="visual-story-copy">
            <p className="eyebrow">Cleaner output, fewer surprises</p>
            <h2 id="visual-story-title">Preview the exact structure before it becomes a document.</h2>
            <p>
              The app is designed around the moment that usually breaks: moving a technical ChatGPT response into a file someone else can read. You get a formatted preview, a plain-text fallback, and clear export controls in one place.
            </p>
            <div className="mini-checks" aria-label="Workflow benefits">
              <span>Math stays readable</span>
              <span>Tables keep structure</span>
              <span>Exports are tracked</span>
            </div>
          </div>
        </section>

        <section id="features" className="features-band reveal" aria-labelledby="features-title">
          <div className="section-copy">
            <p className="eyebrow">Professional output, less cleanup</p>
            <h2 id="features-title">ChatGPT math that looks right in Word.</h2>
          </div>
          <div className="feature-grid">
            {[
              ["fx", "Formula-first conversion", "Recognizes common LaTeX and STEM notation so equations do not arrive as messy raw text."],
              ["md", "Markdown structure", "Keeps headings, lists, emphasis, code blocks, and tables organized for report-style writing."],
              ["pc", "Math preview", "Review the formatted result and fallback text before committing it to a document."],
              ["doc", "Word and PDF export", "Free accounts get 15 exports each month; Plus and Lifetime unlock unlimited documents."],
              ["link", "Share-link workflow", "Use a ChatGPT share URL to bring the full answer into the app without manual copying and cleanup."],
              ["acct", "In-app plans", "Compare free and paid options in the desktop app, then upgrade there when unlimited exports matter."]
            ].map(([icon, title, copy]) => (
              <article className="feature-card" key={title}>
                <div className="feature-icon" aria-hidden="true">{icon}</div>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="comparison-band reveal" aria-labelledby="comparison-title">
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

        <section className="testimonials-band reveal" aria-labelledby="testimonials-title">
          <div className="section-copy">
            <p className="eyebrow">Who it helps</p>
            <h2 id="testimonials-title">Made for people who live between AI and documents.</h2>
          </div>
          <div className="quote-grid">
            <figure className="quote-card">
              <blockquote>
                Stop reformatting ChatGPT equations by hand before they can go into Word.
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
                Formula formatting makes long technical answers easier to preserve and share.
              </blockquote>
              <figcaption>Research teams</figcaption>
            </figure>
          </div>
        </section>

        <PricingSection />

        <section id="faq" className="faq-band reveal" aria-labelledby="faq-title">
          <div className="section-copy narrow">
            <p className="eyebrow">FAQ</p>
            <h2 id="faq-title">Questions buyers will ask first.</h2>
          </div>
          <div className="faq-list">
            <details open>
              <summary>What happens after I buy?</summary>
              <p>Download the Windows app for free first. Paid upgrades are selected from the app Account tab and completed with Stripe Checkout.</p>
            </details>
            <details>
              <summary>What is included for free?</summary>
              <p>Clipboard preview, ChatGPT share-link import, and 15 total Word/PDF exports per calendar month after activating a free account in the app.</p>
            </details>
            <details>
              <summary>How do unlimited exports work?</summary>
              <p>Plus monthly, Plus yearly, and Lifetime plans remove the export limit. You can compare plans, upgrade, and manage billing from the desktop Account tab.</p>
            </details>
            <details>
              <summary>Is tax enabled?</summary>
              <p>The integration is ready for Stripe Tax, but automatic tax is intentionally disabled until active registrations are confirmed.</p>
            </details>
          </div>
        </section>

        <section className="final-cta reveal" aria-labelledby="final-title">
          <p className="eyebrow">Free to try</p>
          <h2 id="final-title">Give technical writers a reliable way to get ChatGPT mathematics into Word.</h2>
          <div className="final-actions">
            <a className="button primary" href="/api/download">Download for free</a>
            <a className="button secondary" href="#pricing">View pricing</a>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <span>GPT Mathematical</span>
        <span>Mathematical formula formatting and document export for AI-assisted STEM writing.</span>
      </footer>
    </>
  );
}
