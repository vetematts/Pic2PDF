/* ----------------------------------------------------------------------------
 * Origami — shared shell
 *
 * Injects a small top navigation bar and a footer into every page of the
 * suite. Tool pages keep their own hero/content untouched; the shell just
 * wraps them with consistent suite chrome.
 *
 * Usage (place at the end of <body>):
 *
 *   <!-- on the suite landing -->
 *   <script src="shared/shell.js"></script>
 *   <script>Shell.mount();</script>
 *
 *   <!-- on a tool page (e.g. tools/pic2pdf/index.html) -->
 *   <script src="../../shared/shell.js"></script>
 *   <script>Shell.mount({ tool: "Pic2PDF", rootHref: "../../" });</script>
 *
 * Options:
 *   tool       string — display name of the current tool (omit on landing)
 *   rootHref   string — URL to the suite landing (default "./")
 *   github     string — GitHub repo URL for the footer link
 * -------------------------------------------------------------------------- */

(function () {
  "use strict";

  const DEFAULT_GITHUB = "https://github.com/vetematts/Pic2PDF";

  function el(tag, props, children) {
    const node = document.createElement(tag);
    if (props) {
      for (const key in props) {
        if (key === "className") node.className = props[key];
        else if (key.startsWith("aria-") || key === "role") node.setAttribute(key, props[key]);
        else node[key] = props[key];
      }
    }
    if (children) {
      for (const child of children) {
        if (child == null) continue;
        node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
      }
    }
    return node;
  }

  function buildHeader(options) {
    const rootHref = options.rootHref || "./";
    const brand = el(
      "a",
      { className: "origami-nav-brand", href: rootHref },
      ["Origami"]
    );

    const items = [brand];
    if (options.tool) {
      items.push(el("span", { className: "origami-nav-sep", "aria-hidden": "true" }, ["›"]));
      items.push(el("span", { className: "origami-nav-tool", "aria-current": "page" }, [options.tool]));
    }

    return el("nav", { className: "origami-nav", "aria-label": "Suite" }, items);
  }

  function buildFooter(options) {
    const github = options.github || DEFAULT_GITHUB;
    return el("footer", { className: "origami-foot" }, [
      el("span", null, ["100% local · No server · No account"]),
      el("span", { className: "origami-foot-sep", "aria-hidden": "true" }, [" · "]),
      el(
        "a",
        {
          className: "origami-foot-link",
          href: github,
          rel: "noopener",
          target: "_blank",
        },
        ["Source on GitHub"]
      ),
    ]);
  }

  function mount(options) {
    const opts = options || {};
    document.body.insertBefore(buildHeader(opts), document.body.firstChild);
    document.body.appendChild(buildFooter(opts));
  }

  window.Shell = { mount };
})();
