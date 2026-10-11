#!/usr/bin/env python3
"""SMTP mailbox-level verification with per-host rate gates + resumable cache."""

import argparse
import csv
import os
import random
import re
import socket
import threading
import time
from concurrent.futures import ThreadPoolExecutor

import verify_emails as V

EHLO = "probe.local"
FROM = "verify@probe.local"
MAX_CONN = 4
MIN_SPACING = 0.6
CONN_TIMEOUT = 6.0

_host_lock = threading.Lock()
_host_inflight = {}
_host_last = {}


def _host_gate(host):
    while True:
        with _host_lock:
            now = time.time()
            inflight = _host_inflight.get(host, 0)
            last = _host_last.get(host, 0.0)
            if inflight < MAX_CONN and now - last >= MIN_SPACING:
                _host_inflight[host] = inflight + 1
                _host_last[host] = now
                return
        time.sleep(0.05 + random.random() * 0.1)


def _read_line(f):
    data = b""
    try:
        while not data.endswith(b"\r\n"):
            c = f.read(1)
            if not c:
                break
            data += c
    except OSError:
        pass
    try:
        return data.decode("latin-1").strip()
    except Exception:
        return ""


def _read_response(f, cap=50):
    line = _read_line(f)
    data = line
    lines = 1
    if len(line) >= 4 and line[3] == "-":
        code = line[:3]
        while lines < cap:
            nxt = _read_line(f)
            data += "\n" + nxt
            lines += 1
            if not nxt or (nxt[:3] == code and (len(nxt) < 4 or nxt[3] != "-")):
                break
    return data


def _try_host(host, email):
    verdict = ("unknown", 0)
    try:
        with socket.create_connection((host, 25), timeout=CONN_TIMEOUT) as sock:
            sock.settimeout(6.0)
            f = sock.makefile("rb")
            banner = _read_line(f)
            code = int(banner[:3]) if banner[:3].isdigit() else 0
            if code != 220:
                return ("unknown", code)
            sock.sendall(("EHLO %s\r\n" % EHLO).encode("latin-1"))
            r = _read_response(f)
            rc = int(r[:3]) if r[:3].isdigit() else 0
            if rc >= 400:
                sock.sendall(("HELO %s\r\n" % EHLO).encode("latin-1"))
                r = _read_response(f)
                rc = int(r[:3]) if r[:3].isdigit() else 0
            if rc >= 400:
                return ("unknown", rc)
            sock.sendall(("MAIL FROM:<%s>\r\n" % FROM).encode("latin-1"))
            r = _read_response(f)
            mf = int(r[:3]) if r[:3].isdigit() else 0
            if mf >= 400:
                try:
                    sock.sendall(b"QUIT\r\n")
                except OSError:
                    pass
                return ("unknown", mf)
            sock.sendall(("RCPT TO:<%s>\r\n" % email).encode("latin-1"))
            r = _read_response(f)
            rcpt = int(r[:3]) if r[:3].isdigit() else 0
            try:
                sock.sendall(b"QUIT\r\n")
            except OSError:
                pass
            if rcpt == 250:
                verdict = ("active", rcpt)
            elif rcpt == 252:
                verdict = ("catch_all", rcpt)
            elif 450 <= rcpt <= 459:
                verdict = ("unknown", rcpt)  # greylisting
            elif 550 <= rcpt <= 559:
                verdict = ("invalid", rcpt)
            else:
                verdict = ("unknown", rcpt)
    except OSError:
        verdict = ("unknown", "conn")
    except Exception:
        verdict = ("unknown", "err")
    return verdict


def check_email(email, mx_cache):
    domain = email.rpartition("@")[2].lower()
    if domain not in mx_cache:
        mx_cache[domain] = V.get_mx_udp(domain)
    hosts = list(mx_cache[domain]) or [domain]
    verdict = ("unknown", 0)
    for host in hosts:
        _host_gate(host)
        try:
            verdict = _try_host(host, email)
        finally:
            with _host_lock:
                _host_inflight[host] = max(0, _host_inflight.get(host, 0) - 1)
        if verdict[0] in ("active", "invalid"):
            break
    return verdict[0], verdict[1]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("emails")
    ap.add_argument("--out", default="smtp_verified_cache.csv")
    ap.add_argument("--workers", type=int, default=120)
    ap.add_argument("--recheck-invalid", action="store_true")
    args = ap.parse_args()

    done = {}
    if os.path.exists(args.out):
        for r in csv.DictReader(open(args.out, encoding="utf-8")):
            done[r["email"]] = (r.get("status"), r.get("code"))

    emails = [l.strip().lower() for l in open(args.emails) if "@" in l.strip()]
    todo = [e for e in emails if e not in done]
    print("total %d | already done %d | remain %d" % (len(emails), len(done), len(todo)),
          flush=True)

    mx_cache = {}
    counts = {"active": 0, "invalid": 0, "unknown": 0, "catch_all": 0}
    for k, v in done.values():
        counts[k] = counts.get(k, 0) + 1

    lock = threading.Lock()
    errlog = open("errors.log", "a", encoding="utf-8")
    outfile = open(args.out, "a", newline="", encoding="utf-8")
    writer = csv.writer(outfile)
    if os.path.getsize(args.out) == 0:
        writer.writerow(["email", "status", "code"])

    def work(e):
        try:
            s, c = check_email(e, mx_cache)
        except Exception as ex:
            s, c = "unknown", "exc:" + type(ex).__name__
            with lock:
                errlog.write("%s\t%s\n" % (e, ex))
                errlog.flush()
        with lock:
            counts[s] = counts.get(s, 0) + 1
            writer.writerow([e, s, c])
            outfile.flush()
            n = sum(counts.values())
            if n % 2000 == 0:
                print("progress %d/%d %s" % (n, len(todo), counts), flush=True)

    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        list(ex.map(work, todo))
    outfile.close()
    print("DONE", counts, flush=True)


if __name__ == "__main__":
    main()