import fs from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

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

test("platform section focuses on web and Android 16+ without the runtime embed", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");
  await freezeMotion(page);

  const platformSection = page.locator('[data-testid="platform-section"], .s2-channel').first();
  const platformPanels = page.locator('[data-testid="platform-panels"], .platform-panels').first();
  const platformCards = page.locator('[data-testid="platform-card"], .platform-card');

  await platformSection.scrollIntoViewIfNeeded();
  await platformSection.screenshot({ path: testInfo.outputPath("platform-section.png") });

  const summary = await platformSection.evaluate((section) => {
    const heading = section.querySelector(".s2-android-title")?.textContent?.replace(/\s+/g, " ").trim() || "";
    const body = section.querySelector(".platform-body")?.textContent?.replace(/\s+/g, " ").trim() || "";
    const labels = Array.from(section.querySelectorAll(".platform-label")).map((node) => node.textContent?.trim() || "");
    return {
      heading,
      body,
      labels,
      iframeCount: section.querySelectorAll("iframe").length
    };
  });
  await writeJsonArtifact(testInfo, "platform-section.json", summary);

  await expect(platformPanels).toBeVisible();
  await expect(platformCards).toHaveCount(2);
  expect(summary.heading).toContain("Works on Web");
  expect(summary.heading).toContain("Android 16+");
  expect(summary.body).toContain("web");
  expect(summary.body).toContain("Android 16+");
  expect(summary.labels).toEqual(["Web", "Android 16+"]);
  expect(summary.iframeCount).toBe(0);
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
