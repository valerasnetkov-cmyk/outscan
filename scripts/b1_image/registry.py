"""Read registry identities through fixed HTTPS origins; never persist credentials."""
import base64
import json
import urllib.error
import urllib.parse
import urllib.request
from .core import DIGEST, digest, require

ACCEPT = ", ".join(("application/vnd.oci.image.index.v1+json",
                    "application/vnd.docker.distribution.manifest.list.v2+json",
                    "application/vnd.oci.image.manifest.v1+json",
                    "application/vnd.docker.distribution.manifest.v2+json"))


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise RuntimeError("REGISTRY_REDIRECT")


def request(url, headers):
    require(urllib.parse.urlsplit(url).netloc in
            ("ghcr.io", "auth.docker.io", "registry-1.docker.io"), "REGISTRY_ORIGIN")
    opener = urllib.request.build_opener(NoRedirect)
    try:
        with opener.open(urllib.request.Request(url, headers=headers), timeout=30) as response:
            data = response.read(4 * 1024 * 1024 + 1)
            require(len(data) <= 4 * 1024 * 1024, "REGISTRY_SIZE")
            return response.status, dict(response.headers), data
    except urllib.error.HTTPError as error:
        return error.code, {}, b""


def token(host, repository, credential=None):
    service = "registry.docker.io" if host == "docker" else "ghcr.io"
    endpoint = "https://auth.docker.io/token" if host == "docker" else "https://ghcr.io/token"
    query = urllib.parse.urlencode({"service": service, "scope": "repository:" + repository + ":pull"})
    headers = {}
    if credential:
        headers["Authorization"] = "Basic " + base64.b64encode(credential.encode()).decode()
    code, _, raw = request(endpoint + "?" + query, headers)
    require(code == 200, "REGISTRY_AUTH")
    value = json.loads(raw)
    result = value.get("token") or value.get("access_token")
    require(isinstance(result, str) and bool(result), "REGISTRY_TOKEN")
    return result


def verify_manifest(raw, header_digest, expected=None):
    require(bool(DIGEST.fullmatch(header_digest)), "REGISTRY_DIGEST_FORMAT")
    require(digest(raw) == header_digest, "REGISTRY_DIGEST_BYTES")
    if expected:
        require(header_digest == expected, "REGISTRY_DIGEST_MISMATCH")
    parsed = json.loads(raw)
    require(parsed.get("schemaVersion") == 2, "REGISTRY_SCHEMA")
    return parsed


def manifest(host, repository, reference, bearer, missing_ok=False):
    origin = "registry-1.docker.io" if host == "docker" else "ghcr.io"
    quoted = urllib.parse.quote(reference, safe=":")
    code, headers, raw = request(f"https://{origin}/v2/{repository}/manifests/{quoted}",
                                 {"Accept": ACCEPT, "Authorization": "Bearer " + bearer})
    if code == 404 and missing_ok:
        return None
    require(code == 200, "REGISTRY_MANIFEST_UNAVAILABLE")
    header = {k.lower(): v for k, v in headers.items()}.get("docker-content-digest", "")
    parsed = verify_manifest(raw, header, reference if reference.startswith("sha256:") else None)
    return header, raw, parsed


def amd64_child(parsed, original):
    if "manifests" not in parsed:
        return original
    candidates = [item for item in parsed["manifests"]
                  if item.get("platform", {}).get("os") == "linux"
                  and item.get("platform", {}).get("architecture") == "amd64"
                  and not item.get("platform", {}).get("variant")]
    require(len(candidates) == 1, "BASE_AMD64_AMBIGUOUS")
    result = candidates[0].get("digest", "")
    require(bool(DIGEST.fullmatch(result)), "BASE_CHILD_DIGEST")
    return result
