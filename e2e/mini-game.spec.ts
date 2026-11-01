import { expect, test, type Browser, type Page } from "@playwright/test";

async function joinPlayer(browser: Browser, code: string, name: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/play");
  await page.getByTestId("join-code").fill(code);
  await page.getByTestId("join-name").fill(name);
  await page.getByTestId("join-submit").click();
  await expect(page.getByRole("heading", { name: "You're in." })).toBeVisible();
  return page;
}

async function answer(page: Page, own: string, prediction: string) {
  await expect(page.getByTestId("ready")).toBeVisible();
  await page.getByTestId("ready").click();
  await page.getByTestId("own-answer").fill(own);
  await page.getByTestId("prediction").fill(prediction);
  await page.getByTestId("lock-answer").click();
  await expect(page.getByTestId("watch-tv")).toBeVisible();
}

test("two teams answer, reveal, and score one question", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const host = await hostContext.newPage();
  await host.goto("/host");
  await host.getByTestId("create-game").click();
  await expect(host.getByTestId("room-code")).toBeVisible();
  const code = (await host.getByTestId("room-code").innerText()).trim();

  const tvContext = await browser.newContext();
  const tv = await tvContext.newPage();
  await tv.goto(`/tv?code=${code}`);
  await expect(tv.getByTestId("tv-room-code")).toHaveText(code);

  const alex = await joinPlayer(browser, code, "Alex");
  const blair = await joinPlayer(browser, code, "Blair");
  const casey = await joinPlayer(browser, code, "Casey");
  const drew = await joinPlayer(browser, code, "Drew");

  await expect(host.getByText("Waiting to be paired")).toContainText("Alex");
  await host.getByTestId("team-name").fill("Red");
  await host.getByTestId("add-team").click();
  await expect(host.getByTestId("team-Red")).toBeVisible();
  await host.getByTestId("team-name").fill("Gold");
  await host.getByTestId("add-team").click();
  await expect(host.getByTestId("team-Gold")).toBeVisible();

  await host.getByTestId("team-Red").getByTestId("assign-Alex-a").click();
  await host.getByTestId("team-Red").getByTestId("assign-Blair-b").click();
  await host.getByTestId("team-Gold").getByTestId("assign-Casey-a").click();
  await host.getByTestId("team-Gold").getByTestId("assign-Drew-b").click();

  await host.getByTestId("load-sample").click();
  await expect(host.getByRole("button", { name: "Round 1", exact: true }).first()).toBeVisible();
  for (let index = 0; index < 6; index += 1) {
    await host.getByRole("button", { name: "Round 1", exact: true }).first().click();
    await expect(host.getByRole("button", { name: "In round 1", exact: true })).toHaveCount(index + 1);
  }
  await host.getByTestId("start-game").click();

  await expect(tv.getByTestId("tv-pass-hint")).toBeVisible();
  await answer(alex, "pizza", "tacos");
  await answer(blair, "tacos", "pizza");
  await answer(casey, "cats", "dogs");
  await answer(drew, "birds", "cats");

  await expect(host.getByTestId("host-lock-progress")).toHaveText("4 of 4 locked");
  await host.getByTestId("advance").click();
  await host.getByTestId("reveal-Red-bOwn").click();
  await host.getByTestId("reveal-Red-aPred").click();
  await host.getByTestId("match-Red-a_predicts_b").click();
  await host.getByTestId("match-Red-b_predicts_a").click();

  await expect(tv.getByTestId("predicts-b-answer")).toHaveText("tacos");
  await expect(tv.getByTestId("score-Red")).toHaveText("2");

  await host.getByTestId("match-Gold-b_predicts_a").click();
  await host.getByTestId("miss-Gold-a_predicts_b").click();
  await expect(tv.getByTestId("score-Gold")).toHaveText("1");
  await expect(tv.getByTestId("score-Red")).toHaveText("2");

  await alex.reload();
  await expect(alex.getByTestId("watch-tv")).toBeVisible();
  await expect(alex.getByText("pizza")).toHaveCount(0);
});
