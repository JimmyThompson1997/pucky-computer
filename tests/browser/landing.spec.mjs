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

test("platform hero is one viewport and points to web app with mobile coming soon", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");
  await freezeMotion(page);

  const platformSection = page.locator('[data-testid="platform-section"], .s2-channel').first();
  const platformCards = page.locator('[data-testid="platform-card"], .platform-card');

  await platformSection.scrollIntoViewIfNeeded();
  await platformSection.screenshot({ path: testInfo.outputPath("platform-section.png") });

  const summary = await platformSection.evaluate((section) => {
    const heading = section.querySelector(".s2-android-title")?.textContent?.replace(/\s+/g, " ").trim() || "";
    const body = section.querySelector(".platform-body")?.textContent?.replace(/\s+/g, " ").trim() || "";
    const rect = section.getBoundingClientRect();
    return {
      heading,
      body,
      text: section.textContent?.replace(/\s+/g, " ").trim() || "",
      cardCount: section.querySelectorAll('[data-testid="platform-card"], .platform-card').length,
      iframeCount: section.querySelectorAll("iframe").length,
      sectionHeight: rect.height,
      viewportHeight: window.innerHeight
    };
  });
  await writeJsonArtifact(testInfo, "platform-section.json", summary);

  await expect(platformCards).toHaveCount(0);
  expect(summary.heading).toBe("Web App");
  expect(summary.body).toBe("iOS and Android coming soon.");
  expect(summary.text).not.toContain("Supported platforms");
  expect(summary.text).not.toContain("Android 16+");
  expect(summary.text).not.toContain("Desktop browser access");
  expect(summary.cardCount).toBe(0);
  expect(summary.iframeCount).toBe(0);
  expect(Math.abs(summary.sectionHeight - summary.viewportHeight)).toBeLessThanOrEqual(2);
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
    const heading = document.querySelector('[data-testid="android-native-belt"] h2, .android-native-belt h2')?.textContent?.replace(/\s+/g, " ").trim() || "";
    const clones = Array.from(document.querySelectorAll('[data-clone="true"], .android-native-item--clone'));
    const visibleClones = clones.filter((node) => getComputedStyle(node).display !== "none").length;

    return {
      heading,
      tileMetrics,
      overlapPairs,
      gridDisplay: grid ? getComputedStyle(grid).display : "",
      gridAnimationName: grid ? getComputedStyle(grid).animationName : "",
      visibleCloneCount: visibleClones
    };
  });

  await writeJsonArtifact(testInfo, "android-tiles.json", metrics);

  const expectedLabels = ["Inbox", "Tasks", "Calendar", "Reminders", "Notes", "Contacts"];
  expect(metrics.heading).toBe("Run Your Life");
  expect(metrics.tileMetrics.map((metric) => metric.label)).toEqual(expectedLabels);

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

  const waitlistLink = page.getByRole("link", { name: /Join Pucky waitlist/i });
  const searchLink = page.getByRole("link", { name: /Browse app integrations on Composio/i });
  const firstTickerItem = page.locator(".ticker-item").first();

  await expect(page.getByRole("link", { name: "About" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "FAQ" })).toHaveCount(0);
  await expect(page.locator("#about, .about-faq, .about-panel")).toHaveCount(0);
  await expect(page.locator("#faq, .faq-panel, .faq-list")).toHaveCount(0);
  await expect(waitlistLink).toHaveAttribute(
    "href",
    "https://docs.google.com/forms/d/e/1FAIpQLSciK2U0IvfeVWuG3-gwsCut-EmDrw4zvmz5_UReuaU5Qd_Vng/viewform"
  );
  await expect(waitlistLink).toHaveAttribute("target", "_blank");
  await expect(waitlistLink).toHaveAttribute("rel", /noopener/);
  const waitlistStyle = await waitlistLink.evaluate((node) => {
    const style = getComputedStyle(node);
    const titleStyle = getComputedStyle(document.querySelector(".main-title"));
    const subtitleStyle = getComputedStyle(document.querySelector(".main-sub"));
    return {
      backgroundColor: style.backgroundColor,
      borderRadius: Number.parseFloat(style.borderRadius),
      color: style.color,
      titleColor: titleStyle.color,
      subtitleColor: subtitleStyle.color
    };
  });
  expect(waitlistStyle.backgroundColor).toContain("255, 255, 255");
  expect(waitlistStyle.borderRadius).toBeGreaterThanOrEqual(40);
  expect(waitlistStyle.color).toBe("rgb(6, 16, 28)");
  expect(waitlistStyle.titleColor).toBe("rgb(255, 255, 255)");
  expect(waitlistStyle.subtitleColor).toBe("rgb(255, 255, 255)");
  await expect(searchLink).toHaveAttribute("href", "https://composio.dev/toolkits");
  await expect(firstTickerItem).toHaveAttribute("href", "https://composio.dev/toolkits");
});
