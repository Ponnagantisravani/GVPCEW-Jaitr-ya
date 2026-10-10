import os

import requests


class BackendClient:
    def __init__(self, base_url=None, timeout=20):
        self.base_url = (base_url or os.getenv("BACKEND_URL", "https://gvpcew-app.onrender.com")).rstrip("/")
        self.timeout = timeout
        self.api_base_url = self._normalize_api_base_url(self.base_url)
        self.enrollment_api_key = os.getenv("ENROLLMENT_API_KEY", "")

    def lookup_student(self, roll_number):
        response = requests.post(
            self._url("/enrollment/lookup"),
            json={"rollNumber": roll_number},
            headers={"X-Enrollment-Key": self.enrollment_api_key},
            timeout=10
        )
        return self._parse_response(response)["student"]

    def upload_embedding(self, payload):
        response = requests.post(
            self._url("/enrollment/upload"),
            json=payload,
            headers={"X-Enrollment-Key": self.enrollment_api_key},
            timeout=self.timeout
        )
        return self._parse_response(response)

    def _url(self, path):
        return f"{self.api_base_url}{path}"

    def _normalize_api_base_url(self, base_url):
        return base_url if base_url.endswith("/api") else f"{base_url}/api"

    def _parse_response(self, response):
        try:
            response.raise_for_status()
            return response.json()
        except requests.HTTPError as exc:
            try:
                message = response.json().get("message", "Request failed")
            except Exception:
                message = "Request failed"
            raise RuntimeError(message) from exc
