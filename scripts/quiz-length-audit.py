#!/usr/bin/env python3
"""Quiz option-length audit (F4 / Branch 4).

Parser method (Phase 1, Seat C): parse every lesson's <Quiz> blocks,
extract each question's options + correctIndex, and assert per file that
the parsed question count matches the file's correctIndex count.
Reports strict-longest (correct strictly longest), tied-longest and
inclusive (strict + tied) counts, plus mean lengths.

Usage: python3 scripts/quiz-length-audit.py [--tier beginner] [--json out.json]
Length = character length of the decoded option string.
"""
import argparse, json, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
LESSONS = ROOT / "content" / "lessons"

def decode_js_string(s: str) -> str:
    # s is the raw content between double quotes (escapes intact)
    out, i = [], 0
    while i < len(s):
        c = s[i]
        if c == "\\" and i + 1 < len(s):
            n = s[i+1]
            mapping = {"n": "\n", "t": "\t", "r": "\r", '"': '"', "'": "'", "\\": "\\", "`": "`", "/": "/"}
            if n == "u" and i + 5 < len(s) + 1 and len(s) >= i + 6:
                try:
                    out.append(chr(int(s[i+2:i+6], 16))); i += 6; continue
                except ValueError:
                    pass
            out.append(mapping.get(n, n)); i += 2
        else:
            out.append(c); i += 1
    return "".join(out)

STR = r'''(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)')'''

def parse_file(path: pathlib.Path):
    text = path.read_text(encoding="utf-8")
    ci_count = len(re.findall(r"correctIndex\s*:", text))
    questions = []
    pat = re.compile(
        r"question\s*:\s*" + STR + r"\s*,\s*options\s*:\s*\[(.*?)\]\s*,\s*correctIndex\s*:\s*(\d+)",
        re.S,
    )
    for m in pat.finditer(text):
        qraw = m.group(1) if m.group(1) is not None else m.group(2)
        opts_raw = [a if a is not None else b for a, b in re.findall(STR, m.group(3))]
        options = [decode_js_string(o) for o in opts_raw]
        questions.append({
            "question": decode_js_string(qraw),
            "options": options,
            "correctIndex": int(m.group(4)),
        })
    assert len(questions) == ci_count, f"{path.name}: parsed {len(questions)} != correctIndex count {ci_count}"
    for q in questions:
        assert len(q["options"]) == 4, f"{path.name}: question has {len(q['options'])} options: {q['question'][:60]}"
        assert 0 <= q["correctIndex"] < 4
    return questions

def tier_of(path: pathlib.Path):
    m = re.search(r"tier:\s*'(\w+)'", path.read_text(encoding="utf-8")[:600])
    return m.group(1) if m else "?"

def stats(qs):
    strict = tied = 0
    clens, dlens = [], []
    for q in qs:
        lens = [len(o) for o in q["options"]]
        c = lens[q["correctIndex"]]
        clens.append(c); dlens.extend(l for i, l in enumerate(lens) if i != q["correctIndex"])
        mx = max(lens)
        if c == mx and lens.count(mx) == 1: strict += 1
        elif c == mx: tied += 1
    return strict, tied, clens, dlens

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tier", default=None)
    ap.add_argument("--json", default=None)
    args = ap.parse_args()
    files = sorted(LESSONS.glob("*.mdx"))
    all_q, report = [], {}
    for f in files:
        tier = tier_of(f)
        qs = parse_file(f)
        s, t, cl, dl = stats(qs)
        report[f.stem] = {"tier": tier, "questions": len(qs), "strict": s, "tied": t,
                          "inclusive": s + t,
                          "correct_mean": round(sum(cl)/len(cl), 1) if cl else 0,
                          "distractor_mean": round(sum(dl)/len(dl), 1) if dl else 0}
        for q in qs: q["_lesson"] = f.stem; q["_tier"] = tier
        all_q.extend(qs)
    s, t, cl, dl = stats(all_q)
    total_opts = sum(len(q["options"]) for q in all_q)
    print(f"CORPUS: questions={len(all_q)} options={total_opts} strict={s} tied={t} inclusive={s+t}")
    print(f"CORPUS %: strict={100*s/len(all_q):.1f} inclusive={100*(s+t)/len(all_q):.1f}")
    print(f"CORPUS means: correct={sum(cl)/len(cl):.1f} distractor={sum(dl)/len(dl):.1f}")
    pos = [0,0,0,0]
    for q in all_q: pos[q["correctIndex"]] += 1
    print(f"POSITIONS: {pos}")
    full = [k for k, v in report.items() if v["questions"] >= 4 and v["strict"] == v["questions"]]
    print(f"LESSONS 100% strict (>=4q): {len(full)}: {sorted(full)}")
    for tier in ("beginner", "intermediate", "advanced"):
        tq = [q for q in all_q if q["_tier"] == tier]
        if not tq: continue
        s2, t2, cl2, dl2 = stats(tq)
        print(f"TIER {tier}: lessons={len({q['_lesson'] for q in tq})} questions={len(tq)} strict={s2} ({100*s2/len(tq):.1f}%) inclusive={s2+t2} ({100*(s2+t2)/len(tq):.1f}%) correct_mean={sum(cl2)/len(cl2):.1f} distractor_mean={sum(dl2)/len(dl2):.1f}")
        if args.tier in (None, tier):
            for k in sorted({q['_lesson'] for q in tq}):
                v = report[k]
                print(f"  {k}: q={v['questions']} strict={v['strict']} tied={v['tied']} correct_mean={v['correct_mean']} distractor_mean={v['distractor_mean']}")
    if args.json:
        pathlib.Path(args.json).write_text(json.dumps({"corpus": {"questions": len(all_q), "options": total_opts, "strict": s, "tied": t, "inclusive": s+t, "correct_mean": round(sum(cl)/len(cl),1), "distractor_mean": round(sum(dl)/len(dl),1)}, "lessons": report}, indent=2))
    return 0

if __name__ == "__main__":
    sys.exit(main())
