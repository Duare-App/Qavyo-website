/* Loads editable Qavyo copy from content/site-copy.json. */
(function () {
  "use strict";

  const futureLabels = new Set([
    "API", "App Store", "Loyalty", "Marketing", "My Business",
    "Order and Pay", "Partnerships", "Pay by Link", "Payment Processing",
    "Press", "Online ordering",
  ]);

  const removeLabels = new Set([
    "Accessories", "Air", "All card machines", "Caller ID", "Card machines",
    "Countertop 2", "Deputy", "Hardware", "Kitchen hardware", "Link",
    "Loyalzoo", "Mobile Portable", "OpenTable", "POS barcode scanners",
    "POS comparisons", "POS printers", "Pro cash drawer", "Qavyo Capital",
    "Qavyo Payments Lite", "QuickBooks", "Shopify", "Till roll", "Xero",
  ]);

  const text = (element, value) => {
    if (element && value) element.textContent = value;
  };

  const pageName = () => {
    const name = location.pathname.split("/").pop();
    return name || "index.html";
  };

  function hideLink(link) {
    const container = link.closest(".nnav__item, .footer__col, li, .nnav__cta");
    (container || link).style.display = "none";
  }

  function hideUnavailableNavigation(copy) {
    const hiddenPages = new Set([
      ...(copy.navigation?.roadmapPages || []),
      ...(copy.navigation?.removedPages || []),
    ]);

    document.querySelectorAll("a[href]").forEach((link) => {
      const href = (link.getAttribute("href") || "").split("?")[0].split("#")[0];
      const label = link.textContent.replace(/\s+/g, " ").trim();
      if (hiddenPages.has(href) || futureLabels.has(label) || removeLabels.has(label)) hideLink(link);
    });
  }

  function removeUnsupportedTemplateSections() {
    const unsupported = /card machine|payment terminal|cash drawer|barcode scanner|till roll|countertop 2|epos now capital|loyalzoo|trustpilot|80,000 locations/i;
    document.querySelectorAll("h1, h2, h3, .socialproofbanner__textcolor h2").forEach((heading) => {
      if (!unsupported.test(heading.textContent)) return;
      const section = heading.closest(".element, section, article, .component");
      if (section) section.remove();
    });
  }

  function applyCommonCopy(copy) {
    const page = copy.pages?.[pageName()];
    document.title = page?.title ? `${page.title} | ${copy.siteName}` : document.title.replace(/Epos Now/gi, copy.siteName).replace(/EPOS/gi, "POS");

    document.querySelectorAll('a[href^="tel:"]').forEach((link) => {
      link.href = "contact-us.html";
      text(link, "Talk to sales");
    });
    document.querySelectorAll(".nhead__ecomcartwrapper, .nnav__action--login").forEach((element) => {
      element.style.display = "none";
    });

    const headerSales = document.querySelector(".nhead__sect--endgroup > a");
    if (headerSales) {
      headerSales.href = "contact-us.html";
      text(headerSales, "Talk to sales");
    }
  }

  function applyPageCopy(copy) {
    const page = copy.pages?.[pageName()];
    if (!page || pageName() === "index.html" || pageName() === "pricing.html") return;

    const heading = document.querySelector("main h1");
    if (!heading) return;
    text(heading, page.title);

    const section = heading.closest(".element, section, article, .component") || heading.parentElement;
    const intro = section?.querySelector("p");
    text(intro, page.intro);
  }

  function applyHomepageCopy(copy) {
    if (pageName() !== "index.html") return;
    const home = copy.homepage;
    const hero = document.querySelector(".ct2hero");
    if (hero) {
      text(hero.querySelector(".ct2hero__eyebrow"), home.eyebrow);
      text(hero.querySelector(".ct2hero__title"), home.title);
      const badge = hero.querySelector(".ct2hero__badge");
      if (badge) badge.remove();
      text(hero.querySelector(".ct2hero__subhead"), home.description);
      const actions = hero.querySelectorAll(".ct2hero__actions a");
      if (actions[0]) {
        actions[0].href = "contact-us.html";
        text(actions[0], home.primaryAction);
      }
      if (actions[1]) {
        actions[1].href = "systems.html";
        text(actions[1], home.secondaryAction);
      }
    }

    document.querySelectorAll(".socialproofbanner, .casestudycarousel").forEach((section) => section.remove());

    const faq = document.querySelector(".faq");
    if (faq) {
      text(faq.querySelector("h2"), home.faqTitle);
      faq.querySelectorAll(".faq__item").forEach((item, index) => {
        const itemCopy = home.faqs[index];
        if (!itemCopy) return item.remove();
        text(item.querySelector(".faq__question"), itemCopy[0]);
        text(item.querySelector(".faq__answer"), itemCopy[1]);
      });
    }

    document.querySelectorAll(".hero--noimg").forEach((section) => {
      text(section.querySelector("h2"), home.closingTitle);
      const links = section.querySelectorAll("a");
      if (links[0]) {
        links[0].href = "pricing.html";
        text(links[0], home.closingPrimaryAction);
      }
      if (links[1]) {
        links[1].href = "contact-us.html";
        text(links[1], home.closingSecondaryAction);
      }
    });
  }

  function replaceList(list, values) {
    if (!list) return;
    list.replaceChildren(...values.map((value) => {
      const item = document.createElement("li");
      item.textContent = value;
      return item;
    }));
  }

  function applyPricingCopy(copy) {
    if (pageName() !== "pricing.html" || !copy.pricing) return;
    const pricing = copy.pricing;
    const hero = document.querySelector(".hero");
    if (hero) {
      text(hero.querySelector(".eyebrow"), pricing.hero.eyebrow);
      text(hero.querySelector("h1"), pricing.hero.title);
      text(hero.querySelector("p"), pricing.hero.description);
      hero.querySelectorAll(".switch button").forEach((button, index) => text(button, pricing.hero.billingPeriods[index]));
      text(hero.querySelector(".save"), pricing.hero.savingNote);
    }

    document.querySelectorAll(".plans .plan").forEach((card, index) => {
      const plan = pricing.plans[index];
      if (!plan) return card.remove();
      text(card.querySelector(".tag"), plan.tag);
      text(card.querySelector("h2"), plan.name);
      text(card.querySelector(".intro"), plan.intro);
      text(card.querySelector(".price"), plan.price);
      text(card.querySelector(".region-price"), plan.priceNote);
      text(card.querySelector(".button"), plan.action);
      replaceList(card.querySelector(".features"), plan.features);
    });

    const addonBand = document.querySelector(".band");
    if (addonBand) {
      text(addonBand.querySelector(".eyebrow"), pricing.addons.eyebrow);
      text(addonBand.querySelector("h2"), pricing.addons.title);
      text(addonBand.querySelector(".section-head p"), pricing.addons.description);
      addonBand.querySelectorAll(".addon").forEach((card, index) => {
        const addon = pricing.addons.items[index];
        if (!addon) return card.remove();
        text(card.querySelector("h3"), addon[0]);
        text(card.querySelector("p"), addon[1]);
        text(card.querySelector("span"), addon[2]);
      });
    }

    const comparison = document.querySelector(".comparison");
    if (comparison) {
      text(comparison.querySelector(".eyebrow"), pricing.comparison.eyebrow);
      text(comparison.querySelector("h2"), pricing.comparison.title);
      text(comparison.querySelector(".section-head p"), pricing.comparison.description);
      const rows = comparison.querySelectorAll(".compare-row");
      rows[0]?.querySelectorAll("span").forEach((cell, index) => text(cell, pricing.comparison.headers[index]));
      Array.from(rows).slice(1).forEach((row, index) => {
        const values = pricing.comparison.rows[index];
        if (!values) return row.remove();
        row.querySelectorAll("span").forEach((cell, cellIndex) => text(cell, values[cellIndex]));
      });
    }

    const faq = document.querySelector(".faq");
    if (faq) {
      faq.querySelectorAll("details").forEach((item, index) => {
        const itemCopy = pricing.faqs[index];
        if (!itemCopy) return item.remove();
        text(item.querySelector("summary"), itemCopy[0]);
        text(item.querySelector("p"), itemCopy[1]);
      });
    }

    const footer = document.querySelector("footer");
    if (footer) {
      text(footer.querySelector("h2"), pricing.footer.title);
      text(footer.querySelector("p"), pricing.footer.description);
      text(footer.querySelector(".button"), pricing.footer.action);
      text(footer.querySelector(".footer-note"), pricing.footer.note);
    }
  }

  async function start() {
    try {
      const response = await fetch(new URL("content/site-copy.json", location.href));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const copy = await response.json();
      applyCommonCopy(copy);
      applyHomepageCopy(copy);
      applyPricingCopy(copy);
      applyPageCopy(copy);
      hideUnavailableNavigation(copy);
      removeUnsupportedTemplateSections();
    } catch (error) {
      console.error("Qavyo website copy could not be loaded.", error);
    }
  }

  document.addEventListener("DOMContentLoaded", start);
}());
