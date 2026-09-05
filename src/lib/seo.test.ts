import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { product } from "@/lib/brand/product";
import { APP_LOCALES } from "@/lib/i18n/locales";
import {
  INDEXABLE_PATHS,
  ROBOTS_DISALLOW,
  absoluteUrl,
  landingJsonLd,
  languageAlternates,
  localizedPath,
  sitemapEntries,
} from "@/lib/seo";

describe("SEO indexing helpers", () => {
  it("builds locale-prefixed canonicals on the public origin", () => {
    assert.equal(localizedPath("en", "/"), "/en");
    assert.equal(localizedPath("fr", "/pricing"), "/fr/pricing");
    assert.equal(
      absoluteUrl("es", "/privacy"),
      `${product.siteUrl}/es/privacy`,
    );
  });

  it("lists every public locale for hreflang, with English as x-default", () => {
    const languages = languageAlternates("/");
    for (const locale of APP_LOCALES) {
      assert.equal(languages[locale], `${product.siteUrl}/${locale}`);
    }
    assert.equal(languages["x-default"], `${product.siteUrl}/en`);
  });

  it("sitemaps each indexable path in every locale", () => {
    const entries = sitemapEntries();
    assert.equal(entries.length, INDEXABLE_PATHS.length * APP_LOCALES.length);
    assert.ok(entries.every((entry) => entry.url.startsWith(product.siteUrl)));
    assert.ok(entries.some((entry) => entry.url === `${product.siteUrl}/en`));
    assert.ok(
      entries.some((entry) => entry.url === `${product.siteUrl}/fr/pricing`),
    );
    assert.ok(
      !entries.some((entry) => entry.url.includes("/login")),
    );
  });

  it("keeps app, portal, and token routes out of robots", () => {
    const disallowed = ROBOTS_DISALLOW.join(" ");
    for (const fragment of [
      "/*/login",
      "/*/home",
      "/*/portal",
      "/*/book/",
      "/*/pay/",
      "/api/",
    ]) {
      assert.ok(disallowed.includes(fragment), fragment);
    }
  });

  it("emits SoftwareApplication and FAQ structured data", () => {
    const data = landingJsonLd({
      locale: "en",
      title: "Dossierly — CRM for Canadian immigration consultants",
      description: "Practice CRM for Canadian immigration consultants.",
      faqs: [{ question: "Where is data stored?", answer: "In Canada." }],
    });
    const types = data["@graph"].map((node) => node["@type"]);
    assert.deepEqual(
      types.sort(),
      [
        "FAQPage",
        "Organization",
        "SoftwareApplication",
        "WebPage",
        "WebSite",
      ].sort(),
    );
  });
});
