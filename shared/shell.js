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
    const brand = el("a", { className: "origami-nav-brand", href: rootHref }, []);
    brand.innerHTML =
      '<svg class="origami-nav-crane" viewBox="0 0 120 100" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">' +
        '<polygon points="5,55 45,45 60,95" fill="#9FB3EC"/>' +
        '<polygon points="115,55 75,45 60,95" fill="#B8C9F3"/>' +
        '<polygon points="45,45 60,22 60,95" fill="#8AA8E6"/>' +
        '<polygon points="75,45 60,22 60,95" fill="#C0CFEF"/>' +
        '<polygon points="45,45 40,4 60,22" fill="#7B9EE8"/>' +
        '<polygon points="75,45 82,4 60,22" fill="#B0C5F5"/>' +
        '<polyline points="5,55 45,45 60,22 75,45 115,55" fill="none" stroke="#ffffff" stroke-width="0.8" opacity="0.3"/>' +
        '<line x1="60" y1="22" x2="60" y2="95" stroke="#ffffff" stroke-width="0.8" opacity="0.3"/>' +
        '<line x1="45" y1="45" x2="60" y2="95" stroke="#ffffff" stroke-width="0.8" opacity="0.3"/>' +
        '<line x1="75" y1="45" x2="60" y2="95" stroke="#ffffff" stroke-width="0.8" opacity="0.3"/>' +
      '</svg>' +
      'Origami Docs';

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
