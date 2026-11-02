"""Browser end-to-end test of the real UI with an injected wallet backed by a local Hardhat node.

Usage: python3 tests/ui_e2e.py  (app on :3100 built against the local chain, Hardhat node on :8545)
Saves product screenshots to docs/screenshots/.
"""
import json
import os
import re
import sys
import tempfile
import urllib.request
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

APP = os.environ.get("APP_URL", "http://127.0.0.1:3100")
RPC = os.environ.get("RPC_URL", "http://127.0.0.1:8545")
SHOTS = Path(__file__).resolve().parents[3] / "docs" / "screenshots"
SHOTS.mkdir(parents=True, exist_ok=True)

# EIP-1193 provider that forwards to the Hardhat node, whose dev accounts are unlocked
WALLET = """
(() => {
  const rpc = %s;
  let id = 1;
  const call = async (method, params) => {
    const res = await fetch(rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: id++, method, params: params || [] }) });
    const body = await res.json();
    if (body.error) { const e = new Error(body.error.message); e.code = body.error.code; throw e; }
    return body.result;
  };
  window.ethereum = {
    isMetaMask: false,
    request: async ({ method, params }) => {
      if (method === 'eth_requestAccounts') return call('eth_accounts');
      if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain') return null;
      return call(method, params);
    },
    on: () => {},
    removeListener: () => {},
  };
})();
""" % json.dumps(RPC)


def rpc(method, params=None):
    req = urllib.request.Request(RPC, data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params or []}).encode(), headers={"content-type": "application/json"})
    return json.loads(urllib.request.urlopen(req).read())["result"]


def shot(page, name):
    page.screenshot(path=str(SHOTS / f"{name}.png"), full_page=True)
    print(f"  screenshot {name}.png")


def main():
    csv_path = Path(tempfile.gettempdir()) / "drawledger-entrants.csv"
    csv_path.write_text("name,email\n" + "\n".join(f"Entrant {i:03d},entrant{i:03d}@example.test" for i in range(1, 25)))

    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, slow_mo=int(os.environ.get("SLOW_MO", "0")))
        video_dir = SHOTS.parent / "demo"
        ctx = browser.new_context(viewport={"width": 1280, "height": 900}, accept_downloads=True, record_video_dir=str(video_dir), record_video_size={"width": 1280, "height": 900})
        ctx.add_init_script(WALLET)
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))

        print("landing")
        page.goto(APP)
        expect(page.get_by_role("heading", name=re.compile("every entrant can check"))).to_be_visible()
        shot(page, "01-landing")

        print("sign in")
        page.goto(f"{APP}/operator")
        page.get_by_role("button", name="Connect wallet and sign in").click()
        expect(page.get_by_role("heading", name="Your draws")).to_be_visible(timeout=20000)

        print("create draw")
        page.get_by_role("link", name="New draw").click()
        page.get_by_label("Title").fill("Block C parking allotment 2026")
        page.get_by_label("What is being allotted").fill("Six covered parking slots for the 2026 to 2027 year.")
        page.get_by_label("Who can enter").fill("Residents with a registered vehicle")
        page.get_by_label("Prize or allocation").fill("One covered parking slot")
        page.get_by_label("Number of winners").fill("6")
        page.get_by_label("Challenge window after the result").select_option(label="10 minutes (testing)")
        page.get_by_text("Show winners' names publicly").click()
        shot(page, "02-new-draw")
        with page.expect_download() as dl:
            page.get_by_role("button", name="Create draw on MST").click()
        assert dl.value.suggested_filename.startswith("drawledger-secret-")
        expect(page.get_by_role("heading", name="1. Collect entries")).to_be_visible(timeout=30000)
        manage_url = page.url
        draw_id = manage_url.rstrip("/").split("/")[-1]

        print("import entries")
        page.locator("input[type=file][accept*=csv]").set_input_files(str(csv_path))
        expect(page.get_by_text("Added 24 entries")).to_be_visible(timeout=20000)
        page.get_by_placeholder("Entrant name").fill("Your Name")
        page.get_by_role("button", name="Add", exact=True).click()
        expect(page.get_by_text("Added 1 entry")).to_be_visible(timeout=20000)
        shot(page, "03-entries")

        print("close entries on chain")
        page.get_by_role("button", name=re.compile("Lock 25 entries")).click()
        expect(page.get_by_role("heading", name="2. Reveal the seed")).to_be_visible(timeout=30000)
        for _ in range(5):
            rpc("evm_mine")
        reveal = page.get_by_role("button", name="Reveal with saved secret")
        expect(reveal).to_be_enabled(timeout=20000)
        shot(page, "04-reveal")
        reveal.click()

        print("publish")
        publish = page.get_by_role("button", name="Compute and publish result")
        expect(publish).to_be_visible(timeout=30000)
        publish.click()
        expect(page.get_by_role("heading", name="Winners")).to_be_visible(timeout=30000)
        expect(page.get_by_text("Result published").first).to_be_visible()
        shot(page, "05-published")

        detail = page.evaluate("id => fetch(`/api/draws/${id}`).then(r => r.json())", draw_id)
        assert "draw" in detail, detail
        slug = detail["draw"]["slug"]
        winner_hashes = {w["entryHash"] for w in detail["draw"]["winners"]}
        winner = next(e for e in detail["entries"] if e["entryHash"] in winner_hashes)
        loser = next(e for e in detail["entries"] if e["entryHash"] not in winner_hashes)

        print("public page and browser verification")
        page.goto(f"{APP}/d/{slug}")
        page.get_by_role("button", name="Verify this draw in my browser").click()
        expect(page.get_by_text("Independent recomputation gives the same 6 winners")).to_be_visible(timeout=30000)
        shot(page, "06-public-verified")

        print("receipts")
        page.goto(f"{APP}/r/{winner['receiptToken']}")
        expect(page.get_by_text(re.compile("You won, rank"))).to_be_visible(timeout=30000)
        expect(page.get_by_text(re.compile("Confirmed: your entry is inside"))).to_be_visible()
        shot(page, "07-receipt-winner")
        page.goto(f"{APP}/r/{loser['receiptToken']}")
        expect(page.get_by_text("You did not win this draw.", exact=False)).to_be_visible(timeout=30000)

        print("verify page and mobile view")
        page.goto(f"{APP}/verify")
        page.get_by_placeholder(re.compile("Draw number")).fill(detail["draw"]["onchainId"])
        page.get_by_role("button", name="Load").click()
        page.get_by_role("button", name="Verify this draw in my browser").click()
        expect(page.get_by_text("Revealed secret matches the commitment")).to_be_visible(timeout=30000)
        shot(page, "08-verify")
        mobile = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
        m = mobile.new_page()
        m.goto(f"{APP}/d/{slug}")
        expect(m.get_by_role("heading", name="Block C parking allotment 2026")).to_be_visible()
        shot(m, "09-public-mobile")

        video = page.video
        ctx.close()
        if video:
            target = video_dir / "drawledger-demo.webm"
            Path(video.path()).replace(target)
            print(f"  demo video {target.name}")
        browser.close()
        if errors:
            print("Page errors:", errors)
            sys.exit(1)
        print("UI end-to-end flow passed")


if __name__ == "__main__":
    main()
