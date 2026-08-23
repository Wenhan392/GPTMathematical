export function PricingSection() {
  return (
    <section id="pricing" className="pricing-band" aria-labelledby="pricing-title">
      <div className="section-copy pricing-copy">
        <div>
          <p className="eyebrow">Free download, simple upgrades</p>
          <h2 id="pricing-title">Start free. Upgrade when exports become part of your workflow.</h2>
        </div>
      </div>
      <div className="pricing-grid">
        <article className="price-card">
          <p className="plan">Free</p>
          <h3>$0<small>/month</small></h3>
          <p className="plan-copy">For trying the app and occasional ChatGPT math exports.</p>
          <ul>
            <li>Free Windows app download</li>
            <li>Clipboard and share-link preview</li>
            <li>15 Word/PDF exports per month</li>
            <li>Email-only free account inside the app</li>
          </ul>
          <a className="button quiet" href="/api/download">Download free</a>
        </article>
        <article className="price-card featured">
          <p className="plan">Plus Monthly</p>
          <h3><span>$2</span><small>/month</small></h3>
          <p className="plan-copy">For regular ChatGPT math-to-document workflows without a long commitment.</p>
          <ul>
            <li>Unlimited Word and PDF exports</li>
            <li>Formula and Markdown formatting</li>
            <li>Response picker</li>
            <li>Manage billing anytime</li>
          </ul>
          <span className="button primary plan-note">Upgrade inside the app</span>
        </article>
        <article className="price-card">
          <p className="plan">Plus Yearly</p>
          <h3><span>$20</span><small>/year</small></h3>
          <p className="plan-copy">For daily use with a lower yearly price than paying month to month.</p>
          <ul>
            <li>Unlimited Word and PDF exports</li>
            <li>Formula and Markdown formatting</li>
            <li>Response picker</li>
            <li>Best subscription value</li>
          </ul>
          <span className="button quiet plan-note">Upgrade inside the app</span>
        </article>
        <article className="price-card lifetime">
          <p className="plan">Lifetime</p>
          <h3>$30<small>once</small></h3>
          <p className="plan-copy">For early buyers who want the desktop app without another subscription.</p>
          <ul>
            <li>Unlimited Word and PDF exports</li>
            <li>Lifetime updates for v1</li>
            <li>Single Windows device</li>
          </ul>
          <span className="button quiet plan-note">Upgrade inside the app</span>
        </article>
      </div>
    </section>
  );
}
