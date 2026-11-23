"""Exercise the built starter at a project subpath in Chromium."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import os
import shutil
import tempfile
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def main():
    screenshots = ROOT / "browser-checks"
    screenshots.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as temporary:
        shutil.copytree(ROOT / "dist", Path(temporary) / "example-tool")
        server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=temporary))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(executable_path=os.environ.get("TEST_CHROMIUM"))
                page = browser.new_page(viewport={"width": 1280, "height": 1000})
                errors = []
                page.on("pageerror", lambda error: errors.append(str(error)))
                page.goto(f"http://127.0.0.1:{server.server_port}/example-tool/")
                page.locator("#metrics").get_by_text("Paired hours").wait_for()
                assert page.locator("#reading-rows tr").count() == 168
                page.locator("#station").select_option("lake-major")
                page.locator("#period").select_option("1")
                assert "2023-05-27" in page.locator("#week").inner_text()
                assert "85.4" in page.locator("#peak-reading").inner_text()
                assert "1 hour later" in page.locator("#peak-reading").inner_text()
                page.locator("#cutoff").select_option("25")
                assert "25 µg/m³" in page.locator("#agreement").inner_text()
                assert page.locator("#daily-rows tr").count() == 7
                page.locator("#hourly summary").click()
                assert "AST" in page.locator("#local-heading").inner_text()
                page.locator("#provider").select_option("openweather")
                assert page.locator("#inactive").is_visible() or page.locator("#daily").is_visible()
                assert page.locator("#traces").is_hidden() == page.locator("#inactive").is_visible()
                page.locator("#provider").select_option("cams")
                page.locator("#hourly summary").click()
                page.locator('#broader details summary').click()
                for side,values in [('a','0\n2026-11-01T09:00:00Z,'),('b','10\n2026-11-01T09:00:00Z,5')]:
                    page.locator('#observation-'+side).set_input_files({'name':side+'.csv','mimeType':'text/csv','buffer':('time,value\n2026-11-01T08:00:00Z,'+values).encode()})
                page.locator('#observation-form button').click()
                expect(page.locator('#broader-result')).to_contain_text('1 matched hours')
                assert 'Neither file was uploaded' in page.locator('#broader-status').inner_text()
                with page.expect_download() as event: page.locator('#broader-download').click()
                assert event.value.suggested_filename=='airpair-comparison.json'
                page.screenshot(path=str(screenshots / "desktop.png"), full_page=True)
                page.set_viewport_size({"width": 390, "height": 844})
                assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
                page.screenshot(path=str(screenshots / "mobile.png"), full_page=True)
                assert not errors, errors
                browser.close()
            print("Browser checks passed: both stations, hours, provider separation and mobile layout")
        finally:
            server.shutdown()


if __name__ == "__main__":
    main()
