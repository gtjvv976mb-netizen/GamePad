import { expect, test } from "@playwright/test";

// A stand-in Solana wallet that registers through the Wallet Standard, like Phantom or Solflare do, and signs with a
// real Ed25519 key (WebCrypto), so the site's Sign In With Solana check runs for real.
async function installWallet(page: import("@playwright/test").Page, opts: { signIn: boolean; forge?: boolean }) {
  await page.addInitScript(({ signIn, forge }) => {
    const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    const b58 = (b: Uint8Array) => {
      let n = 0n; for (const x of b) n = n * 256n + BigInt(x);
      let s = ""; while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
      for (const x of b) { if (x) break; s = "1" + s; }
      return s;
    };
    // The key and the site's authorization survive a reload, like a real wallet's.
    const hex = (b: Uint8Array) => [...b].map(x => x.toString(16).padStart(2, "0")).join("");
    const unhex = (h: string) => new Uint8Array(h.match(/../g)!.map(x => parseInt(x, 16)));
    const ready = (async () => {
      const saved = sessionStorage.getItem("test-wallet-key");
      let key: CryptoKeyPair;
      if (saved) {
        const [pk, sk] = saved.split(".");
        key = {
          publicKey: await crypto.subtle.importKey("raw", unhex(pk), { name: "Ed25519" }, true, ["verify"]),
          privateKey: await crypto.subtle.importKey("pkcs8", unhex(sk), { name: "Ed25519" }, true, ["sign"]),
        };
      } else {
        key = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]) as CryptoKeyPair;
        const pk = new Uint8Array(await crypto.subtle.exportKey("raw", key.publicKey));
        const sk = new Uint8Array(await crypto.subtle.exportKey("pkcs8", key.privateKey));
        sessionStorage.setItem("test-wallet-key", `${hex(pk)}.${hex(sk)}`);
      }
      const publicKey = new Uint8Array(await crypto.subtle.exportKey("raw", key.publicKey));
      return { key, account: { address: b58(publicKey), publicKey, chains: ["solana:devnet"], features: [] as string[] } };
    })();
    const sign = async (m: Uint8Array<ArrayBuffer>) => new Uint8Array(await crypto.subtle.sign("Ed25519", (await ready).key.privateKey, m));
    let accounts: unknown[] = [];
    const features: Record<string, unknown> = {
      "standard:connect": { version: "1.0.0", connect: async (i?: { silent?: boolean }) => {
        if (!i?.silent || sessionStorage.getItem("test-wallet-ok")) { accounts = [(await ready).account]; sessionStorage.setItem("test-wallet-ok", "1"); }
        return { accounts };
      } },
      "standard:disconnect": { version: "1.0.0", disconnect: async () => { accounts = []; sessionStorage.removeItem("test-wallet-ok"); } },
      "standard:events": { version: "1.0.0", on: () => () => {} },
      "solana:signTransaction": { version: "1.0.0", supportedTransactionVersions: ["legacy", 0], signTransaction: async () => { throw new Error("not in this test"); } },
      "solana:signMessage": { version: "1.0.0", signMessage: async ({ message }: { message: Uint8Array<ArrayBuffer> }) => [{ signedMessage: message, signature: await sign(message) }] },
    };
    if (signIn) features["solana:signIn"] = {
      version: "1.0.0",
      signIn: async (i: Record<string, string>) => {
        const { account } = await ready;
        const text = `${i.domain} wants you to sign in with your Solana account:\n${account.address}\n\n${i.statement}\n\nURI: ${i.uri}\nVersion: ${i.version}\nChain ID: ${i.chainId}\nNonce: ${i.nonce}\nIssued At: ${i.issuedAt}`;
        const signedMessage = new TextEncoder().encode(text);
        (window as unknown as { __signed: string }).__signed = text;
        // a forged sign-in returns a signature over a different message
        return [{ account, signedMessage, signature: await sign(forge ? new TextEncoder().encode(text + " ") : signedMessage) }];
      },
    };
    const wallet = {
      version: "1.0.0", name: "Test Wallet", chains: ["solana:devnet"], features,
      icon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxIDEiLz4=",
      get accounts() { return accounts; },
    };
    const register = ({ register }: { register(w: unknown): void }) => register(wallet);
    window.addEventListener("wallet-standard:app-ready", (e: Event) => register((e as CustomEvent).detail));
    window.dispatchEvent(new CustomEvent("wallet-standard:register-wallet", { detail: register }));
  }, opts);
}

for (const signIn of [true, false]) {
  test(`a Solana wallet connects and signs in (${signIn ? "Sign In With Solana" : "signed message"})`, async ({ page }) => {
    await installWallet(page, { signIn });
    await page.goto("./?no3d&nointro");
    await page.getByRole("button", { name: /^Connect/ }).first().click();
    await page.getByRole("button", { name: /Test Wallet/ }).click();
    await expect(page.getByRole("dialog", { name: "Sign in" })).toBeVisible();
    await expect(page.getByText(/The store isn't on Solana devnet yet/)).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: /Sign in$/ }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.getByRole("tab", { name: "Profile" }).click();
    await expect(page.getByRole("heading", { name: "Your wallet" })).toBeVisible();
    await expect(page.getByText("Solana devnet", { exact: true })).toBeVisible();
    await expect(page.locator("dt", { hasText: "Signed in" }).locator("+ dd")).toHaveText("Yes");
    if (signIn) expect(await page.evaluate(() => (window as unknown as { __signed: string }).__signed)).toMatch(/^localhost:4173 wants you to sign in with your Solana account:\n\w{32,44}\n/);

    // the next visit reconnects quietly and keeps the sign-in; Disconnect forgets both
    await page.reload();
    await page.getByRole("tab", { name: "Profile" }).click();
    await expect(page.locator("dt", { hasText: "Signed in" }).locator("+ dd")).toHaveText("Yes");
    await page.getByRole("button", { name: "Disconnect" }).click();
    await expect(page.getByRole("heading", { name: "Not connected" })).toBeVisible();
    await page.reload();
    await page.getByRole("tab", { name: "Profile" }).click();
    await expect(page.getByRole("heading", { name: "Not connected" })).toBeVisible();
  });
}

test("a signature that doesn't match the wallet is refused", async ({ page }) => {
  await installWallet(page, { signIn: true, forge: true });
  await page.goto("./?no3d&nointro");
  await page.getByRole("button", { name: /^Connect/ }).first().click();
  await page.getByRole("button", { name: /Test Wallet/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Sign in$/ }).click();
  await expect(page.getByRole("alert")).toHaveText("That signature didn't match this wallet.");
});
