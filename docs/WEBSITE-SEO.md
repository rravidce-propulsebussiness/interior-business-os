# Website SEO

Business settings provide website name, description, locale, timezone, contact details, logo and favicon references, and global noindex. Each page has a title, description, visibility, noindex, canonical override, Open Graph title/description/image and a unique normalized route. Internal navigation and asset references are validated before publication. Use media reference keys from the Media tab.

Only published pages enter public metadata and sitemap output. Sitemap paths derive from the resolving hostname; robots excludes preview and honors noindex. Draft preview always emits noindex,nofollow. The public renderer emits Organization JSON-LD from explicitly published business contact settings and escapes script-closing markup. It does not fabricate ratings, testimonials or rich-result eligibility. The interior starter is noindex by default until the business replaces example content.

Existing published URLs should remain stable. Arbitrary redirect rules and search-engine submission services are not implemented. Publishing a renamed route currently changes its public URL without creating a redirect; update navigation before publishing.
