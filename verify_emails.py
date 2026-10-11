#!/usr/bin/env python3
"""
Free email verification (best-effort, no API key required).

Checks, per email address:
  1. Syntax validity
  2. Disposable / role-account flag
  3. Domain MX record (does the domain actually accept mail?)

Optionally, if an API key is supplied via env vars, it also runs a real
deliverability check:
  - ZeroBounce:  ZEROBOUNCE_API_KEY
  - Bouncer:     BOUNCER_API_KEY

An MX check is FREE and catches most dead domains, but it cannot tell whether
a specific mailbox exists. Only a real verifier API gives true mailbox-level
"valid" / "invalid". Nothing can honestly guarantee 100% deliverability.
"""

import argparse
import csv
import json
import os
import random
import re
import socket
import struct
import subprocess
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

SYNTAX = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$")

_DNS_SERVERS = []
with open("/etc/resolv.conf") as _rf:
    for _line in _rf:
        _p = _line.split()
        if len(_p) == 2 and _p[0] == "nameserver":
            _DNS_SERVERS.append(_p[1])
_DNS_SERVERS += ["1.1.1.1", "8.8.8.8"]  # fallbacks
_DNS_SERVERS = list(dict.fromkeys(_DNS_SERVERS))
ROLE = {
    "info", "sales", "support", "admin", "office", "contact", "help",
    "billing", "accounts", "dispatch", "ops", "operations", "hr", "jobs",
    "careers", "noreply", "no-reply", "mail", "team",
}
DISPOSABLE = {
    "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com",
    "trashmail.com", "yopmail.com", "getnada.com", "sharklasers.com",
}

_mx_cache = {}


def _encode_name(name):
    out = b""
    for label in name.rstrip(".").split("."):
        out += bytes([len(label)]) + label.encode("ascii", "ignore")
    return out + b"\x00"


def _decode_at(data, off, guard=0):
    labels = []
    while True:
        guard += 1
        if guard > 32:
            return ""
        ln = data[off]
        if ln == 0:
            break
        if ln & 0xC0 == 0xC0:
            off = struct.unpack(">H", data[off:off + 2])[0] & 0x3FFF
            continue
        off += 1
        labels.append(data[off:off + ln].decode("ascii", "ignore"))
        off += ln
    return ".".join(labels)


def get_mx_udp(domain, timeout=3.0):
    """Raw DNS MX query over UDP - no subprocess. Returns list of exchangers."""
    if not _DNS_SERVERS:
        return get_mx(domain)
    qname = _encode_name(domain)
    tid = random.randint(0, 0xFFFF)
    header = struct.pack(">HHHHHH", tid, 0x0100, 1, 0, 0, 0)
    question = qname + struct.pack(">HH", 15, 1)
    pkt = header + question
    for srv in _DNS_SERVERS:
        try:
            sk = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            sk.settimeout(timeout)
            sk.sendto(pkt, (srv, 53))
            data, _ = sk.recvfrom(4096)
            sk.close()
            if len(data) < 12 or data[0:2] != struct.pack(">H", tid):
                continue
            rcode = data[3] & 0x0F
            if rcode != 0:
                return []
            ancount = struct.unpack(">H", data[6:8])[0]
            pos = 12
            while data[pos] != 0:
                pos += data[pos] + 1
            pos = 12 + (pos - 12) + 1 + 4
            hosts = []
            for _ in range(ancount):
                n0 = data[pos]
                if n0 & 0xC0 == 0xC0:
                    pos += 2
                else:
                    while data[pos] != 0:
                        pos += data[pos] + 1
                    pos += 1
                rtype, rclass, ttl, rdlen = struct.unpack(">HHIH", data[pos:pos + 10])
                pos += 10
                rdata_end = pos + rdlen
                if rtype == 15:
                    cursor = pos + 2  # skip preference
                    labels = []
                    while cursor < rdata_end:
                        ln = data[cursor]
                        if ln & 0xC0 == 0xC0:
                            off = struct.unpack(">H", data[cursor:cursor + 2])[0] & 0x3FFF
                            labels.append(_decode_at(data, off))
                            cursor += 2
                        else:
                            cursor += 1
                            labels.append(data[cursor:cursor + ln].decode("ascii", "ignore"))
                            cursor += ln
                    cleaned = [x for x in labels if x]
                    if cleaned:
                        hosts.append(".".join(cleaned).lower())
                pos = rdata_end
            return hosts
        except Exception:
            try:
                sk.close()
            except Exception:
                pass
            continue
    return []


