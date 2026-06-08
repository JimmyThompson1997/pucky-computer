import fs from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const BROKEN_RUNTIME_ROOTS = new Set(["/styles.css", "/app.js", "/pucky-config.js"]);

async function writeJsonArtifact(testInfo, name, payload) {
  const filePath = testInfo.outputPath(name);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2));
  return filePath;
}

async function freezeMotion(page) {
  await page.addStyleTag({
    content: `
      *,
      *::before,
      *::after {
        animation-play-state: paused !important;
        transition-duration: 0s !important;
        scroll-behavior: auto !important;
      }
    `
  });
}

function visibleTileSelector() {
  return ':is([data-testid="android-surface-item"], .android-native-item):not([data-clone="true"]):not(.android-native-item--clone)';
}

test("runtime preview renders embedded feed without broken root asset requests", async ({ page }, testInfo) => {
  const brokenResponses = [];
  page.on("response", (response) => {
    try {
      const url = new URL(response.url());
      if (response.status() === 404 && BROKEN_RUNTIME_ROOTS.has(url.pathname)) {
        brokenResponses.push({
          url: response.url(),
          status: response.status()
        });
      }
    } catch {
      // Ignore non-standard URLs.
    }
  });

  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");
  await freezeMotion(page);

  const previewSection = page.locator('[data-testid="cover-runtime-section"], .s2-channel').first();
  const previewDevice = page.locator('[data-testid="cover-runtime-device"], .cover-runtime-device').first();
  const previewFrame = page.locator('[data-testid="cover-runtime-frame"], .cover-runtime-frame').first();

  await previewSection.scrollIntoViewIfNeeded();
  await expect.poll(async () => previewFrame.getAttribute("src")).not.toBe("about:blank");

  const frameSrc = await previewFrame.getAttribute("src");
  await previewSection.screenshot({ path: testInfo.outputPath("runtime-section.png") });
  await previewDevice.screenshot({ path: testInfo.outputPath("runtime-device.png") });
  await writeJsonArtifact(testInfo, "runtime-network.json", {
    frameSrc,
    brokenResponses
  });

  await expect(previewFrame).toHaveAttribute("src", /\/pucky-cover-runtime\/\?reset_nav=1$/);

  const frame = page.frameLocator('[data-testid="cover-runtime-frame"], .cover-runtime-frame');
  await expect(frame.locator(".page-tabs .tab")).toHaveCount(5);
  await expect.poll(async () => frame.locator(".card-wrap").count()).toBeGreaterThan(0);

  expect(brokenResponses).toEqual([]);
});

test("smartphone surface tiles stay readable across viewports", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");
  await freezeMotion(page);

  const belt = page.locator('[data-testid="android-native-belt"], .android-native-belt').first();
  await belt.scrollIntoViewIfNeeded();
  await belt.screenshot({ path: testInfo.outputPath("android-belt.png") });

  const metrics = await page.locator(visibleTileSelector()).evaluateAll((nodes) => {
    const overlapPairs = [];
    const tileMetrics = nodes.map((node) => {
      const label = node.querySelector("span");
      const itemRect = node.getBoundingClientRect();
      const labelRect = label ? label.getBoundingClientRect() : itemRect;
      return {
        label: (label?.textContent || "").trim(),
        item: {
          left: itemRect.left,
          right: itemRect.right,
          top: itemRect.top,
          bottom: itemRect.bottom,
          width: itemRect.width,
          height: itemRect.height
        },
        labelRect: {
          left: labelRect.left,
          right: labelRect.right,
          top: labelRect.top,
          bottom: labelRect.bottom,
          width: labelRect.width,
          height: labelRect.height
        },
        fitsWithinTile:
          labelRect.left >= itemRect.left + 4 &&
          labelRect.right <= itemRect.right - 4 &&
          labelRect.top >= itemRect.top &&
          labelRect.bottom <= itemRect.bottom
      };
    });

    for (let index = 0; index < tileMetrics.length; index += 1) {
      for (let next = index + 1; next < tileMetrics.length; next += 1) {
        const first = tileMetrics[index];
        const second = tileMetrics[next];
        const overlap =
          first.labelRect.left < second.labelRect.right &&
          first.labelRect.right > second.labelRect.left &&
          first.labelRect.top < second.labelRect.bottom &&
          first.labelRect.bottom > second.labelRect.top;
        if (overlap) {
          overlapPairs.push([first.label, second.label]);
        }
      }
    }

    const grid = document.querySelector('[data-testid="android-native-grid"], .android-native-grid');
    const clones = Array.from(document.querySelectorAll('[data-clone="true"], .android-native-item--clone'));
    const visibleClones = clones.filter((node) => getComputedStyle(node).display !== "none").length;

    return {
      tileMetrics,
      overlapPairs,
      gridDisplay: grid ? getComputedStyle(grid).display : "",
      gridAnimationName: grid ? getComputedStyle(grid).animationName : "",
      visibleCloneCount: visibleClones
    };
  });

  await writeJsonArtifact(testInfo, "android-tiles.json", metrics);

  const viewportWidth = testInfo.project.use.viewport.width;
  if (viewportWidth <= 520) {
    expect(metrics.gridDisplay).toBe("flex");
    expect(metrics.gridAnimationName).toBe("androidNativeTickerMove");
    expect(metrics.visibleCloneCount).toBeGreaterThan(0);
  } else {
    expect(metrics.visibleCloneCount).toBe(0);
    expect(metrics.tileMetrics.every((metric) => metric.fitsWithinTile)).toBeTruthy();
    expect(metrics.overlapPairs).toEqual([]);
  }
});

test("anchors and outbound links stay wired", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");

  const aboutLink = page.getByRole("link", { name: "About" });
  const faqLink = page.getByRole("link", { name: "FAQ" });
  const githubLink = page.getByRole("link", { name: /GitHub/i }).first();
  const searchLink = page.getByRole("link", { name: /Browse app integrations on Composio/i });
  const firstTickerItem = page.locator(".ticker-item").first();

  await expect(aboutLink).toHaveAttribute("href", "#about");
  await expect(faqLink).toHaveAttribute("href", "#faq");
  await expect(githubLink).toHaveAttribute("href", "https://github.com/JimmyThompson1997/Motorolla");
  await expect(searchLink).toHaveAttribute("href", "https://composio.dev/toolkits");
  await expect(firstTickerItem).toHaveAttribute("href", "https://composio.dev/toolkits");

  await aboutLink.click();
  await expect(page).toHaveURL(/#about$/);
  await faqLink.click();
  await expect(page).toHaveURL(/#faq$/);
});
