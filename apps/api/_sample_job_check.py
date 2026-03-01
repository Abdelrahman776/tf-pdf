import json
import time
from pathlib import Path
import requests

api = "http://127.0.0.1:8012"
file_path = Path(r"d:\oneDrive\Desktop\copilot-latest-LLMs\apps\data\uploads\2e2eed67-d372-44f1-8567-8a3536364fb1_image_145.png")

with file_path.open("rb") as fp:
    up = requests.post(f"{api}/v1/files/upload", files={"file": (file_path.name, fp, "image/png")}, timeout=30)
up.raise_for_status()
file_id = up.json()["file_id"]

payload = {
    "file_id": file_id,
    "mode": "image",
    "preserve_layout": True,
    "language": "en",
    "user_prompt": "Preserve original layout and style details.",
}
job = requests.post(f"{api}/v1/jobs", json=payload, timeout=30)
job.raise_for_status()
job_id = job.json()["id"]

status = "queued"
for _ in range(30):
    time.sleep(1)
    r = requests.get(f"{api}/v1/jobs/{job_id}", timeout=30)
    r.raise_for_status()
    data = r.json()
    status = data.get("status", "")
    if status in {"completed", "failed"}:
        break

artifact = requests.get(f"{api}/v1/jobs/{job_id}/layout-artifact", timeout=30)
summary = {
    "job_id": job_id,
    "status": status,
    "artifact_status": artifact.status_code,
}
if artifact.status_code == 200:
    payload = artifact.json()
    pages = payload.get("pages", [])
    summary["artifact_pages"] = len(pages)
    summary["image_blocks"] = sum(len((p or {}).get("image_blocks", [])) for p in pages)
    first_image_url = ""
    for page in pages:
        for b in page.get("image_blocks", []):
            first_image_url = str((b.get("style") or {}).get("image_url") or "")
            if first_image_url:
                break
        if first_image_url:
            break
    summary["first_image_url"] = first_image_url

print(json.dumps(summary, ensure_ascii=False))
