import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { UnoptimizedPreviewImage } from "../../components/UnoptimizedPreviewImage";

for (const src of ["blob:https://nexcut.invalid/synthetic", "data:image/png;base64,c3ludGhldGlj", "https://images.invalid/preview.png"]) {
  test("preview preserves browser-owned source without an optimizer request: " + src.split(":")[0], () => {
    const html = renderToStaticMarkup(createElement(UnoptimizedPreviewImage, { src, alt: "Synthetic preview", width: 1024, height: 1024, className: "h-auto w-full" }));
    assert.ok(html.includes('src="' + src + '"'));
    assert.ok(html.includes('alt="Synthetic preview"'));
    assert.ok(html.includes('width="1024"'));
    assert.ok(html.includes('height="1024"'));
    assert.ok(html.includes('loading="eager"'));
    assert.ok(!html.includes("/_next/image"));
    assert.ok(!html.includes("srcSet="));
  });
}
