#!/usr/bin/env python3
"""Schreibt src-tauri/templates/_stil/versionen.txt: die Prüfsummen aller
Fassungen von stil.typ und den Vorlagen-Dateien, die je committet wurden.

NeoTypst erkennt daran, ob die Kopie in einem Projekt eine unveränderte
ältere Fassung ist (dann darf sie ersetzt werden) oder von Hand angepasst.
Prüfsumme: FNV-1a 64 über die Bytes ohne \r, wie stil_hash() in stil.rs.

    scripts/stil-versionen.py          neu schreiben
    scripts/stil-versionen.py --check  Fehler, wenn die Datei veraltet ist
"""
import subprocess, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "src-tauri/templates/_stil/versionen.txt"
# Pfad im Projekt -> Pfad im Repository
DATEIEN = {"templates/stil.typ": "src-tauri/templates/_stil/stil.typ"}
for name in ["arbeitsblatt", "hausaufgabe", "wettbewerb", "dokumentation", "essay"]:
    DATEIEN[f"templates/{name}.typ"] = f"src-tauri/templates/{name}/templates/{name}.typ"


def fnv1a(data: bytes) -> str:
    # Zeilenenden zählen nicht: \r wird übersprungen (Windows-Kopien mit CRLF).
    h = 0xCBF29CE484222325
    for b in data.replace(b"\r", b""):
        h ^= b
        h = (h * 0x100000001B3) & 0xFFFFFFFFFFFFFFFF
    return f"{h:016x}"


def git(*args: str) -> bytes:
    return subprocess.run(["git", *args], cwd=ROOT, check=True, capture_output=True).stdout


zeilen = []
for projekt, repo in DATEIEN.items():
    gesehen = set()
    for commit in git("log", "--format=%H", "--", repo).decode().split():
        try:
            inhalt = git("show", f"{commit}:{repo}")
        except subprocess.CalledProcessError:
            continue  # in diesem Commit gelöscht
        h = fnv1a(inhalt)
        if h not in gesehen:
            gesehen.add(h)
            zeilen.append(f"{projekt} {h}")
    # Auch der Stand im Arbeitsverzeichnis, falls noch nicht committet.
    h = fnv1a((ROOT / repo).read_bytes())
    if h not in gesehen:
        zeilen.append(f"{projekt} {h}")

text = "# Erzeugt von scripts/stil-versionen.py, nicht von Hand ändern.\n" + "\n".join(sorted(zeilen)) + "\n"
if "--check" in sys.argv:
    if not OUT.exists() or OUT.read_text() != text:
        sys.exit("versionen.txt ist veraltet: scripts/stil-versionen.py ausführen und committen.")
else:
    OUT.write_text(text)
    print(f"{len(zeilen)} Fassungen in {OUT.relative_to(ROOT)}")
