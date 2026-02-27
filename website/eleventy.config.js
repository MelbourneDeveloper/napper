import techdoc from "eleventy-plugin-techdoc";

export default function (eleventyConfig) {
  eleventyConfig.addPlugin(techdoc, {
    site: {
      name: "Napper",
      url: "https://napperapi.dev",
      description:
        "CLI-first, test-oriented HTTP API testing tool for VS Code with F# scripting.",
      author: "Christian Findlay",
      themeColor: "#1B4965",
      stylesheet: "/assets/css/styles.css",
      ogImage: "/assets/images/logo.png",
      organization: {
        name: "Napper",
        url: "https://napperapi.dev",
        logo: "/assets/images/logo.png",
        sameAs: [
          "https://github.com/MelbourneDeveloper/napper",
          "https://marketplace.visualstudio.com/items?itemName=nimblesite.napper",
        ],
      },
    },
    features: {
      blog: true,
      docs: true,
      darkMode: true,
      i18n: false,
    },
  });

  eleventyConfig.addPassthroughCopy("src/assets");
  eleventyConfig.addPassthroughCopy({ "src/favicon.ico": "favicon.ico" });

  const faviconLinks = [
    '<link rel="icon" type="image/x-icon" href="/favicon.ico">',
    '<link rel="icon" type="image/png" sizes="32x32" href="/assets/images/favicon-32x32.png">',
    '<link rel="icon" type="image/png" sizes="16x16" href="/assets/images/favicon-16x16.png">',
    '<link rel="apple-touch-icon" sizes="180x180" href="/assets/images/apple-touch-icon.png">',
  ].join("\n  ");

  eleventyConfig.addTransform("favicon", function (content) {
    if (this.page.outputPath?.endsWith(".html")) {
      return content.replace("</head>", `  ${faviconLinks}\n</head>`);
    }
    return content;
  });

  // Fix robots.txt: allow image crawling (Google requires image access)
  eleventyConfig.addTransform("robots-fix", function (content) {
    if (this.page.outputPath === "robots.txt" || this.page.outputPath?.endsWith("/robots.txt")) {
      return content.replace(
        "Disallow: /assets/",
        "Disallow: /assets/css/\nDisallow: /assets/js/"
      );
    }
    return content;
  });

  // Fix llms.txt: remove dead /api/ link
  eleventyConfig.addTransform("llms-fix", function (content) {
    if (this.page.outputPath === "llms.txt" || this.page.outputPath?.endsWith("/llms.txt")) {
      return content.replace(
        "- API Reference: https://napperapi.dev/api/",
        ""
      );
    }
    return content;
  });

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data",
    },
    templateFormats: ["md", "njk", "html"],
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
}
