const prices = {
  monthly: {
    starter: "$0",
    pro: "$5",
    team: "$12"
  },
  yearly: {
    starter: "$0",
    pro: "$39",
    team: "$99"
  }
};

const labels = {
  monthly: "/seat",
  yearly: "/seat per year"
};

const toggleButtons = document.querySelectorAll("[data-billing]");
const starterPrice = document.querySelector("[data-price-starter]");
const proPrice = document.querySelector("[data-price-pro]");
const teamPrice = document.querySelector("[data-price-team]");
const planLabels = document.querySelectorAll(".price-card small");

toggleButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const billing = button.dataset.billing || "monthly";
    toggleButtons.forEach((item) => item.classList.toggle("active", item === button));
    starterPrice.textContent = prices[billing].starter;
    proPrice.textContent = prices[billing].pro;
    teamPrice.textContent = prices[billing].team;
    planLabels.forEach((label) => {
      label.textContent = labels[billing];
    });
  });
});

document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener("click", (event) => {
    const target = document.querySelector(link.getAttribute("href"));
    if (!target) {
      return;
    }

    event.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

const header = document.querySelector(".site-header");
const revealTargets = document.querySelectorAll(
  ".product-band, .workflow-band, .features-band, .comparison-band, .testimonials-band, .pricing-band, .faq-band, .final-cta, .step-card, .feature-card, .quote-card, .price-card"
);

window.addEventListener("scroll", () => {
  header?.classList.toggle("scrolled", window.scrollY > 12);
}, { passive: true });

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, {
    rootMargin: "0px 0px -12% 0px",
    threshold: 0.12
  });

  revealTargets.forEach((target, index) => {
    target.classList.add("reveal", `reveal-delay-${(index % 4) + 1}`);
    observer.observe(target);
  });
} else {
  revealTargets.forEach((target) => target.classList.add("is-visible"));
}