def get_mx(domain):
    if domain in _mx_cache:
        return _mx_cache[domain]
    hosts = []
    try:
        out = subprocess.run(
            ["dig", "+short", "MX", domain],
            capture_output=True, text=True, timeout=15,
        ).stdout
        for line in out.splitlines():
            parts = line.strip().split()
            if len(parts) >= 2:
                hosts.append(parts[1].rstrip("."))
    except Exception:
        pass
    _mx_cache[domain] = hosts
    return hosts


def api_check(email, provider, key):
    try:
        if provider == "zerobounce":
            url = ("https://api.zerobounce.net/v2/validate?api_key=%s&email=%s"
                   % (key, urllib.parse.quote(email)))
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=20) as r:
                d = json.load(r)
            return d.get("status", "")
        if provider == "bouncer":
            url = ("https://api.usebouncer.com/v1.1/email/verify?email=%s"
                   % urllib.parse.quote(email))
            req = urllib.request.Request(url, headers={"x-api-key": key})
            with urllib.request.urlopen(req, timeout=20) as r:
                d = json.load(r)
            return d.get("status", "")
    except Exception as e:
        return "api_error:%s" % e
    return ""


def verify_one(email, provider, key):
    email = (email or "").strip()
    result = {
        "email": email, "syntax_ok": False, "domain": "",
        "role_account": False, "disposable": False,
        "mx_ok": False, "mx_host": "", "api_status": "", "verdict": "invalid",
    }
    if not SYNTAX.match(email):
        return result
    result["syntax_ok"] = True
    local, _, domain = email.rpartition("@")
    domain = domain.lower()
    result["domain"] = domain
    result["role_account"] = local.lower() in ROLE
    result["disposable"] = domain in DISPOSABLE
    mx = get_mx_udp(domain)
    result["mx_ok"] = bool(mx)
    result["mx_host"] = mx[0] if mx else ""

    if provider and key:
        status = api_check(email, provider, key)
        result["api_status"] = status
        low = status.lower()
        if low in ("valid", "deliverable"):
            result["verdict"] = "valid"
        elif low in ("invalid", "undeliverable"):
            result["verdict"] = "invalid"
        else:
            result["verdict"] = "risky"
    else:
        if not mx:
            result["verdict"] = "invalid"
        elif result["disposable"]:
            result["verdict"] = "risky"
        else:
            result["verdict"] = "likely_valid"
    return result


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("--email-col", default="email_address")
    ap.add_argument("--out", default="verified_leads.csv")
    ap.add_argument("--workers", type=int, default=25)
    args = ap.parse_args()

    provider = os.environ.get("EMAIL_VERIFIER", "").lower()
    key = ""
    if provider == "zerobounce":
        key = os.environ.get("ZEROBOUNCE_API_KEY", "")
    elif provider == "bouncer":
        key = os.environ.get("BOUNCER_API_KEY", "")
    if provider and not key:
        print("Warning: %s selected but no API key set; MX-only mode." % provider)
        provider = ""

    rows = list(csv.DictReader(open(args.input, encoding="utf-8")))
    print("Verifying %d emails (mode=%s)..." % (len(rows), provider or "mx-only"))

    emails = [r.get(args.email_col, "") for r in rows]
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        results = list(ex.map(lambda e: verify_one(e, provider, key), emails))

    counts = {}
    for r in results:
        counts[r["verdict"]] = counts.get(r["verdict"], 0) + 1

    # merge back original row + verification columns (except email dup)
    with open(args.out, "w", newline="", encoding="utf-8") as f:
        ver_cols = ["syntax_ok", "domain", "role_account", "disposable",
                    "mx_ok", "mx_host", "api_status", "verdict"]
        fieldnames = list(rows[0].keys()) + ver_cols if rows else ver_cols
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        for orig, ver in zip(rows, results):
            merged = dict(orig)
            for c in ver_cols:
                merged[c] = ver[c]
            w.writerow(merged)

    print("Verdicts:", counts)
    print("Wrote ->", args.out)


if __name__ == "__main__":
    main()
