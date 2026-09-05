import type { MetadataRoute } from "next";

import { product } from "@/lib/brand/product";
import { ROBOTS_DISALLOW } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [...ROBOTS_DISALLOW],
    },
    sitemap: `${product.siteUrl}/sitemap.xml`,
    host: product.siteUrl,
  };
}
