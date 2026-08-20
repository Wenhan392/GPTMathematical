import { CheckoutButton } from "./CheckoutButton";

export function PricingSection() {
  return (
    <section id="pricing" className="pricing-band" aria-labelledby="pricing-title">
      <div className="section-copy pricing-copy">
        <div>
          <p className="eyebrow">Launch pricing</p>
          <h2 id="pricing-title">Simple pricing for launch.</h2>
        </div>
      </div>
      <div className="pricing-grid">
        <article className="price-card featured">
          <p className="plan">Monthly Subscription</p>
          <h3><span>$2</span><small>/month</small></h3>
          <p className="plan-copy">For regular ChatGPT math-to-document workflows without a long commitment.</p>
          <ul>
            <li>Formula and Markdown formatting</li>
            <li>Response picker</li>
            <li>Word and PDF export</li>
            <li>Clipboard copy included</li>
          </ul>
          <CheckoutButton className="button primary" plan="monthly">Buy monthly</CheckoutButton>
        </article>
        <article className="price-card">
          <p className="plan">Yearly Subscription</p>
          <h3><span>$20</span><small>/year</small></h3>
          <p className="plan-copy">For daily use with a lower yearly price than paying month to month.</p>
          <ul>
            <li>Formula and Markdown formatting</li>
            <li>Response picker</li>
            <li>Word and PDF export</li>
            <li>Best subscription value</li>
          </ul>
          <CheckoutButton className="button quiet" plan="yearly">Buy yearly</CheckoutButton>
        </article>
        <article className="price-card lifetime">
          <p className="plan">Lifetime</p>
          <h3>$30<small>once</small></h3>
          <p className="plan-copy">For early buyers who want the desktop app without another subscription.</p>
          <ul>
            <li>All formula formatting features</li>
            <li>Lifetime updates for v1</li>
            <li>Single Windows device</li>
          </ul>
          <CheckoutButton className="button quiet" plan="lifetime">Buy lifetime</CheckoutButton>
        </article>
      </div>
    </section>
  );
}
