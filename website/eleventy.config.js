import techdoc from "eleventy-plugin-techdoc";

export default function (eleventyConfig) {
  eleventyConfig.addPlugin(techdoc, {
    site: {
      name: "Napper",
      url: "https://napper.dev",
      description:
        "CLI-first, test-oriented HTTP API testing tool for VS Code with F# scripting.",
      author: "Christian Findlay",
      themeColor: "#1B4965",
      stylesheet: "/assets/css/styles.css",
      ogImage: "/assets/images/logo.png",
      organization: {
        name: "Napper",
        url: "https://napper.dev",
        logo: "/assets/images/logo.png",
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
